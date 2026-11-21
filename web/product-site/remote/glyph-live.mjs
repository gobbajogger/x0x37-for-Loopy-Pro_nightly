// SPDX-License-Identifier: GPL-3.0-only
// THE shared live-glyph renderer for the Remote and website. Strokes and easing
// come from aa-ease.mjs, vendored 1:1 from Lead's renderer-aa-ease.js (Xiaolin Wu
// AA at 0..16 coverage with firmware px_blend, critically damped ease settling in
// 160 ms). Shapes come from the engine curves: the four reference kinds
// (chicago-wave, juno-wave, juno-width, 909-bd-decay) are painted by Lead's own
// paintGlyph; every other glyph family's polyline comes from glyph-render.mjs
// and is stroked by the same Wu/px_blend code. Pixels are written into an
// ImageData at device resolution (devicePixelRatio), so there is no upscaling.
// A frame is requested only while a value is moving; idle glyphs schedule
// nothing. prefers-reduced-motion jumps straight to the target.
import{render,unit,familyOf as fnOf}from'./glyph-render.mjs';
import{INK,FACE_THEME,OMEGA,easeCreate,easeSetTarget,easeStep,paintGlyph,strokePoly}from'./aa-ease.mjs';
export const SETTLE_MS=160;
export const SETTLE_EPS=0.005;
export const FACE=FACE_THEME; // #101a1f panel (page-01 / R22 night face)
// Which glyphs Lead's reference paints directly.
export function referenceKind(fn,engine){
 const f=fnOf(fn),e=String(engine||'').toLowerCase();
 if(f==='WAVE')return e==='juno'?'juno-wave':e==='chicago'?'chicago-wave':null;
 if(f==='WIDTH')return 'juno-width';
 if(f==='DECAY'&&/909/.test(e))return '909-bd-decay';
 return null;
}
// SVG path "M x y L x y ... M ..." into polylines.
export function polylines(d){
 const out=[];let cur=null;
 for(const m of String(d).matchAll(/([ML])\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/g)){
  if(m[1]==='M'||!cur){cur=[];out.push(cur);}cur.push([+m[2],+m[3]]);
 }
 return out;
}
// Paint one glyph into RGBA pixels (w x h device px). value01 is 0..1.
export function paintPixels(data,w,h,fn,value01,engine,state={}){
 for(let i=0;i<data.length;i+=4){data[i]=FACE[0];data[i+1]=FACE[1];data[i+2]=FACE[2];data[i+3]=255;}
 const pad=Math.max(1,Math.round(h*0.08)),gx=pad,gy=pad,gw=w-2*pad,gh=h-2*pad;
 const kind=referenceKind(fn,engine);
 if(kind){paintGlyph({data,width:w,height:h},kind,unit(value01)*127,gx,gy,gw,gh,INK);return kind;}
 const r=render(fn,value01,engine,{...state,valueDomain:'normalized'}),vw=r.zero!==undefined?29:r.cell?102:40,vh=r.zero!==undefined?19:r.cell?26:24,scale=Math.min(gw/vw,gh/vh);
 // The reel diameter is physical geometry. Preserve it in wide or tall cards.
 const sx=r.fn==='TAPE'?scale:gw/vw,sy=r.fn==='TAPE'?scale:gh/vh;
 const left=gx+(gw-sx*vw)/2,top=gy+(gh-sy*vh)/2;
 if(r.zero!==undefined){
  const y=top+r.zero*sy;
  const dim=FACE.map((c,i)=>Math.round(c+(INK[i]-c)*3/16));
  strokePoly(data,w,h,[[left+0.5*sx,y],[left+28.5*sx,y]],dim);
 }
 for(const line of polylines(r.d))strokePoly(data,w,h,line.map(([x,y])=>[left+x*sx,top+y*sy]),INK);
 return r.fn;
}
export class GlyphAnimator{
 constructor({value=0,draw,raf=globalThis.requestAnimationFrame?.bind(globalThis),reduced=()=>!!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches}={}){
  this.e=easeCreate(value);this.draw=draw;this.raf=raf;this.reduced=reduced;this.pending=0;this.last=null;this.frames=0;draw?.(value);
 }
 get value(){return this.e.y;} get target(){return this.e.target;} get idle(){return !this.pending;}
 set(target){target=Number(target);if(!Number.isFinite(target))return;if(target===this.e.target&&this.e.y===target)return;easeSetTarget(this.e,target);
  if(this.reduced()||!this.raf){this.e.y=target;this.e.v=0;this.draw?.(target);return;}
  if(!this.pending){this.last=null;this.pending=this.raf(t=>this.tick(t));}}
 tick(t){this.pending=0;const dt=this.last==null?1/60:Math.min(0.05,Math.max(0,(t-this.last)/1000));this.last=t;
  easeStep(this.e,dt,OMEGA);this.frames++;
  if(Math.abs(this.e.y-this.e.target)<=SETTLE_EPS*0.1&&Math.abs(this.e.v)<0.05){this.e.y=this.e.target;this.e.v=0;}
  this.draw?.(this.e.y);
  if(this.e.y!==this.e.target)this.pending=this.raf(n=>this.tick(n));}
}
export function drawGlyph(canvas,fn,value01,engine,state={}){
 const dpr=Math.max(1,globalThis.devicePixelRatio||1),w=Math.max(8,Math.round((canvas.clientWidth||40)*dpr)),h=Math.max(8,Math.round((canvas.clientHeight||24)*dpr));
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 const ctx=canvas.getContext?.('2d');if(!ctx)return;const img=ctx.createImageData(w,h);paintPixels(img.data,w,h,fn,value01,engine,state);ctx.putImageData(img,0,0);
}
const live=new WeakMap();
export function mountLiveGlyphs(root){
 if(!root?.querySelectorAll||typeof document==='undefined')return 0;let n=0;
 for(const el of root.querySelectorAll('[data-glyph-fn]')){
  if(live.has(el))continue;const fn=el.dataset.glyphFn,engine=el.dataset.glyphEngine||'chicago';
  const c=document.createElement('canvas');c.className='glyph-canvas';c.setAttribute('aria-hidden','true');el.replaceChildren(c);
  const state=el.dataset.miamiParameter===undefined?{}:{miamiParameter:Number(el.dataset.miamiParameter)};
  // Discrete selectors jump directly to the new native shape and its matching name.
  const a=new GlyphAnimator({raf:state.miamiParameter===undefined?undefined:null,value:unit(el.dataset.glyphValue,el.dataset.glyphDomain??'normalized'),draw:v=>drawGlyph(c,fn,v,engine,state)});live.set(el,a);el.glyphAnimator=a;n++;
 }
 return n;
}
export function setGlyphValue(el,value,domain='normalized'){const normalized=unit(value,domain);el.dataset.glyphValue=String(normalized);el.dataset.glyphDomain='normalized';live.get(el)?.set(normalized);}
