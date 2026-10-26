// SPDX-License-Identifier: GPL-3.0-only
// Actual sample page event/preview handlers in a small DOM; no browser, MIDI or device execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as api from './x0x_breaks.js';
const html=readFileSync(new URL('./x0x_breaks.html',import.meta.url),'utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const tone=()=>Float32Array.from({length:88200},(_,i)=>.4*Math.sin(i*2*Math.PI*330/44100));
const hash=x=>createHash('sha256').update(Buffer.from(Float64Array.from(x).buffer)).digest('hex');
function environment(){
 const ids={},writes=[],played=[],audioGate={suspended:false,waiters:[]};
 function element(tag='div'){
  const selectors={};
  return {tag,children:[],style:{},checked:false,value:'',textContent:'',disabled:false,hidden:false,open:false,classList:{add(){},remove(){}},
   appendChild(x){this.children.push(x);return x;},getContext(){return{clearRect(){},fillRect(){}};},
   querySelector(selector){return selectors[selector]||=element(selector==='canvas'?'canvas':'button');},
   showModal(){this.open=true;},close(){this.open=false;if(this.onclose)this.onclose();},click(){return this.onclick?.();},
   set innerHTML(v){this.children=[];},get innerHTML(){return'';}};
 }
 for(const m of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
  const e=ids[m[3]]=element(m[1]);e.checked=/\bchecked\b/.test(m[2]);e.disabled=/\bdisabled\b/.test(m[2]);e.value=m[2].match(/\bvalue="([^"]*)"/)?.[1]||'';
 }
 const document={getElementById:id=>{assert.ok(ids[id],id);return ids[id];},createElement:element,body:element('body'),documentElement:element('html')};
 class AudioContext{
  state=audioGate.suspended?'suspended':'running';destination={};
  resume(){return new Promise(resolve=>audioGate.waiters.push(()=>{this.state='running';resolve();}));}
  createBuffer(ch,length,rate){return{length,rate,copyToChannel(data){this.data=data.slice();}};}
  createBufferSource(){const node={playbackRate:{value:1},connect(){},disconnect(){},stop(){},start(){played.push({buffer:this.buffer,rate:this.playbackRate.value});}};return node;}
 }
 const window={},execute=new Function('document','window','parent','location','getComputedStyle','AudioContext','writes',...Object.keys(api),script+`
 writeImage=async(k,img)=>writes.push({k,img});readAll=async()=>{};
 return { seed(items=[]){loops=items;readOk=true;lay={count:1,size:81920,slots:[{size:81920,nz:0}]};dev=[null];acceptedSettings=importSettings();render();},
  state:()=>({loops,busy,readOk}),addFiles,recutNewLoops,playLoopPreview,stopLoopPreview,
  decodeWith(x,sr=44100){decode=async()=>({x,rate:sr});},settings(){return importSettings();},setSettings(s){restoreSettings(s);acceptedSettings=importSettings();},
  prepare:(x,settings)=>prepareImportedLoop(Array.from(x),44100,'literal <file>.wav',settings),writes};`);
 const e=execute(document,window,window,{search:''},()=>({getPropertyValue:()=>''}),AudioContext,writes,...Object.values(api));
 // writeImage replacement closes over this explicitly supplied test-only sink.
 // The page functions retain real packing/image/preview/recut implementations.
 e.writes=writes;return{...e,ids,window,played,audioGate};
}
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};

test('space-saving selector is visible, defaults Off, and explains actual rate rather than stretch promise',()=>{
 assert.match(html,/Oldschool space saver/);assert.match(html,/<option value="">Off<\/option>/);
 assert.match(html,/original files stay untouched/i);assert.match(html,/matching lower playback rate/);
 assert.match(html,/Mono reference uses the same trim and bar cut/);
 assert.match(html,/not perceived-loudness matching/);
 const e=environment();assert.equal(e.settings().gritFactor,1);
});

test('cancel add or replace preview preserves loop list, original input and zero writes',async()=>{
 const e=environment(),x=tone(),before=hash(x);e.setSettings({bars:false,trim:false,storageRate:44100,gritFactor:2});
 const existing=e.prepare(x,{bars:false,gritFactor:1});e.seed([existing]);e.decodeWith(x);
 const pending=e.addFiles([{name:'literal <file>.wav'}],0);await tick();
 assert.equal(e.ids.previewDlg.open,true);assert.equal(e.state().busy,true);assert.equal(e.ids.grit.disabled,true);
 e.ids.previewCancel.onclick();await pending;
 assert.equal(e.state().loops[0],existing);assert.equal(e.writes.length,0);assert.equal(hash(x),before);
 assert.equal(e.state().busy,false);
});

