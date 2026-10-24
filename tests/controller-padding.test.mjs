// SPDX-License-Identifier: GPL-3.0-only
// Browser-side controller image test: no private controller, no device operations.
import assert from 'node:assert/strict';
import { ctlProblem } from '../web/fm1pkg.js';

const capacity=0x10000;
const put16=(d,o,n)=>new DataView(d.buffer).setUint16(o,n,true);
const put32=(d,o,n)=>new DataView(d.buffer).setUint32(o,n,true);
function crc32(data) {
  let crc=0xffffffff;
  for (const octet of data) {
    crc ^= octet;
    for (let b=0; b<8; b++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
const controller=new Uint8Array(160);
controller.fill(0xa5);
put32(controller,0,0x43423058);
put16(controller,4,2);
put16(controller,6,68);
put32(controller,8,0x20000);
put32(controller,12,controller.length);
put32(controller,16,0);
put32(controller,20,2);
put32(controller,24,0x02087080);
put32(controller,28,0x02087090);
put32(controller,32,0x01c06e80);
put32(controller,36,0x01c07680);
put32(controller,40,0x01c01800);
put32(controller,44,0x01c07680);
put32(controller,48,0);
put32(controller,52,0);
put32(controller,16,crc32(controller));
const padded=tail=>Uint8Array.from([...controller,...tail]);
assert.equal(ctlProblem(controller),null);
for (const n of [1,44,capacity-controller.length])
  assert.equal(ctlProblem(padded(new Uint8Array(n).fill(0xff))),null);
for (const tail of [
  new Uint8Array([0]), new Uint8Array([0x80]), new Uint8Array(44),
  new Uint8Array([0xff,0]),
  Uint8Array.from([...new Uint8Array(17).fill(0xff),0x7f])
]) assert.match(ctlProblem(padded(tail))||'',/non-erased/i);
const corrupt=controller.slice();
corrupt[corrupt.length-1]^=1;
assert.match(ctlProblem(corrupt)||'',/CRC mismatch/);
assert.notEqual(ctlProblem(controller.slice(0,20)),null);
assert.notEqual(ctlProblem(padded(new Uint8Array(capacity-controller.length+1).fill(0xff))),null);
console.log('PASS: controller-image non-erased tail rejected, erased bytes retained, CRC/bounds guarded');
