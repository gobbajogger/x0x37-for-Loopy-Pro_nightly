import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

const target=new URL('../../web/product-site/remote/vendor/funkybeats-core.mjs',import.meta.url);
test('actual FunkyBeats state and duration/velocity port is installed, not only a notice',async()=>{
 assert.ok(existsSync(target),'missing actual upstream-derived core');
 const {createSequencerState,noteDuration,velocityAt,UPSTREAM}=await import(target);
 assert.equal(UPSTREAM.commit,'809e1e78407f7bf315eee8655387eca8b7ac465b');
 const state=createSequencerState({channels:[{type:'drum'},{type:'synth'}],patternCount:32});
 assert.equal(state.patterns.length,32);assert.equal(state.getSteps(),16);
 state.pushUndo();state.getStep(1,3).on=true;state.getStep(1,3).duration=4;
 state.setPatternLength(32);assert.equal(state.getStep(1,3).duration,4);assert.equal(state.getStep(1,31).on,false);
 assert.equal(state.undo(),true);assert.equal(state.getSteps(),16);assert.equal(state.getStep(1,3).on,false);
 assert.equal(state.redo(),true);assert.equal(state.getStep(1,3).duration,4);
 state.copyPattern();state.currentPattern=31;state.pastePattern();assert.equal(state.getStep(1,3).duration,4);
 state.getStep(1,3).duration=2;state.currentPattern=0;assert.equal(state.getStep(1,3).duration,4);
 const saved=state.serialize();saved.patterns[0].channels[1][3].on=false;assert.equal(state.getStep(1,3).on,true);
 for(let steps=1;steps<=64;steps++)for(let start=0;start<steps;start++)for(const current of[-1,start,start+3,steps+1])assert.equal(noteDuration(current,start,steps),Math.max(1,Math.min(current-start+1,steps-start)));
 for(let y=-10;y<=110;y++)assert.equal(velocityAt(y,0,100),Math.round(Math.max(.05,Math.min(1,1-y/100))*100)/100);
});
test('current Remote explicitly consumes source port and drum cells toggle without a mode',()=>{
 const app=readFileSync(new URL('../../web/product-site/remote/app.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('../../web/product-site/remote/index.html',import.meta.url),'utf8');
 assert.match(app,/renderFunkyBeatsDrums/);const adapter=readFileSync(new URL('../../web/product-site/remote/funkybeats-view.mjs',import.meta.url),'utf8');assert.match(adapter,/buildSequencerGrid/);assert.match(adapter,/funkybeats-core\.mjs/);
 assert.doesNotMatch(app,/drumEdit&&b\.dataset\.drumNote/);
});

test('ported upstream sequencer renders all typed drum cells with safe, stable identities',async()=>{
 const {renderFunkyBeatsDrums,DRUM_VOICES}=await import('../../web/product-site/remote/funkybeats-view.mjs');
 for(const kit of ['909','808']){
  const track=kit==='909'?'drum909':'drum808';
  const notes=[{id:'first',track,note:36,start:0,velocity:88},{id:'fifth',track,note:36,start:22050,velocity:104},{id:'foreign',track:'other',note:36,start:0,velocity:20}];
  const html=renderFunkyBeatsDrums({kit,notes,endSample:88200});
  assert.equal((html.match(/data-drum-note=/g)||[]).length,176);
  assert.equal((html.match(/class="seq-step-group"/g)||[]).length,52);
  assert.match(html,/BD step 1 velocity 88/);assert.match(html,/BD step 5 velocity 104/);assert.doesNotMatch(html,/data-hit="foreign"/);
  assert.equal(DRUM_VOICES[kit].length,11);assert.doesNotMatch(html,/seq-mute|seq-solo|seq-eucl|AudioContext|Not loaded/);
  const escaped=renderFunkyBeatsDrums({kit,notes:[{...notes[0],id:'"<script>'}],endSample:88200});assert.doesNotMatch(escaped,/<script>/);assert.match(escaped,/&quot;&lt;script&gt;/);
 }
});
test('actual upstream launcher renders all five local rows without fake playback',async()=>{
 const {renderFunkyBeatsLauncher}=await import('../../web/product-site/remote/funkybeats-view.mjs');
 const html=renderFunkyBeatsLauncher({parts:['909','808','Bass A','Bass B','BREAK'],targets:[0,null,31,null,5]});
 assert.equal((html.match(/data-launch-part=/g)||[]).length,160);
 assert.equal((html.match(/aria-pressed="true"/g)||[]).length,3);
 assert.match(html,/Bass A P32, not loaded/);assert.doesNotMatch(html,/PERFORM MODE|next bar|queued|AudioContext/);
 assert.throws(()=>renderFunkyBeatsLauncher({parts:['909'],targets:[0]}));
});

test('FunkyBeats retains the MIT permission notice',()=>{
 const notice=readFileSync(new URL('../../LICENSES/FunkyBeats-MIT.md',import.meta.url),'utf8');
 assert.match(notice,/Permission is hereby granted/);
 assert.match(notice,/THE SOFTWARE IS PROVIDED/);
});
test('actual synth slider builder retains explicit native domains and escaped values',async()=>{
 const {renderTypedFunkyBeatsParameter}=await import('../../web/product-site/remote/funkybeats-view.mjs');
 const html=renderTypedFunkyBeatsParameter({id:'native/"<control>',label:'Attack',value:25,min:3,max:9000,step:.25,display:'25 ms'});
 assert.match(html,/min="3" max="9000" value="25" step="0.25"/);
 assert.match(html,/aria-label="Attack"/);assert.match(html,/aria-valuetext="25 ms"/);assert.doesNotMatch(html,/<control>/);assert.match(html,/data-param="native\/&quot;&lt;control&gt;"/);
 assert.match(html,/data-native-param="native\/&quot;&lt;control&gt;"/);
 assert.match(renderTypedFunkyBeatsParameter({id:'x',label:'Wave',value:0,min:0,max:0,display:'SAW',enabled:false}),/disabled="disabled"/);
 assert.throws(()=>renderTypedFunkyBeatsParameter({id:'x',label:'Wrong',value:128,min:0,max:127,display:'wrong'}));
});
test('upstream mixer projection retains typed faders, not fabricated meters or controls',async()=>{
 const {renderTypedFunkyBeatsMixer}=await import('../../web/product-site/remote/funkybeats-view.mjs');
 const channels=['909','808','BREAK','CHICAGO','MIAMI'].map((label,i)=>({id:'parts|1:5:'+i+':0',label,value:75+i,min:0,max:127,step:1,display:'-5dB',occurrence:i}));
 const html=renderTypedFunkyBeatsMixer({channels});
 assert.match(html,/aria-label="909"/);assert.match(html,/aria-valuetext="-5dB"/);assert.equal((html.match(/class="mixer-fader"/g)||[]).length,5);assert.equal((html.match(/max="127"/g)||[]).length,5);
 for(let i=0;i<5;i++){assert.ok(html.includes('data-param="'+channels[i].id+'"'));assert.ok(html.includes('value="'+channels[i].value+'"'));}
 assert.doesNotMatch(html,/mixer-vu|mixer-eq|mixer-send|mixer-mute|mixer-solo|bus-channel|master-fader|0\.0dB/);
 assert.throws(()=>renderTypedFunkyBeatsMixer({channels:channels.slice(1)}));
});
test('mixer values reproduce exact production formatter table without inferred units',async()=>{
 const {mixerDisplay,mixerFormatTable}=await import('../../web/product-site/remote/mixer-format.mjs');
 assert.equal(mixerFormatTable.productionSourceCommit,'65a24027883dfd166221f44de364f446cf79efbe');
 assert.equal(mixerFormatTable.runtimeAdmission,'NOT_ADMITTED');
 for(const voice of mixerFormatTable.voices)for(const control of mixerFormatTable.controls)for(const row of control.values)assert.equal(mixerDisplay(`parts|1:5:${voice}:${control.slot}`,row.raw),row.number+row.unit);
 assert.equal(mixerDisplay('p|1:5:0:0',0),'OFF');assert.equal(mixerDisplay('p|1:5:0:0',100),'0dB');
 assert.equal(mixerDisplay('p|1:5:0:3',0),'L50');assert.equal(mixerDisplay('p|1:5:0:3',64),'C');assert.equal(mixerDisplay('p|1:5:0:3',127),'R50');
 assert.equal(mixerDisplay('p|1:2:0:0',10),null);assert.equal(mixerDisplay('p|1:5:0:0',.5),null);
});
