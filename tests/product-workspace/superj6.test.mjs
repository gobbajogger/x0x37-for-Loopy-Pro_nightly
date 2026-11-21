// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {SUPERJ6_PROGRAM,WAVE_STOPS,SOUND_BANKS,sourceOnlyBank,superJ6Specs,superJ6Spec,
  acceptsSuperJ6,renderSuperJ6,superJ6Text} from '../../web/product-site/remote/superj6.mjs';

const referenceBits=new Map([
  [78,0x3e015a1c],[79,0x3f011ab3],[82,0x3f800000],[83,0x3f800000],
  [88,0x3e4bde44],[96,0x3e54c882],[100,0x3e8ea7b5],
  [195,0x3f800000],[196,0],[197,0x3f800000],[202,0x3ddd29f1],[210,0x3f800000],[211,0x3f800000]
]);
const sid=(slot,field)=>superJ6Specs.find(s=>s.slot===slot&&s.field===field);
function bits(v){const d=new DataView(new ArrayBuffer(4));d.setFloat32(0,v);return d.getUint32(0);}

test('the two Draft owners retain all 13 measured original float words and stable preset/field identities',()=>{
  assert.equal(superJ6Specs.length,26);
  assert.equal(new Set(superJ6Specs.map(s=>s.id)).size,26);
  for(const spec of superJ6Specs){
    assert.equal(bits(spec.value),referenceBits.get(spec.field));
    assert.ok(spec.id.includes(SUPERJ6_PROGRAM.bankArchiveSha256));
    assert.ok(spec.id.endsWith('/'+SUPERJ6_PROGRAM.bankId+'/'+SUPERJ6_PROGRAM.programId+'|'+spec.field));
    assert.equal(superJ6Spec(spec.id),spec);
    assert.ok(acceptsSuperJ6(spec,spec.value));
  }
  assert.deepEqual([...SOUND_BANKS],['CHICAGO','MIAMI','Synth One','SuperJ6']);
  assert.equal(sourceOnlyBank('SuperJ6'),true);assert.equal(sourceOnlyBank('JUNO'),false);
});
test('original waveform stops, independent PWM, continuous SUB and all three clock modes',()=>{
  const edits=new Map();
  for(const field of [82,83])assert.deepEqual(WAVE_STOPS.map(v=>superJ6Text(sid(0,field),v,edits)),['Sine','Triangle','Saw','Square']);
  const text=(f,v)=>superJ6Text(sid(0,f),v,edits);
  assert.equal(text(78,0),'50% duty');assert.equal(text(79,1),'3% duty');
  assert.equal(text(202,.25),'25%');assert.equal(text(202,0),'0%');
  for(const [rate,mode] of [[88,195],[96,196],[100,197]]){
    edits.set(sid(0,mode).id,0);assert.equal(text(rate,.5),'4/3 beats');
    edits.set(sid(0,mode).id,1);assert.equal(text(rate,.5),'1.591 Hz');assert.equal(text(rate,1),'16 Hz');
  }
  const left=renderSuperJ6(0,edits),right=renderSuperJ6(1,edits);
  assert.equal((left.match(/data-sj6-field=/g)||[]).length,13);
  assert.match(left,/PWM String Pad/);assert.match(right,/data-sj6-display="96">8 beats</);
  assert.doesNotMatch(left,/data-native-param|data-param=|quarter note|1\/16/);
  const baselineGlyph=html=>html.match(/data-sj6-glyph="82">(.*?)<\/span>/)[1];
  const previous=baselineGlyph(left);edits.set(sid(0,210).id,0);
  assert.notEqual(baselineGlyph(renderSuperJ6(0,edits)),previous);
  assert.equal(baselineGlyph(renderSuperJ6(1,edits)),baselineGlyph(right));
});
test('unsupported field values and legacy identity aliases are rejected',()=>{
  for(const v of [NaN,Infinity,-.1,1.01,.1234567890123456])assert.equal(acceptsSuperJ6(sid(0,78),v),false);
  for(const f of [82,83,210,211,195,196,197])assert.equal(acceptsSuperJ6(sid(0,f),.5),false);
  assert.equal(superJ6Spec('source-sound/JUNO/0|1:2:0:0:3'),undefined);
  assert.equal(superJ6Spec(sid(0,78).id.replace(SUPERJ6_PROGRAM.programId,'other')),undefined);
});

