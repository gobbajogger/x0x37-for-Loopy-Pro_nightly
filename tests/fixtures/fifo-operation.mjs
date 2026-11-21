// SPDX-License-Identifier: GPL-3.0-only
import {spawn} from 'node:child_process';

// Start the blocked-I/O clock only after the child has imported the code under test.
export function runFifoOperation(prepare, operation, {operationMs, startupMs=15000, startupDelayMs=0}) {
 const code = `
  ${prepare}
  if (${startupDelayMs}) await new Promise(resolve => setTimeout(resolve, ${startupDelayMs}));
  process.once('message', message => {
   if (message.phase !== 'go') { process.exitCode = 2; process.disconnect(); return; }
   process.send({phase:'operation-start'}, () => {
    try {
     ${operation};
     process.send({phase:'result', outcome:'returned'});
    } catch (error) {
     process.send({phase:'result', outcome:'threw', message:error.message});
    } finally {
     process.disconnect();
    }
   });
  });
  process.send({phase:'ready'});
 `;
 return new Promise((resolve,reject) => {
  const start = performance.now();
  const child = spawn(process.execPath, ['--input-type=module','-e',code], {stdio:['ignore','ignore','pipe','ipc']});
  let readyAt=null, operationAt=null, endedAt=null, result=null, timedOut=null, stderr='', timer;
  let childError=null;
  function watch(phase, ms) {
   clearTimeout(timer);
   timer=setTimeout(() => { timedOut=phase; child.kill('SIGKILL'); }, ms);
  }
  watch('startup', startupMs);
  child.stderr.on('data', chunk => { stderr+=chunk; });
  child.on('message', message => {
   if (timedOut) return;
   if (message.phase==='ready') {
    readyAt=performance.now();
    watch('operation-start', startupMs);
    child.send({phase:'go'});
   } else if (message.phase==='operation-start') {
    operationAt=performance.now();
    watch('operation', operationMs);
   } else if (message.phase==='result') {
    endedAt=performance.now();
    result=message;
    watch('shutdown', startupMs);
   }
  });
  child.on('error', error => {
   if (childError) return;
   childError=error;
   if (child.pid) child.kill('SIGKILL');
  });
  child.once('close', (code,signal) => {
   clearTimeout(timer);
   if (childError) { reject(childError); return; }
   resolve({code,signal,result,timedOut,stderr,ready:readyAt!==null,operationStarted:operationAt!==null,
    startupElapsedMs:readyAt===null?null:readyAt-start,
    operationElapsedMs:operationAt===null?null:(endedAt??performance.now())-operationAt});
  });
 });
}
