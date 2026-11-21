import{allocateDraftIds}from'./draft-identity.mjs';
import{RollDraft}from'./roll.mjs';
import{PAN_CENTRE}from'./pan.mjs';
export const chanceDomain=Object.freeze([...Array.from({length:20},(_,i)=>(100-i*5)+'%'),...Array.from({length:7},(_,i)=>Array.from({length:i+2},(_,j)=>(j+1)+':'+(i+2))).flat()]);
export class SequenceDraft extends RollDraft{
 constructor(o){super(o);this.selection=new Set();this.clipboard=null;}
 beginSelectionGesture(owner,id){const ns=this._notes.filter(n=>this.selection.has(n.id)),anchor=ns.find(n=>n.id===id);if(!anchor||ns.length<2||ns.some(n=>n.track!==anchor.track)||!super.beginGesture(owner,id))return false;this.gesture.ids=ns.map(n=>n.id);return true;}
 previewSelectionGesture(owner,samples,pitch){const g=this.gesture;if(!g||g.owner!==owner||this.pointers.size!==1||!g.ids||!Number.isInteger(samples)||!Number.isInteger(pitch))return false;const ids=new Set(g.ids),changes=g.before.filter(n=>ids.has(n.id)).map(n=>this.validate(n.id,{start:n.start+samples,end:n.end+samples,note:n.note+pitch})),map=new Map(changes.map(n=>[n.id,n]));this._notes=g.before.map(n=>map.get(n.id)??structuredClone(n));return true;}
 beginStepGesture(owner,ids){if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)return false;const notes=ids.map(id=>this._notes.find(n=>n.id===id));if(notes.some(n=>!n)||notes.some(n=>n.track!==notes[0].track)||!super.beginGesture(owner,ids[0]))return false;this.gesture.ids=[...ids];return true;}
 previewStepGesture(owner,patches){const g=this.gesture;if(!g||g.owner!==owner||this.pointers.size!==1||!g.ids)return false;if(!Array.isArray(patches)||patches.length!==g.ids.length||new Set(patches.map(p=>p.id)).size!==g.ids.length||patches.some(p=>!g.ids.includes(p.id)||!p.patch||Object.keys(p.patch).some(k=>!['note','velocity','pan','chance','pitchOffset'].includes(k))))throw Error('Invalid step group patch');const changes=new Map(patches.map(p=>[p.id,this.validate(p.id,p.patch)]));this._notes=g.before.map(n=>changes.get(n.id)??structuredClone(n));return true;}
 selectIds(ids){if(!Array.isArray(ids)||ids.some(id=>!this._notes.some(n=>n.id===id)))throw Error('Invalid selection');this.selection=new Set(ids);}
 validate(id,patch){const base={...patch};delete base.chance;delete base.pan;delete base.pitchOffset;const n=super.validate(id,base);if('pitchOffset'in patch){if(!['drum909','drum808'].includes(n.track)||!Number.isInteger(patch.pitchOffset)||patch.pitchOffset< -24||patch.pitchOffset>24)throw Error('Drum pitch offset is -24..24 semitones');if(patch.pitchOffset===0)delete n.pitchOffset;else n.pitchOffset=patch.pitchOffset;}if('pan'in patch){if(patch.pan!==null&&!(Number.isInteger(patch.pan)&&patch.pan>=0&&patch.pan<=127))throw Error('Pan is 0..127');const p=patch.pan===null?PAN_CENTRE:patch.pan;if(p===PAN_CENTRE)delete n.pan;else n.pan=p;}if('chance'in patch){if(!['chicago','miami','drum909','drum808'].includes(n.track)||patch.chance!==null&&!chanceDomain.includes(patch.chance))throw Error('Unsupported chance');if(patch.chance===null)delete n.chance;else n.chance=patch.chance;}return n;}
 copy(){const ns=this._notes.filter(n=>this.selection.has(n.id));if(!ns.length)throw Error('Select notes');const start=Math.min(...ns.map(n=>n.start)),pitch=Math.min(...ns.map(n=>n.note));this.clipboard=ns.map(n=>({...structuredClone(n),start:n.start-start,end:n.end-start,note:n.note-pitch}));return ns.length;}
 paste({track,start,note}){if(this.gesture||!this.clipboard?.length)throw Error('No clipboard or active gesture');if(typeof track!=='string'||!Number.isInteger(start)||!Number.isInteger(note))throw Error('Invalid paste target');const ns=this.clipboard.map(n=>({...n,track,start:n.start+start,end:n.end+start,note:n.note+note,sourceOrder:null}));for(const n of ns)if(n.start<0||n.end>this.endSample||n.note<0||n.note>127||('pitchOffset'in n&&!['drum909','drum808'].includes(track))||n.chance&&!['chicago','miami','drum909','drum808'].includes(track))throw Error('Whole paste must fit');const before=this.notes,allocation=allocateDraftIds(this._notes,ns.length,this.next);ns.forEach((n,i)=>n.id=allocation.ids[i]);this._notes.push(...ns);this.next=allocation.next;this.push(before);this.selection=new Set(ns.map(n=>n.id));return ns.map(n=>n.id);}
 moveSelected(samples,pitch){if(this.gesture||!Number.isInteger(samples)||!Number.isInteger(pitch))throw Error('Invalid group move');const changes=this._notes.filter(n=>this.selection.has(n.id)).map(n=>this.validate(n.id,{start:n.start+samples,end:n.end+samples,note:n.note+pitch}));const map=new Map(changes.map(n=>[n.id,n]));const before=this.notes;this._notes=this._notes.map(n=>map.get(n.id)??n);return this.push(before);}
 deleteSelected(){if(this.gesture)throw Error('Finish gesture');const before=this.notes;this._notes=this._notes.filter(n=>!this.selection.has(n.id));this.selection.clear();return this.push(before);}
 toggleHit(track,note,start){if(!['drum909','drum808'].includes(track)||!Number.isInteger(start)||start<0||start>=this.endSample)throw Error('Invalid drum step');const found=this._notes.find(n=>n.track===track&&n.note===note&&n.start===start);if(found){this.selectIds([found.id]);this.deleteSelected();return null;}const id=this.add({track,note,start,end:start+1,velocity:100,channel:9});const n=this._notes.find(n=>n.id===id);n.end=start;n.pulse=true;return id;}
 changes(){const ids=new Set([...this.original.map(n=>n.id),...this._notes.map(n=>n.id)]);return [...ids].flatMap(id=>{const before=this.original.find(n=>n.id===id)??null,after=this._notes.find(n=>n.id===id)??null;return JSON.stringify(before)===JSON.stringify(after)?[]:[{id,track:(after??before).track,before:structuredClone(before),after:structuredClone(after),status:'local-draft'}];});}
}
export const MAX_SONG_ROWS = 1024;
export class Arrangement{
 constructor(){this.rows=[];this.history=[];this.future=[];}
 save(next){
  if(next.length>MAX_SONG_ROWS)throw Error('Song row limit reached');
  this.history.push(structuredClone(this.rows));this.future=[];this.rows=next;
 }
 check(row){if(!Array.isArray(row.patterns)||row.patterns.length!==5||row.patterns.some(n=>!Number.isInteger(n)||n<0||n>31)||!Number.isInteger(row.repeats)||row.repeats<1||row.repeats>8)throw Error('Invalid song row');
  if(Object.hasOwn(row,'muteMask')&&(!Number.isInteger(row.muteMask)||row.muteMask<0||row.muteMask>31))throw Error('Invalid song mute mask');
  return {patterns:[...row.patterns],repeats:row.repeats,...(row.muteMask?{muteMask:row.muteMask}:{})};
 }
 add(patterns,repeats=1){this.save([...this.rows,this.check({patterns:[...patterns],repeats})]);}
 update(i,patch){this.row(i);if(Object.keys(patch).some(k=>!['patterns','repeats','muteMask'].includes(k)))throw Error('Invalid song row');const row=this.check({...structuredClone(this.rows[i]),...structuredClone(patch)});this.save(this.rows.map((r,j)=>i===j?row:r));}
 row(i){if(!Number.isInteger(i)||i<0||i>=this.rows.length)throw Error('Invalid song row');return this.rows[i];}
 setPattern(i,part,pattern){const row=this.row(i);if(!Number.isInteger(part)||part<0||part>=5||!Number.isInteger(pattern)||pattern<0||pattern>31)throw Error('Invalid song pattern');const patterns=[...row.patterns];patterns[part]=pattern;this.update(i,{patterns});}
 setPartOn(i,part,on){
  const row=this.row(i);
  if(!Number.isInteger(part)||part<0||part>=5||typeof on!=='boolean')throw Error('Invalid song part switch');
  const before=row.muteMask??0,bit=1<<part;
  const muteMask=on?before&~bit:before|bit;
  if(muteMask===before)return false;
  this.update(i,{muteMask});return true;
 }
 move(i,direction){this.row(i);if(direction!==-1&&direction!==1)throw Error('Invalid song move');const next=i+direction;if(next<0||next>=this.rows.length)return false;const rows=structuredClone(this.rows);[rows[i],rows[next]]=[rows[next],rows[i]];this.save(rows);return true;}
 remove(i){this.row(i);this.save(this.rows.filter((_,index)=>index!==i));}
 undo(){if(!this.history.length)return;this.future.push(this.rows);this.rows=this.history.pop();}
 redo(){if(!this.future.length)return;this.history.push(this.rows);this.rows=this.future.pop();}
}

