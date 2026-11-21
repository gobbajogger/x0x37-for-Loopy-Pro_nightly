// SPDX-License-Identifier: GPL-3.0-only
// DNR2 session for the browser Remote.
// Wire: tests/product-remote/tests/c-reference/remote_wire.c lines 6-23.
//   Frame is 51 bytes, header F0 7D 44 4E 02 (bytes 240,125,68,78,2), end F7.
// Ops, statuses and kinds: remote_core.h lines 8-10.
//   HELLO 0, OPEN 1, READ 2, SET 3, DOWN 4, UP 5, KEEPALIVE 6, CLOSE 7.
//   OK 0, QUEUED 1, BAD 2, BUSY 3, STALE 4, CONFLICT 5, UNSUPPORTED 6, FULL 7, EXHAUSTED 8.
//   U32 1, F32_BITS 2, HELD 3.
// Handling: remote_core.c dnr2_handle. HELLO returns catalog crc and count and does not
// open a lease. OPEN creates the lease. READ does not renew it. SET/DOWN/UP/KEEPALIVE/CLOSE
// require the lease. A revision mismatch returns CONFLICT and does not apply the value.
// The older 36-byte header F0 7D 44 4E 01 in remote/vendor/codec.mjs is not this core.
// Firmware repository main usb.c dispatches other SysEx and does not dispatch 7D 44 4E.
// This module therefore sends nothing until the user clicks Connect, and it sends SET
// only for an explicit Apply or Undo of a control the instrument confirmed.
import {MidiBroker,RemoteClient} from './device/vendor/client.mjs';
import {OP} from './device/vendor/codec.mjs';
import {validateBundle,friendly} from './device/session.mjs';

const SAFETY_OFF='No reviewed firmware catalog. Apply stays off.';
const SAFETY_ON='Apply sends only a control this connection confirmed. Pattern edits stay on this page.';

