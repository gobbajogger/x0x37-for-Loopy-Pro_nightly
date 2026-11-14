// SPDX-License-Identifier: GPL-3.0-only
import {SOUND_BOUNDS} from './control-schema.js';
export const SCHEMA = 'dnbox-sequencer-draft/2';
export const KITS = [
  [['Kick',36],['Snare',38],['Low tom',41],['Mid tom',45],['High tom',50],['Rim',37],['Clap',39],['Closed hat',42],['Open hat',46],['Crash',49],['Ride',51]],
  [['Kick',36],['Snare',38],['Low tom',41],['Mid tom',45],['High tom',50],['Rim',37],['Clap',39],['Cowbell',56],['Cymbal',49],['Open hat',46],['Closed hat',42]]
];
export const PARTS = ['Synth 1','Synth 2','909','808','BREAKS'];
export const RATES = ['1/16','1/16T','1/32','1/8T'];
export const STEPS_PER_BEAT = [4,6,8,3];
export const copy = x => structuredClone(x);
export const integer = (x,a,b) => Number.isInteger(x) && x>=a && x<=b;
export const gate = s => s.flags & 3;
export const pitchName = n => ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][n%12]+(Math.floor(n/12)-1);
export function createDraft() {
  return {schema:SCHEMA,engines:['Miami','Chicago'],sound:{},patterns:Array.from({length:32},()=>({
    bass:Array.from({length:2},()=>({length:16,rate:0,direction:0,transpose:0,generator:{density:70,accent:40,slide:25,octaves:2,root:9,scale:0,baseOctave:1,autoBars:0,seed:48879,rng:0},steps:Array.from({length:64},()=>({note:60,flags:0,velocity:0}))})),
    drum:Array.from({length:2},()=>({length:16,rate:0,hits:Array.from({length:11},()=>[0,0]),accent:[0,0]})),breaks:{length:16,rate:0,gates:0,slices:Array(16).fill(0),loopA:null,loopB:null,sliceMode:0,settings:Array(12).fill(0)}
  }))};
}
function keys(x,want) {return x && typeof x==='object' && !Array.isArray(x) && Object.keys(x).sort().join(',')===want.slice().sort().join(',');}
function require(ok,msg) {if(!ok) throw new Error(msg);}
export function validateDraft(d) {
  require(keys(d,['schema','patterns','engines','sound']) && d.schema===SCHEMA,'Unsupported draft schema. This is not a project or sample backup.');
  require(Array.isArray(d.engines)&&d.engines.length===2&&d.engines.every(x=>['Miami','Chicago'].includes(x))&&d.engines.filter(x=>x==='Miami').length<=1,'One Miami context is available; choose Chicago for the other synth.');
  require(d.sound&&Object.getPrototypeOf(d.sound)===Object.prototype&&Object.keys(d.sound).length<=512&&Object.entries(d.sound).every(([k,v])=>/^[a-zA-Z0-9 _./+-]{1,96}$/.test(k)&&!['__proto__','constructor','prototype'].includes(k)&&SOUND_BOUNDS[k]&&integer(v,...SOUND_BOUNDS[k])),'Invalid local sound settings.');
  require(Array.isArray(d.patterns)&&d.patterns.length===32,'A draft must contain exactly 32 patterns.');
  for(const p of d.patterns) {
    require(keys(p,['bass','drum','breaks'])&&Array.isArray(p.bass)&&p.bass.length===2&&Array.isArray(p.drum)&&p.drum.length===2,'Invalid pattern parts.');
    for(const b of p.bass) {
      require(keys(b,['length','rate','direction','transpose','steps','generator'])&&integer(b.length,1,64)&&integer(b.rate,0,3)&&integer(b.direction,0,3)&&integer(b.transpose,-24,24),'Invalid melodic settings.');
      const g=b.generator;require(keys(g,['density','accent','slide','octaves','root','scale','baseOctave','autoBars','seed','rng'])&&['density','accent','slide'].every(k=>integer(g[k],0,100))&&integer(g.octaves,1,3)&&integer(g.root,0,11)&&integer(g.scale,0,5)&&integer(g.baseOctave,0,4)&&integer(g.autoBars,0,16)&&integer(g.seed,0,0xffffffff)&&integer(g.rng,0,0xffffffff),'Invalid generator settings.');
      require(Array.isArray(b.steps)&&b.steps.length===64,'A melodic part needs all 64 stored steps.');
      for(const s of b.steps) require(keys(s,['note','flags','velocity'])&&integer(s.note,0,127)&&integer(s.flags,0,255)&&gate(s)<3&&integer(s.velocity,0,127)&&!(gate(s)===0&&(s.flags>>4)),'Invalid melodic note, gate, release or velocity.');
    }
    const q=p.breaks;require(keys(q,['length','rate','gates','slices','loopA','loopB','sliceMode','settings'])&&q.length===16&&q.rate===0&&integer(q.gates,0,65535)&&Array.isArray(q.slices)&&q.slices.length===16&&q.slices.every(x=>integer(x,0,8))&&[q.loopA,q.loopB].every(x=>x===null||integer(x,0,65534))&&integer(q.sliceMode,0,1)&&Array.isArray(q.settings)&&q.settings.length===12&&q.settings.every((x,i)=>integer(x,0,i===8?4:i>=10?5:100)),'Invalid BREAKS data.');
    for(const k of p.drum) {
      require(keys(k,['length','rate','hits','accent'])&&integer(k.length,1,64)&&integer(k.rate,0,3)&&Array.isArray(k.hits)&&k.hits.length===11,'Invalid drum part.');
      for(const m of [...k.hits,k.accent]) require(Array.isArray(m)&&m.length===2&&m.every(x=>integer(x,0,0xffffffff)),'Invalid 64-step drum mask.');
    }
  }
  return d;
}
export const getPart = (d,p,t) => t<2 ? d.patterns[p].bass[t] : t<4 ? d.patterns[p].drum[t-2] : d.patterns[p].breaks;
export const bit = (mask,s) => (mask[s>>>5]>>>(s&31))&1;
export function setBit(mask,s,on) {mask[s>>>5]=(on ? mask[s>>>5]|(1<<(s&31)) : mask[s>>>5]&~(1<<(s&31)))>>>0;}
export function decodeStep(s) {return `${['REST','NOTE','TIE'][gate(s)]} ${pitchName(s.note)} / velocity ${s.velocity||'100 (legacy)'} / accent ${!!(s.flags&4)} / slide ${!!(s.flags&8)} / release ${s.flags>>4 || 'legacy'}`;}
export function diffDraft(a,b) {
  const rows=[];
  for(const k of ['engines','sound'])if(JSON.stringify(a[k])!==JSON.stringify(b[k]))rows.push({target:'Local '+k,field:k,before:JSON.stringify(a[k]),after:JSON.stringify(b[k])});
  for(let p=0;p<32;p++)for(let t=0;t<4;t++) {
    const x=getPart(a,p,t),y=getPart(b,p,t),at=`Pattern ${p+1} / ${PARTS[t]}`;
    for(const f of t<2?['length','rate','direction','transpose']:['length','rate']) if(x[f]!==y[f])rows.push({target:at,field:f,before:String(x[f]),after:String(y[f])});
    if(t<2&&JSON.stringify(x.generator)!==JSON.stringify(y.generator))rows.push({target:at,field:'Generator settings',before:JSON.stringify(x.generator),after:JSON.stringify(y.generator)});
    if(t<2) {for(let s=0;s<64;s++)if(JSON.stringify(x.steps[s])!==JSON.stringify(y.steps[s]))rows.push({target:at,field:`Step ${s+1}`,before:decodeStep(x.steps[s]),after:decodeStep(y.steps[s])});}
    else for(let v=0;v<12;v++)for(let s=0;s<64;s++) {
      const xm=v===11?x.accent:x.hits[v],ym=v===11?y.accent:y.hits[v];
      if(bit(xm,s)!==bit(ym,s))rows.push({target:at,field:`${v===11?'Total accent':KITS[t-2][v][0]} / step ${s+1}`,before:bit(xm,s)?'On':'Off',after:bit(ym,s)?'On':'Off'});
    }
  }
  for(let p=0;p<32;p++)if(JSON.stringify(a.patterns[p].breaks)!==JSON.stringify(b.patterns[p].breaks))rows.push({target:`Pattern ${p+1} / BREAKS`,field:'Gate / slice / settings',before:JSON.stringify(a.patterns[p].breaks),after:JSON.stringify(b.patterns[p].breaks)});
  return rows;
}
export class DraftStore {
  constructor(d=createDraft()) {this.doc=copy(validateDraft(d));this.revision=0;this.history=[];}
  replace(candidate) {validateDraft(candidate);if(!diffDraft(this.doc,candidate).length)return false;this.history.push(this.doc);if(this.history.length>32)this.history.shift();this.doc=copy(candidate);this.revision++;return true;}
  edit(fn) {const next=copy(this.doc);fn(next);return this.replace(next);}
  undo() {if(!this.history.length)return false;this.doc=this.history.pop();this.revision++;return true;}
}
export function parseDraft(text) {
  if(typeof text!=='string'||new TextEncoder().encode(text).length>1048576)throw new Error('Draft limit: 1 MiB.');
  const d=JSON.parse(text);if(d.schema==='dnbox-sequencer-draft/1'){const fresh=createDraft();for(let p=0;p<32;p++)for(let t=0;t<2;t++){if(d.patterns?.[p]?.bass?.[t])d.patterns[p].bass[t].generator=copy(fresh.patterns[p].bass[t].generator);}for(const p of d.patterns||[])p.breaks=copy(fresh.patterns[0].breaks);d.schema=SCHEMA;d.engines=copy(fresh.engines);d.sound={};}return validateDraft(d);
}
export function setCell(doc,p,b,s,patch) {
  if(!integer(p,0,31)||!integer(b,0,1)||!integer(s,0,63))throw new Error('Invalid cell target.');
  const cell=doc.patterns[p].bass[b].steps[s];
  for(const k of Object.keys(patch))if(!['note','flags','velocity'].includes(k))throw new Error('Unknown note field.');
  Object.assign(cell,patch);if(gate(cell)===0)cell.flags&=15;
}
export function durationEdit(doc,p,b,start,slots,endpoint) {
  if(!integer(start,0,63)||!integer(slots,1,64-start)||!integer(endpoint,0,15))throw new Error('Duration cannot wrap past stored step 64.');
  const a=doc.patterns[p].bass[b].steps,n=a[start];if(gate(n)!==1)throw new Error('Choose a NOTE onset to change duration.');
  let oldEnd=start;while(oldEnd<63&&gate(a[oldEnd+1])===2)oldEnd++;
  for(let i=start+1;i<start+slots;i++)if(i>oldEnd&&gate(a[i])!==0)throw new Error('Duration overlaps another note/tie.');
  for(let i=start+1;i<=oldEnd;i++)a[i]={note:a[i].note,flags:0,velocity:a[i].velocity};
  n.flags&=15;
  for(let i=start+1;i<start+slots;i++)a[i]={note:n.note,flags:2,velocity:n.velocity};
  a[start+slots-1].flags=(a[start+slots-1].flags&15)|(endpoint<<4);
}
