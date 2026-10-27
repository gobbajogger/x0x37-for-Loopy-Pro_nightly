// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseProject,ProjectDevice,PROJECT_OP} from '../../web/x0x_projects.js';
let checks=0;
for(const path of process.argv.slice(2)) {
 const b=new Uint8Array(readFileSync(path)), meta=parseProject(b,b.length);
 assert.ok([6,7].includes(meta.patternVersion));assert.equal(meta.soundRevision,11);assert.equal(meta.payloadLength,36420);checks+=3;
 for(const stream of [4,5,8]) {const bad=b.slice();new DataView(bad.buffer).setUint32(20,stream,true);assert.throws(()=>parseProject(bad),e=>e.code==='version');checks++;}
 const bad=b.slice();bad[80]^=1;assert.throws(()=>parseProject(bad),e=>/CRC/.test(e.message));checks++;
}
const queryDevice=new ProjectDevice({});
queryDevice.command=async()=>[PROJECT_OP.QUERY,0,2,36452&127,(36452>>7)&127,(36452>>14)&127,0];
assert.equal(await queryDevice.query(),36452);assert.equal(queryDevice.projectProtocol,2);checks+=2;
const device=new ProjectDevice({});device.projectProtocol=2;
const calls=[];device.command=async (...args)=>calls.push(args);
await assert.rejects(device.adoptLegacyBass([0,0]),e=>e.code==='identity');checks++;
await assert.rejects(device.adoptLegacyBass([1,1],{confirmed:true}),e=>e.code==='identity');checks++;
await device.adoptLegacyBass([0,1],{confirmed:true});assert.deepEqual(calls,[[PROJECT_OP.ADOPT_BASS,[0,1,0x58,0x30]]]);checks++;
console.log(`PASS ${checks} actual rev11 producer/browser pair and explicit adoption command checks`);
