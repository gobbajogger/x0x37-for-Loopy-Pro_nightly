import test from 'node:test';
import assert from 'node:assert/strict';
import {SequenceDraft} from '../../web/product-site/remote/sequence.mjs';
import {stepGroups,StepLaneGesture,renderStepSliders} from '../../web/product-site/remote/step-lane.mjs';
const setup=()=>{const m=new SequenceDraft({trace:{sampleRate:44100,endSample:16000,events:[]}});for(const [note,start] of [[60,1000],[64,1001],[67,1400],[72,2000]])m.add({track:'chicago',note,start,end:start+400});return m;};
test('sixteen step groups preserve chords and near-grid timestamps without collapsing notes',()=>{
 const m=setup(),notes=m.notes,groups=stepGroups(notes,16000);assert.equal(groups.length,16);assert.equal(groups[1].notes.length,3);assert.equal(groups[2].notes.length,1);assert.deepEqual(groups.flatMap(g=>g.notes),notes);assert.deepEqual(m.notes,notes);
});
test('same-step velocity previews every note, commits once and undo restores exact chord',()=>{
 const m=setup(),before=m.notes,count=m.history.length,g=new StepLaneGesture(m);assert.ok(g.begin(1,stepGroups(before,16000)[1],'velocity'));g.preview(1,1);g.preview(1,.5);assert.deepEqual(m.notes.slice(0,3).map(n=>n.velocity),[64,64,64]);assert.equal(m.notes[3].velocity,100);g.end(1);assert.equal(m.history.length,count+1);m.undo();assert.deepEqual(m.notes,before);m.redo();assert.equal(m.notes[1].velocity,64);
});
test('group pitch clamps as a whole, preserving intervals and event timing',()=>{
 const m=setup();m.editNote(m.notes[2].id,{note:126});const before=m.notes,g=new StepLaneGesture(m);g.begin(1,stepGroups(before,16000)[1],'pitch');g.preview(1,1);g.end(1);assert.deepEqual(m.notes.slice(0,3).map(n=>n.note),[61,65,127]);assert.deepEqual(m.notes.map(n=>[n.start,n.end,n.id]),before.map(n=>[n.start,n.end,n.id]));
});
test('second touch and cancellation roll back every member without history',()=>{
 const m=setup(),before=m.notes,count=m.history.length,g=new StepLaneGesture(m),step=stepGroups(before,16000)[1];g.begin(1,step,'pan');g.preview(1,1);assert.notDeepEqual(m.notes,before);assert.equal(g.begin(2,step,'chance'),false);g.end(1);g.end(2);assert.deepEqual(m.notes,before);assert.equal(m.history.length,count);
});
test('drum pitch edits local pitch offset, never MIDI voice identity',()=>{
 const m=new SequenceDraft({trace:{sampleRate:44100,endSample:16000,events:[]}});m.toggleHit('drum909',36,1000);const before=m.notes,g=new StepLaneGesture(m);g.begin(1,stepGroups(before,16000)[1],'pitch');g.preview(1,.75);g.end(1);assert.equal(m.notes[0].note,36);assert.equal(m.notes[0].pitchOffset,12);assert.equal(m.notes[0].pulse,true);m.undo();assert.deepEqual(m.notes,before);
});
test('empty steps are not synthesized and invalid group patches are atomic',()=>{
 const m=setup(),before=m.notes,g=new StepLaneGesture(m);assert.equal(g.begin(1,stepGroups(before,16000)[0],'velocity'),false);assert.deepEqual(m.notes,before);const ids=before.slice(0,2).map(n=>n.id);assert.ok(m.beginStepGesture(9,ids));assert.throws(()=>m.previewStepGesture(9,[{id:ids[0],patch:{velocity:30}},{id:ids[1],patch:{velocity:999}}]));assert.deepEqual(m.notes,before);m.cancelAll();
});

test('render has sixteen distinct hit cells and explicitly identifies mixed chord values',()=>{
 const m=setup();m.editNote(m.notes[1].id,{velocity:80});const html=renderStepSliders(stepGroups(m.notes,16000),{kind:'velocity'});assert.equal((html.match(/data-lane-step=/g)||[]).length,16);assert.equal((html.match(/ disabled/g)||[]).length,14);assert.match(html,/Step 2, 3 notes, velocity Mixed/);assert.match(html,/data-lane-step="1"/);
});
test('keyboard step adjustment preserves mixed velocities and is one undo',()=>{
 const m=setup();m.editNote(m.notes[1].id,{velocity:80});const before=m.notes,g=new StepLaneGesture(m);g.nudge(stepGroups(before,16000)[1],'velocity',1);assert.deepEqual(m.notes.slice(0,3).map(n=>n.velocity),[101,81,101]);m.undo();assert.deepEqual(m.notes,before);
});

