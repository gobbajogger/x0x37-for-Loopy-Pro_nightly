// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {paintDrumGlyph} from '../../web/product-site/remote/drum-strip.mjs';

const catalog=JSON.parse(readFileSync(new URL('../../web/product-site/remote/components.json',import.meta.url)));
const tunes=catalog.screens.filter(screen=>screen.path.includes('-voice-'))
 .flatMap(screen=>screen.controls.filter(control=>control.context.name==='Tune'));

// The original example frame is immutable. Only the editable original and the
// compact strip are addressed by paintDrumGlyph.
function editableViews(control) {
 const trees=Array.from({length:2},()=>{
  const path={d:null,setAttribute(name,value){assert.equal(name,'d');this.d=value;}};
  return {path,setAttribute(){},querySelector(selector){assert.equal(selector,'path');return path;}};
 });
 const selector='[data-source-control="'+control.identity+'"] [data-glyph-semantic]';
 const root={querySelectorAll(query){
  assert.equal(query,'[data-drum-editor] '+selector+', [data-drum-sound-strip] '+selector);
  return trees;
 }};
 return {root,paths:()=>trees.map(tree=>tree.path.d)};
}

test('the 21 native tuning forks follow the firmware bounds and midpoint in both editable views',()=>{
 const forks=tunes.filter(control=>control.identity!=='1:0:0:0');
 assert.equal(forks.length,21);
 // dv_tune_fork, firmware 9dd6f2df: left/right tines, centre join and stem.
 for(const control of forks){
  const views=editableViews(control);
  for(const [raw,left,right,join,tip] of [[0,11.66,20.34,10.46,16.595],[64,8.9791,23.0209,11.4679,17.3509],[127,6.34,25.66,12.46,18.095]]){
   paintDrumGlyph(views.root,control,raw,127);
   const [editor,compact]=views.paths();
   assert.ok(editor,control.identity);
   assert.equal(editor,compact);
   const points=[...editor.matchAll(/([ML])([\d.]+) ([\d.]+)/g)].map(([,op,x,y])=>[op,+x,+y]);
   assert.equal(points.length,21);
   assert.deepEqual([points[0],points[1],points[9],points[17],points[18],points[19],points[20]],
    [['M',left,0],['L',left,6],['L',16,join],['L',right,6],['L',right,0],['M',16,join],['L',16,tip]]);
  }
 }
});

test('the 909 kick Tune does not receive a single-control tuning fork',()=>{
 const kick=tunes.find(control=>control.identity==='1:0:0:0');
 assert.ok(kick);
 const views=editableViews(kick);
 paintDrumGlyph(views.root,kick,127,127);
 assert.deepEqual(views.paths(),[null,null]);
});
