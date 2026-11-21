// SPDX-License-Identifier: GPL-3.0-only
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {paintKickDepth} from '../../web/product-site/remote/drum-strip.mjs';

test('pending Tune, Depth and Pitch edits repaint the original Depth path and restore each prior curve',()=>{
  const keys=['1:0:0:0','1:0:0:4','1:0:0:5'];
  const values=new Map(keys.map((id,i)=>[id,[34,0,45][i]]));
  let pathLookups=0,drawing='M0 2H7Q13 12 19 12H31';
  const path={setAttribute(key,value){assert.equal(key,'d');drawing=value;}};
  const glyph={setAttribute(key,value){assert.deepEqual([key,value],['data-glyph-origin','firmware dv_glyph']);},
               querySelector(q){assert.equal(q,'path');pathLookups++;return path;}};
  const locator='[data-source-control="1:0:0:4"] [data-glyph-semantic="P.DPTH"]';
  const root={querySelectorAll(q){
    assert.equal(q,'[data-drum-editor] '+locator+', [data-drum-sound-strip] '+locator);return [glyph];
  }};
  paintKickDepth(root,keys[0],34,()=>undefined);
  assert.equal(pathLookups,0);
  const paint=(id,value)=>{
    paintKickDepth(root,id,value,key=>{assert.notEqual(key,id);return values.get(key);});
    values.set(id,value);
    return [...drawing.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(m=>+m[2]);
  };
  const expected=[[6.79083109,8.46621895,10.5005817,10.9320412],
                  [8.61200809,10.3244076,10.9316015,10.9417505],
                  [6.73025703,9.65477753,10.9016714,10.9238968],
                  [1.65163922,2.57380843,2.86714053,2.87189412]];
  const commands=[[0,34,0],[0,0,1],[1,127,2],[2,127,3],[2,45,2],[1,0,1],[0,34,0]];
  for(const [index,value,state] of commands){
    const ys=paint(keys[index],value);
    assert.equal(ys.length,25);
    for(const [j,point] of [0,6,12,24].entries())
      assert.ok(Math.abs(ys[point]-expected[state][j])<.00006);
  }
  assert.equal(pathLookups,1);
});
