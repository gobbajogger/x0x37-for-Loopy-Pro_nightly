// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const {paintKickDepth}=await import(pathToFileURL(resolve(process.argv[2],'web/product-site/remote/drum-strip.mjs')));
const {GlyphAnimator}=await import(pathToFileURL(resolve(process.argv[2],'web/product-site/remote/glyph-live.mjs')));
const ids=['1:0:0:0','1:0:0:4','1:0:0:5'];
let drawing,lookups=0,mounts=0;
const drawPath={setAttribute(key,value){assert.equal(key,'d');drawing=value;}};
const selector='[data-source-control="1:0:0:4"] [data-glyph-semantic="P.DPTH"]';
const glyph={setAttribute(k,v){assert.equal(k,'data-glyph-origin');assert.equal(v,'firmware dv_glyph');},
  querySelector(q){assert.equal(q,'path');mounts++;return drawPath;}};
const root={querySelectorAll(q){
  assert.equal(q,'[data-drum-editor] '+selector+', [data-drum-sound-strip] '+selector);
  lookups++;return [glyph];
}};
const results=new Map(),fractional=new Map(),rounded=createHash('sha256');
let coordinates=0,worst=0;
for(const line of readFileSync(process.argv[3],'utf8').trim().split('\n')){
  const [tune,depth,pitch,...expected]=line.split(' ').map(Number);
  const tri=[tune,depth,pitch];
  if(!Number.isInteger(depth)){
    const key=[tune,pitch].join(',');
    if(!fractional.has(key))fractional.set(key,[]);
    fractional.get(key).push({depth,expected});continue;
  }
  for(let axis=0;axis<3;axis++){
    paintKickDepth(root,ids[axis],tri[axis],id=>{
      assert.notEqual(id,ids[axis],'the active knob must use its pending gesture value');
      return tri[ids.indexOf(id)];
    });
    const actual=[...drawing.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].flatMap(m=>[+m[1],+m[2]]);
    assert.equal(actual.length,50);assert.equal(expected.length,50);
    for(let j=0;j<50;j++){
      const diff=Math.abs(actual[j]-expected[j]);worst=Math.max(worst,diff);
      assert.ok(diff<.00006,`${tri} point ${j}: ${diff}`);
      coordinates++;
    }
  }
  rounded.update(expected.map(v=>Math.round(v*16)).join(',')+'\n');
  results.set(tri.join(','),expected);
}
assert.equal(mounts,1);assert.equal(lookups,results.size*3);
// Drive the actual product GlyphAnimator. The compiled C probe receives these
// same fractional positions before executing dv_glyph's raw-to-SI conversion.
let fractionalCoordinates=0,animations=0;
for(const [key,frames] of fractional){
  const [tune,pitch]=key.split(',').map(Number);
  let pending,observe,observedValue,animatedPath;
  const witness=new GlyphAnimator({value:0,draw:q=>{observedValue=127*q;},raf:fn=>{observe=fn;return 1;}});
  witness.set(1);
  globalThis.requestAnimationFrame=fn=>{pending=fn;return 1;};
  const path={setAttribute(k,v){assert.equal(k,'d');animatedPath=v;}};
  const g={setAttribute(){},querySelector:()=>path};
  const target={querySelectorAll:()=>[g]};
  const read=id=>id===ids[0]?tune:pitch;
  paintKickDepth(target,ids[1],0,read);
  paintKickDepth(target,ids[1],127,read);
  for(const [i,{depth,expected}] of frames.entries()){
    assert.equal(typeof pending,'function');
    observe(i*1000/60);pending(i*1000/60);
    assert.ok(Math.abs(Math.fround(observedValue)-depth)<.000001);
    assert.deepEqual(expected,results.get([tune,Math.round(depth),pitch].join(',')));
    assert.notDeepEqual(expected,results.get([tune,Math.round(depth)+(i? -1:1),pitch].join(',')));
    const points=[...animatedPath.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].flatMap(m=>[+m[1],+m[2]]);
    assert.equal(points.length,50);
    for(let j=0;j<50;j++){
      const diff=Math.abs(points[j]-expected[j]);worst=Math.max(worst,diff);
      assert.ok(diff<.00006,`ease ${key} at ${depth}, coordinate ${j}: ${diff}`);
      fractionalCoordinates++;
    }
    animations++;
  }
}
delete globalThis.requestAnimationFrame;
assert.equal(animations,10);
console.log(JSON.stringify({triples:results.size,paintAxes:3,integerCoordinates:coordinates,animatedFrames:animations,fractionalCoordinates,
 comparedCoordinates:coordinates+fractionalCoordinates,
 maxDifference:worst,nativeRoundedDigest:rounded.digest('hex')},null,2));
