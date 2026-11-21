// SPDX-License-Identifier: GPL-3.0-only
// Run with the same DNBOX_EMULATOR_RUNTIME used by the product build.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readEmulatorPin,readEmulatorRuntime} from '../../scripts/emulator-runtime.mjs';
import {patternLockSpecs} from '../../web/product-site/remote/pattern-locks.mjs';

const pin=readEmulatorPin(fileURLToPath(new URL('../../scripts/emulator-runtime-pin.json',import.meta.url)));
const runtime=new Map(readEmulatorRuntime({directory:process.env.DNBOX_EMULATOR_RUNTIME,pin}));
const adapter=runtime.get('emu/wasi.mjs');
const {createKernelWasi}=await import('data:text/javascript;base64,'+adapter.toString('base64'));
const wasm=new WebAssembly.Module(runtime.get('emu/kernel.wasm'));
const wasi=createKernelWasi(()=>native.memory);
const native=new WebAssembly.Instance(wasm,{wasi_snapshot_preview1:wasi}).exports;
native._initialize();
assert.equal(native.web_boot(),0);
for(let i=0;i<600;i++)native.web_render(128);

// Factory voice 1 is Chicago. Both Draft owners can select the Chicago bank.
const voice=1, parameters=20;
assert.equal(native.web_sound_read(voice),parameters);
function nativeValue(parameter,value){
 const data=new Int32Array(native.memory.buffer,native.web_sound_data(),parameters*7);
 const current=data[parameter*7+3];
 if(current!==value){
  assert.equal(native.web_sound_set_voice(voice,native.web_sound_revision(),parameter,current,value),0);
  for(let n=0;native.web_sound_poll()===0 && n<100;n++)native.web_render(128);
  assert.equal(native.web_sound_poll(),1);
  assert.equal(native.web_sound_read(voice),parameters);
 }
 const text=Buffer.from(native.memory.buffer,native.web_sound_text()+parameter*96,96);
 return text.toString('ascii',0,text.indexOf(0))+text.toString('ascii',64,text.indexOf(0,64));
}
const curves=[];
let comparisons=0;
for(let parameter=0;parameter<parameters;parameter++){
 const fields=patternLockSpecs.filter(field=>field.bank==='CHICAGO'&&field.parameter===parameter);
 assert.deepEqual(fields.map(f=>f.part),[2,3]);
 const curve=[];
 for(let raw=0;raw<=(parameter===17?11:127);raw++){
  const expected=nativeValue(parameter,raw);curve.push(expected);
  for(const field of fields){
   assert.equal(field.text(raw),expected,`${field.owner} parameter ${parameter} raw ${raw}`);
   comparisons++;
  }
 }
 curves.push(curve);
}
console.log(JSON.stringify({kernel:pin.kernel,wasm:pin.files['kernel.wasm'].sha256,
 nativeValues:curves.flat().length,draftComparisons:comparisons,
 nativeCurveSha256:createHash('sha256').update(JSON.stringify(curves)).digest('hex')}));
