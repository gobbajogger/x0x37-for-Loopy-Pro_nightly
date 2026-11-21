// SPDX-License-Identifier: GPL-3.0-only
import {breakChanceText} from './break-chance.mjs';
import {chanceDomain} from './sequence.mjs';
import {LANE_KINDS,chanceFromLane,velocityFromLane,panFromLane,pitchOffsetFromLane,laneFraction,laneText} from './lane.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function stepGroups(notes,endSample,steps=16){
 if(!Array.isArray(notes)||!Number.isInteger(endSample)||endSample<=0||!Number.isInteger(steps)||steps<1||steps>64)throw Error('Invalid step lane');
 const groups=Array.from({length:steps},(_,step)=>({step,notes:[]})),span=endSample/steps;
 for(const note of notes){const near=Math.round(note.start/span),index=Math.abs(note.start-Math.round(near*span))<2?near:Math.floor(note.start/span);groups[clamp(index,0,steps-1)].notes.push(note);}
 return groups;
}
const supports=(notes,kind)=>kind!=='chance'||notes.every(n=>['chicago','miami','drum909','drum808'].includes(n.track));
export class StepLaneGesture{
 constructor(model,{changed=()=>{},base=n=>n.note}={}){this.model=model;this.changed=changed;this.base=base;this.active=null;this.owners=new Set();}
 begin(owner,group,kind,{groups=[group]}={}){
  this.owners.add(owner);
  if(this.owners.size!==1){this.cancel(false);return false;}
  if(!LANE_KINDS.includes(kind)||!group?.notes?.length||!supports(group.notes,kind)){this.owners.delete(owner);return false;}
  const notes=groups.flatMap(g=>g.notes).map(n=>structuredClone(n));
  if(!this.model.beginStepGesture(owner,notes.map(n=>n.id))){this.model.cancelGesture(owner);this.owners.delete(owner);this.changed();return false;}
  this.active={owner,kind,notes,step:group.step,groups:new Map(groups.map(g=>[g.step,g.notes.map(n=>structuredClone(n))])),bases:new Map(notes.map(n=>[n.id,this.base(n)])),patches:new Map(),last:null};return true;
 }
 preview(owner,p,step=this.active?.step){
  const g=this.active;if(!g||owner!==g.owner||this.owners.size!==1||!Number.isFinite(p)||!Number.isInteger(step)||!g.groups.has(step))return false;
  p=clamp(p,0,1);const from=g.last??{step,p},distance=Math.abs(step-from.step),direction=step>=from.step?1:-1;
  for(let i=0;i<=distance;i++){
   const at=from.step+i*direction,level=distance?from.p+(p-from.p)*i/distance:p,notes=g.groups.get(at)??[];if(!notes.length)continue;
   let offset=pitchOffsetFromLane(level);const drums=notes.every(n=>['drum909','drum808'].includes(n.track));
   if(g.kind==='pitch'&&!drums)offset=clamp(offset,-Math.min(...notes.map(n=>g.bases.get(n.id))),127-Math.max(...notes.map(n=>g.bases.get(n.id))));
   for(const n of notes)g.patches.set(n.id,g.kind==='velocity'?{velocity:velocityFromLane(level)}:g.kind==='chance'?{chance:chanceFromLane(level)}:g.kind==='pan'?{pan:panFromLane(level)}:drums?{pitchOffset:offset}:{note:g.bases.get(n.id)+offset});
  }
  const result=this.model.previewStepGesture(owner,g.notes.map(n=>({id:n.id,patch:g.patches.get(n.id)??{}})));g.last={step,p};this.changed();return result;
 }
 nudge(group,kind,direction){
  if(![1,-1].includes(direction))return false;this.cancel();
  const ids=new Set(group?.notes?.map(n=>n.id)??[]),current={...group,notes:this.model.notes.filter(n=>ids.has(n.id))},owner=Symbol('keyboard-step');
  if(!this.begin(owner,current,kind))return false;
  const drums=current.notes.every(n=>['drum909','drum808'].includes(n.track)),delta=clamp(direction,-Math.min(...current.notes.map(n=>n.note)),127-Math.max(...current.notes.map(n=>n.note)));
  const patches=current.notes.map(n=>({id:n.id,patch:kind==='velocity'?{velocity:clamp(n.velocity+direction,1,127)}:kind==='pan'?{pan:clamp((n.pan??64)+direction,0,127)}:kind==='chance'?{chance:chanceDomain[clamp(chanceDomain.indexOf(n.chance??'100%')-direction,0,chanceDomain.length-1)]}:drums?{pitchOffset:clamp((n.pitchOffset??0)+direction,-24,24)}:{note:n.note+delta}}));
  this.model.previewStepGesture(owner,patches);return this.end(owner);
 }
 end(owner){this.owners.delete(owner);if(this.active?.owner!==owner)return false;this.active=null;const result=this.model.commitGesture(owner);this.changed();return result;}
 cancel(clear=true){this.model.cancelAll();this.active=null;if(clear)this.owners.clear();this.changed();}
 cancelPointer(owner){this.owners.delete(owner);this.cancel(false);}
}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// The lane header and slider accessibility text keep the complete value. A
// narrow cell can repeat the number without its unit or release denominator.
const compactStepWords = {Unset:'—', Mixed:'≠', Legacy:'Leg.'};
// Short panel labels are distinct within each Chicago selector. The full stock
// name remains the slider value and the selected step's readout.
const compactLockNames = {
 'SAW/PUL':'S/P', GATE:'GT', DOWN:'↓', 'UP/DN':'↕', '1 OCT':'1', '2 OCT':'2',
 'CHO/FLG':'C/F', PHASER:'PHA', 'RING MOD':'RM', COMPRESSOR:'CMP',
 DECIMATOR:'DEC', ENSEM:'ENS', 'SH DLY':'SH', 'BPM DL':'BPM', HALL:'HL', 'GT REV':'GR',
};
function stepOutput(text) {
 const shortName = compactLockNames[text];
 const compact = shortName ?? compactStepWords[text] ?? text.replace(/^([+-]?\d+(?:\.\d+)?)(?: *%|st|dB|\/15)$/, '$1');
 const full = escape(text);
 if (compact === text) return '<output aria-hidden="true">'+full+'</output>';
 return '<output aria-hidden="true"'+(shortName?' class="step-enum"':'')+'><span class="step-full">'+full+
   '</span><span class="step-compact">'+escape(compact)+'</span></output>';
}
export function renderStepSliders(groups,{kind='velocity',base=n=>n.note,selected=null,breakChance=null,activeStep=null,stepValue=null}={}){
 return groups.map(({step,notes})=>{
  if(stepValue) {
    const {spec,values,enabled} = stepValue, raw=values[step], index=spec.domain.indexOf(raw);
    const text=raw==null?'Unset':spec.text(raw), level=Math.max(0,index)/(spec.domain.length-1);
    return `<button class="step-slider" role="slider" aria-valuemin="0" aria-valuemax="${spec.domain.length-1}" aria-valuenow="${Math.max(0,index)}" aria-valuetext="${escape(text)}" data-lane-step="${step}"${enabled(step)?'':' disabled'} style="left:${step/groups.length*100}%;width:${100/groups.length}%;--v:${level.toFixed(4)}" aria-label="Step ${step+1}, ${spec.label} ${escape(text)}" aria-pressed="${activeStep===step}"><i class="step-slider-fill"></i>${stepOutput(text)}</button>`;
  }
  const point = breakChance ? breakChanceText(breakChance[step]) : null;
  const values=notes.map(n=>kind==='pitch'&&['drum909','drum808'].includes(n.track)?`${(n.pitchOffset??0)>0?'+':''}${n.pitchOffset??0}st`:laneText(kind,n,base(n)));
  const mixed=new Set(values).size>1,value=point??(mixed?'Mixed':values[0]??''),active=point&&activeStep!==null?step===activeStep:notes.some(n=>n.id===selected),level=point?laneFraction('chance',{chance:point}):notes.length?notes.reduce((sum,n)=>sum+(kind==='pitch'&&['drum909','drum808'].includes(n.track)?clamp(.5+(n.pitchOffset??0)/48,0,1):laneFraction(kind,n,base(n))),0)/notes.length:0;
  const label=`Step ${step+1}, ${notes.length} notes, ${kind} ${value||'empty'}`;
  return `<button class="step-slider" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(level*100)}" aria-valuetext="${escape(value||'empty')}" data-lane-step="${step}"${notes.length&&supports(notes,kind)?` data-select="${escape(notes[0].id)}"`:breakChance?'':' disabled'} style="left:${step/groups.length*100}%;width:${100/groups.length}%;--v:${level.toFixed(4)}" aria-label="${escape(label)}" aria-pressed="${active}"${['pitch','pan'].includes(kind)?' data-bipolar':''}><i class="step-slider-fill"></i>${stepOutput(value)}</button>`;
 }).join('');
}