export function mountFirmwareLink({document:doc=globalThis.document,navigator:nav=globalThis.navigator,bundle=globalThis.__DNBOX_FIRMWARE_BUNDLE??null}={}){
 const $ =id=>doc.getElementById(id);
 const connect=$('connect'),apply=$('apply'),state=$('conn-state'),safety=$('firmware-safety'),list=$('firmware-controls');
 if(!connect||!apply||!state)return {destroy(){}};
 let undoEdit=null,generation=0,disposed=false,closing=null;
 let admitted=null,client=null,broker=null,confirmed=new Map(),pending=null,busy=false;
 apply.disabled=true;
 if(safety)safety.textContent=bundle?SAFETY_ON:SAFETY_OFF;
 const result=$('connection-result'),message=$('connection-message');
 const say=text=>{state.textContent=text;if(message)message.textContent=text;};
 $('close-connection')?.addEventListener('click',()=>{if(result)result.hidden=true;connect.focus?.();});
 function stage(descriptor,input){
  if(busy||disposed||state.dataset.session!=='ready'||$(input.id)!==input)return;
  const value=input.value===''?NaN:Number(input.value);
  const known=confirmed.get(descriptor.id);
  const ok=known&&known.available!==false&&Number.isFinite(value)&&value>=descriptor.min&&value<=descriptor.max&&(descriptor.kind!==1||Number.isInteger(value))&&value!==known.value;
  pending=ok?{id:descriptor.id,value}:null;
  apply.disabled=!ok;
 }
 function invalidate(text){
  undoEdit=null;pending=null;confirmed.clear();apply.disabled=true;
  list?.replaceChildren();state.dataset.session='disconnected';say(text);
 }
 function renderControls(){
  if(!list?.replaceChildren||!doc.createElement)return;
  list.replaceChildren();
  for(const descriptor of admitted.catalog.controls){
   const reading=confirmed.get(descriptor.id);
   if(!reading||reading.available===false){
    const row=doc.createElement('p');row.dataset.control=String(descriptor.id);row.textContent=`${descriptor.label} Not confirmed`;list.append(row);continue;
   }
   if(descriptor.kind===3){
    const row=doc.createElement('p');row.dataset.control=String(descriptor.id);row.textContent=`${descriptor.label} ${reading.value}`;list.append(row);continue;
   }
   const label=doc.createElement('label');label.textContent=descriptor.label;
   const input=doc.createElement('input');
   input.type='number';input.id=`fw-${descriptor.id}`;input.dataset.fw=String(descriptor.id);
   input.min=String(descriptor.min);input.max=String(descriptor.max);input.step=descriptor.kind===1?'1':'any';input.value=String(reading.value);
   input.addEventListener('input',()=>stage(descriptor,input));
   label.append(input);list.append(label);
  }
  if(undoEdit){
   const edit=undoEdit;
   const button=doc.createElement('button');
   button.type='button';button.className='btn';button.id='firmware-undo';
   button.textContent=edit.storedLabel ? `Undo stored ${edit.storedLabel} value` : 'Undo instrument edit';
   button.addEventListener('click',()=>{
    if(undoEdit===edit)void writeControl(edit,true);
   });
   list.append(button);
  }
 }
 function shutdown(announce){
  if(closing)return closing;
  ++generation;undoEdit=null;busy=true;state.dataset.session='disconnected';
  apply.disabled=true;pending=null;confirmed.clear();admitted=null;
  list?.replaceChildren();
  const current=client,link=broker;client=null;broker=null;
  closing=Promise.resolve().then(async()=>{
   let released=true;
   try{if(current)released=(await current.close()).released===true;}catch{released=false;}
   link?.dispose();
   connect.textContent='Connect';
   if(announce)say(released?'Disconnected':'Release was not confirmed.');
   if(safety)safety.textContent=bundle?SAFETY_ON:SAFETY_OFF;
   return released;
  }).finally(()=>{closing=null;busy=false;});
  return closing;
 }
 async function onConnect(){
  if(disposed||busy||client)return;const own=++generation;busy=true;apply.disabled=true;pending=null;say('Connecting');
  try{
   let parsed=null;
   if(bundle){try{parsed=validateBundle(bundle);}catch{parsed=null;}}
   if(!parsed){say(SAFETY_OFF);if(safety)safety.textContent=SAFETY_OFF;return;}
   const request=nav?.requestMIDIAccess;
   if(typeof request!=='function')throw Error('MIDI access is unavailable in this browser.');
   const access=await request.call(nav,{sysex:true});
   if(own!==generation)return;
   const input=[...access.inputs.values()].find(port=>port.state==='connected');
   const output=[...access.outputs.values()].find(port=>port.state==='connected');
   if(!input||!output){say('No MIDI input and output pair is connected. Connect your instrument and try again.');return;}
   await input.open?.();if(own!==generation)return;
   await output.open?.();if(own!==generation)return;
   const timeoutMs=Number.isFinite(globalThis.__DNBOX_MIDI_TIMEOUT)?globalThis.__DNBOX_MIDI_TIMEOUT:400;
   broker=new MidiBroker({input,output,timeoutMs});
   const pin={crc:parsed.catalog.crc,count:parsed.catalog.count,admitted:true,controls:parsed.catalog.controls.map(descriptor=>({id:descriptor.id,kind:descriptor.kind,min:descriptor.min,max:descriptor.max,...(descriptor.readMin!==undefined?{readMin:descriptor.readMin}:{}),...(descriptor.readMax!==undefined?{readMax:descriptor.readMax}:{})}))};
   client=new RemoteClient({transport:broker,pin,client:91,onState:note=>{if(own!==generation)return;
    if(note.phase==='connection-lost')invalidate('Connection lost. Disconnect and reconnect.');
    if(note.phase==='refresh-required')invalidate('The instrument changed. Disconnect and reconnect.');}});
   await client.identify();if(own!==generation)return;
   await client.open();if(own!==generation)return;
   const snapshot=await client.snapshot(parsed.catalog.controls.map(descriptor=>descriptor.id));
   if(own!==generation)return;
   if(!parsed.admission.testOnly)client.startKeepalive();
   admitted=parsed;confirmed=new Map(snapshot.values.map(reading=>[reading.id,reading]));pending=null;
   renderControls();apply.disabled=true;
   const count=snapshot.values.filter(reading=>reading.available!==false).length;
   state.dataset.session='ready';say(`Connected. ${count} controls confirmed.`);if(result)result.hidden=true;
   if(safety)safety.textContent=`${parsed.admission.testOnly?'Simulator catalog. Not a device. ':''}${SAFETY_ON}`;
   connect.textContent='Disconnect';
  }catch(error){
   if(own!==generation)return;
   await shutdown(false);if(!disposed)say(friendly(error));
  }finally{if(own===generation)busy=false;}
 }
 async function writeControl(job,reversing){
  if(!job||busy||disposed||!client||state.dataset.session!=='ready')return;
  const current=client,own=generation;
  const prior=confirmed.get(job.id);
  if(!prior?.available)return;
  pending=null;undoEdit=null;apply.disabled=true;busy=true;
  try{
   if(reversing){
    // READ does not acquire a write lease. The SET below also checks this
    // revision in the firmware, covering a device edit between READ and SET.
    const before=await current.snapshot([job.id]);
    if(own!==generation||state.dataset.session!=='ready')return;
    const value=before.values[0];
    if(before.revision!==job.revision||!value.available||!Object.is(value.value,job.after))
     throw Error('The instrument changed.');
   }
   const ack=await current.set(job.id,job.value);
   if(own!==generation||state.dataset.session!=='ready')return;
   const snapshot=await current.snapshot(admitted.catalog.controls.map(control=>control.id));
   if(own!==generation||state.dataset.session!=='ready')return;
   const reading=snapshot.values.find(control=>control.id===job.id);
   const descriptor=admitted.catalog.controls.find(control=>control.id===job.id);
   const requested=descriptor.kind===2?Math.fround(job.value):job.value;
   if(!reading?.available||snapshot.revision!==ack.revision||
      !Object.is(reading.value,ack.value)||!Object.is(reading.value,requested))
    throw Error('The instrument changed.');
   // A stored scalar can also move other controls (for example, a compressor
   // macro). One inverse SET cannot promise to restore those controls.
   const storedTarget=ack.queued||Boolean(reversing&&job.storedLabel);
   const previousValues=confirmed;
   confirmed=new Map(snapshot.values.map(control=>[control.id,control]));
   const changedControls=admitted.catalog.controls.filter(control=>{
    if(control.id===job.id)return false;
    const before=previousValues.get(control.id),after=confirmed.get(control.id);
    return before?.available!==after?.available||!Object.is(before?.value,after?.value);
   });
   const otherChanges=changedControls.length
    ?' Other control values changed ('+changedControls.map(control=>control.label).join(', ')+').':'';
   if(!reversing&&!changedControls.length&&!Object.is(prior.value,reading.value)&&prior.value>=descriptor.min&&prior.value<=descriptor.max)
    undoEdit={id:job.id,value:prior.value,after:reading.value,revision:snapshot.revision,storedLabel:ack.queued?descriptor.label:null};
   renderControls();
   if(storedTarget){
    const stored=reversing?`Restored stored value ${reading.value}.`:`Stored ${reading.value}.`;
    say(stored+(ack.queued?' Update queued.':'')+otherChanges);
   }else say((reversing?`Firmware restored ${reading.value}.`:`Firmware confirmed ${reading.value}.`)+otherChanges);
  }catch(error){
   if(own===generation)invalidate(error.message.includes('instrument changed')
    ?'The instrument changed. Disconnect and reconnect.':'The edit was not confirmed. Disconnect and reconnect.');
  }finally{if(own===generation)busy=false;}
 }
 connect.addEventListener('click',event=>{
  event.preventDefault?.();if(disposed||closing)return;
  if(result)result.hidden=false;
  if(client)void shutdown(true);else if(!busy)void onConnect();
 });
 apply.addEventListener('click',()=>{void writeControl(pending,false);});
 const page=doc.defaultView;
 const leave=()=>{if(client||busy)void shutdown(true);};
 page?.addEventListener('pagehide',leave);
 return {destroy(){disposed=true;page?.removeEventListener('pagehide',leave);return shutdown(false);},op:OP};
}
