// SPDX-License-Identifier: GPL-3.0-only
// Consumer lifecycle only; these provider doubles are NOT native engine proof.
import test from 'node:test';import assert from 'node:assert/strict';import{existsSync}from'node:fs';
const url=new URL('../../web/product-site/remote/runtime-mix-state.mjs',import.meta.url);
const mod=existsSync(url)?await import(url):{};
const groups=new Map([['5:0:0',{key:'5:0:0',target:5,voice:0,parameter:0,min:0,max:127}]]);
const snap=value=>({controls:[{target:5,voice:0,parameter:0,min:0,max:127,kind:'u32',value}]});
const make=()=>{assert.equal(typeof mod.createRuntimeMixState,'function');return mod.createRuntimeMixState(groups)};
test('state changes only after native provider acknowledgment and Undo uses opaque token',async()=>{
 const s=make();let release,call;const p={read:async()=>snap(75),set:async args=>{call=args;return await new Promise(r=>release=r)},undo:async({token})=>{assert.equal(token,'one');return{...snap(75),undoToken:null}},close(){}};
 await s.connect(p);const pending=s.change('5:0:0',80);assert.equal(s.snapshot().values.get('5:0:0'),75);assert.equal(s.snapshot().phase,'busy');assert.deepEqual(call,{target:5,voice:0,parameter:0,expected:75,value:80});
 release({...snap(80),undoToken:'one'});await pending;assert.equal(s.snapshot().values.get('5:0:0'),80);await s.undo();assert.equal(s.snapshot().values.get('5:0:0'),75);assert.equal(s.snapshot().canUndo,false);
});
test('missing/malformed native snapshot never supplies captured defaults',async()=>{
 for(const value of [{controls:[]},snap(128),{controls:[...snap(50).controls,...snap(50).controls]}, {controls:[{...snap(50).controls[0],kind:'f32'}]}]){
  const s=make();await assert.rejects(s.connect({read:async()=>value,set(){},undo(){},close(){}}));assert.equal(s.snapshot().phase,'unavailable');assert.equal(s.snapshot().values.size,0);
 }
});
test('Stop during in-flight native edit cannot repopulate closed session',async()=>{
 const s=make();let release,closed=0;await s.connect({read:async()=>snap(75),set:()=>new Promise(r=>release=r),undo(){},close(){closed++}});
 const pending=s.change('5:0:0',90);s.close();release({...snap(90),undoToken:'late'});await pending;assert.equal(s.snapshot().phase,'inactive');assert.equal(s.snapshot().values.size,0);assert.equal(closed,1);
});
test('conflict or ambiguous reply blocks further writes instead of retrying effects',async()=>{
 const s=make();let calls=0;await s.connect({read:async()=>snap(75),set:async()=>{calls++;throw Error('conflict')},undo(){},close(){}});
 await assert.rejects(s.change('5:0:0',80),/conflict/);assert.equal(s.snapshot().phase,'unavailable');await assert.rejects(s.change('5:0:0',81));assert.equal(calls,1);assert.equal(s.snapshot().values.size,0);
});
test('invalid control/domain and parallel request never reach provider',async()=>{
 const s=make();let calls=0,release;await s.connect({read:async()=>snap(75),set:async()=>{calls++;return await new Promise(r=>release=r)},undo(){},close(){}});
 await assert.rejects(s.change('unknown',10));await assert.rejects(s.change('5:0:0',128));assert.equal(calls,0);
 const p=s.change('5:0:0',80);await assert.rejects(s.change('5:0:0',81));assert.equal(calls,1);release({...snap(80),undoToken:'token'});await p;
 const copy=s.snapshot();copy.values.set('5:0:0',1);assert.equal(s.snapshot().values.get('5:0:0'),80);
});
test('failed replacement preserves the existing native session and Undo receipt',async()=>{
 const s=make();let closed=0;const old={read:async()=>snap(75),set:async()=>({...snap(80),undoToken:'old'}),undo:async()=>({...snap(75),undoToken:null}),close(){closed++}};
 await s.connect(old);await s.change('5:0:0',80);
 await assert.rejects(s.connect({read:async()=>{throw Error('candidate failed')},set(){},undo(){},close(){}}));
 assert.equal(closed,0);assert.equal(s.snapshot().phase,'ready');assert.equal(s.snapshot().values.get('5:0:0'),80);assert.equal(s.snapshot().canUndo,true);await s.undo();assert.equal(s.snapshot().values.get('5:0:0'),75);
});
test('failed reconnect after uncertain write cannot restore ready with empty readings',async()=>{
 const s=make();let writes=0;
 await s.connect({read:async()=>snap(75),set:async()=>{writes++;throw Error('uncertain')},undo(){},close(){}});
 await assert.rejects(s.change('5:0:0',80));
 await assert.rejects(s.connect({read:async()=>{throw Error('new failed')},set(){},undo(){},close(){}}));
 assert.equal(s.snapshot().phase,'unavailable');assert.equal(s.snapshot().values.size,0);
 await assert.rejects(s.change('5:0:0',81));assert.equal(writes,1);
});
test('older same-provider connect cannot close the newer adopted session',async()=>{
 const s=make();const readers=[];let closed=0;
 const p={read:()=>new Promise(resolve=>readers.push(resolve)),set:async()=>({...snap(81),undoToken:'ok'}),undo(){},close(){closed++}};
 const first=s.connect(p),second=s.connect(p);readers[1](snap(80));await second;readers[0](snap(75));await first;
 assert.equal(closed,0);assert.equal(s.snapshot().phase,'ready');assert.equal(s.snapshot().values.get('5:0:0'),80);
 await s.change('5:0:0',81);assert.equal(s.snapshot().values.get('5:0:0'),81);s.close();assert.equal(closed,1);
});
test('invalid provider values cannot leave consumer loading or ready',async()=>{
 for(const candidate of [null,4,'bad',{},true]){const s=make();await assert.rejects(s.connect(candidate));assert.equal(s.snapshot().phase,'unavailable');}
});
test('Stop closes pending candidate once and late read never admits it',async()=>{
 const s=make();let done,closed=0;const p={read:()=>new Promise(r=>done=r),set(){},undo(){},close(){closed++}};
 const loading=s.connect(p);s.close();assert.equal(closed,1);done(snap(75));await loading;assert.equal(closed,1);assert.equal(s.snapshot().phase,'inactive');assert.equal(s.snapshot().values.size,0);
});
test('superseded unresolved candidates are closed without waiting for their reads',()=>{
 const s=make();let aClosed=0,bClosed=0;
 const a={read:()=>new Promise(()=>{}),set(){},undo(){},close(){aClosed++}};
 const b={read:()=>new Promise(()=>{}),set(){},undo(){},close(){bClosed++}};
 void s.connect(a);void s.connect(b);assert.equal(aClosed,1);assert.equal(bClosed,0);s.close();assert.equal(aClosed,1);assert.equal(bClosed,1);
});
test('consumer Undo history never advertises beyond native sixteen-record retention',async()=>{
 const s=make();let value=50,serial=0;const before=new Map();
 await s.connect({read:async()=>snap(value),set:async change=>{const token=String(++serial);before.set(token,value);value=change.value;return{...snap(value),undoToken:token}},undo:async({token})=>{value=before.get(token);return{...snap(value),undoToken:null}},close(){}});
 for(let i=0;i<17;i++)await s.change('5:0:0',51+i);
 for(let i=0;i<16;i++)await s.undo();
 assert.equal(s.snapshot().canUndo,false);assert.equal(s.snapshot().values.get('5:0:0'),51);
});

test('a valid token cannot confirm a Mix edit with an unchanged stored value',async()=>{
 const state=make();
 await state.connect({read:async()=>snap(75),set:async()=>({...snap(75),undoToken:'one'}),undo(){},close(){}});
 await assert.rejects(state.change('5:0:0',80),/not confirmed/);
 assert.equal(state.snapshot().phase,'unavailable');
 assert.equal(state.snapshot().canUndo,false);
});

test('a Mix Undo requires the previous stored value in the native readback',async()=>{
 const state=make();
 await state.connect({read:async()=>snap(75),set:async()=>({...snap(80),undoToken:'one'}),
  undo:async()=>({...snap(80),undoToken:null}),close(){}});
 await state.change('5:0:0',80);
 await assert.rejects(state.undo(),/not confirmed/);
 assert.equal(state.snapshot().phase,'unavailable');
 assert.equal(state.snapshot().values.size,0);
});
