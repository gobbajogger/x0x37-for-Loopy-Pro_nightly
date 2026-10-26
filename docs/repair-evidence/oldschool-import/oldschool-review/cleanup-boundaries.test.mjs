// SPDX-License-Identifier: GPL-3.0-only
// Actual sample page event/preview handlers in a small DOM; no browser, MIDI or device execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as api from 'file:///Users/mac/Documents/Codex/2026-10-26/task-6/sample-oldschool-site/web/x0x_breaks.js';
const html=readFileSync(new URL('file:///Users/mac/Documents/Codex/2026-10-26/task-6/sample-oldschool-site/web/x0x_breaks.html'),'utf8');
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
  createBufferSource(){const node={playbackRate:{value:1},stops:0,disconnects:0,connect(){},disconnect(){this.disconnects++;},stop(){this.stops++;},start(){played.push({buffer:this.buffer,rate:this.playbackRate.value,node:this});}};return node;}
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


test('independent cleanup: replacing, natural end and workspace invalidation release owned nodes only',async()=>{
 const e=environment(),loop=e.prepare(tone(),{bars:false,gritFactor:2});e.seed([loop]);
 await e.playLoopPreview(loop,true);const a=e.played[0].node;
 await e.playLoopPreview(loop,false);const b=e.played[1].node;
 assert.equal(a.stops,1);assert.equal(a.disconnects,1);
 a.onended();assert.equal(a.disconnects,2);
 e.stopLoopPreview();assert.equal(b.stops,1,'late old onended cannot discard successor ownership');assert.equal(b.disconnects,1);
 await e.playLoopPreview(loop,false);const c=e.played[2].node;c.onended();e.stopLoopPreview();
 assert.equal(c.stops,0,'already-ended source is not stopped again');assert.equal(c.disconnects,1);
 await e.playLoopPreview(loop,true);const d=e.played[3].node;e.window.sampleWorkspace.invalidate();
 assert.equal(d.stops,1);assert.equal(d.disconnects,1);assert.equal(e.state().readOk,false);assert.equal(e.writes.length,0);
});
test('independent settings/cancel: audio is stopped before transactional recut review and source remains untouched',async()=>{
 const e=environment(),x=tone(),settings={bars:false,trim:false,storageRate:44100,gritFactor:1};e.setSettings(settings);
 const loop=e.prepare(x,settings),before=hash(loop.x);e.seed([loop]);await e.playLoopPreview(loop,false);const n=e.played[0].node;
 e.ids.grit.value='max';const p=e.recutNewLoops();await tick();assert.equal(n.stops,1);assert.equal(n.disconnects,1);
 e.ids.previewCancel.onclick();await p;assert.equal(e.state().loops[0],loop);assert.equal(hash(loop.x),before);assert.equal(e.ids.grit.value,'');assert.equal(e.writes.length,0);
});
