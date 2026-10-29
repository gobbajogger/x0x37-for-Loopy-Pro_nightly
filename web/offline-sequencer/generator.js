// SPDX-License-Identifier: GPL-3.0-only
// Derived from TB-3PO / schwung-tb3po / Phazerville Hemisphere Suite,
// (c) djphazer and contributors, GPL-3.0.
// Local TB-3PO port of pinned firmware tb3po.c. No device or auto-clock execution.
import {copy,getPart,gate,diffDraft,validateDraft} from './model.js';
export const SCALES=[[0,2,3,5,7,8,10],[0,1,3,5,7,8,10],[0,2,3,5,7,8,11],[0,3,5,7,10],[0,2,3,5,7,9,10],[0,2,4,5,7,9,11]];
export function generatePlan(store,pattern,part,mode,config){
 if(part>1||!['new','mutate'].includes(mode))throw Error('No verified generator for this part/mode.');
 const candidate=copy(store.doc),b=getPart(candidate,pattern,part);b.generator={...b.generator,...config};validateDraft(candidate);const g=b.generator,scale=SCALES[g.scale],f=Math.fround;let rng=(mode==='mutate'?g.rng:0)||g.seed||1;
 const random=()=>{let x=rng||1;x^=x<<13;x^=x>>>17;x^=x<<5;rng=x>>>0;return (rng&0xffffff)/0x1000000;};
 const pitch=(degree,oct)=>Math.max(0,Math.min(127,12*(g.baseOctave+1)+g.root+scale[degree]+12*oct));
 const kind=()=>{let flags=1;if(random()<f(g.accent/100))flags=5;if(random()<f(g.slide/100))flags=9;return flags;};
 const rollPitch=()=>pitch(Math.min(scale.length-1,Math.floor(f(random()*scale.length))),Math.min(g.octaves-1,Math.floor(f(random()*g.octaves))));
 let had=b.steps.slice(0,b.length).some(s=>gate(s)!==0);
 if(mode==='new'){
  b.steps=Array.from({length:64},()=>({note:pitch(0,0),flags:0,velocity:0}));
  for(let i=0;i<b.length;i++){if(random()>f(g.density/100))continue;const degree=i%4===0&&random()<f(.35)?0:Math.min(scale.length-1,Math.floor(f(random()*scale.length)));const oct=Math.min(g.octaves-1,Math.floor(f(random()*g.octaves)));b.steps[i].note=pitch(degree,oct);b.steps[i].flags=kind();}
 }else{
  for(let i=0;i<b.length;i++){if(random()>=.25)continue;if(random()<.5)b.steps[i].flags=random()>f(g.density/100)?0:kind();else b.steps[i].note=rollPitch();if(gate(b.steps[i])===0)b.steps[i].flags&=15;}
 }
 for(let i=0;i<b.length;i++)if((b.steps[i].flags&8)&&gate(b.steps[(i+1)%b.length])===0)b.steps[i].flags=mode==='new'?1:b.steps[i].flags&~8;
 if((mode==='new'||had)&&!b.steps.slice(0,b.length).some(s=>gate(s)!==0))b.steps[0]={note:pitch(0,0),flags:1,velocity:0};
 if(mode==='mutate')g.rng=rng;
 return {kind:'generator',revision:store.revision,settings:{pattern,part,mode},candidate,errors:[],losses:[{kind:mode==='new'?'New replaces all 64 stored cells, including inactive cells':'Mutate may alter notes and gates within active length',detail:'No device/per-note sound data is present in this offline draft; device parity remains unqualified.'}],notices:['Only selected part and pattern change. Auto-mutate is not running.','Mutate can introduce notes into a cleared line; an initially empty line does not force an audible anchor.'],changes:diffDraft(store.doc,candidate)};
}
