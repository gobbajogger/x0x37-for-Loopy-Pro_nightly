// SPDX-License-Identifier: GPL-3.0-only
// Exercise the pinned emulator and the Remote consumers through their public ports.
// Node supplies the message channel and audio clock. No browser or MIDI device is used.
// DNBOX_EMULATOR_RUNTIME=/path/to/emu node tests/product-remote/native-readback.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {MessageChannel} from 'node:worker_threads';
import {readEmulatorPin,readEmulatorRuntime} from '../../scripts/emulator-runtime.mjs';
import {mixControlBindings} from '../../web/product-site/remote/runtime-mix-map.mjs';
import {chicagoControlBindings} from '../../web/product-site/remote/runtime-sound-map.mjs';
import {createRuntimeMixState} from '../../web/product-site/remote/runtime-mix-state.mjs';
import {createRuntimeSoundState} from '../../web/product-site/remote/runtime-sound-state.mjs';
import {SourceSounds} from '../../web/product-site/remote/sound.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const directory=process.env.DNBOX_EMULATOR_RUNTIME;
const pin=readEmulatorPin(join(root,'scripts/emulator-runtime-pin.json'));
const files=new Map(readEmulatorRuntime({directory,pin}));
const moduleUrl=name=>pathToFileURL(resolve(directory,name));
const {createNativeControlProvider,createNativeSoundProvider}=await import(moduleUrl('native-session.mjs'));
const loadJson=name=>JSON.parse(readFileSync(join(root,'web/product-site/remote',name),'utf8'));
const catalog=loadJson('catalog.json');
const mix=mixControlBindings(catalog,loadJson('components.json')).groups;
const sound=chicagoControlBindings(new SourceSounds(loadJson('source-sounds.json'),catalog).entries()).groups;
const {port1,port2}=new MessageChannel();
const identity={firmware:pin.firmware,kernel:pin.files['kernel.wasm'].sha256,session:'readback-test'};
let Processor;
globalThis.sampleRate=44100;
globalThis.currentTime=0;
globalThis.AudioWorkletProcessor=class{constructor(){this.port=port1;}};
globalThis.registerProcessor=(name,processor)=>{assert.equal(name,'dnbox-native-kernel');Processor=processor;};
await import(moduleUrl('worklet.mjs'));
const processor=new Processor();
const output=[[new Float32Array(128),new Float32Array(128)]];
function advance(ms){
 for(let i=0;i<Math.ceil(ms*44.1/128);i++){
  globalThis.currentTime+=128/44100;
  assert.ok(processor.process([],output),'native processor stopped');
 }
}
async function panel(message,ms){
 await processor.message(message);
 advance(ms);
 await nextTurn();
}

async function exercise(state,makeProvider,controls){
 const reader=makeProvider();
 let operation='read baseline';
 try{
  const baseline=await reader.read();
  for(const [key,descriptor] of controls){
   // An independent Chicago READ issues a new revision. Reconnect before the next edit.
   operation='connect for '+key;
   await state.connect(makeProvider());
   const prior=state.snapshot().values.get(key);
   assert.ok(Number.isInteger(prior),key);
   const desired=prior===descriptor.max?prior-1:prior+1;
   operation='set '+key;
   await state.change(key,desired);
   operation='read after '+operation;
   const edited=await reader.read();
   const stored=edited.controls.find(c=>c.target===descriptor.target&&c.voice===descriptor.voice&&c.parameter===descriptor.parameter);
   assert.equal(stored.value,desired,key);
   assert.equal(state.snapshot().values.get(key),stored.value,key);
   operation='undo '+key;
   await state.undo();
   operation='read after '+operation;
   const restored=await reader.read();
   assert.deepEqual(restored.controls,baseline.controls,key);
   assert.equal(state.snapshot().values.get(key),prior,key);
   assert.equal(state.snapshot().canUndo,false,key);
  }
  return controls.size;
 }catch(error){throw Error('Native readback failed during '+operation,{cause:error});}
 finally{state.close();reader.close();}
}

let render;
try{
 const ready=new Promise((resolve,reject)=>port2.addEventListener('message',({data})=>{
  if(data.type==='ready')resolve();
  if(data.type==='error')reject(Error(data.message));
 }));
 port2.start();
 port2.postMessage({type:'load',bytes:files.get('emu/kernel.wasm'),observer:identity});
 await ready;
 advance(300);
 render=setInterval(()=>advance(6),1);
 const makeMix=()=>createNativeControlProvider({port:port2,pin:identity});
 const mixCount=await exercise(createRuntimeMixState(mix),makeMix,mix);
 const soundCounts=[];
 for(const voice of [1,0]){
  if(voice===0){
   // The stock Bass A boots in Miami. Select Chicago with the panel controls.
   for(let i=0;i<4;i++)await panel({type:'turn',role:1,delta:1},240);
   await panel({type:'buttons',bits:1<<4},110);
   await panel({type:'buttons',bits:0},110);
   await panel({type:'turn',role:0,delta:-1},240);
   await panel({type:'turn',role:3,delta:-1},240);
  }
  const makeSound=()=>createNativeSoundProvider({port:port2,pin:identity,voice});
  const controls=new Map([...sound].filter(([,descriptor])=>descriptor.voice===voice));
  soundCounts[voice]=await exercise(createRuntimeSoundState(sound,{voice}),makeSound,controls);
 }
 assert.deepEqual([mixCount,...soundCounts],[29,20,20]);
 console.log(JSON.stringify({firmware:pin.firmware,kernel:pin.kernel,wasm_sha256:identity.kernel,
  mix:mixCount,chicago_bass_a:soundCounts[0],chicago_bass_b:soundCounts[1],
  fresh_reads_after_edit_and_undo:2*(mixCount+soundCounts[0]+soundCounts[1])}));
}finally{
 clearInterval(render);
 port1.close();
 port2.close();
}
