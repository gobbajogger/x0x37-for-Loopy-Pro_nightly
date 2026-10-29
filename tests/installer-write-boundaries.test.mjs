// SPDX-License-Identifier: GPL-3.0-only
// Actual shipping Updater.install/write/resume and installKeepingSlots bodies.
// Only discovery/serve/MIDI-link boundaries are mocked; no physical-unit claim.
import { makePackage } from './fixtures/bundled-synthetic.mjs';
import { withInstallSnapshot } from './fixtures/install-snapshot.mjs';
import { logicalImage } from '../web/fm1pkg.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
const source = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8').replace(/^export\s+/gm, '');
const otaContext = { setTimeout(fn) { fn(); return 0; }, clearTimeout() {}, TextEncoder };
new Script(source('web/fm1ota.js')+'\nthis.api={Updater,sameKeyboard,pack7};').runInNewContext(otaContext);
const { Updater, sameKeyboard, pack7 } = otaContext.api;
const slotsContext = { TextEncoder, TextDecoder, crypto: globalThis.crypto };
new Script(source('web/x0x_breaks.js')+'\nthis.api={installKeepingSlots,crc32,userSlotRaw};').runInNewContext(slotsContext);
const { installKeepingSlots } = slotsContext.api;
let cases = 0, failed = 0;
async function check(name, run) {
  cases++;
  try { await run(); console.log('PASS '+name); }
  catch (error) { failed++; console.error('FAIL '+name+': '+error.message); }
}
const image = new Uint8Array(1024);
function device(model, text=model+'_900', ports=null) {
  const state = { sends: [], closed: 0 };
  const input=ports?.input||{name:model,state:'connected'},output=ports?.output||{name:model,state:'connected'};
  return { name:input.name, id: { model, text, version:Number(text.split("_")[1]) }, state, link: {
    input, output,
    send(bytes) { state.sends.push([...bytes]); return true; }, close() { state.closed++; }
  } };
}
function accessFor(dev) {
  const listeners=new Set();
  return {inputs:new Map(dev?[['in',dev.link.input]]:[]),outputs:new Map(dev?[['out',dev.link.output]]:[]),
    addEventListener(type,listener){assert.equal(type,'statechange');listeners.add(listener);},
    removeEventListener(type,listener){assert.equal(type,'statechange');listeners.delete(listener);}};
}
function portFor(access,dev) { access.inputs=new Map([['in',dev.link.input]]);access.outputs=new Map([['out',dev.link.output]]); }
async function installCase(product, appModel, loaderModel, accept) {
  const app = device(appModel), loader = device(loaderModel,loaderModel+'_900',app.link), back = device(product.split('_')[0],product,app.link);
  const access=accessFor(app),up = new Updater(access,()=>{}); let loaderServe = 0, verifyServe = 0;
  up.find = async filter => { assert.ok(filter(app.id)); return app; };
  const found = [loader, back];
  up.waitFor = async filter => { const dev=found.shift(); portFor(access,dev); assert.ok(filter(dev.id),'discovery honors actual filter'); return dev; };
  up.serve = async (link, bytes, finish) => {
    assert.equal(bytes, image);
    if (finish===0xF0000000) { assert.equal(link,loader.link); loaderServe++; }
    else { assert.equal(finish,0xE0000000); verifyServe++; }
    return { finished: true, served: 1 };
  };
  if (accept) {
    assert.equal(await up.install(image, product), product);
    assert.equal(loader.state.sends.length,1); assert.equal(loaderServe,1);
    assert.deepEqual(loader.state.sends[0],[0xF0,0x22,0x24,0x35,0x7F,0xF7]);
  } else {
    await assert.rejects(up.install(image,product), error=>error.code==='model');
    assert.equal(loader.state.sends.length,0,'wrong-family loader receives no UPGRADE');
    assert.equal(loaderServe,0,'wrong-family loader receives no image reads');
    assert.equal(loader.state.closed,1);
  }
  assert.equal(verifyServe,1,'initial running-firmware staging remains actual install behavior');
}
await check('install rejects ota-FM-1 before loader write for Elite package',()=>installCase('SMK-37 Elite_900','SMK-37 Elite','ota-FM-1',false));
await check('install rejects ota-SMK before loader write for FM-1 package',()=>installCase('FM-1_900','FM-1','ota-SMK-37 Pro',false));
await check('install rejects Pro loader for Elite package',()=>installCase('SMK-37 Elite_900','SMK-37 Elite','ota-SMK-37 Pro',false));
await check('install rejects Elite loader for Pro package',()=>installCase('SMK-37 Pro_900','SMK-37 Pro','ota-SMK-37 Elite',false));
await check('install preserves matching Elite loader positive',()=>installCase('SMK-37 Elite_900','SMK-37 Elite','ota-SMK-37 Elite',true));
await check('install preserves matching Pro loader positive',()=>installCase('SMK-37 Pro_900','SMK-37 Pro','ota-SMK-37 Pro',true));
await check('install preserves FM-1 loader positive',()=>installCase('FM-1_900','FM-1','ota-FM-1',true));
for (const [name, product, model, accept] of [
  ['write cross-family refusal','SMK-37 Elite_900','ota-FM-1',false],
  ['write requires a known package identity','','ota-SMK-37 Elite',false],
  ['write rejects Pro loader for Elite package','SMK-37 Elite_900','ota-SMK-37 Pro',false],
  ['write allows matching Elite loader','SMK-37 Elite_900','ota-SMK-37 Elite',true],
]) await check(name,async()=>{
  const loader=device(model),up=new Updater(accessFor(loader),()=>{});up.bind(loader);up.product=product;let served=0;
  up.serve=async()=>{served++;return {finished:true};};
  if (accept) { await up.write(loader,image,()=>{}); assert.equal(loader.state.sends.length,1); assert.equal(served,1); }
  else { await assert.rejects(up.write(loader,image,()=>{}),e=>e.code==='model');assert.equal(loader.state.sends.length,0);assert.equal(served,0); }
});
await check('resume preserves matching Elite loader on the same port pair',async()=>{
  const loader=device('ota-SMK-37 Elite'),up=new Updater(accessFor(loader),()=>{});let served=0;
  up.find=async filter=>{assert.ok(filter(loader.id));return loader;};
  up.serve=async()=>{served++;return {finished:true};};
  const back=device('SMK-37 Elite','SMK-37 Elite_900',loader.link);
  up.waitFor=async filter=>{portFor(up.access,back);assert.ok(filter(back.id));return back;};
  assert.equal(await up.resume(image,()=>{},'SMK-37 Elite_900'),true);
  assert.equal(up.verified,true);assert.equal(back.state.closed,1);
  assert.equal(served,1);assert.equal(loader.state.sends.length,1);
});
function slotDevice(text, mode) {
  const model=text.split('_')[0], state={closed:0,commands:[]}; let command;
  const link={
    input:{name:model,state:'connected'},output:{name:model,state:'connected'},
    drain() {},
    send(bytes) { command=bytes[4];state.commands.push(command);return mode!=='usb-loss'; },
    async read() {
      if(mode==='no-reply')return null;
      if(mode==='read-error')throw Error('synthetic USB read failure');
      if(command===15) {
        const payload=mode==='short-reply'?[1]:mode==='backup-error'?[1,80,1,0,1]:mode==='zero-count'?[0,80]:[2,80,0,0,0,0,0,0];
        return [0xF0,0x7D,0x46,0x4C,15,...payload,0xF7];
      }
      throw Error('synthetic slot backup read failure');
    },
    close(){state.closed++;}
  };
  return {name:model,id:{text,model,version:Number(text.split('_')[1])},link,state};
}
for(const [name,text,mode,code] of [
  ['X0X no slot response blocks install','SMK-37 Pro_900','no-reply','slotbackup'],
  ['USB send failure blocks install','SMK-37 Pro_900','usb-loss','slotbackup'],
  ['USB read failure blocks install','SMK-37 Pro_900','read-error','slotbackup'],
  ['malformed SMP_INFO blocks install','SMK-37 Pro_900','short-reply','slotbackup'],
  ['zero-slot SMP_INFO blocks install','SMK-37 Pro_900','zero-count','slotbackup'],
  ['stock corrupt reply is not unsupported','SMK-37 Pro_016','short-reply','slotbackup'],
  ['stock USB loss is not unsupported','SMK-37 Pro_016','usb-loss','slotbackup'],
  ['unclassified no response is not unsupported','SMK-37 Elite_017','no-reply','slotbackup'],
  ['stock Elite016 no SMP_INFO retains supported path','SMK-37 Elite_016','no-reply',null],
  ['stock MKE016 no SMP_INFO retains supported path','MKE-P37_016','no-reply',null],
  ['stock Starry016 no SMP_INFO retains supported path','STARRYKEY-37 Play_016','no-reply',null],
  ['stock FM1_015 no SMP_INFO retains supported path','FM-1_015','no-reply',null],
  ['required slot backup failure blocks install','SMK-37 Pro_900','backup-error','slotbackup'],
  ['known stock Pro016 no SMP_INFO retains existing manual path','SMK-37 Pro_016','no-reply',null],
  ['valid empty slot layout retains install','SMK-37 Pro_900','empty',null],
]) await check(name,async()=>{
  const dev=slotDevice(text,mode);let installs=0;
  const product=(text.startsWith('STARRYKEY-37')?'SMK-37 Pro':text.split('_')[0])+'_900';
  const up=new Updater(accessFor(dev),()=>{});
  up.find=async filter=>{assert.ok(filter(dev.id));return dev;};
  up.install=async()=>{installs++;return product;};
  if(mode==='empty'||mode==='backup-error')withInstallSnapshot(dev.link,up);
  const result=installKeepingSlots(up,image,product,product.startsWith('FM-1')?'fm1':'smk',{sameKeyboard});
  if(code) {await assert.rejects(result,e=>e.code===code);assert.equal(installs,0,'no installer entry after unknown layout/failed backup');}
  else {assert.equal((await result).product,product);assert.equal(installs,1);}
  assert.equal(dev.state.closed,1,'prewrite link is always closed');
});

