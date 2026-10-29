// SPDX-License-Identifier: GPL-3.0-only
// Recovered implementation-review-r1.md, same retained review ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DraftStore,copy,getPart} from './model.js';
import {putNote,notesOf,applyPlan} from './editing.js';
import {parseSMF,makeImportPlan} from './smf.js';
const track=[0,144,60,96,131,96,128,60,0,0,255,47,0];
const bytes=new Uint8Array([77,84,104,100,0,0,0,6,0,0,0,1,1,224,77,84,114,107,0,0,0,track.length,...track]);
const settings={pattern:0,part:0,track:0,channel:0,rate:0,startBeat:1,beats:1};
test('RD-CODE-01 exact destination TIE crossing rejects without mutation or outside-cell clearing',()=>{
 const store=new DraftStore();store.edit(d=>putNote(d,0,0,{start:0,pitch:72,slots:8,velocity:90}));
 const before=copy(store.doc),revision=store.revision,history=store.history.length;
 const plan=makeImportPlan(parseSMF(bytes),store.doc,revision,settings);
 assert.deepEqual(store.doc,before,'preview does not mutate the draft');
 assert.equal(store.revision,revision);assert.equal(store.history.length,history);
 assert.deepEqual(plan.candidate,before);assert.deepEqual(plan.changes,[]);
 assert.ok(plan.errors.some(x=>/destination.*tie|tie.*destination/i.test(x)),'destination crossing must block Use');
 assert.throws(()=>applyPlan(store,plan),/destination|tie/i);assert.deepEqual(store.doc,before);
 assert.equal(store.revision,revision);assert.equal(store.history.length,history);
 assert.deepEqual(getPart(store.doc,0,0).steps.slice(4,8),getPart(before,0,0).steps.slice(4,8));
 assert.deepEqual(store.doc.patterns[0].bass[1],before.patterns[0].bass[1]);
 assert.equal(notesOf(getPart(store.doc,0,0))[0].slots,8,'rejected import preserves old note');
 assert.ok(store.undo());assert.equal(notesOf(getPart(store.doc,0,0)).length,0,'rejection adds no Undo frame');
});
test('RD-CODE-01 safe boundary preserves independent outside note, isolated apply and Undo',()=>{
 const store=new DraftStore();store.edit(d=>{putNote(d,0,0,{start:0,pitch:72,slots:4,velocity:90});putNote(d,0,0,{start:4,pitch:75,slots:4,velocity:85});putNote(d,0,1,{start:12,pitch:67,slots:1,velocity:100});});
 const before=copy(store.doc),plan=makeImportPlan(parseSMF(bytes),store.doc,store.revision,settings);
 assert.equal(plan.errors.length,0);assert.deepEqual(store.doc,before);
 applyPlan(store,plan);const notes=notesOf(getPart(store.doc,0,0));assert.equal(notes[0].slots,4);assert.equal(notes[0].end,3.9375);assert.equal(notes[0].pitch,60);
 assert.deepEqual(getPart(store.doc,0,0).steps.slice(4),getPart(before,0,0).steps.slice(4));
 assert.deepEqual(store.doc.patterns[0].bass[1],before.patterns[0].bass[1]);
 assert.ok(store.undo());assert.deepEqual(store.doc,before);
});
test('RD-CODE-01 full64 replacement needs no outside-TIE rejection; complex-tie edit guard remains',()=>{
 const store=new DraftStore();store.edit(d=>putNote(d,0,0,{start:0,pitch:72,slots:64,velocity:90}));
 const before=copy(store.doc),plan=makeImportPlan(parseSMF(bytes),store.doc,store.revision,{...settings,beats:16});
 assert.equal(plan.errors.length,0);applyPlan(store,plan);assert.equal(notesOf(getPart(store.doc,0,0))[0].end,3.9375);store.undo();assert.deepEqual(store.doc,before);
 store.edit(d=>d.patterns[0].bass[0].steps[1].flags|=4);const complex=copy(store.doc);
 assert.throws(()=>store.edit(d=>putNote(d,0,0,{start:0,pitch:73,slots:64,velocity:90},0)),/Complex tie/);assert.deepEqual(store.doc,complex);
});

test('RD-CODE-01 choosing a window covering the whole destination dependency remains safe',()=>{
 const store=new DraftStore();store.edit(d=>putNote(d,0,0,{start:0,pitch:72,slots:8,velocity:90}));const before=copy(store.doc);
 const plan=makeImportPlan(parseSMF(bytes),store.doc,store.revision,{...settings,beats:2});assert.equal(plan.errors.length,0);assert.deepEqual(store.doc,before);
 applyPlan(store,plan);const note=notesOf(getPart(store.doc,0,0))[0];assert.equal(note.slots,4);assert.equal(note.end,3.9375);assert.deepEqual(getPart(store.doc,0,0).steps.slice(8),getPart(before,0,0).steps.slice(8));
 assert.deepEqual(store.doc.patterns[0].bass[1],before.patterns[0].bass[1]);store.undo();assert.deepEqual(store.doc,before);
});
