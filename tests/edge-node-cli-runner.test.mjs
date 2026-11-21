// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runNodeCli } from './fixtures/node-cli.mjs';

function files(t, source, preload = '') {
  const cwd = mkdtempSync(join(tmpdir(), 'cli-runner-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const file = join(cwd, 'command.mjs');
  const shim = join(cwd, 'preload.mjs');
  writeFileSync(file, source);
  writeFileSync(shim, preload);
  return { file, cwd, nodeArgs: ['--import', shim] };
}

test('Node initialization leaves the full command budget and original CLI invocation intact', async t => {
  const { file, cwd, nodeArgs } = files(t, `
    console.log(JSON.stringify([process.argv.slice(1), process.cwd(), globalThis.loaded]));
    console.error('diagnostic');
  `, `
    await new Promise(done => setTimeout(done, 3500));
    globalThis.loaded = true;
  `);
  const args = ['--flag', 'argument with spaces'];
  const result = await runNodeCli(file, args, { cwd, nodeArgs, operationMs: 3000 });
  assert.equal(result.status, 0);
  assert.equal(result.signal, null);
  assert.deepEqual(JSON.parse(result.stdout), [[file, ...args], cwd, true]);
  assert.equal(result.stderr, 'diagnostic\n');
});

test('an ordinary semantic rejection preserves its exit code and streams', async t => {
  const { file } = files(t, "console.error('invalid input'); process.exitCode = 1;");
  assert.deepEqual(await runNodeCli(file), { status: 1, signal: null, stdout: '', stderr: 'invalid input\n' });
});

test('a preload error cannot qualify as a command rejection', async t => {
  const { file, nodeArgs } = files(t, '', "throw new Error('preload failed');");
  await assert.rejects(runNodeCli(file, [], { nodeArgs }), error =>
    error.phase === 'startup' && error.status === 1 && error.signal === null &&
    error.message.includes('exited before readiness') && error.stderr.includes('preload failed'));
});

test('the startup watchdog terminates a stalled preload', async t => {
  const { file, nodeArgs } = files(t, '', 'await new Promise(() => setInterval(() => {}, 1000));');
  await assert.rejects(runNodeCli(file, [], { nodeArgs, startupMs: 1500 }), error =>
    error.phase === 'startup' && error.signal === 'SIGKILL' && error.status === null &&
    error.message.includes('timed out after 1500 ms'));
});

test('an unexpected command signal fails the test runner', async t => {
  const { file } = files(t, "process.kill(process.pid, 'SIGTERM');");
  await assert.rejects(runNodeCli(file), error =>
    error.phase === 'command' && error.signal === 'SIGTERM' && error.status === null &&
    error.message.includes('unexpected termination'));
});

test('the default 15-second command watchdog terminates and reaps a blocked CLI', async t => {
  const { file } = files(t, 'console.log(process.pid); setInterval(() => {}, 1000);');
  await assert.rejects(runNodeCli(file), error => {
    assert.equal(error.phase, 'command');
    assert.equal(error.status, null);
    assert.equal(error.signal, 'SIGKILL');
    assert.match(error.message, /timed out after 15000 ms/);
    const pid = Number(error.stdout.trim());
    assert.ok(Number.isSafeInteger(pid) && pid > 0);
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    return true;
  });
});
