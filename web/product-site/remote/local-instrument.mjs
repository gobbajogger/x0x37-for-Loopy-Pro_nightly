// SPDX-License-Identifier: GPL-3.0-only
// Owns a user-started local native runtime. It does not apply Remote drafts,
// request MIDI permissions or replace a connected instrument session.
import {createMasterOutput} from './master-output.mjs';
import {createRuntimePlayingState} from './runtime-playing-state.mjs';
export function createLocalInstrument({load,attach,status=()=>{},onState=()=>{},onPlaying=()=>{}}){
 const playing=createRuntimePlayingState({onState:onPlaying});
 let active=null,binding=null,pending=null,generation=0;
 let masterOutput=null;
 function showMasterOutput(host){
  if(!host||!active){masterOutput?.close();masterOutput=null;return;}
  masterOutput ??= createMasterOutput(active);
  masterOutput.mount(host);
 }
 async function stop(message='Emulator stopped'){
  ++generation;showMasterOutput(null);playing.close();pending?.abort();pending=null;
  const old=active;active=null;binding?.close();binding=null;
  onState('stopped');status(message);if(old)await old.close();
 }
 async function start(){
  if(active||pending)return;
  const mine=++generation,controller=new AbortController();pending=controller;
  playing.close();onState('starting');status('Starting emulator');let candidate;
  try{
   candidate=await load({signal:controller.signal,onMessage:message=>{if(mine===generation&&active===candidate&&candidate)playing.receive(message,candidate.node.port,candidate.observerPin);},onError:error=>{if(mine===generation)void stop('Emulator stopped: '+error.message);}});
   if(controller.signal.aborted||mine!==generation){await candidate.close();return;}
   binding=attach(candidate.node.port,candidate.observerPin);
   candidate.activate();active=candidate;playing.bind(candidate.node.port,candidate.observerPin);pending=null;onState('running');status('Emulator running · Draft edits stay separate');
  }catch(error){
   if(mine===generation){active=null;playing.close();pending=null;binding?.close();binding=null;onState(controller.signal.aborted?'stopped':'unavailable');status(controller.signal.aborted?'Emulator stopped':'Emulator unavailable');}
   await candidate?.close();
  }
 }
 const controlEndpoint=()=>active?{port:active.node.port,pin:active.observerPin}:null;
 return {start,stop,controlEndpoint,showMasterOutput,playingState:playing.snapshot};
}
