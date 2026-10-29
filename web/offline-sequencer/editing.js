// SPDX-License-Identifier: GPL-3.0-only
import {copy,gate,integer,getPart} from './model.js';
export function notesOf(part) {
 const notes=[];for(let i=0;i<64;i++)if(gate(part.steps[i])===1){let end=i;while(end<63&&gate(part.steps[end+1])===2)end++;const last=part.steps[end];notes.push({start:i,pitch:part.steps[i].note,slots:end-i+1,end:end+((last.flags>>4)||16)/16,endpoint:last.flags>>4,rawVelocity:part.steps[i].velocity,velocity:part.steps[i].velocity||100,accent:!!(part.steps[i].flags&4),slide:!!(part.steps[i].flags&8)});i=end;}return notes;
}
export function removeNote(doc,pattern,part,start){const b=getPart(doc,pattern,part),n=notesOf(b).find(n=>n.start===start);if(!n)throw Error('Select a NOTE onset.');for(let i=start;i<start+n.slots;i++)b.steps[i]={note:b.steps[i].note,flags:0,velocity:b.steps[i].velocity};}
export function putNote(doc,pattern,part,{start,pitch,slots=1,velocity=100,accent=false,slide=false,endpoint=0},oldStart=null){
 if(!integer(part,0,1)||!integer(start,0,63)||!integer(pitch,0,127)||!integer(slots,1,64-start)||!integer(velocity,0,127)||!integer(endpoint,0,15))throw Error('Note exceeds stored pitch, velocity or 64-step bounds.');
 const b=getPart(doc,pattern,part),old=oldStart===null?null:notesOf(b).find(n=>n.start===oldStart);if(oldStart!==null&&!old)throw Error('Selected note no longer exists.');
 const previous=old?copy(b.steps.slice(old.start,old.start+old.slots)):null;if(previous&&previous.some((s,i)=>(i>0&&(s.note!==previous[0].note||(s.flags&15)!==2))||(i<previous.length-1&&(s.flags>>4))))throw Error('Complex tie-cell metadata cannot be edited by this note tool; draft unchanged.');
 for(let i=start;i<start+slots;i++)if(gate(b.steps[i])!==0&&!(old&&i>=old.start&&i<old.start+old.slots))throw Error('This edit overlaps an existing note/tie. Move or remove it explicitly.');
 if(old)removeNote(doc,pattern,part,oldStart);
 for(let i=start;i<start+slots;i++)b.steps[i]={note:pitch,flags:i===start?1|(accent?4:0)|(slide?8:0):2,velocity:previous&&velocity===previous[0].velocity&&i-start<previous.length?previous[i-start].velocity:velocity};b.steps[start+slots-1].flags|=endpoint<<4;
}
export function noteEditPlan(store,pattern,part,note,oldStart=null){const candidate=copy(store.doc);putNote(candidate,pattern,part,note,oldStart);return {revision:store.revision,pattern,part,candidate};}
export function applyPlan(store,plan){if(plan.revision!==store.revision)throw Error('Draft changed after preview. Preview again.');if(plan.errors?.length)throw Error(plan.errors.join(' '));return store.replace(plan.candidate);}