test('accepted add shows exact data saving and retains original for Off and preview',async()=>{
 const e=environment(),x=tone(),before=hash(x);e.setSettings({bars:false,trim:false,storageRate:44100,gritFactor:2});e.seed();e.decodeWith(x);
 const pending=e.addFiles([{name:'literal <file>.wav'}]);await tick();e.ids.previewGo.onclick();await pending;
 const loop=e.state().loops[0];assert.equal(loop.n,44100);assert.equal(loop.rate,22050);
 assert.match(e.ids.savings.textContent,/22,050 B sample data vs 44,100 B/);
 assert.match(e.ids.savings.textContent,/22,562 B including 1 × 512 B/);
 assert.equal(e.ids.previewList.children[0].children[0].textContent,'literal <file>.wav');
 await e.playLoopPreview(loop,true);await e.playLoopPreview(loop,false);
 assert.equal(e.played[0].buffer.length/e.played[0].buffer.rate/e.played[0].rate,2);
 assert.equal(e.played[1].buffer.length/e.played[1].buffer.rate/e.played[1].rate,2);
 assert.deepEqual(e.played[1].buffer.data,Float32Array.from(api.imaDecode(loop.adpcm,loop.n),v=>v/32768));
 e.ids.grit.value='';await e.recutNewLoops();assert.equal(e.state().loops[0].n,88200);assert.equal(e.state().loops[0].savedBytes,0);
 assert.equal(hash(e.state().loops[0].x),before);assert.equal(hash(x),before);
});

test('failed recut is atomic and restores controls instead of leaving partial transformed loops',async()=>{
 const e=environment(),settings={bars:false,trim:false,storageRate:44100,gritFactor:1};e.setSettings(settings);
 const a=e.prepare(tone(),settings),b=e.prepare(tone().slice(0,128),settings);e.seed([a,b]);e.ids.grit.value='max';
 await e.recutNewLoops();assert.equal(e.state().loops[0],a);assert.equal(e.state().loops[1],b);
 assert.equal(e.ids.grit.value,'');assert.match(e.ids.status.textContent,/short/);assert.equal(e.writes.length,0);
});

test('cancel send/escape performs no slot writes; confirmation sends actual prepared saved-rate image',async()=>{
 const e=environment(),loop=e.prepare(tone(),{bars:false,gritFactor:3});e.seed([loop]);
 let pending=e.ids.send.onclick();await tick();assert.equal(e.ids.previewDlg.open,true);
 e.ids.previewDlg.oncancel({preventDefault(){}});await pending;assert.equal(e.writes.length,0);
 pending=e.ids.send.onclick();await tick();e.ids.previewGo.onclick();await pending;
 assert.equal(e.writes.length,1);const h=api.parseHeader(e.writes[0].img);
 assert.equal(h.zones[0].rate,14700);assert.equal(h.zones[0].n,29400);assert.equal(h.dataLen,14700);
});

test('rapid preview source changes and Stop cannot start stale audio after a suspended context resumes',async()=>{
 const e=environment(),loop=e.prepare(tone(),{bars:false,gritFactor:2});e.seed([loop]);e.audioGate.suspended=true;
 const first=e.playLoopPreview(loop,true),second=e.playLoopPreview(loop,false);
 assert.equal(e.audioGate.waiters.length,2);e.audioGate.waiters.shift()();await first;assert.equal(e.played.length,0);
 e.ids.previewStop.onclick();e.audioGate.waiters.shift()();await second;assert.equal(e.played.length,0);
 await e.playLoopPreview(loop,false);assert.equal(e.played.length,1);
});

test('workspace source switch stops a pending original preview before audio starts',async()=>{
 const e=environment(),loop=e.prepare(tone(),{bars:false,gritFactor:3});e.seed([loop]);e.audioGate.suspended=true;
 const pending=e.playLoopPreview(loop,true);e.window.sampleWorkspace.activate(false);
 e.audioGate.waiters.shift()();await pending;assert.equal(e.played.length,0);assert.equal(e.writes.length,0);
});

test('repeated setting event while confirmation is open cannot apply mismatched control labels',async()=>{
 const e=environment(),loop=e.prepare(tone(),{bars:false,gritFactor:1});e.setSettings({bars:false,trim:false,storageRate:44100,gritFactor:1});e.seed([loop]);
 e.ids.grit.value='medium';const change=e.recutNewLoops();await tick();assert.equal(e.ids.previewDlg.open,true);
 e.ids.grit.value='max';await e.recutNewLoops();e.ids.previewGo.onclick();await change;
 assert.equal(e.state().loops[0].gritFactor,2);assert.equal(e.ids.grit.value,'medium');assert.equal(e.writes.length,0);
});


test('A/B reference uses the same trim and bar cut, mono peak target, and leaves encoded preview exact',async()=>{
 const e=environment(),x=new Float32Array(44100*6);
 for(let i=44100;i<44100*5;i++)x[i]=.02*Math.sin(i*2*Math.PI*330/44100);
 const before=hash(x),settings={bars:true,trim:true,storageRate:22050,gritFactor:2};
 const loop=e.prepare(x,settings);e.seed([loop]);
 const full=e.prepare(x,{...settings,bars:false,trim:false});
 assert.ok(loop.reference.length<full.reference.length);
 assert.equal(loop.referenceRate,44100);
 const target=30000/32768;
 assert.ok(Math.abs(loop.reference.reduce((m,v)=>Math.max(m,Math.abs(v)),0)-target)<1e-7);
 await e.playLoopPreview(loop,true);await e.playLoopPreview(loop,false);
 const duration=p=>p.buffer.length/p.buffer.rate/p.rate;
 assert.ok(Math.abs(duration(e.played[0])-duration(e.played[1]))<.001);
 assert.deepEqual(e.played[0].buffer.data,loop.reference);
 assert.deepEqual(e.played[1].buffer.data,Float32Array.from(api.imaDecode(loop.adpcm,loop.n),v=>v/32768));
 assert.equal(hash(x),before);assert.equal(hash(loop.x),before);
});
