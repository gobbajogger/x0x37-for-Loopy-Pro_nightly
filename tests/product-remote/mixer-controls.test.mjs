import test from'node:test';import assert from'node:assert/strict';import{renderTypedFunkyBeatsMixer}from'../../web/product-site/remote/funkybeats-view.mjs';
const channels=()=>['909','808','BASS A','BASS B','BREAK'].map((label,i)=>({id:'parts|1:5:'+i+':0',label,value:75,min:0,max:127,step:1,display:'-5dB'}));
test('mixer preserves native identities, domain and five part routes',()=>{const html=renderTypedFunkyBeatsMixer({channels:channels()});assert.equal((html.match(/data-mix-part=/g)||[]).length,5);assert.doesNotMatch(html,/VU|solo|mixer-meter/);});
test('wrong source, duplicate voice, wrong parameter and fractional domains reject',()=>{for(const patch of[{id:'other|1:5:1:0'},{id:'parts|1:5:0:0'},{id:'parts|1:5:1:1'},{max:100},{value:75.5},{step:.5}]){const c=channels();Object.assign(c[1],patch);assert.throws(()=>renderTypedFunkyBeatsMixer({channels:c}));}});

import {fxDisplay} from '../../web/product-site/remote/mixer-format.mjs';

test('FX readouts use their firmware identities, units and raw domains', () => {
  const expected = [
    [4, 73, '62%'], [5, 57, '45%'], [6, 62, '149Hz'], [7, 85, '-1.9dB'],
    [8, 7, '1/8.'], [9, 52, '35%'], [10, 51, '40%'], [11, 85, '-1.9dB'],
  ];
  for (const [slot, initial, display] of expected) {
    const id = 'current-state-and-reference/fx-' + (slot < 8 ? 'reverb' : 'delay') + '-direct.svg|1:4:0:' + slot;
    const max = slot === 8 ? 12 : 127;
    assert.equal(fxDisplay(id, initial), display);
    for (let raw = 0; raw <= max; raw++) assert.ok(fxDisplay(id, raw));
    for (const invalid of [-1, max + 1, 0.5]) assert.equal(fxDisplay(id, invalid), null);
  }
  assert.equal(fxDisplay('1:4:0:4', 0), '20%');
  assert.equal(fxDisplay('1:4:0:4', 127), '93%');
  assert.equal(fxDisplay('1:5:0:4', 73), null);
});
