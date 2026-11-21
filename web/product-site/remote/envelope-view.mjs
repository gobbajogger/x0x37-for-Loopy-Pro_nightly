// SPDX-License-Identifier: GPL-3.0-only
import {chicagoTimes,chicagoLevel} from './glyph-render.mjs';
const clamp=n=>Math.max(0,Math.min(1,n));
const point=(x,y)=>`${x.toFixed(3)},${(30-28*clamp(y)).toFixed(3)}`;
function nativeBassPath(engine,s){
 const [a,d,sustain,r]=s.adsr,points=[],juno=engine==='JUNO';
 const e=juno?{A:a,D:d,R:r,S:sustain}:{...chicagoTimes(a,d,r),S:sustain};
 const step=1-1/Math.max(1,r*44100);
 const releaseSamples=juno&&sustain>.00001&&step>0?Math.log(.00001/sustain)/Math.log(step):0;
 const duration=[juno?a:e.A*Math.log(1.3/.3),juno?d:e.D*Math.log(100),juno?releaseSamples/44100:sustain>.04?e.R*Math.log(sustain/.04):0];
 const total=duration.reduce((a,b)=>a+b,0)||1,width=duration.map(n=>1+82*n/total),x1=width[0],x2=x1+width[1],x3=x2+15;
 const add=(x0,x1,fn)=>{for(let i=0;i<=24;i++)points.push(point(x0+(x1-x0)*i/24,fn(i/24)));};
 add(0,x1,t=>juno?t:chicagoLevel(0,t*duration[0],e));
 add(x1,x2,t=>juno?1-(1-sustain)*t:chicagoLevel(1,t*duration[1],e));
 points.push(point(x3,sustain));
 add(x3,100,t=>t===1?0:juno?sustain*Math.pow(step,t*releaseSamples):chicagoLevel(2,t*duration[2],e));
 return 'M'+points.join(' L');
}
export function observedEnvelopeMarkup(voice){
 if(!voice)return '';
 const {engine,role,snapshot:s}=voice;let title,stage=null,level,d='';
 if(engine==='JUNO'){
  title='AMP / FILTER';level=s.level;stage=['Idle','Attack','Decay','Sustain','Release'][s.stage];d=nativeBassPath(engine,s);
 }else if(engine==='CHICAGO'&&role==='amp'){
  title='AMP';level=s.level;stage={0:'Attack',1:'Decay / sustain',3:'Release',6:'Idle'}[s.state];d=nativeBassPath(engine,s);
 }else if(engine==='CHICAGO'&&role==='filter'){
  title='FILTER';level=s.eg; // No filter stage or curve is exported by this native API.
 }else if(engine==='909'){
  title='AMP';level=s.raw_level;stage=!s.active?'Idle':s.hold_active?'Hold':s.ramp_valid?'Decay':null;
  if(s.ramp_valid&&s.ramp_start>0&&s.ramp_end>0){
   const pts=Array.from({length:33},(_,i)=>point(100*i/32,s.ramp_start*Math.pow(s.ramp_end/s.ramp_start,i/32)));
   d='M'+pts.join(' L');
  }else if(Number.isFinite(s.target_decay_ms)&&Number.isFinite(s.target_hold_ms)){
   // Idle target shape is not a latched runtime ramp. The independent level
   // meter remains the actual snapshot; no elapsed position is synthesized.
   const hold=voice.slot===0?s.target_hold_ms:0,decay=Math.max(1/44.1,s.target_decay_ms),split=100*hold/(hold+decay);
   const pts=[point(0,1),point(split,1)];
   for(let i=1;i<=32;i++)pts.push(point(split+(100-split)*i/32,Math.pow(.00001,i/32)));
   d='M'+pts.join(' L');
  }
 }else return '';
 if(!Number.isFinite(level))return '';
 const graph=d?`<svg class="envelope-graph" viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label="${title} envelope"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`:'';
 return `<section class="observed-envelope" data-observed-engine="${engine}" data-observed-slot="${voice.slot}" data-observed-role="${role}"><div class="envelope-observed-heading"><strong>${title}</strong><small>Emulator</small>${stage?`<output data-observed-stage="${stage}">${stage}</output>`:''}</div>${graph}<div class="envelope-level" data-observed-level="${level}"><svg class="envelope-level-gauge" viewBox="-2 0 104 4" preserveAspectRatio="none" role="meter" aria-valuemin="0" aria-valuemax="1" aria-valuenow="${clamp(level)}" aria-label="${title} level"><line x1="0" y1="2" x2="100" y2="2" stroke="currentColor" stroke-opacity=".3"/><circle cx="${100*clamp(level)}" cy="2" r="1.5" fill="currentColor"/></svg><output>${Math.round(level*100)}%</output></div></section>`;
}

import {EnvelopeObservations} from './envelope-observations.mjs';
export function mountEnvelopeObservations(port,pin,{host,targets,now=()=>performance.now(),schedule=f=>setInterval(f,250),unschedule=clearInterval}){
 if(!port||typeof port.addEventListener!=='function'||typeof port.removeEventListener!=='function')throw Error('Owning native MessagePort required');
 const state=new EnvelopeObservations(pin);let closed=false;
 const render=()=>{
  const node=host();if(!node)return;
  const at=now(),html=closed?'':targets().map(([engine,slot,role])=>observedEnvelopeMarkup(state.get(engine,slot,role,at))).join('');
  if(node.innerHTML!==html)node.innerHTML=html;node.hidden=!html;
 };
 const receive=event=>{
  if(closed)return;
  if(event.data?.type==='error'){state.close();render();return;}
  if(event.data?.type!=='envelopes')return;
  state.accept(event.data,now());render();
 };
 port.addEventListener('message',receive);port.start?.();
 const timer=schedule(render);render();
 return {render,close(){if(closed)return;closed=true;state.close();port.removeEventListener('message',receive);unschedule(timer);render();}};
}
