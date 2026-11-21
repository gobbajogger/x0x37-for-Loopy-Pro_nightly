// SPDX-License-Identifier: GPL-3.0-only
// Live R22 readouts. One renderer per function. The shape is the current value
// through that engine's transfer curve. Idle and zero-depth stay on one frame.
// WAVE and WIDTH: Lead's ANIM-SPEC readout (102x26, peak-normalised, pad 2).
// Integer division follows the firmware C source, which truncates toward zero:
//   firmware/src/app/ui_original_wave.h:30,33 (z/4) and :93 (/2, /16384), #869 94197fc8.
// Lead's Python proof used floor division (//). That changes 24-27 of the 56
// raw Chicago samples by one unit, but none of the 102x26 rows, so the golden
// fixture glyph-fixtures-102x26.json still holds for every engine.
// Rounding for the readout uses Python's round-half-even, as the proof does.
//   firmware/src/dsp/juno6.c:10 blep, :35-41 oscillator, :79 pulse width
//   experiments/original_synth/chicago_program.c:17-21,54-57
//   experiments/original_synth/chicago_program_private.h:4-5 gain maps
// Other curves cited from firmware repository main:
//   firmware/src/dsp/drum909.c:24-26,274-283 kick pitch drop
//   firmware/src/app/ui.c:8047-8071 attack click and 808 tone lowpass
//   firmware/src/app/ui.c:8084-8108 snappy noise and level meter
// Animation is re-render after interpolating the parameter. No decorative motion.

import {miamiWave} from './wave-display.mjs';

const MERGED={
 G023:'WAVE',G024:'WAVE',G025:'WAVE',G026:'WIDTH',G029:'WIDTH',
 G037:'ADSR',G038:'ADSR',G049:'ADSR',
 G015:'ATTACK',G048:'ATTACK',
 G016:'DECAY',G071:'DECAY',
 G027:'LFO',G028:'LFO',
 G050:'TAPE',G051:'TAPE',
 G021:'TONE',G054:'TONE',
 G013:'TUNE',G014:'TUNE',G017:'TUNE',
 G032:'FILTER',G033:'FILTER',G031:'ENV'
};
// Every G001-G082 id has a value-driven family. Names come from glyph-registry FUNCTION_GLYPH.
export const ID_FAMILY=Object.freeze(Object.fromEntries([
 ...['G001','G002','G003','G004','G005','G006','G007','G008','G009','G010','G011','G012'].map(id=>[id,'VOICE']),
 ['G013','TUNE'],['G014','TUNE'],['G015','ATTACK'],['G016','DECAY'],['G017','TUNE'],['G018','TUNE'],['G019','LEVEL'],['G020','DECAY'],
 ['G021','TONE'],['G022','LEVEL'],['G023','WAVE'],['G024','WAVE'],['G025','WAVE'],['G026','WIDTH'],['G027','LFO'],['G028','LFO'],
 ['G029','WIDTH'],['G030','LFO'],['G031','ENV'],['G032','FILTER'],['G033','FILTER'],['G034','HPF'],['G035','LEVEL'],['G036','GLIDE'],
 ['G037','ADSR'],['G038','ADSR'],['G039','DRIVE'],['G040','DRIVE'],['G041','LFO'],['G042','LFO'],['G043','LFO'],['G044','DRIVE'],
 ['G045','LFO'],['G046','LFO'],['G047','PAN'],['G048','ATTACK'],['G049','ADSR'],['G050','TAPE'],['G051','TAPE'],['G052','ECHO'],
 ['G053','ECHO'],['G054','TONE'],['G055','ECHO'],['G056','ECHO'],['G057','DRIVE'],['G058','ECHO'],['G059','LEVEL'],['G060','DRIVE'],
 ['G061','GATE'],['G062','COMP'],['G063','COMP'],['G064','COMP'],['G065','COMP'],['G066','LEVEL'],['G067','COMP'],['G068','COMP'],
 ['G069','COMP'],['G070','HPF'],['G071','DECAY'],['G072','PAN'],['G073','GATE'],['G074','GATE'],['G075','LEVEL'],['G076','GATE'],
 ['G077','LFO'],['G078','GATE'],['G079','GATE'],['G080','GLIDE'],['G081','LFO'],['G082','LFO']
]));
const NAMES={
 WAVE:'WAVE',WIDTH:'WIDTH',PWM:'WIDTH',PULSE:'WIDTH',ENV:'ENV',ADSR:'ADSR',LFO:'LFO',
 FILTER:'FILTER',CUTOFF:'FILTER',RES:'FILTER',TUNE:'TUNE',PITCH:'TUNE',
 DECAY:'DECAY',ATTACK:'ATTACK',TAPE:'TAPE',WEAR:'TAPE',TONE:'TONE',LEVEL:'LEVEL',
 GLIDE:'GLIDE',PAN:'PAN',HPF:'HPF',LOWCUT:'HPF',PEAK:'FILTER',BALANCE:'PAN',
 BITE:'DRIVE',GNAW:'DRIVE',CRUSH:'DRIVE',DRIVE:'DRIVE',DIST:'DRIVE',SNAPPY:'DECAY',PDEPTH:'TUNE',
 CHORUS:'LFO',CARRIER:'LFO',XMOD:'LFO',WOBBLE:'LFO',FM:'LFO',MORPH:'LFO',AUTOPAN:'LFO',PHASER:'LFO',MOTION:'LFO',
 TIME:'ECHO',FEEDBACK:'ECHO',REV:'ECHO',DLY:'ECHO',PINGPONG:'ECHO',RETURN:'LEVEL',SUSTAIN:'ADSR',RELEASE:'DECAY',
 COMP:'COMP',THRESH:'COMP',RATIO:'COMP',MAKEUP:'COMP',LIMIT:'COMP',GLUE:'COMP',PUMP:'COMP',
 LINK:'GATE',TEMPO:'GATE',SWING:'GATE',LOCK:'GATE',NOTE:'GATE',GATE:'GATE',SLIDE:'GLIDE',SUB:'LEVEL',ACCENT:'LEVEL',MIX:'LEVEL',CHANCE:'LEVEL',VOICE:'VOICE',
 BD:'VOICE',SD:'VOICE',LT:'VOICE',MT:'VOICE',HT:'VOICE',RS:'VOICE',CP:'VOICE',CH:'VOICE',OH:'VOICE',CC:'VOICE',RC:'VOICE',CR:'VOICE',RD:'VOICE',CB:'VOICE',CY:'VOICE',COWBELL:'VOICE',DRUMBD:'VOICE'
};

