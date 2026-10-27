// SPDX-License-Identifier: GPL-3.0-only
// Actual production request parser, synthetic frames only; no device access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pack7, unpack7, Updater } from '../web/fm1ota.js';
const source = readFileSync(new URL('../web/fm1ota.js', import.meta.url), 'utf8');
const parse = new Function('pack7', 'unpack7', `return (${source.match(/function parseRequest\(pkt\) \{[\s\S]*?\n\}/)[0]});`)(pack7, unpack7);
function raw({fl=0, addr=0, len=8}={}) {
  const u=[0,0x59,0x30,8,0,0,fl,addr&255,(addr>>>8)&255,(addr>>>16)&255,(addr>>>24)&255,len&255,(len>>>8)&255,(len>>>16)&255];
  return [...u,~u.slice(6).reduce((a,b)=>a+b,0)&255];
}
const frame = u => [0xf0,...pack7(u),0xf7];
for (const args of [{}, {fl:255,addr:0x12345678,len:0x123456}, {addr:0xe0000000,len:8}, {addr:0xf0000000,len:0}])
 test(`valid request fields retained ${JSON.stringify(args)}`,()=>{
  const want={fl:0,addr:0,len:8,...args};assert.deepEqual(parse(frame(raw(args))),want);
 });
const malformed=[];
for(const n of [0,7,9,0x108,0x10008]) {const u=raw();u[3]=n&255;u[4]=(n>>>8)&255;u[5]=(n>>>16)&255;malformed.push([`declared ${n}`,frame(u)]);}
{const u=raw();u[14]^=1;malformed.push(['checksum',frame(u)]);}
{const u=raw();u[7]^=1;malformed.push(['changed address unchanged checksum',frame(u)]);}
{const u=raw();u[2]=0x11;malformed.push(['wrong command',frame(u)]);}
const good=frame(raw());
malformed.push(['missing F0',good.slice(1)],['missing F7',good.slice(0,-1)],['truncated',good.slice(0,-2).concat(0xf7)],['extra',good.slice(0,-1).concat(0,0xf7)]);
{const p=[...good];p[2]|=128;malformed.push(['status byte',p]);}
{const p=[...good];p[p.length-2]|=64;malformed.push(['packed padding',p]);}
for(const [name,pkt] of malformed) test(`${name} refuses before any firmware-data reply`,async()=>{
 assert.equal(parse(pkt),null);
 const packets=[pkt,frame(raw({addr:0xf0000000,len:0}))],sent=[];
 const link={lost:false,async read(){return packets.shift()||null;},send(p){sent.push(p);return true;}};
 const result=await new Updater({inputs:new Map(),outputs:new Map()}).serve(link,new Uint8Array(16),0xf0000000,1000);
 assert.equal(result.served,0);assert.equal(sent.length,1,'only canonical finish reply');assert.equal(result.finished,true);
});
