// SPDX-License-Identifier: GPL-3.0-only
// Native Chicago consumer only. No device, Draft mutation or scalar-inverse Undo.
export function createRuntimeSoundState(bindings,{voice,onState=()=>{}}={}){
 if(![0,1].includes(voice))throw Error('Invalid Chicago voice');
 const groups=new Map([...bindings].filter(([,g])=>g.voice===voice).map(([k,g])=>[k,{...g}]));
 if(groups.size!==20)throw Error('Incomplete Chicago controls');
 for(let parameter=0;parameter<20;parameter++){const key=`CHICAGO:${voice}:2:${voice}:${parameter}`,g=groups.get(key);if(!g||g.engine!=='CHICAGO'||g.sourceBank!==0||g.target!==2||g.voice!==voice||g.parameter!==parameter||g.min!==0||g.max!==(parameter===17?11:127))throw Error('Chicago domain mismatch');}
 let provider=null,pendingProvider=null,admitted=false,phase='inactive',values=new Map(),displays=new Map(),history=[],revision=null,choiceSerial=null,epoch=0;
 const closed=new WeakSet(),opaque=s=>typeof s==='string'&&s.length>0&&s.length<=256&&!/[\u0000-\u001f]/.test(s);
 function release(candidate){if(candidate&&(typeof candidate==='object'||typeof candidate==='function')&&candidate!==provider&&candidate!==pendingProvider&&!closed.has(candidate)){closed.add(candidate);if(typeof candidate.close==='function')candidate.close();}}
 const snapshot=()=>({phase,engine:admitted?'CHICAGO':null,voice,sourceBank:admitted?0:null,choiceSerial,revision,values:new Map(values),displays:new Map([...displays].map(([k,v])=>[k,{...v}])),canUndo:phase==='ready'&&history.length>0});
 const notify=()=>onState(snapshot());
 function parse(reply){
  if(!reply||reply.engine!=='CHICAGO'||reply.voice!==voice||reply.sourceBank!==0||!Number.isSafeInteger(reply.choiceSerial)||reply.choiceSerial<0||reply.choiceSerial>0xffffffff||!opaque(reply.revision)||!Array.isArray(reply.controls)||reply.controls.length!==20)throw Error('Invalid native Chicago snapshot');
  const next=new Map(),labels=new Map();
  for(const c of reply.controls){
   if(!c||c.target!==2||c.voice!==voice||!Number.isSafeInteger(c.parameter))throw Error('Invalid native Chicago identity');
   const key=`CHICAGO:${voice}:2:${voice}:${c.parameter}`,g=groups.get(key);
   if(!g||next.has(key)||c.kind!=='u32'||c.min!==g.min||c.max!==g.max||!Number.isSafeInteger(c.value)||c.value<c.min||c.value>c.max)throw Error('Invalid native Chicago domain');
   if(typeof c.display!=='string'||c.display.length>63||typeof c.unit!=='string'||c.unit.length>31||/[\u0000-\u001f]/.test(c.display+c.unit))throw Error('Invalid native Chicago display');
   next.set(key,c.value);labels.set(key,{display:c.display,unit:c.unit});
  }
  return{values:next,displays:labels,revision:reply.revision,choiceSerial:reply.choiceSerial};
 }
 function adopt(next){({values,displays,revision,choiceSerial}=next);}
 function clear(nextPhase){admitted=false;phase=nextPhase;values=new Map();displays=new Map();history=[];revision=choiceSerial=null;notify();}
 function close(){++epoch;const old=provider,pending=pendingProvider;provider=pendingProvider=null;release(old);release(pending);clear('inactive');}
 async function connect(candidate){
  if(candidate===provider&&admitted&&phase==='ready')return;
  if(phase==='busy')throw Error('Native Chicago transaction in flight');
  const mine=++epoch,old=provider,previous=pendingProvider;pendingProvider=candidate;release(previous);phase='loading';notify();
  try{
   if(!candidate||!['read','set','undo','close'].every(k=>typeof candidate[k]==='function')||closed.has(candidate))throw Error('Chicago provider unavailable');
   const reply=await candidate.read(),next=parse(reply);if(reply.undoToken!==null)throw Error('Unexpected Chicago read token');
   if(mine!==epoch){release(candidate);return;}
   provider=candidate;pendingProvider=null;release(old);adopt(next);history=[];admitted=true;phase='ready';notify();
  }catch(error){if(mine===epoch)pendingProvider=null;release(candidate);if(mine===epoch){if(provider===old&&admitted){phase='ready';notify();}else clear('unavailable');}throw error;}
 }
 async function transaction(action){
  if(phase!=='ready'||!provider||!admitted)throw Error('Native Chicago is not ready');
  const mine=epoch,current=provider;phase='busy';notify();
  try{const result=await action(current);if(mine!==epoch)return;const next=parse(result.reply);
   if(next.values.get(result.key)!==result.expected)throw Error('Chicago change not confirmed');
   result.commit();adopt(next);phase='ready';notify();}
  catch(error){if(mine===epoch){if(error?.code==='busy'&&error.noWrite===true&&provider===current&&admitted){phase='ready';notify();}else clear('unavailable');}throw error;}
 }
 async function change(key,value){
  const g=groups.get(key);if(!g||!Number.isSafeInteger(value)||value<g.min||value>g.max)throw Error('Invalid Chicago edit');
  return transaction(async current=>{
   const before=values.get(key);
   const reply=await current.set({revision,target:2,voice,parameter:g.parameter,expected:before,value});
   if(!opaque(reply?.undoToken))throw Error('Invalid Chicago Undo token');
   return{reply,key,expected:value,commit(){history.push({key,before,token:reply.undoToken});if(history.length>16)history.shift();}};
  });
 }
 async function undo(){
  if(!history.length)throw Error('No Chicago edit to undo');
  const {key,before,token}=history.at(-1);
  return transaction(async current=>{
   const reply=await current.undo({token});if(reply?.undoToken!==null)throw Error('Invalid Chicago Undo result');
   return{reply,key,expected:before,commit(){history.pop();}};
  });
 }
 return{connect,change,undo,close,snapshot};
}
