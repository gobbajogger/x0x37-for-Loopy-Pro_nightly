import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../install/index.html',import.meta.url),'utf8');
const start=html.indexOf('const HS_QUERY ='),end=html.indexOf('// SPDX-License-Identifier:',html.indexOf('  async resume',start));
const{Updater,openMidiPort}=await import('data:text/javascript;base64,'+Buffer.from(html.slice(start,end)+'\nexport {Updater,openMidiPort};').toString('base64'));
async function advance(t,ms){for(let n=0;n<ms;n+=100){t.mock.timers.tick(100);await new Promise(r=>setImmediate(r));}}
for(const connection of ['open','closed'])test(`hung ${connection} port.open is bounded even after statechange`,async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const listeners=new Set();let settled=false,error;
 const port={connection,open(){return new Promise(()=>{})},addEventListener(_,fn){listeners.add(fn);queueMicrotask(fn)},removeEventListener(_,fn){listeners.delete(fn)}};
 openMidiPort(port).then(()=>{settled=true},e=>{settled=true;error=e});
 await advance(t,3500);assert.equal(settled,true,'entire open must time out');assert.equal(error?.code,'open');assert.equal(listeners.size,0);
});
test('waitFor deadline bounds hung opening and late completion cannot install a handler',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});let resolveOpen;
 const input={name:'SMK-37 Pro',state:'connected',connection:'open',onmidimessage:null,open(){return new Promise(r=>resolveOpen=r)}};
 const output={...input,open:async()=>{},send(){}};
 const u=new Updater({inputs:new Map([['i',input]]),outputs:new Map([['o',output]])});let settled=false,result;
 u.waitFor(()=>true,500).then(x=>{settled=true;result=x});await advance(t,600);
 assert.equal(settled,true);assert.equal(result,null);assert.equal(input.onmidimessage,null);
 resolveOpen();await advance(t,1000);assert.equal(input.onmidimessage,null);
});
test('closed port with resolved open but no statechange times out and removes observer',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});const listeners=new Set();let error;
 const p={connection:'closed',open:async()=>{},addEventListener(_,f){listeners.add(f)},removeEventListener(_,f){listeners.delete(f)}};
 openMidiPort(p).catch(e=>error=e);await advance(t,3100);assert.equal(error?.code,'open');assert.equal(listeners.size,0);
});
test('discovery deadline bounds silent handshake and removes its handler',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const input={name:'SMK-37 Pro',state:'connected',connection:'open',onmidimessage:null,open:async()=>{}};
 const output={...input,send(){}};
 const u=new Updater({inputs:new Map([['i',input]]),outputs:new Map([['o',output]])});let settled=false;
 u.waitFor(()=>true,500).then(x=>{assert.equal(x,null);settled=true});await advance(t,600);assert.equal(settled,true);assert.equal(input.onmidimessage,null);
});
test('normal closed-port transition still succeeds and removes temporary observer',async()=>{
 const listeners=new Set();const p={connection:'closed',open:async()=>{for(const f of listeners)f()},addEventListener(_,f){listeners.add(f)},removeEventListener(_,f){listeners.delete(f)}};
 await openMidiPort(p);assert.equal(listeners.size,0);
});
test('output opening cannot exceed remaining discovery deadline after input succeeds',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});let resolveOutput;
 const input={name:'SMK-37 Pro',state:'connected',connection:'open',onmidimessage:null,open:async()=>{}};
 const output={...input,open(){return new Promise(r=>resolveOutput=r)},send(){}};
 const u=new Updater({inputs:new Map([['i',input]]),outputs:new Map([['o',output]])});let settled=false;
 u.waitFor(()=>true,500).then(x=>{assert.equal(x,null);settled=true});await advance(t,600);assert.equal(settled,true);assert.equal(input.onmidimessage,null);resolveOutput();await advance(t,1000);assert.equal(input.onmidimessage,null);
});
