// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {miamiWave, miamiWaveParameter} from '../../web/product-site/remote/wave-display.mjs';
import {readoutYs, render, renderSvg} from '../../web/product-site/remote/glyph-render.mjs';
import {paintPixels, polylines} from '../../web/product-site/remote/glyph-live.mjs';

const parameters = [0, 6, 11];
const pin = 'ffd31a735acc5721d1f90a30fc1ceb283aad6fc5';
const sha256 = data => createHash('sha256').update(data).digest('hex');

test('both bass slots match the native names, zero lines and 29 samples at all q127 values', () => {
 const snapshots = JSON.parse(readFileSync(new URL('../../web/product-site/remote/source-sounds.json', import.meta.url)));
 assert.equal(snapshots.source, pin);
 const hash = createHash('sha256');
 let checked = 0;
 for (const {bassSlot: voice, controls} of snapshots.contexts.filter(c => c.bank === 'MIAMI').sort((a,b) => a.bassSlot-b.bassSlot)) {
  for (const parameter of parameters) {
   const row = controls.find(c => miamiWaveParameter(c) === parameter);
   assert.equal(miamiWave(parameter,row.raw).name, row.value);
   for (let raw = 0; raw <= 127; raw++) {
    const wave = miamiWave(parameter,raw);
    const state = {miamiParameter:parameter, valueDomain:'raw127'};
    const draw = render(row.name,raw,'miami',state);
    const points = polylines(draw.d);
    assert.deepEqual(readoutYs(row.name,'miami',raw,parameter),wave.rows);
    assert.equal(points.length,1);
    assert.deepEqual(points[0],wave.rows.map((y,x)=>[x+0.5,y+0.5]));
    assert.equal(draw.zero, wave.zero+0.5);
    hash.update([voice,parameter,raw,wave.name,wave.zero,...wave.rows].join(' ')+'\n');
    checked++;
   }
  }
 }
 assert.equal(checked,768);
 // Factory zero from miami-wave-oracle.c; names resolved by the pinned ui.c formatter.
 assert.equal(hash.digest('hex'),'eac79d8a9b4325506161c5d687ae29e5421bf9a50e90359da7258783ac4019f2');
});

test('XMOD pulse and wobble square use different canvas and SVG traces at the same raw value', () => {
 const painted = new Set();
 for (const parameter of parameters) {
  const name = parameter === 11 ? 'SHAPE' : 'WAVE';
  const pixels = new Uint8ClampedArray(58*38*4);
  const state = {miamiParameter:parameter};
  assert.equal(paintPixels(pixels,58,38,name,1,'miami',state),'WAVE');
  assert.match(renderSvg(name,1,'miami',state),/viewBox="0 0 29 19"/);
  painted.add(sha256(pixels));
 }
 assert.equal(painted.size,3);
 assert.equal(miamiWave(5,127),null);
 assert.equal(miamiWave(6,128),null);
 assert.equal(miamiWaveParameter({kind:1,target:2,sourceBank:3,voice:0,parameter:0}),null);
});

// Optional regeneration. Supply a local firmware checkout at pin, Node.js and a C99 compiler.
// DNBOX_MIAMI_FIRMWARE=/path/to/firmware node --test tests/product-remote/miami-wave.test.mjs
const firmware = process.env.DNBOX_MIAMI_FIRMWARE;
test('supplied pinned C source reproduces all 23,220 projections, including untouched cells', {skip:!firmware}, () => {
 const cwd = resolve(firmware);
 const ui = readFileSync(join(cwd,'firmware/src/app/ui.c'));
 assert.equal(createHash('sha1').update('blob '+ui.length+'\0').update(ui).digest('hex'),'8cb35150b9294aad0d8e1d3d78069e1802fdbf89');
 const names = Object.fromEntries(['shape','wobble'].map(key => {
  const match = ui.toString().match(new RegExp('const '+key+'\\[\\] = \\{([^}]+)\\}'));
  assert.ok(match, key);
  return [key,JSON.parse('['+match[1]+']')];
 }));
 const dir = mkdtempSync(join(tmpdir(),'miami-wave-')), binary = join(dir,'probe');
 try {
  const source = fileURLToPath(new URL('miami-wave-oracle.c',import.meta.url));
  const args = ['-std=c99','-O2','-DX0X_HOST','-I.','-Iexperiments/original_synth','-fno-fast-math','-ffp-contract=off',
   source,'firmware/src/app/original_sound.c',...['miami_program','chicago_program','fused_reference'].map(s=>'experiments/original_synth/'+s+'.c'),'-lm','-o',binary];
  const build = spawnSync(process.env.CC || 'cc',args,{cwd,encoding:'utf8'});
  assert.equal(build.status,0,build.stderr || String(build.error));
  const run = spawnSync(binary,[],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:30000});
  assert.equal(run.status,0,run.stderr || String(run.error));
  assert.equal(sha256(run.stdout),'0a66fbbe2320837e7d2b48eb3871179d8e96858bfc2dce06fdbd1298febd9ff3');
  for (const line of run.stdout.trimEnd().split('\n')) {
   const [factory,voice,parameter,raw,snapshot,shape,zero,...rows] = line.split(' ').map(Number);
   const wave = miamiWave(parameter,raw<0?snapshot:raw);
   assert.deepEqual(wave,{name:names[parameter===11?'wobble':'shape'][shape],zero,rows},
    'factory '+factory+', voice '+voice+', parameter '+parameter+', raw '+raw);
  }
 } finally {rmSync(dir,{recursive:true,force:true});}
});
