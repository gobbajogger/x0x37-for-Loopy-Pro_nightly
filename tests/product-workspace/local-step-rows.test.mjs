// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {changeStepRow,checkedStepRows,stepCanEdit} from '../../web/product-site/remote/local-step-rows.mjs';
import {StepValueGesture} from '../../web/product-site/remote/step-value-gesture.mjs';
const row = (step,value) => Array.from({length:16},(_,i)=>i===step?value:null);
test('stock gate, two flags and release fraction retain 132 valid original step bytes',()=>{
 let valid=0;
 for(let flags=0;flags<256;flags++){
  const gate=flags&3, release=flags>>4;
  const step={chicago:{gate:row(0,gate),accent:row(0,(flags>>2)&1),slide:row(0,(flags>>3)&1),release:row(0,release)}};
  if(gate===3 || (gate===0&&release!==0))assert.throws(()=>checkedStepRows(step));
  else{assert.deepEqual(checkedStepRows(step),step);valid++;}
 }
 assert.equal(valid,132);
});
test('unknown, Rest, Off, Legacy and a recorded endpoint remain distinct and gate edits clear endpoints',()=>{
 const empty={};
 const note=changeStepRow(empty,'chicago','gate',row(4,1));
 assert.equal(note.chicago.release[4],0);
 const held=changeStepRow(note,'chicago','release',row(4,15));
 assert.equal(held.chicago.release[4],15);
 assert.equal(changeStepRow(held,'chicago','gate',row(4,1)).chicago.release[4],15);
 const rest=changeStepRow(held,'chicago','gate',row(4,0));
 assert.deepEqual([rest.chicago.gate[4],rest.chicago.release[4]],[0,0]);
 assert.equal(stepCanEdit(rest,'chicago','release',4),false);
 assert.deepEqual(changeStepRow(rest,'chicago','gate',row(4,null)),empty);
 assert.deepEqual(changeStepRow(empty,'miami','accent',row(4,0)),{miami:{accent:row(4,0)}});
 for(const bad of [{miami:{release:row(0,1)}},{breaks:{gate:row(0,1)}},{chicago:{release:[0]}},
                   {drum909:{gate:row(0,1)}},{chicago:{accent:row(0,true)}},{miami:{gate:row(0,1.5)}}]){
  assert.throws(()=>checkedStepRows(bad));
 }
});
test('multi-step value strokes interpolate once and cancellation never touches committed points',()=>{
 let points=row(4,null),commands=0;
 const editor=new StepValueGesture({read:()=>points,commit:next=>{points=next;commands++;},paint(){},
  fromPosition:p=>Math.round(p*15),nudged:(_,dir)=>dir,enabled:step=>step!==2});
 assert.equal(editor.begin(11,{step:2}),false);
 assert.ok(editor.begin(12,{step:0}));editor.preview(12,0,0);editor.preview(12,1,3);
 assert.deepEqual(editor.values.slice(0,4),[0,5,null,15]);
 assert.equal(commands,0);editor.end(12);assert.equal(commands,1);
 editor.begin(13,{step:0});editor.preview(13,1,0);assert.equal(editor.begin(14,{step:1}),false);
 editor.end(13);editor.end(14);assert.equal(commands,1);assert.equal(points[0],0);
});
