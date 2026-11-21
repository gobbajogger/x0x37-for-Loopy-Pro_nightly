// SPDX-License-Identifier: GPL-3.0-only
import {spawnSync} from 'node:child_process';
import {runFifoOperation} from './fixtures/fifo-operation.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,readFileSync,writeFileSync,rmSync,symlinkSync,mkdirSync} from 'node:fs';import {fileURLToPath} from 'node:url';import {buildProductSite} from '../scripts/build-product-site.mjs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';import {readEmulatorRuntime,readEmulatorPin} from '../scripts/emulator-runtime.mjs';
const names=['runtime.json','kernel.wasm','native-session.mjs','observer.mjs','session-codec.mjs','worklet.mjs','wasi.mjs','index.html','page.mjs','style.css'];
function fixture(t){const directory=mkdtempSync(join(tmpdir(),'emu-stage-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));const files={};for(const n of names){const bytes=Buffer.from(n==='kernel.wasm'?[0,97,115,109,1,0,0,0]:'source '+n);writeFileSync(join(directory,n),bytes);files[n]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}const pin={firmware:'a'.repeat(40),kernel:'b'.repeat(40),files};const meta={firmware_source:pin.firmware,kernel_source:pin.kernel,wasm_bytes:files['kernel.wasm'].bytes,wasm_sha256:files['kernel.wasm'].sha256,device_control:false,full_physical_panel:false};const bytes=Buffer.from(JSON.stringify(meta));writeFileSync(join(directory,'runtime.json'),bytes);files['runtime.json']={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};return{directory,pin};}
test('only exact qualified public runtime closure is staged, never native oracle/private output',t=>{const x=fixture(t);writeFileSync(join(x.directory,'native.pcm'),'must not ship');const rows=readEmulatorRuntime(x);assert.deepEqual(rows.map(r=>r[0]).sort(),names.map(n=>'emu/'+n).sort());assert(rows.every(r=>Buffer.isBuffer(r[1])));});
test('changed executable module or WASM bytes are refused',t=>{for(const name of ['kernel.wasm','worklet.mjs']){const x=fixture(t);writeFileSync(join(x.directory,name),'changed');assert.throws(()=>readEmulatorRuntime(x),/runtime.*mismatch/i);}});
test('symlink input and incomplete pin are refused',t=>{const x=fixture(t);rmSync(join(x.directory,'page.mjs'));symlinkSync(join(x.directory,'observer.mjs'),join(x.directory,'page.mjs'));assert.throws(()=>readEmulatorRuntime(x),/symlink|regular/i);const y=fixture(t);delete y.pin.files['observer.mjs'];assert.throws(()=>readEmulatorRuntime(y),/closure/i);});

test('source-only Tools navigation retains Remote without offering a missing playable panel', t => {
 const repo = fileURLToPath(new URL('../', import.meta.url));
 mkdirSync(join(repo, '.output'), {recursive:true});
 const output = mkdtempSync(join(repo, '.output/emu-env-'));
 t.after(() => rmSync(output, {recursive:true, force:true}));
 const previous = process.env.DNBOX_EMULATOR_RUNTIME;
 try {
  process.env.DNBOX_EMULATOR_RUNTIME = '/missing-artifact-must-not-be-read';
  assert.equal(buildProductSite({output}).emulator, false);
  const html = readFileSync(join(output, 'tools/index.html'), 'utf8');
  assert.match(html, /href="\.\.\/remote\/">Open Remote/);
  assert.doesNotMatch(html, /href="\.\.\/emu\//);
  const reference = readFileSync(join(output, 'reference/index.html'), 'utf8');
  assert.doesNotMatch(reference, /href="screens\/"/);
  assert.match(reference, /href="current-ui\.html"/);
 } finally {
  if (previous === undefined) delete process.env.DNBOX_EMULATOR_RUNTIME;
  else process.env.DNBOX_EMULATOR_RUNTIME = previous;
 }
});

const runtimeModule = new URL('../scripts/emulator-runtime.mjs', import.meta.url).href;
const fifoDeadline = {operationMs:1500};

function expectRejection(run, message) {
 assert.equal(run.timedOut, null, JSON.stringify(run));
 assert.equal(run.code, 0, run.stderr);
 assert.equal(run.result?.outcome, 'threw');
 assert.match(run.result.message, message);
}

test('FIFO runtime input and regular-to-FIFO replacement fail promptly', async t => {
 for (const race of [false, true]) {
  const x = fixture(t), path = join(x.directory, 'runtime.json'), fifo = race ? path+'.fifo' : path;
  if (!race) rmSync(path);
  assert.equal(spawnSync('mkfifo', [fifo]).status, 0);
  const prepare = `
   import fs from 'node:fs';
   import {syncBuiltinESMExports} from 'node:module';
   const {directory,pin}=${JSON.stringify(x)};
   const path=directory+'/runtime.json';
   if (${race}) {
    const original=fs.lstatSync;
    let swapped=false;
    fs.lstatSync=function(p,...args) {
     const stat=original(p,...args);
     if (p===path && !swapped) { swapped=true; fs.renameSync(path+'.fifo',path); }
     return stat;
    };
    syncBuiltinESMExports();
   }
   const {readEmulatorRuntime}=await import(${JSON.stringify(runtimeModule)});`;
  const run = await runFifoOperation(prepare, 'readEmulatorRuntime({directory,pin})', fifoDeadline);
  expectRejection(run, /Regular runtime input required/);
 }
});

test('repository runtime pin refuses links, FIFO and oversized input', async t => {
 const x=fixture(t), path=join(x.directory,'pin.json');
 writeFileSync(path, JSON.stringify(x.pin)); assert.deepEqual(readEmulatorPin(path), x.pin);
 rmSync(path); symlinkSync(join(x.directory,'runtime.json'), path); assert.throws(() => readEmulatorPin(path), /symlink/);
 rmSync(path); assert.equal(spawnSync('mkfifo', [path]).status, 0);
 const run=await runFifoOperation(
  `const {readEmulatorPin}=await import(${JSON.stringify(runtimeModule)});`,
  `readEmulatorPin(${JSON.stringify(path)})`, fifoDeadline,
 );
 expectRejection(run, /Regular runtime pin/);
 rmSync(path); writeFileSync(path, ' '.repeat(65537)); assert.throws(() => readEmulatorPin(path), /size/);
});

test('the runtime watchdog kills and reaps a blocked FIFO reader', async t => {
 const {directory}=fixture(t), path=join(directory,'blocked.fifo');
 assert.equal(spawnSync('mkfifo', [path]).status, 0);
 const run=await runFifoOperation("import {readFileSync} from 'node:fs';",
  `readFileSync(${JSON.stringify(path)})`, fifoDeadline);
 assert.equal(run.operationStarted, true, JSON.stringify(run));
 assert.equal(run.timedOut, 'operation');
 assert.equal(run.signal, 'SIGKILL');
 assert.equal(run.result, null);
});