for (const [product, model] of [['SMK-37 Elite_900','ota-FM-1'],['SMK-37 Elite_900','ota-SMK-37 Pro'],['FM-1_900','ota-SMK-37 Pro'],['','ota-SMK-37 Elite']])
 await check('resume refuses foreign/missing package '+product+'/'+model,async()=>{
  const loader=device(model),up=new Updater(accessFor(loader),()=>{});let served=0;
  up.find=async filter=>{assert.ok(filter(loader.id));return loader;};up.serve=async()=>{served++;return{finished:true};};
  await assert.rejects(up.resume(image,()=>{},product),e=>e.code==='model');
  assert.equal(loader.state.sends.length,0);assert.equal(served,0);assert.equal(loader.state.closed,1);
 });
await check('sameKeyboard preserves exact models and only the verified Starrykey-to-Pro alias',()=>{
 for(const name of ['SMK-37 Pro','SMK-37 Elite','MKE-P37','STARRYKEY-37 Play','SMK-37+VA'])
  {assert.equal(sameKeyboard(name,name),true);assert.equal(sameKeyboard(name,'SMK-37 Elite'),name==='SMK-37 Elite');assert.equal(sameKeyboard(name,'FM-1'),false);}
 assert.equal(sameKeyboard('STARRYKEY-37 Play','SMK-37 Pro'),true);
 assert.equal(sameKeyboard('FM-1','FM-1'),true);
});
function midiPort(name,text) {
 const state={sent:[],opens:0,text};
 const input={name,state:'connected',onmidimessage:null,async open(){state.opens++;}};
 const output={name,state:'connected',async open(){},send(bytes){
  state.sent.push([...bytes]);
  if(bytes[1]===0 && bytes[2]===0x32) {
   const payload=new Uint8Array(34);payload[1]=0x59;payload[2]=0x11;payload[3]=27;
   for(let i=0;i<state.text.length;i++)payload[i+6]=state.text.charCodeAt(i);
   payload[33]=~payload.slice(6,33).reduce((sum,b)=>sum+b,0)&255;
   input.onmidimessage?.({data:[0xF0,...pack7(payload),0xF7]});
  }
 }};
 return {input,output,state};
}
function usePorts(up,...ports) {
 up.access.inputs=new Map(ports.map((p,i)=>[String(i),p.input]));
 up.access.outputs=new Map(ports.map((p,i)=>[String(i),p.output]));
}
async function boundUpdater() {
 const up=new Updater(accessFor(),()=>{});
 const port=midiPort('SMK selected','SMK-37 Elite_900');usePorts(up,port);
 const dev=await up.find(id=>!/^ota-/.test(id.model));up.bind(dev);dev.link.close();
 return {up,port};
}
await check('bind single selected observable port positive',async()=>{
 const {up}=await boundUpdater();assert.equal(up.targetName,'SMK selected');assert.equal(up.singlePort('SMK selected').length,1);
});
await check('bind ambiguity refuses before app UPGRADE',async()=>{
 const up=new Updater(accessFor(),()=>{});
 const a=midiPort('SMK first','SMK-37 Elite_900'),b=midiPort('SMK second','SMK-37 Pro_900');usePorts(up,a,b);
 let served=0;up.serve=async()=>{served++;return{finished:true};};
 await assert.rejects(up.install(image,'SMK-37 Elite_900'),e=>e.code==='ambiguous');
 assert.equal(served,0);assert.equal(a.state.sent.filter(p=>p[1]===0x22).length,0);assert.equal(b.state.sent.length,0);
});
await check('selected port name change refuses before app UPGRADE',async()=>{
 const up=new Updater(accessFor(),()=>{}),a=midiPort('SMK before','SMK-37 Elite_900');usePorts(up,a);
 const original=Updater.prototype.find;
 up.find=async filter=>{const dev=await original.call(up,filter);usePorts(up,midiPort('SMK changed','SMK-37 Elite_900'));return dev;};
 await assert.rejects(up.install(image,'SMK-37 Elite_900'),e=>e.code==='ambiguous');
 assert.equal(a.state.sent.filter(p=>p[1]===0x22).length,0);
});
await check('real find/wait refuses replacement with a matching-model loader',async()=>{
 const {up}=await boundUpdater();const loader=midiPort('ota USB-MIDI','ota-SMK-37 Elite_900');usePorts(up,loader);
 await assert.rejects(up.waitFor(id=>/^ota-/.test(id.model),1000),e=>e.code==='continuity');assert.equal(loader.state.sent.length,0);
});
await check('real find/wait accepts matching-model loader on the uninterrupted pair',async()=>{
 const {up,port}=await boundUpdater();port.state.text='ota-SMK-37 Elite_900';
 const dev=await up.waitFor(id=>/^ota-/.test(id.model),1000);assert.equal(dev.id.model,'ota-SMK-37 Elite');dev.link.close();
});
await check('real bound find refuses changed family',async()=>{
 const {up,port}=await boundUpdater();port.state.text='ota-FM-1_900';
 await assert.rejects(up.find(),e=>e.code==='model');assert.equal(port.state.sent.filter(p=>p[1]===0x22).length,0);
 assert.equal(port.input.onmidimessage,null);
});
await check('real bound wait refuses observable ambiguity before handshake',async()=>{
 const {up}=await boundUpdater(),a=midiPort('SMK one','SMK-37 Elite_900'),b=midiPort('SMK two','SMK-37 Pro_900');usePorts(up,a,b);
 await assert.rejects(up.waitFor(()=>true,1000),e=>e.code==='ambiguous');assert.equal(a.state.sent.length,0);assert.equal(b.state.sent.length,0);
});
for(const mode of ['name-change','extra-port'])await check('verified find blocks '+mode+' before readback',async()=>{
 const {up}=await boundUpdater();up.verified=true;
 const a=midiPort(mode==='name-change'?'X0X changed':'SMK selected','SMK-37 Elite_900');
 const b=midiPort('SMK extra','SMK-37 Pro_900');usePorts(up,a,...(mode==='extra-port'?[b]:[]));
 await assert.rejects(up.find(),e=>e.code==='ambiguous');assert.equal(a.state.sent.length,0);assert.equal(b.state.sent.length,0);
});
await check('binding ambiguity blocks sample-layout query and backup',async()=>{
 const dev=slotDevice('SMK-37 Pro_900','backup-error'),up=new Updater(accessFor(dev),()=>{});let installs=0;
 up.access.inputs.set('extra',{name:'SMK extra',state:'connected'});up.find=async()=>dev;up.install=async()=>{installs++;};
 await assert.rejects(installKeepingSlots(up,image,'SMK-37 Pro_900','smk',{sameKeyboard}),e=>e.code==='ambiguous');
 assert.equal(dev.state.commands.length,0);assert.equal(installs,0);
});
// Actual archive/migration/restore bodies, with only sample/MIDI protocol I/O mocked.
for(const mode of ['positive','name-change','extra-port','archive-error','readback-mismatch'])await check('post-install restore binding '+mode,async()=>{
 const dev=slotDevice('SMK-37 Pro_900','empty'),back=slotDevice('SMK-37 Pro_900','empty');
 back.link.input=dev.link.input;back.link.output=dev.link.output;
 const up=new Updater(accessFor(dev),()=>{});let installs=0,postReads=0,writes=0,saved=false;const events=[];
 const oldLayout={count:1,size:4096,ext:true,slots:[{nz:1,off:0,size:4096,used:1}]};
 const newLayout=()=>({count:1,size:4096,ext:true,slots:[{nz:writes?1:0,off:4096,size:4096,used:writes?1:0}]});
 const {userSlotRaw,crc32}=slotsContext.api;const part=userSlotRaw('test',[{adpcm:new Uint8Array([17]),n:2,rate:44100}],4096);
 const sample=new Uint8Array(512+part.data.length);sample.fill(255);sample.set(part.hdr);sample.set(part.data,512);
 const packageImage=logicalImage(makePackage('pro',{slotMap:[[4096,4096]]}));
 const io={layout:async link=>{if(link===dev.link)return oldLayout;postReads++;return newLayout();},
  backup:async()=>{events.push('backup');const img=sample.slice();if(mode==='archive-error')img[512]^=1;return{layout:oldLayout,images:[img]};},
  write:async()=>{writes++;events.push('restore');},read:async()=>{const img=sample.slice();if(mode==='readback-mismatch')img[512]^=1;return img;}};
 const context={TextEncoder,TextDecoder,crypto:globalThis.crypto,io};new Script(source('web/x0x_breaks.js')+'\nreadSlotLayout=io.layout;backupSlots=io.backup;writeSlotImage=io.write;readSlotImage=io.read;this.run=installKeepingSlots;').runInNewContext(context);
 up.find=async()=>dev;up.install=async()=>{assert.equal(saved,true,'verified archive saved before install');installs++;events.push('install');up.targetName=back.name;up.verified=true;portFor(up.access,back);if(mode==='name-change')up.access.inputs.set('in',{name:'SMK changed',state:'connected'});if(mode==='extra-port')up.access.inputs.set('extra',{name:'SMK extra',state:'connected'});return 'SMK-37 Pro_900';};
 up.waitFor=async()=>back;
 withInstallSnapshot(dev.link,up);
 const result=context.run(up,packageImage,'SMK-37 Pro_900','smk',{sameKeyboard,save(){saved=true;events.push('save');return true; /* simulated retained backup */}});
 if(mode==='positive'){await result;assert.equal(installs,1);assert.equal(writes,1);assert.ok(postReads>0);assert.deepEqual(events,['backup','save','install','restore']);}
 else{await assert.rejects(result);if(mode==='archive-error'){assert.equal(installs,0);assert.equal(saved,false);}else if(mode==='readback-mismatch'){assert.equal(installs,1);assert.equal(writes,1);}else{assert.equal(installs,1);assert.equal(postReads,0);assert.equal(writes,0);}}
});
// B4-B8 use observable WebMIDI port names and real bind/find/wait guards.
console.log(JSON.stringify({cases,failed,scope:'actual browser shipping bodies; synthetic discovery/serve/MIDI boundaries, no hardware'}));
assert.equal(failed,0,'shipping write boundary regressions');
