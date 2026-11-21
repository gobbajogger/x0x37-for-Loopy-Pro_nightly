// SPDX-License-Identifier: GPL-3.0-only
// Local native provider consumer. No WebMIDI, synthesized readings, or draft
// mutations. The provider owns native admission, adoption and atomic Undo.
export function createRuntimeMixState(bindings,{onState=()=>{}}={}){
 const groups=new Map([...bindings].map(([key,g])=>[key,{...g}]));
 let provider=null,pendingProvider=null,admitted=false,phase='inactive',values=new Map(),history=[],epoch=0;
 const closed=new WeakSet();
 function release(candidate){if(candidate&&(typeof candidate==='object'||typeof candidate==='function')&&candidate!==provider&&candidate!==pendingProvider&&!closed.has(candidate)){closed.add(candidate);if(typeof candidate.close==='function')candidate.close();}}
 const snapshot=()=>({phase,values:new Map(values),canUndo:phase==='ready'&&history.length>0});
 const notify=()=>onState(snapshot());
 function parse(reply){
  if(!reply||!Array.isArray(reply.controls)||reply.controls.length>256)throw Error('Invalid native Mix snapshot');
  const seen=new Set(),next=new Map();
  for(const c of reply.controls){
   if(!c||![c.target,c.voice,c.parameter,c.value,c.min,c.max].every(Number.isSafeInteger)||c.target<0||c.voice<0||c.parameter<0||c.kind!=='u32'||c.min!==0||c.max<0||c.max>0xffffffff||c.value<c.min||c.value>c.max)throw Error('Invalid native Mix control');
   const key=`${c.target}:${c.voice}:${c.parameter}`;if(seen.has(key))throw Error('Duplicate native Mix control');seen.add(key);
   const g=groups.get(key);if(g){if(c.min!==g.min||c.max!==g.max)throw Error('Native Mix domain mismatch');next.set(key,c.value);}
  }
  if(next.size!==groups.size)throw Error('Missing native Mix reading');
  return next;
 }
 function unavailable(){admitted=false;phase='unavailable';values=new Map();history=[];notify();}
 function close(){++epoch;const old=provider,pending=pendingProvider;provider=null;pendingProvider=null;admitted=false;phase='inactive';values=new Map();history=[];release(old);release(pending);notify();}
 async function connect(candidate){
  if(phase==='busy')throw Error('Native Mix transaction in flight');
  const mine=++epoch,old=provider,priorPending=pendingProvider;pendingProvider=candidate;release(priorPending);phase='loading';notify();
  try{
   if(!candidate||!['read','set','undo','close'].every(k=>typeof candidate[k]==='function')||closed.has(candidate))throw Error('Native Mix provider unavailable');
   const next=parse(await candidate.read());
   if(mine!==epoch){release(candidate);return;}
   provider=candidate;pendingProvider=null;release(old);
   values=next;history=[];admitted=true;phase='ready';notify();
  }catch(error){if(mine===epoch)pendingProvider=null;release(candidate);if(mine===epoch){if(provider===old&&admitted){phase='ready';notify();}else unavailable();}throw error;}
 }
 async function transaction(action){
  if(phase!=='ready'||!provider)throw Error('Native Mix is not ready');
  const mine=epoch,current=provider;phase='busy';notify();
  try{
   const result=await action(current);if(mine!==epoch)return;
   const next=parse(result.reply);
   if(next.get(result.key)!==result.expected)throw Error('Native Mix change not confirmed');
   result.commit();values=next;phase='ready';notify();
  }catch(error){if(mine===epoch)unavailable();throw error;}
 }
 async function change(key,value){
  const g=groups.get(key);
  if(!g||!Number.isSafeInteger(value)||value<g.min||value>g.max)throw Error('Invalid native Mix edit');
  return transaction(async current=>{
   const before=values.get(key);
   const reply=await current.set({target:g.target,voice:g.voice,parameter:g.parameter,expected:before,value});
   if(typeof reply?.undoToken!=='string'||!reply.undoToken.length||reply.undoToken.length>256)throw Error('Invalid native Undo receipt');
   return{reply,key,expected:value,commit(){history.push({key,before,token:reply.undoToken});if(history.length>16)history.shift();}};
  });
 }
 async function undo(){
  if(!history.length)throw Error('No native edit to undo');
  const {key,before,token}=history.at(-1);
  return transaction(async current=>{
   const reply=await current.undo({token});if(reply?.undoToken!==null)throw Error('Invalid native Undo result');
   return{reply,key,expected:before,commit(){history.pop();}};
  });
 }
 return{connect,change,undo,close,snapshot};
}