test('Hz readouts use the frequency returned by the build-9 Conductor',()=>{
  // The original returns binary32 before Remote formats to three decimal places.
  const probe=new DataView(new ArrayBuffer(4));
  const cases=[[0x3d7cc788,'0.002 Hz'],[0x3e13f963,'0.025 Hz']];
  for(const slot of [0,1])for(const [rate,mode] of [[88,195],[96,196],[100,197]]){
    const spec=sid(slot,rate),edits=new Map([[sid(slot,mode).id,1]]);
    for(const [word,expected] of cases){
      probe.setUint32(0,word);
      const value=probe.getFloat32(0);
      assert.equal(superJ6Text(spec,value,edits),expected);
      edits.set(spec.id,value);
      const html=renderSuperJ6(slot,edits);
      assert.ok(html.includes('data-sj6-display="'+rate+'">'+expected+'</output>'));
      assert.match(html,new RegExp('data-sj6-field="'+rate+'"[^>]*aria-valuetext="'+expected.replace('.', '\\.')+'"'));
    }
  }
});

test('all three synced LFOs on both basses select the original binary32 tempo ranges',()=>{
  // First representable normalized value selecting each successively faster
  // rate from the build-9 Conductor's compiled lfo_rate at 120 BPM.
  const starts=[0,0x3cf0f111,0x3db4b4bc,0x3e16969b,0x3e52d2d6,0x3e87878a,
    0x3ea5a5a7,0x3ec3c3c6,0x3ee1e1e3,0x3f000001,0x3f0f0f10,0x3f1e1e1f,
    0x3f2d2d2e,0x3f3c3c3d,0x3f4b4b4c,0x3f5a5a5b,0x3f69696a,0x3f787879];
  const periods=['32 beats','≈24 beats','16 beats','≈12 beats','8 beats','4 beats',
    '8/3 beats','2 beats','4/3 beats','1 beat','2/3 beat','1/2 beat','1/3 beat',
    '1/4 beat','1/6 beat','1/8 beat','1/12 beat','1/16 beat'];
  const word=new DataView(new ArrayBuffer(4));
  const raw=bits=>{word.setUint32(0,bits);return word.getFloat32(0);};
  for(const slot of [0,1])for(const [rate,mode] of [[88,195],[96,196],[100,197]]){
    const spec=sid(slot,rate),edits=new Map([[sid(slot,mode).id,0]]);
    for(let i=0;i<starts.length;i++){
      const hi=i+1<starts.length?starts[i+1]-1:0x3f800000;
      for(const value of [raw(starts[i]),raw(hi)])assert.equal(superJ6Text(spec,value,edits),periods[i]);
    }
    edits.set(spec.id,0.5);
    assert.ok(renderSuperJ6(slot,edits).includes('aria-valuetext="4/3 beats"'));
    edits.set(sid(slot,mode).id,1);
    assert.equal(superJ6Text(spec,0.5,edits),'1.591 Hz');
  }
});

if (process.env.DNBOX_SUPERJ6_ARCHIVE) {
  test('both Draft owners reproduce the original thirteen binary32 control values', () => {
    const script = fileURLToPath(new URL('../../tools/check-superj6-draft-source.py', import.meta.url));
    const result = JSON.parse(execFileSync('python3', [script, process.env.DNBOX_SUPERJ6_ARCHIVE], {encoding:'utf8'}));
    assert.equal(result.owners, 2);
    assert.equal(result.matchedOriginalFields, 13);
    assert.equal(result.archiveSha256, SUPERJ6_PROGRAM.bankArchiveSha256);
  });
}
