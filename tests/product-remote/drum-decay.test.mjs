// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {paintDrumGlyph,paintKickDepth} from '../../web/product-site/remote/drum-strip.mjs';

const {screens}=JSON.parse(readFileSync(new URL('../../web/product-site/remote/components.json',import.meta.url)));
const controls=screens.filter(s=>s.path.includes('-voice-')).flatMap(s=>s.controls);

test('20 retained falling-tail donors follow the original idle curves at all 128 settings',()=>{
  const native=createHash('sha256');
  let count=0;
  for(const control of controls.filter(c=>['Decay','Tail'].includes(c.context.name))){
    let drawing='M1 0C4 7 9 12 31 12';
    const path={setAttribute(key,value){assert.equal(key,'d');drawing=value;}};
    const glyph={setAttribute(){},querySelector(key){assert.equal(key,'path');return path;}};
    const root={querySelectorAll:()=>[glyph]};
    if(control.identity==='1:1:6:2'){
      // The 808 clap uses a sound-dependent stage page and retains its own donor.
      paintDrumGlyph(root,control,0,127);
      assert.equal(drawing,'M1 0C4 7 9 12 31 12');
      continue;
    }
    for(let raw=0;raw<128;raw++){
      paintDrumGlyph(root,control,raw,127);
      const points=[...drawing.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].flatMap(m=>[+m[1],+m[2]]);
      assert.equal(points.length,34,control.identity);
      native.update(points.map(v=>Math.round(v*16)).join(',')+'\n');
    }
    count++;
  }
  assert.equal(count,20);
  // Compiled firmware 9dd6f2df. The independent source oracle checks unrounded positions.
  assert.equal(native.digest('hex'),'190476ca2b84e35e8b488e4a4a5e407df38f9b139e9bef261f77fa84bc104c71');
});


test('only 12 separately owned drum occurrences retain static donors',()=>{
  const staticIds=new Set([
    '1:0:0:0','1:0:0:5','1:0:1:1','1:0:1:2','1:1:1:1','1:1:1:2',
    '1:1:2:3','1:1:3:3','1:1:4:3','1:1:5:3','1:1:6:4','1:1:6:2',
  ]);
  assert.equal(controls.length,83);
  let unchanged=0;
  for(const c of controls){
    let drawing='retained';
    const path={setAttribute(key,value){drawing=value;}};
    const glyph={setAttribute(){},querySelector:()=>path};
    const root={querySelectorAll:q=>q.includes('[data-source-control="'+c.identity+'"]')?[glyph]:[]};
    const maximum=c.context.name==='Sound'?1:127;
    const paint=value=>{
      paintDrumGlyph(root,c,value,maximum);
      paintKickDepth(root,c.identity,value,id=>({'1:0:0:0':34,'1:0:0:4':0,'1:0:0:5':45})[id]);
    };
    paint(0);
    const low=drawing;
    paint(maximum);
    assert.equal(drawing===low,staticIds.has(c.identity),c.identity);
    if(drawing===low)unchanged++;
  }
  assert.equal(unchanged,12);
});
