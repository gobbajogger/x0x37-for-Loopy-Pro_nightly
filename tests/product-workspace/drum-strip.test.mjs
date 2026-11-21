// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderDrumStrip, drumValueText, paintDrumGlyph} from '../../web/product-site/remote/drum-strip.mjs';

const site = new URL('../../web/product-site/remote/', import.meta.url);
const screens = JSON.parse(readFileSync(new URL('components.json',site))).screens.filter(s=>s.successor?.recomposedDrum);
const defaults = JSON.parse(readFileSync(new URL('../product-remote/fixtures/drum-firmware-defaults.json',import.meta.url)));
const catalog = JSON.parse(readFileSync(new URL('catalog.json',site))).controls;

function projection(screen) {
  // The independent fixture extracts the shipped source subtrees; the browser
  // cases exercise the native DOMParser/serializer and compare their real DOM.
  const glyphs = [...screen.body_svg.matchAll(/<g\b[^>]*data-glyph-semantic="[^"]+"[^>]*>(?:<path\b[^>]*\/>)+<\/g>/g)].map(match=>match[0]);
  assert.equal(glyphs.length,screen.controls.length,screen.path);
  return new Map(screen.controls.map((c,index)=>[c.identity,glyphs[index]]));
}

test('all drum strip cells retain their own captured identity, role and artwork, with the firmware readout at the source raw value', () => {
  assert.equal(screens.length,22);
  let count=0,active=0;
  for(const screen of screens) {
    const controls=screen.controls, glyphs=projection(screen);
    const html=renderDrumStrip(screen,(id,occurrence)=>{
      const c=controls[Number(occurrence)];
      assert.equal(id,screen.path+'|'+c.identity);
      const [,target,voice,param]=c.identity.split(':').map(Number);
      const source=catalog.find(d=>d.target===target&&d.voice===voice&&d.parameter===param&&d.kind!=='HELD');
      assert.ok(source);
      return {value:Number(c.context.raw),min:source.min,max:source.max,step:1};
    },glyphs);
    const units=html.split('<section data-drum-sound-unit').slice(1);
    assert.equal(units.length,controls.length);
    for (const [index,c] of controls.entries()) {
      const unit=units[index],id=screen.path+'|'+c.identity;
      const expectedRole=c.markers['visual-role']==='active glyph/value control'?'active':'summary';
      assert.ok(unit.includes('data-drum-role="'+expectedRole+'"'));
      assert.ok(unit.includes(glyphs.get(c.identity)));
      assert.ok(unit.includes('data-param="'+id+'"'));
      assert.equal((unit.match(/data-param="/g)||[]).length,1);
      assert.ok(unit.includes('data-drum-decrement="'+id+'"'));
      assert.ok(unit.includes('data-drum-increment="'+id+'"'));
      assert.ok(unit.includes(defaults[screen.path][index]+'</output>'));
      assert.ok(!unit.includes(' disabled'));
      count++; if(expectedRole==='active')active++;
    }
  }
  assert.equal(count,83);assert.equal(active,60);
});

test('909 BD retains all six ordered source controls including both bank summaries', () => {
  const screen=screens.find(s=>s.path.endsWith('909-voice-00.svg'));
  assert.deepEqual(screen.controls.map(c=>c.context.name),['Tune','Attack','Decay','P.Dpth','Pitch','ACCENT']);
  const html=renderDrumStrip(screen,(id,i)=>({value:Number(screen.controls[Number(i)].context.raw)}),projection(screen));
  assert.ok(html.includes('--drum-columns:6'));
  assert.ok(html.includes('data-drum-label>Pitch depth</span>'));
  assert.ok(html.includes('data-drum-label>Velocity</span>'));
  assert.deepEqual(screen.controls.map(c=>drumValueText(c,Number(c.context.raw))),['13ms','10%','1.0s','0%','+0.1st','100%']);
});

test('a missing local descriptor leaves the captured cell and its actions disabled', () => {
  const screen=screens[0];
  const html=renderDrumStrip(screen,()=>null,projection(screen));
  assert.equal((html.match(/ disabled/g)||[]).length,screen.controls.length*3);
});

test('editable kit glyphs update their mounted source paths at every raw value', () => {
  const envelopeControls=[];
  let tuneForks=0, kitSummaries=0, fallingTails=0;
  for(const screen of screens)for(const control of screen.controls){
    const attributes=new Map();
    const path={setAttribute:(k,v)=>attributes.set(k,v)};
    let pathLookups=0;
    const glyph={setAttribute:()=>{},querySelector:selector=>{
      assert.equal(selector,'path');pathLookups++;return path;
    }};
    const root={querySelectorAll:selector=>{
      assert.ok(selector.includes('[data-drum-editor]') && selector.includes('[data-drum-sound-strip]'));
      assert.ok(selector.includes('[data-source-control="'+control.identity+'"]'));
      return [glyph];
    }};
    paintDrumGlyph(root,control,0,127);
    if(!attributes.has('d'))continue;
    const firstCurve=attributes.get('d');
    const fork=control.context.name==='Tune' && control.identity!=='1:0:0:0';
    const summary=control.context.name==='ACCENT' && control.markers['visual-role']==='inactive bank parameter summary';
    const decay=['Decay','Tail'].includes(control.context.name) && control.identity!=='1:1:6:2';
    if(decay)fallingTails++;
    else if(fork)tuneForks++;
    else if(summary)kitSummaries++;
    else envelopeControls.push(control.identity);
    for(let raw=0;raw<=127;raw++){
      paintDrumGlyph(root,control,raw,127);
      const curve=attributes.get('d');
      if(decay){
        const points=[...curve.matchAll(/[ML]([\d.]+) ([\d.]+)/g)];
        assert.equal(points.length,17);
        assert.ok(points.every((p,i)=>+p[2]>=0 && +p[2]<=12 && (!i || +p[1]>+points[i-1][1])));
      }else if(fork){
        // Two eight-segment tines, their upright ends and the independent stem.
        assert.equal(curve.match(/[ML]/g).join(''),'M'+'L'.repeat(18)+'ML');
      }else if(summary){
        assert.match(curve,/^(?:M\d+ 12V[\d.]+){4}$/);
      }else if(control.identity==='1:1:0:1'){
        const ys=[...curve.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(match=>Number(match[2]));
        assert.equal(ys.length,25);
        assert.ok(ys.every((y,i)=>y>=1 && y<=12 && (!i || y>=ys[i-1])));
        if(raw===0)assert.ok(ys[12]>9.5);
        if(raw===127)assert.ok(ys[12]<2);
      }else{
        assert.match(curve,/^M1 12L([\d.]+) 0L31 0$/);
        assert.ok(Math.abs(Number(curve.slice(6).split(' ')[0])-(1+30*raw/127))<.0001);
      }
    }
    assert.notEqual(attributes.get('d'),firstCurve,control.identity);
    assert.equal(pathLookups,1,'updates reuse the mounted glyph path');
  }
  assert.equal(tuneForks,21);assert.equal(kitSummaries,22);assert.equal(fallingTails,20);
  assert.deepEqual(envelopeControls.sort(),['1:0:0:1','1:0:2:3','1:0:3:3','1:0:4:3','1:1:0:1','1:1:0:4','1:1:6:3']);
});
