// SPDX-License-Identifier: GPL-3.0-only
import { spawn } from 'node:child_process';

const ready = new URL('./cli-ready.mjs', import.meta.url).href;

// Keep the real script as argv[1], including the caller's preload(s) and cwd.
// Only normal exits are results. Signal deaths and watchdog failures reject.
export function runNodeCli(file, args = [], {
  cwd, nodeArgs = [], startupMs = 180000, operationMs = 15000, label = file,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...nodeArgs, '--import', ready, file, ...args], {
      cwd, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let phase = 'startup';
    let released = false;
    let failure;
    let watchdog;
    const stop = reason => {
      if (failure) return;
      failure = reason;
      if (child.pid) child.kill('SIGKILL');
    };
    const watch = ms => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => stop(`timed out after ${ms} ms`), ms);
    };
    function capture(stream) {
      const chunks = [];
      let bytes = 0;
      stream.on('data', chunk => {
        bytes += chunk.length;
        if (bytes <= 1024 * 1024) chunks.push(chunk);
        else stop('exceeded 1 MiB output limit');
      });
      return chunks;
    }
    const stdout = capture(child.stdout);
    const stderr = capture(child.stderr);
    watch(startupMs);
    child.on('message', message => {
      if (failure) return;
      if (message === 'ready' && !released) {
        released = true;
        child.send('run', error => { if (error) stop(error.message); });
      } else if (message === 'starting' && released && phase === 'startup') {
        phase = 'command';
        watch(operationMs);
      } else {
        stop('unexpected readiness message');
      }
    });
    child.on('error', error => stop(error.message));
    child.once('close', (status, signal) => {
      clearTimeout(watchdog);
      const result = { status, signal, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() };
      if (failure || phase === 'startup' || signal || status === null) {
        const reason = failure ?? (phase === 'startup' ? 'exited before readiness' : 'unexpected termination');
        const error = new Error(`${label}: ${phase} ${reason} (exit=${status}, signal=${signal})\n${result.stderr}`);
        reject(Object.assign(error, result, { phase }));
      } else {
        resolve(result);
      }
    });
  });
}