test('unsupported chance is disabled without leaving a gesture owner',()=>{
 const m=new SequenceDraft({trace:{sampleRate:44100,endSample:16000,events:[]}});m.add({track:'breaks',note:60,start:1000,end:1400});const step=stepGroups(m.notes,16000)[1],g=new StepLaneGesture(m);assert.equal(g.begin(1,step,'chance'),false);assert.equal(m.gesture,null);assert.equal(g.owners.size,0);assert.match(renderStepSliders([step],{kind:'chance'}),/ disabled/);
});
test('drum pitch cannot leak through clipboard into a bass track',()=>{
 const m=new SequenceDraft({trace:{sampleRate:44100,endSample:16000,events:[]}});const id=m.toggleHit('drum909',36,1000);m.editNote(id,{pitchOffset:7});m.selectIds([id]);m.copy();const before=m.notes;assert.throws(()=>m.paste({track:'chicago',start:3000,note:60}));assert.deepEqual(m.notes,before);
});
test('rejected cross-surface owner is removed and cannot wedge later edits',()=>{
 const m=setup(),before=m.notes,g=new StepLaneGesture(m),group=stepGroups(before,16000)[1];m.beginGesture(1,group.notes[0].id);m.previewGesture(1,{velocity:20});assert.equal(g.begin(2,group,'velocity'),false);m.commitGesture(1);assert.equal(m.pointers.size,0);assert.deepEqual(m.notes,before);assert.ok(g.begin(3,group,'velocity'));g.preview(3,1);g.end(3);assert.equal(m.notes[0].velocity,127);
});
test('paint-across interpolates skipped active steps as one atomic undo stroke',()=>{
 const m=new SequenceDraft({trace:{sampleRate:44100,endSample:16000,events:[]}});for(const [note,start]of[[60,0],[64,1000],[67,1001],[70,3000]])m.add({track:'chicago',note,start,end:start+400});const before=m.notes,count=m.history.length,groups=stepGroups(before,16000),g=new StepLaneGesture(m);
 g.begin(1,groups[0],'velocity',{groups});g.preview(1,0,0);g.preview(1,1,3);g.end(1);assert.deepEqual(m.notes.map(n=>n.velocity),[1,43,43,127]);assert.equal(m.history.length,count+1);assert.equal(m.notes.length,4);m.undo();assert.deepEqual(m.notes,before);m.redo();assert.deepEqual(m.notes.map(n=>n.velocity),[1,43,43,127]);
});
test('paint-across cancellation restores all touched steps and empty cells stay empty',()=>{
 const m=setup(),before=m.notes,groups=stepGroups(before,16000),g=new StepLaneGesture(m);g.begin(1,groups[1],'pan',{groups});g.preview(1,1,1);g.preview(1,0,3);g.begin(2,groups[2],'pan',{groups});g.end(1);g.end(2);assert.deepEqual(m.notes,before);
});
test('shared drum pitch display uses the stored offset, never the MIDI voice',async()=>{
 const {laneText,laneFraction}=await import('../../web/product-site/remote/lane.mjs');const n={track:'drum909',note:36,pitchOffset:12,velocity:88};assert.equal(laneText('pitch',n,36),'+12st');assert.equal(laneFraction('pitch',n,36),.75);assert.equal(laneText('pitch',{...n,pitchOffset:-7},36),'-7st');
});

import {BreakChanceLane,breakChanceText} from '../../web/product-site/remote/break-chance.mjs';
import {chanceDomain,encodeChance} from '../../web/product-site/remote/sequence.mjs';

test('BREAK Chance exposes the stock editor domain once per step, including silent steps',()=>{
 const codes=chanceDomain.map(encodeChance);
 assert.deepEqual(codes,[...Array.from({length:20},(_,i)=>100-i*5),...Array.from({length:35},(_,i)=>101+i)]);
 for(const label of chanceDomain)assert.equal(breakChanceText(encodeChance(label)),label);
 assert.equal(breakChanceText(null),'100%');
 const groups=stepGroups([{id:'a',start:0,track:'breaks'},{id:'b',start:0,track:'breaks'}],16000);
 const values=Array(16).fill(null);values[0]=101;values[15]=135;
 const html=renderStepSliders(groups,{kind:'chance',breakChance:values});
 assert.match(html,/Step 1, 2 notes, chance 1:2/);assert.match(html,/Step 16, 0 notes, chance 8:8/);
 assert.equal((html.match(/role="slider"/g)||[]).length,16);assert.doesNotMatch(html,/ disabled/);
});
test('BREAK stroke interpolates independent steps once and cancels without changing committed locks',()=>{
 let saved=null,writes=0;
 const lane=new BreakChanceLane({read:()=>saved,commit:values=>{saved=values;writes++;},paint:()=>{}});
 lane.begin(1,{step:0});lane.preview(1,1,0);lane.preview(1,0,15);
 assert.equal(writes,0);assert.equal(lane.values[15],135);lane.end(1);
 assert.equal(writes,1);assert.equal(saved[0],null);assert.equal(saved[15],135);
 const before=[...saved];lane.begin(2,{step:0});lane.preview(2,0,0);
 assert.equal(lane.begin(3,{step:1}),false);lane.end(2);lane.end(3);
 assert.deepEqual(saved,before);assert.equal(writes,1);
 lane.nudge({step:0},'chance',-1);assert.equal(saved[0],95);
 lane.nudge({step:0},'chance',1);assert.equal(saved[0],null);
});
