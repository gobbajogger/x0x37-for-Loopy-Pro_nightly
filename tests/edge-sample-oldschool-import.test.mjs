// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RATE,RATE_HALF,cut,prepareLoopImport,applyOldschool,imaEncode,imaDecode,loopPreviewPcm,userSlotRaw,parseHeader,makeArchive,readArchive } from '../web/x0x_breaks.js';
const source = (n=88200,rate=RATE) => Float32Array.from({length:n},(_,i)=>.5*Math.sin(i*2*Math.PI*440/rate));
const hash = x => createHash('sha256').update(Buffer.from(Float64Array.from(x).buffer)).digest('hex');
const image = loop => { const {hdr,data}=userSlotRaw('GRIT',[loop],81920); const out=new Uint8Array(512+data.length).fill(255);out.set(hdr);out.set(data,512);return out; };

for(const [factor,n,rate,payload] of [[1,88200,44100,44100],[1.5,58800,29400,29400],[2,44100,22050,22050],[3,29400,14700,14700],[4,22050,11025,11025]]){
 test(`actual prepared bank ${factor}x has fewer bytes and compensating saved rate`,()=>{
  const x=source(),before=hash(x),loop=prepareLoopImport(x,RATE,{bars:false,gritFactor:factor});
  assert.equal(loop.n,n);assert.equal(loop.rate,rate);assert.equal(loop.adpcm.length,payload);
  assert.equal(loop.savedBytes,44100-payload);assert.equal(loop.baselineBytes,44100);
  const img=image(loop),head=parseHeader(img);
  assert.equal(img.length,512+payload);assert.equal(head.dataLen,payload);assert.equal(head.zones[0].n,n);assert.equal(head.zones[0].rate,rate);
  assert.equal(head.zones[0].n/head.zones[0].rate,2);
  const archive=makeArchive({count:1,size:81920,slots:[{size:81920}]},[img],'2026-10-26T00:00:00Z');
  const read=readArchive(archive);assert.deepEqual(read.images[0],img);
  assert.deepEqual(read.meta.slots[0].samples,[n]);assert.deepEqual(read.meta.slots[0].rates,[rate]);
  const preview=loopPreviewPcm(loop.s,loop.rate);
  assert.deepEqual(preview.samples,Float32Array.from(imaDecode(loop.adpcm,n),v=>v/32768));
  const skips=100;let crossings=0;for(let i=skips+1;i<n;i++)if(preview.samples[i-1]<0&&preview.samples[i]>=0)crossings++;
  const hz=crossings/((n-skips)/rate);assert.ok(Math.abs(hz-440)<2,`encoded saved-rate preview pitch ${hz}`);
  assert.equal(hash(x),before,'processing, preview and archive export preserve original decoded input');
 });
}

test('Off is byte-identical to existing clean cut; toggles always rebuild from unchanged original',()=>{
 const x=source(),before=hash(x),opts={bars:false,trim:false,storageRate:RATE};
 const clean=prepareLoopImport(x,RATE,opts);assert.deepEqual(clean.s,cut(x,RATE,false));
 for(const gritFactor of [4,1.5,2,1,3,1])prepareLoopImport(x,RATE,{...opts,gritFactor});
 assert.deepEqual(prepareLoopImport(x,RATE,opts).adpcm,imaEncode(cut(x,RATE,false)));assert.equal(hash(x),before);
});

test('half-rate plus grit reports actual payload, odd nibble and fixed slot header overhead',()=>{
 const x=source(88201),loop=prepareLoopImport(x,RATE,{bars:false,storageRate:RATE_HALF,gritFactor:4});
 assert.equal(loop.adpcm.length,Math.ceil(loop.n/2));assert.equal(image(loop).length,512+loop.adpcm.length);
 assert.ok(loop.savedBytes>loop.baselineBytes*.87);assert.ok(Math.abs(loop.n/loop.rate-loop.baselineSamples/RATE)<.001);
 const odd=prepareLoopImport(source(129),RATE,{bars:false});assert.equal(odd.adpcm.length,65);assert.equal(image(odd).length,577);
});

test('bad factors, malformed source and too-short rate-reduced loops fail before serialization',()=>{
 for(const factor of [NaN,Infinity,0,-1,9])assert.throws(()=>applyOldschool(new Int16Array(1000),RATE,factor));
 assert.throws(()=>prepareLoopImport(source(128),RATE,{bars:false,gritFactor:4}),/short/);
 assert.throws(()=>prepareLoopImport([0,NaN,1],RATE));assert.throws(()=>prepareLoopImport(source(),0));
});
