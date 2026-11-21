// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {breakGeneratorPanel,breakSoundChance,breakGeneratorChanges,checkedBreakGenerators,putBreakSetting} from '../../web/product-site/remote/break-generator.mjs';
import {emptyBreakSequence,validateBreakSequence,installBreakSequence} from '../../web/product-site/remote/break-sequence.mjs';

const defaults = [50,0,0,0,0,0,0,0,0,0,2,2];

test('all 12 stock domains retain their parameter-index order on both endpoint patterns', () => {
  for (let id=0; id<12; id++) {
    const max = id===8 ? 4 : id>=10 ? 5 : 100;
    for (let value=0; value<=max; value++) {
      for (const pattern of [0,31]) {
        const rows=putBreakSetting([],pattern,id,value);
        const expected=[...defaults];
        expected[id]=value;
        assert.deepEqual(rows,value===defaults[id] ? [] : [{pattern,settings:expected}]);
      }
    }
    for (const invalid of [-1,max+1,0.5,null,'0']) assert.throws(()=>putBreakSetting([],0,id,invalid));
  }
  const rows=Array.from({length:32},(_,pattern)=>({pattern,settings:[49,...defaults.slice(1)]}));
  assert.deepEqual(checkedBreakGenerators(rows),rows);
  const edited=putBreakSetting(rows,30,9,82);
  assert.deepEqual(edited[29],rows[29]);
  assert.equal(edited[30].settings[9],82);
  assert.equal(rows[30].settings[9],0);
  for (const pattern of [undefined,null,-1,32,'0']) assert.throws(()=>putBreakSetting(rows,pattern,0,1));
});

test('stock Groove, Retrig and named selectors stay ordered and B chance appears on Sound only', () => {
  assert.equal(breakGeneratorPanel([],null),'');
  const html=breakGeneratorPanel([],31);
  assert.match(html,/Generator · BREAK \/ P32 · Draft/);
  assert.deepEqual([...html.matchAll(/data-break-setting="(\d+)"/g)].map(m=>Number(m[1])),[0,1,2,3,4,5,6,7,8,10,11]);
  assert.deepEqual([...html.matchAll(/<legend>([^<]+)<\/legend>/g)].map(m=>m[1]),['Groove','Retrigger','Phrase and length']);
  const names = [...html.matchAll(/<select[^>]*>(.*?)<\/select>/g)].map(m=>[...m[1].matchAll(/selected>([^<]+)</g)].map(v=>v[1]));
  assert.deepEqual(names,[['Off'],['1×'],['1×']]);
  const rows=putBreakSetting(putBreakSetting([],7,8,4),7,10,0);
  assert.deepEqual(breakGeneratorChanges(rows),['BREAK · P08 · Phrase · Off → 16 bars','BREAK · P08 · A length · 1× → 1/4×']);
  assert.doesNotMatch(breakSoundChance(rows,null,0),/data-break-setting/);
  assert.match(breakSoundChance(rows,null,0),/Unassigned B chance from file · 0%/);
  assert.match(breakSoundChance(rows,7),/data-break-setting="9" data-break-pattern="7" value="0"/);
});

test('strict Draft import, subsequent older-file load and canonical default removal', () => {
  const blank=emptyBreakSequence(),rows=putBreakSetting([],13,0,0),valid={...blank,generators:rows};
  assert.deepEqual(validateBreakSequence(valid),valid);
  for (const generators of [null,{},[null], [...rows,...rows],[{pattern:32,settings:defaults}],
      [{pattern:2,settings:defaults.slice(1)}],[{pattern:2,settings:[...defaults,null]}],
      [{pattern:2,settings:Array(12)}],[{pattern:2,settings:defaults,extra:1}]]) {
    assert.throws(()=>validateBreakSequence({...blank,generators}));
  }
  const state=emptyBreakSequence();installBreakSequence(state,valid);assert.deepEqual(state,valid);
  installBreakSequence(state,blank);assert.deepEqual(state,blank);
  assert.deepEqual(validateBreakSequence({...blank,generators:[{pattern:13,settings:defaults}]}),blank);
});

test('firmware chance thresholds, protected anchors, phrase-gated fill and actual enum index',async () => {
  const {breakGlyphShapes}=await import('../../web/product-site/remote/glyph-render.mjs');
  const {FUNCTION_GLYPH}=await import('../../web/product-site/remote/glyph-registry.mjs');
  for (let value=0;value<=100;value++) {
    const count=[9,25,42,59,76,92].filter(threshold=>value>=threshold).length;
    for (const id of [2,4,5,6,7,9]) {
      const shapes=breakGlyphShapes(id,value,0);
      assert.equal(shapes.slice(8).filter(rect=>rect.ink===1).length,count);
    }
    const ink=Math.floor((value*16+50)/100)/16;
    assert.deepEqual(breakGlyphShapes(0,value,0).map(rect=>rect.ink),Array.from({length:16},(_,i)=>i%2?ink:1));
    assert.deepEqual(breakGlyphShapes(1,value,0).filter(rect=>rect.h===12).map(r=>[r.x,r.ink]),[[6,ink],[26,ink]]);
    assert.ok(breakGlyphShapes(3,value,0).every(rect=>rect.ink===0));
    assert.deepEqual(breakGlyphShapes(3,value,1).filter(rect=>rect.h===4).map(r=>r.ink),Array(4).fill(ink));
  }
  for (const [id,count] of [[8,5],[10,6],[11,6]]) for(let i=0;i<count;i++) {
    const rows=breakGlyphShapes(id,i,0);
    assert.equal(rows.length,count);assert.equal(rows.findIndex(r=>r.ink===1),i);
  }
  const html=breakGeneratorPanel([],0),sound=breakSoundChance([],0);
  assert.equal(html.split('data-r22-glyph="'+FUNCTION_GLYPH.CHANCE+'"').length-1,5);
  assert.ok(sound.includes('data-r22-glyph="'+FUNCTION_GLYPH.CHANCE+'"'));
  for (const label of ['Complexity','Anchor','Roll','Fill','Retrigger ×2','Retrigger ×3','Retrigger ×4','Retrigger ×8','Phrase','A length','B length']) {
    assert.ok(html.includes('aria-label="'+label),label);
  }
});