// Explicit input contract: renderer internals use normalized0..1. Raw MIDI
// callers must request raw127; numeric1 is never guessed to mean either end.
export function unit(value,domain='normalized'){
 if(!['normalized','raw127'].includes(domain))throw Error('Unknown glyph value domain');
 const n=Number(value);
 if(!Number.isFinite(n))return 0;
 return Math.min(1,Math.max(0,domain==='raw127'?n/127:n));
}
function fnOf(id){
 const key=String(id??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 return MERGED[key]||ID_FAMILY[key]||NAMES[key]||'LEVEL';
}
export function familyOf(id){return fnOf(id);
}
function num(p,d=1){return (Math.round(p*1000)/1000).toFixed(d);}
function path(points){
 return points.map((p,i)=>(i?'L':'M')+num(p[0])+' '+num(p[1])).join(' ');
}

// C integer division truncates toward zero (ui_original_wave.h).
export function cdiv(a,b){return Math.trunc(a/b);}
function trunc(x){return Math.trunc(x);}
// Python round(): half to even. Used by the proof's panel_plot.
export function pyRound(x){const f=Math.floor(x),d=x-f;if(d>0.5)return f+1;if(d<0.5)return f;return f%2===0?f:f+1;}
export const SWEEP_MIDI=Object.freeze([0,16,32,48,64,80,96,112,127]);
export const SWEEP_HOLD_MS=Object.freeze([160,80,80,80,80,80,80,80,300]);
export function junoBlep(t,dt){
 if(t<dt){t=t/dt;return t+t-t*t-1;}
 if(t>1-dt){t=(t-1)/dt;return t*t+t+t+1;}
 return 0;
}
export function junoOscCycle(n,mix,width,dt=1/128,useBlep=true,applyGain=true){
 width=Math.min(Math.max(width,0.05),0.95);
 const ys=[];
 for(let i=0;i<n;i++){
  const t=i/n;
  let saw=2*t-1, pulse=t<width?1:-1;
  if(useBlep){
   saw-=junoBlep(t,dt); pulse+=junoBlep(t,dt);
   let q=t-width; if(q<0) q+=1; pulse-=junoBlep(q,dt);
  }
  let y=saw*(1-mix)+pulse*mix;
  if(applyGain) y*=0.7;
  ys.push(y);
 }
 return ys;
}
export function junoPulseWidthFromPot(x){return 0.1+x*0.8;}
export function junoGeomWithWrap(n,mix,width){
 return [1*(1-mix)+(-1)*mix, ...junoOscCycle(n,mix,width,1/128,false,false)];
}
export function uiOriginalSaw(p){
 const edge=Math.max(-65536,Math.min(65536,p*64));
 return p-edge;
}
export function uiOriginalWave(shape,p,width){
 if(shape===0) return cdiv(65536-2*Math.abs(p),4);
 let z=uiOriginalSaw(p);
 if(shape>=2){
  let q=p+2*width;
  if(q>65536) q-=131072;
  z-=uiOriginalSaw(q);
 }
 return cdiv(z,4);
}
export function uiOriginalWidth(shape,nw){
 nw=Math.min(Math.max(nw,0.01),0.99);
 if(shape<2) return 0;
 if(shape===2) return 32768;
 return trunc((1-nw)*65536+0.5);
}
function quant(x,count){const q=trunc(x*(count-1)+0.5);return q<count?q:count-1;}
function canonical(x,n){const q=Math.min(Math.max(trunc(x*(n-1)+0.5),0),n-1);return q/(n-1);}
// C hex float 0x1.b2235cp-2 (chicago_program_private.h). JS has no hex float literal.
const GB_MAX=0x1b2235c/2**26;
const SHAPE_A=quant(0.25,5), SHAPE_B=quant(0.75,5), NW=0.5;
export function chicagoGains(x){return [canonical(1-x,1001), canonical(x*GB_MAX,1001)];}
export function chicagoWaveZ(n,x){
 const [ga,gb]=chicagoGains(x);
 const gain=trunc(ga*32768+0.5), other=trunc(gb*32768+0.5);
 const wa=uiOriginalWidth(SHAPE_A,NW), wb=uiOriginalWidth(SHAPE_B,NW);
 const zs=[];
 for(let i=0;i<n;i++){
  const phase=n===1?65536:65536-trunc(131072*i/(n-1));
  zs.push(cdiv(cdiv(uiOriginalWave(SHAPE_A,phase,wa),2)*gain+cdiv(uiOriginalWave(SHAPE_B,phase,wb),2)*other,16384));
 }
 return zs;
}
export function readoutRows(samples){
 const w=102,h=26,n=samples.length;
 let peak=0;
 for(const v of samples) peak=Math.max(peak,Math.abs(v));
 if(!(peak>0)) peak=1;
 const xs=[], ys=[];
 for(let i=0;i<n;i++){
  xs.push(2+pyRound(i*(w-1-4)/(n-1)));
  const clamped=Math.max(-1,Math.min(1,samples[i]/peak));
  ys.push(Math.floor(h/2)-pyRound(clamped*Math.floor((h-4)/2)));
 }
 return {xs,ys};
}
function stroke(rows){return rows.xs.map((x,i)=>(i?'L':'M')+x+' '+rows.ys[i]).join(' ');}
export function proofSamples(kind,midi){
 const x=midi/127;
 if(kind==='juno_wave') return junoGeomWithWrap(56,x,junoPulseWidthFromPot(64/127));
 if(kind==='juno_width') return junoGeomWithWrap(56,1,junoPulseWidthFromPot(x));
 return chicagoWaveZ(56,x).map(z=>z/16384);
}
// Chicago WAVE samples for a MIDI value, in firmware plot units / 16384.
export function chicagoWaveSamples(midi){return chicagoWaveZ(56,Math.max(0,Math.min(127,Number(midi)||0))/127).map(z=>z/16384);}
// Readout rows for a function at a MIDI value. Exactly the golden fixture for WAVE and WIDTH.
export function readoutYs(fn,engine,midi,miamiParameter){
 const m=Math.max(0,Math.min(127,Math.round(Number(midi)||0)));
 if(engine==='miami' && (fn==='WAVE'||fn==='SHAPE'))return miamiWave(miamiParameter??(fn==='SHAPE'?11:0),m)?.rows.slice()??[];
 if(fn==='WIDTH') return readoutRows(proofSamples('juno_width',m)).ys;
 return readoutRows(proofSamples(engine==='juno'?'juno_wave':'chicago_wave',m)).ys;
}
function waveSamples(engine,value){
 const x=unit(value);
 if(engine==='juno') return junoGeomWithWrap(56,x,junoPulseWidthFromPot(64/127));
 return chicagoWaveZ(56,x).map(z=>z/16384);
}
function wavePath(engine,value){
 return stroke(readoutRows(waveSamples(engine,value)));
}
function widthPath(_engine,value){
 return stroke(readoutRows(junoGeomWithWrap(56,1,junoPulseWidthFromPot(unit(value)))));
}

// ui.c:7248-7256 and :7304-7308. x^4 into the RC constants, then the exponential segments.
export function chicagoTimes(a,d,r){
 const q=v=>{const x=v*v;return x*x;};
 return {A:13*q(a)+0.001,D:25*q(d)+0.001,R:25*q(r)+0.002};
}
export function chicagoLevel(stage,t,e){
 if(stage===0) return Math.min(1,1.3-1.3*Math.exp(-t/e.A));
 if(stage===1) return e.S+(1-e.S)*Math.exp(-t/e.D);
 return e.S*Math.exp(-t/Math.max(e.R,1e-6));
}
// ui.c:7313-7319. Stage widths follow those durations. Hold is illustrative.
export function adsrWidths(e){
 const dur=[e.A*Math.log(1.3/0.3), e.D*Math.log(100), e.S>0.04?e.R*Math.log(e.S/0.04):0];
 const sum=dur[0]+dur[1]+dur[2]||1;
 return dur.map(d=>d/sum);
}
// Chicago macro slots 7..10 feed native VCA controls 32..35 via the firmware's 1001-step mapping.
const chicagoVcaRanges=[[0,0.5585317611694336],[0.1190476194024086,0.5515872836112976],[0,1],[0.11866399645805359,0.5506910085678101]];
export function chicagoVcaStage(stage, macro){
 const [low,high]=chicagoVcaRanges[stage];
 return Math.round(1000*(low+(high-low)*macro))/1000;
}
function adsrPath(engine, value, state){
 const u=unit(value);
 const macros=[state.attack??u,state.decay??0.5,state.sustain??0.6,state.release??0.4];
 const [a,d,s,r]=engine.toLowerCase()==='chicago'?macros.map((v,i)=>chicagoVcaStage(i,v)):macros;
 const juno=engine.toLowerCase()==='juno';
 const times=juno?{A:.002+3*a*a,D:.01+3*d*d,R:.01+4*r*r}:chicagoTimes(a,d,r);
 const sampleRate=44100, releaseStep=1-1/Math.max(1,times.R*sampleRate);
 // Compact juno6.c's linear A/D and per-sample exponential release, including silence threshold.
 const releaseDuration=juno
  ? (s>.00001?Math.log(.00001/s)/Math.log(releaseStep)/sampleRate:0)
  : (s>.04?times.R*Math.log(s/.04):0);
 const durations=juno?[times.A,times.D,releaseDuration]:[times.A*Math.log(1.3/.3),times.D*Math.log(100),releaseDuration];
 // DnBOX ui.c adsr_layout: reserve 42 of 214 pixels for hold and at least three for each timed stage.
 const span=172,total=durations.reduce((sum,n)=>sum+n,0);
 const widths=durations.map(n=>3+Math.round((span-9)*n/total));
 widths[1]+=span-widths.reduce((sum,n)=>sum+n,0);
 if(widths[1]<3){widths[2]-=3-widths[1];widths[1]=3;}
 const xs=[0,widths[0],widths[0]+widths[1],widths[0]+widths[1]+42,214];
 const envelope={...times,S:s},pts=[];
 function point(x,level){pts.push([40*x/214,22-18*Math.max(0,Math.min(1,level))]);}
 function segment(start,end,level){for(let i=0;i<=24;i++)point(start+(end-start)*i/24,level(i/24));}
 segment(xs[0],xs[1],u=>juno?u:chicagoLevel(0,u*durations[0],envelope));
 segment(xs[1],xs[2],u=>juno?1-(1-s)*u:chicagoLevel(1,u*durations[1],envelope));
 point(xs[3],s);
 segment(xs[3],xs[4],u=>u===1?0:juno?s*Math.pow(releaseStep,u*durations[2]*sampleRate):chicagoLevel(2,u*durations[2],envelope));
 return path(pts);
}

// drum909.c:276-283. tau is the Tune time constant, 6..32 ms.
export function bd909Hz(tau,m,pm,tMs){
 tau=tau<6?6:tau>32?32:tau;
 m=m<0?0:m>1?1:m;
 if(!(pm>0)) pm=1;
 const base=49*(1+m*(pm-1));
 const df=4.6*tau*(1+1.2*m);
 const t=tMs-16;
 return base+(t>0?df*Math.exp(-t/tau):df);
}
function tunePath(engine, value){
 const u=unit(value);
 if(engine==='909'||engine==='808'){
  const tau=32-u*26;
  const pts=[];
  for(let i=0;i<24;i++){
   const hz=bd909Hz(tau,u,1,i*100/23);
   const y=Math.log2(hz/40)/3.32;
   pts.push([i*40/23, 22-Math.max(0,Math.min(1,y))*18]);
  }
  return path(pts);
 }
 const pts=[];
 const cycles=1+u*2;
 for(let i=0;i<24;i++) pts.push([i*40/23, 12-8*Math.sin(6.2831853*i*cycles/23)]);
 return path(pts);
}

function filterPath(value, state){
 const cut=unit(state.cutoff??value);
 const res=unit(state.res??0);
 const knee=4+cut*28;
 const peak=4+res*10;
 const pts=[[0,8],[knee,8],[knee,8-peak],[knee+6,18],[40,20]];
 return path(pts);
}
function decayPath(value){
 const u=Math.max(0.05,unit(value));
 const pts=[];
 for(let i=0;i<20;i++){
  const env=Math.exp(-i/(3+u*12));
  pts.push([i*40/19, 20-env*16]);
 }
 return path(pts);
}
function attackPath(value){
 const h=4+unit(value)*14;
 return path([[2,20],[6,20-h],[10,20],[40,20]]);
}
function lfoPath(value, state){
 const depth=state.depth==null?1:Number(state.depth);
 if(!depth) return path([[0,12],[40,12]]);
 const rate=0.5+unit(value)*3;
 const pts=[];
 for(let i=0;i<24;i++) pts.push([i*40/23, 12-depth*8*Math.sin(6.2831853*i*rate/23)]);
 return path(pts);
}
// Match the firmware R_TAPE readout. Values 0–15 select digital delay.
function tapePath(value, state){
 const raw=Math.round(unit(value)*127);
 if(raw<16) return path([[2,15],[10,15],[10,5],[20,5],[20,15],[30,15],[30,5],[38,5]]);
 const phase=(state.phase??0)*Math.PI/8;
 const parts=[];
 for(const cx of [10,30]){
  const reel=[];
  for(let i=0;i<=32;i++){
   const angle=i*Math.PI/16;
   reel.push([cx+7*Math.cos(angle),10+7*Math.sin(angle)]);
  }
  parts.push(path(reel),path([[cx,10],[cx+4*Math.sin(phase),10-4*Math.cos(phase)]]));
 }
 const wear=1+Math.floor((raw-16)*32/111);
 parts.push(path([[4,21],[36,21]]),path([[4,20],[4+wear,20]]));
 return parts.join(' ');
}
function tonePath(value){
 const u=unit(value);
 const knee=6+u*24;
 return path([[0,8],[knee,8],[Math.min(40,knee+10),20],[40,20]]);
}
function levelPath(value){
  const n=Math.round(unit(value)*6);
  const pts=[];
  for(let i=0;i<6;i++) pts.push([2+i*6, i<n?18-i*2:20]);
  return path(pts);
}
function glidePath(value){
 const u=unit(value);
 return path([[0,16],[8+u*10,16],[20,8],[40,8]]);
}
// Pan: track with a centre tick and a marker that follows the clipped value
// (value is the L50..R50 fraction from pan.mjs, 0 = L50, 1 = R50).
function panPath(value){
 const x=(2+unit(value)*36).toFixed(1);
 return 'M2 12 L38 12 M20 10 L20 14 M'+x+' 5 L'+x+' 19';
}

// Approximations (no single firmware transfer curve): drive = tanh soft clip,
// echo = taps decaying by feedback, comp = static knee curve, gate = duty, voice = level/decay/hit.
function drivePath(_e,value){const k=0.5+unit(value)*7,pts=[];for(let i=0;i<=24;i++){const x=i/24*2-1;pts.push([i*40/24,12-10*Math.tanh(k*x)/Math.tanh(k)]);}return path(pts);}
function hpfPath(_e,value,state){const cut=unit(state.cutoff??value),knee=6+cut*28;return path([[0,20],[Math.max(0,knee-8),20],[knee,8],[40,8]]);}
function echoPath(_e,value,state){const fb=unit(state.feedback??value),pts=[];let a=16;for(let t=0;t<6;t++){const x=2+t*7;pts.push([x,20],[x,20-a],[x+1,20-a],[x+1,20]);a*=0.25+fb*0.7;}pts.push([40,20]);return path(pts);}
function compPath(_e,value){const th=0.25+0.6*(1-unit(value)),r=1+unit(value)*7,pts=[];for(let i=0;i<=20;i++){const x=i/20,y=x<th?x:th+(x-th)/r;pts.push([x*40,22-y*20]);}return path(pts);}
function gatePath(_e,value){const d=0.08+unit(value)*0.84;return path([[0,20],[2,20],[2,6],[2+d*36,6],[2+d*36,20],[40,20]]);}
function voicePath(_e,value,state){const lvl=unit(state.level??value),dec=unit(state.decay??0.5),hit=Math.max(0,Math.min(1,state.hit??0)),h=4+lvl*14+hit*4,pts=[[2,20],[4,20-h]];for(let i=1;i<=16;i++){const t=i/16;pts.push([4+t*(8+dec*28),20-h*Math.exp(-t*4)]);}pts.push([40,20]);return path(pts);}
const DRAW={
 DRIVE:drivePath, HPF:hpfPath, ECHO:echoPath, COMP:compPath, GATE:gatePath, VOICE:voicePath,
 WAVE:wavePath, WIDTH:widthPath, ADSR:adsrPath, ENV:adsrPath,
 // These take (value,state); the engine argument is dropped. Before this fix they
 // received the engine name as the value, so they never moved with the control.
 FILTER:(e,v,s)=>filterPath(v,s), TUNE:tunePath, DECAY:(e,v)=>decayPath(v), ATTACK:(e,v)=>attackPath(v),
 LFO:(e,v,s)=>lfoPath(v,s), TAPE:(e,v,s)=>tapePath(v,s), TONE:(e,v)=>tonePath(v), LEVEL:(e,v)=>levelPath(v),
 GLIDE:(e,v)=>glidePath(v), PAN:(e,v)=>panPath(v)
};

export function render(fnId, value, engineId='chicago', state={}){
 // State scalars (attack/cutoff/feedback etc.) are already normalized.
 value=unit(value,state.valueDomain??'normalized');
 const fn=fnOf(fnId);
 if(engineId==='miami' && (fn==='WAVE'||fnId==='SHAPE')){
  const parameter=state.miamiParameter ?? (fnId==='SHAPE'?11:0);
  const wave=miamiWave(parameter,Math.round(value*127));
  if(wave)return {fn:'WAVE',engine:engineId,live:false,cell:null,zero:wave.zero+0.5,
   d:path(wave.rows.map((y,x)=>[x+0.5,y+0.5]))};
 }
 const draw=DRAW[fn]||DRAW.LEVEL;
 const live=!!state.live;
 const depth=state.depth;
 if(fn==='LFO' && depth===0) return {fn,d:lfoPath(value,{depth:0}),live:false};
 if(!live && state.age!=null) state={...state, age:0};
 const d=draw(engineId, value, state);
 const proof=(fn==='WIDTH'||(fn==='WAVE'&&engineId!=='miami'));
 return {fn, engine:engineId, d, live, cell:proof?'102x26':null};
}
export function renderSvg(fnId, value, engineId, state={}){
 const drawn=render(fnId,value,engineId,state);
 if(drawn.zero!==undefined)return `<svg class="glyph readout" data-fn="WAVE" viewBox="0 0 29 19" width="40" height="24" aria-hidden="true"><path d="M0.5 ${drawn.zero} H28.5" fill="none" stroke="currentColor" opacity=".1875"/><path d="${drawn.d}" fill="none" stroke="currentColor"/></svg>`;
 if(drawn.cell) return `<svg class="glyph readout readout-wave" data-fn="${drawn.fn}" viewBox="0 0 102 26" width="102" height="26" aria-hidden="true"><rect width="102" height="26" fill="#101a1f"/><path d="${drawn.d}" fill="none" stroke="#dde7de" stroke-width="1"/></svg>`;
 return `<svg class="glyph readout" data-fn="${drawn.fn}" viewBox="0 0 40 24" width="40" height="24" aria-hidden="true"><path d="${drawn.d}" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
// Proven WAVE and WIDTH re-render the nine MIDI steps. Other families still
// interpolate until their proofs arrive. Idle and zero depth stay on one frame.
export function morphFrames(fnId, from, to, engineId, state={}){
 const fn=fnOf(fnId);
 if(!state.live || state.depth===0) return [render(fnId, from, engineId, {...state, live:false})];
 if(fn==='WAVE'||fn==='WIDTH') return SWEEP_MIDI.map((midi,i)=>Object.assign(render(fn, midi, engineId, {...state,valueDomain:'raw127'}),{midi, holdMs:SWEEP_HOLD_MS[i]}));
 const samples=[0,8,16,24,40,60,90,120,160,220,300,420,580,800,1100,1500,2000,2600];
 const span=samples[samples.length-1];
 return samples.map(ms=>render(fnId, from+(to-from)*(ms/span), engineId, state));
}

// BREAK knob strip, pinned FWUI 9dd6f2df: ui_break_layout_controls.h and
// gfinal/ui_chance_exact.c. Coordinates below are in original firmware pixels.
export function breakGlyphShapes(setting, value, phrase) {
 const shapes = [];
 const rect = (x, y, w, h, ink, radius = 0) => shapes.push({x,y,w,h,ink,radius});
 const strength = Math.floor((value * 16 + 50) / 100) / 16;
 if (setting === 2 || (setting >= 4 && setting <= 7) || setting === 9) {
  const count = Math.floor((value * 3 + 25) / 50) - Number(value === 75);
  // The native 26×19 die is centered in the shared 48×19 strip.
  rect(18,3,11,1,1); rect(18,15,11,1,1); rect(17,4,1,11,1); rect(29,4,1,11,1);
  for (const x of [17,29]) for (const y of [3,15]) rect(x,y,1,1,15/16);
  for (const [x,y,on] of [[11,8,count%2],[8,5,count>=2],[14,11,count>=2],
                          [14,5,count>=4],[8,11,count>=4],[8,8,count===6],[14,8,count===6]]) {
   rect(x+11,y,2,2,on ? 1 : 0);
  }
  return shapes;
 }
 if (setting === 8 || setting === 10 || setting === 11) {
  const count = setting === 8 ? 5 : 6;
  const left = 24 - Math.floor((count * 8 - 2) / 2);
  for (let i=0; i<count; i++) rect(left+i*8,5,6,9,i===value ? 1 : 0,2);
  return shapes;
 }
 for (let i=0; i<8; i++) {
  const x = 6 + i * 5;
  if (setting === 0) {
   rect(x,15,3,3,1);
   rect(x,3+(i%2)*4,3,3,strength);
  } else if (setting === 1) {
   rect(x,10,3,3,0);
   if (i%4 === 0) rect(x,4,3,12,strength);
  } else if (setting === 3) {
   const step = 6 + i*4 + (i>=4 ? 4 : 0);
   rect(step,15,3,3,phrase ? 1 : 0);
   if (i>=4) rect(step,4,3,4,phrase ? strength : 0);
  }
 }
 if (setting === 3) rect(23,4,1,14,0);
 return shapes;
}