export function drumLaneTarget(track,note){const kit=track==='drum909'?0:track==='drum808'?1:-1,notes=kit===0?[36,38,41,45,50,37,39,42,46,49,51]:[36,38,41,45,50,37,39,56,49,46,42];const voice=notes.indexOf(note);if(kit<0||voice<0)throw Error('Unknown drum voice');return{part:kit,kit,voice,packedVoice:(kit<<4)|voice,pattern:null,authority:'local-draft-unbound-pattern',velocityStorage:'T_VEL',none:'legacy-accent-law'};}
export function encodeChance(value){if(!chanceDomain.includes(value))throw Error('Unsupported UI chance');if(value.endsWith('%'))return Number(value.slice(0,-1));const[a,b]=value.split(':').map(Number);return 101+(b*(b-1)/2-1)+(a-1);}
// Same pixel scale as a 5–100 step-5 drag (span 144). Past 5% the next steps are 1:2 … 8:8.
export function chanceFromDrag(start,upPx,{span=144,range=95,step=5}={}){
 if(!chanceDomain.includes(start))start='100%';
 const index=chanceDomain.indexOf(start);
 const startUnclamped=start.endsWith('%')?Number(start.slice(0,-1)):5-(index-19)*step;
 const unclamped=startUnclamped+(upPx/span)*range;
 if(unclamped>=2.5){const clamped=Math.max(5,Math.min(100,unclamped));return (5+Math.round((clamped-5)/step)*step)+'%';}
 const stepsBelow=Math.round((5-unclamped)/step);
 return chanceDomain[Math.max(20,Math.min(chanceDomain.length-1,19+stepsBelow))];
}
