// SPDX-License-Identifier: GPL-3.0-only
// Actual production link/request lifecycle; synthetic WebMIDI only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectMidiLink, ProjectDevice, PROJECT_OP } from '../web/x0x_projects.js';
const ack = [0xF0,0x7D,0x46,0x4C,9,PROJECT_OP.WRITE,0,1,0,0,0xF7];
function setup() {
  let listener, detached, removals=0;
  const frames=[];
  const input={state:'connected',addEventListener(t,f){listener=f;},removeEventListener(t,f){assert.equal(f,listener);detached=f;listener=null;removals++;}};
  const output={state:'connected',send(frame){frames.push([...frame]);}};
  const link=new ProjectMidiLink(input,output), device=new ProjectDevice(link,{timeout:5});
  device.identity='X0X keyboard';
  const emit=()=>listener?.({data:Uint8Array.from(ack)});
  const write=(tries=2)=>device.command(PROJECT_OP.WRITE,[0,0,0,1],{length:5,offset:1,tries,timeout:5});
  return {input,output,link,device,frames,emit,write,late:()=>detached?.({data:Uint8Array.from(ack)}),removals:()=>removals};
}
test('live timeout retries exactly once and accepts the matching second WRITE ACK',async()=>{
  const f=setup(), send=f.output.send;
  f.output.send=frame=>{send(frame);if(f.frames.length===2)queueMicrotask(f.emit);};
  await f.write();assert.equal(f.frames.length,2);assert.equal(f.link.closed,false);f.link.close();
});
test('live unanswered requests retain the bounded retry count',async()=>{
  const f=setup();await assert.rejects(f.write(3),e=>e.code==='timeout');
  assert.equal(f.frames.length,3);f.link.close();
});
test('explicit close with both ports still connected stops the pending retry',async()=>{
  const f=setup(),p=f.write();f.link.close();
  await assert.rejects(p,e=>e.code==='connection');assert.equal(f.frames.length,1);assert.equal(f.link.pending,null);
});
for(const port of ['input','output'])test(`${port} disconnect without a statechange callback prevents the retry`,async()=>{
  const f=setup(),p=f.write();f[port].state='disconnected';
  f.emit(); // A queued callback is not valid evidence of a still-live connection.
  await assert.rejects(p,e=>e.code==='connection');assert.equal(f.frames.length,1);f.link.close();
});
for(const port of ['input','output'])test(`${port} already disconnected refuses the first send`,async()=>{
  const f=setup();f[port].state='disconnected';
  await assert.rejects(f.write(),e=>e.code==='connection');assert.equal(f.frames.length,0);f.link.close();
});
test('closed link cannot send, wait again, or revive after a port replug',async()=>{
  const f=setup();f.link.close();f.input.state='disconnected';f.input.state='connected';
  assert.equal(f.link.send(ack),false);assert.equal(await f.link.read(10000),null);assert.equal(f.link.pending,null);
  await assert.rejects(f.write(),e=>e.code==='connection');assert.equal(f.frames.length,0);
});
test('close is idempotent, resolves a pending read and ignores a queued detached callback',async()=>{
  const f=setup(), pending=f.link.read(10000);f.link.close();f.link.close();f.late();
  assert.equal(await pending,null);assert.equal(f.removals(),1);assert.equal(f.link.pending,null);assert.equal(f.link.queue.length,0);
});
test('close discards buffered replies instead of returning stale evidence',async()=>{
  const f=setup();f.emit();assert.equal(f.link.queue.length,1);f.link.close();
  assert.equal(await f.link.read(10000),null);assert.equal(f.link.queue.length,0);
});
test('disconnected link cannot deliver a previously buffered reply',async()=>{
  const f=setup();f.emit();f.input.state='disconnected';
  assert.equal(await f.link.read(10000),null);f.link.close();
});
test('fresh link can connect after a separate old link was closed',async()=>{
  const old=setup();old.link.close();const fresh=setup(),p=fresh.write();fresh.emit();await p;
  assert.equal(fresh.frames.length,1);assert.equal(old.frames.length,0);fresh.link.close();
});
