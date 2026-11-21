import test from 'node:test';
import assert from 'node:assert/strict';
import {Arrangement} from '../../web/product-site/remote/sequence.mjs';
const make=()=>{const a=new Arrangement();a.add([0,1,2,3,4],2);a.add([5,6,7,8,9],3);a.add([10,11,12,13,14],4);return a;};
test('Song changes one part pattern and preserves other cells through Undo/Redo',()=>{
 const a=make(),before=structuredClone(a.rows);a.setPattern(1,3,31);
 assert.deepEqual(a.rows,[before[0],{patterns:[5,6,7,31,9],repeats:3},before[2]]);
 a.undo();assert.deepEqual(a.rows,before);a.redo();assert.equal(a.rows[1].patterns[3],31);
});
test('Song moves a complete row once, keeps boundary no-ops out of history',()=>{
 const a=make(),before=structuredClone(a.rows),count=a.history.length;
 assert.equal(a.move(0,-1),false);assert.equal(a.move(2,1),false);assert.equal(a.history.length,count);
 assert.equal(a.move(1,-1),true);assert.deepEqual(a.rows,[before[1],before[0],before[2]]);assert.equal(a.history.length,count+1);
 a.undo();assert.deepEqual(a.rows,before);a.redo();assert.deepEqual(a.rows,[before[1],before[0],before[2]]);
});
test('Song removes middle, last and only rows without mutating saved snapshots',()=>{
 const a=make(),before=structuredClone(a.rows);a.remove(1);assert.deepEqual(a.rows,[before[0],before[2]]);a.undo();assert.deepEqual(a.rows,before);
 a.remove(2);assert.deepEqual(a.rows,before.slice(0,2));a.remove(1);a.remove(0);assert.deepEqual(a.rows,[]);a.undo();assert.deepEqual(a.rows,[before[0]]);
});
test('Song invalid operations are atomic for rows and history',()=>{
 const a=make(),before=structuredClone(a.rows),history=structuredClone(a.history);
 for(const run of [()=>a.setPattern(1,5,0),()=>a.setPattern(1,0,32),()=>a.setPattern(1,-1,0),()=>a.setPattern(.5,0,0),()=>a.move(-1,1),()=>a.move(0,2),()=>a.move(3,-1),()=>a.remove(3),()=>a.remove('0'),()=>a.update(1,{repeats:9})]){
  assert.throws(run);assert.deepEqual(a.rows,before);assert.deepEqual(a.history,history);assert.deepEqual(a.future,[]);
 }
});

test('five Song switches change only their own low bit and preserve repeats, references and neighbors',()=>{
 for(let repeats=1;repeats<=8;repeats++)for(let mask=0;mask<32;mask++){
  const a=make();a.update(1,{repeats,muteMask:mask});
  const original=structuredClone(a.rows);
  for(let part=0;part<5;part++){
   const on=!(mask&(1<<part)),history=a.history.length;
   assert.equal(a.setPartOn(1,part,on),false);assert.equal(a.history.length,history);
   assert.equal(a.setPartOn(1,part,!on),true);assert.equal(a.history.length,history+1);
   const next=mask^(1<<part);
   assert.deepEqual(a.rows,[original[0],{patterns:[5,6,7,8,9],repeats,...(next?{muteMask:next}:{})},original[2]]);
   a.undo();assert.deepEqual(a.rows,original);a.redo();assert.equal(a.rows[1].muteMask??0,next);a.undo();
  }
 }
});
test('invalid Song masks, rows, part indexes and switch values leave both histories intact',()=>{
 const a=make();a.setPartOn(1,4,false);a.undo();
 const snapshot=()=>structuredClone([a.rows,a.history,a.future]),before=snapshot();
 for(const value of [undefined,null,-1,32,.5,'1',true,NaN,Infinity]){
  assert.throws(()=>a.update(1,{muteMask:value}));assert.deepEqual(snapshot(),before);
 }
 for(const args of [[1,5,false],[1,-1,false],[1,.1,false],['1',0,true],[3,0,false],[1,'2',false],[1,0,1],[1,0,'false'],[1,0,null]]){
  assert.throws(()=>a.setPartOn(...args));assert.deepEqual(snapshot(),before);
 }
 a.redo();a.move(1,-1);assert.equal(a.rows[0].muteMask,16);
 a.setPattern(0,4,31);a.update(0,{repeats:8});assert.equal(a.rows[0].muteMask,16);
 a.setPartOn(0,4,true);assert.ok(!Object.hasOwn(a.rows[0],'muteMask'));
});
