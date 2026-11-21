// SPDX-License-Identifier: GPL-3.0-only
// The vendored shared renderer must produce the same coverage buffers as Lead's
// reference renderer-aa-ease.js (fixture captured from the reference itself).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as aa from '../../web/product-site/remote/aa-ease.mjs';
import {paintPixels, referenceKind, GlyphAnimator, FACE} from '../../web/product-site/remote/glyph-live.mjs';
const fx=JSON.parse(readFileSync(new URL('./fixtures/aa-ease-reference.json', import.meta.url),'utf8'));
const face=(w,h)=>{const d=new Uint8ClampedArray(w*h*4);for(let i=0;i<d.length;i+=4){d[i]=fx.face[0];d[i+1]=fx.face[1];d[i+2]=fx.face[2];d[i+3]=255}return d;};
test('vendored Wu/px_blend coverage buffers are identical to the reference',()=>{
 for(const c of fx.cases){const d=face(fx.w,fx.h);aa.paintGlyph({data:d,width:fx.w,height:fx.h},c.kind,c.v,1,1,100,24);
  assert.equal(createHash('sha256').update(d).digest('hex'),c.sha256,c.kind+' @'+c.v);}
});
test('live glyphs use the reference painter for its four kinds',()=>{
 assert.equal(referenceKind('G023','chicago'),'chicago-wave');
 assert.equal(referenceKind('WAVE','juno'),'juno-wave');
 assert.equal(referenceKind('WAVE','miami'),null);
 assert.equal(referenceKind('G026','miami'),'juno-width');
 assert.equal(referenceKind('DECAY','drum909'),'909-bd-decay');
 const w=102,h=26,a=face(w,h),b=face(w,h);paintPixels(a,w,h,'G023',64/127,'chicago');
 const pad=Math.max(1,Math.round(h*0.08));aa.paintGlyph({data:b,width:w,height:h},'chicago-wave',64,pad,pad,w-2*pad,h-2*pad,aa.INK);
 assert.deepEqual(a,b);
 assert.deepEqual(FACE,aa.FACE_THEME);
});
test('ease is the reference critically damped law; idle schedules no frame',()=>{
 const q=[];const an=new GlyphAnimator({value:0,raf:f=>{q.push(f);return q.length},reduced:()=>false});
 assert.equal(q.length,0,'no rAF at rest');
 an.set(1);let t=0,f;const ys=[];while((f=q.shift())){t+=1000/60;f(t);ys.push(an.value);}
 // reference: y = 1-(1+wt)e^{-wt}, w = 4/0.16; compare each frame
 const e=aa.easeCreate(0);aa.easeSetTarget(e,1);
 for(let i=0;i<10;i++){aa.easeStep(e,1/60);assert.ok(Math.abs(e.y-ys[i])<1e-9,'frame '+i);}
 assert.ok(ys.every((y,i)=>i===0||y>=ys[i-1]-1e-12),'monotone, no overshoot');
 const at160=ys[Math.round(0.16*60)-1];assert.ok(at160>0.9,'within 10% at 160 ms ('+at160+')');
 const within=ys.findIndex(y=>Math.abs(1-y)<=0.005);assert.ok((within+1)/60<=0.32,'within 0.5% by '+((within+1)/60*1000).toFixed(0)+' ms');
 assert.equal(an.value,1);assert.ok(an.idle,'stops when settled');const n=q.length;an.set(1);assert.equal(q.length,n,'same value: no frame');
});
test('reduced motion jumps instantly',()=>{
 let frames=0;const an=new GlyphAnimator({value:0,raf:()=>{frames++;return 1},reduced:()=>true});an.set(0.7);
 assert.equal(an.value,0.7);assert.equal(frames,0);
});
