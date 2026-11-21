// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {renderSynthOneInit} from '../../web/product-site/remote/synth-one-init.mjs';
import {INIT} from '../../web/product-site/remote/synth-one-init-data.mjs';

test('both owners show the production INIT values and measured envelopes without write targets', () => {
  for (const slot of [0, 1]) {
    const html = renderSynthOneInit(slot);
    assert.ok(html.includes('data-synth-one-init="'+slot+'"'));
    assert.equal(new Set([...html.matchAll(/data-init-field="([^"]+)"/g)].map(m => m[1])).size, 14);
    for (const label of ['Saw', '2000 Hz', '90%', '50 ms', '5 ms', '80%', '500 ms']) assert.ok(html.includes('>'+label+'<'));
    const [fileAction, ...readout] = html.split('<section class="synth-one-init"');
    assert.ok(fileAction.includes('data-open-synth-one-files="'+slot+'"'));
    assert.equal(readout.length, 1);
    assert.doesNotMatch(readout[0], /data-param=|<button|<input|<select|data-firmware/);
    for (const name of ['amp','filter']) assert.ok(html.includes('data-init-plot="'+name+'"'));
  }
  assert.throws(() => renderSynthOneInit(2), RangeError);
  assert.equal(INIT.sampleRate, 44100);
  assert.equal(INIT.gateOffSample, 8820);
  assert.equal(INIT.voiceStopSample, 18496);
  assert.equal(INIT.points.length, 81);
  assert.deepEqual(INIT.lastActiveLevels, [0.0099384114, 0.64287013]);
  assert.ok(INIT.points.slice(42).every(pair => pair.every((v, index) => v === INIT.lastActiveLevels[index])));
  assert.ok(INIT.points.every(p => p.length === 2 && p.every(n => n >= 0 && n <= 1.01)));
  assert.ok(INIT.points[20][0] > INIT.points[40][0]);
  assert.ok(INIT.points[20][1] > INIT.points[60][1]);
});

test('both displayed traces use active samples through the final rendered frame and mark note-off', () => {
  // Independent 44.1 kHz host capture with the probe's 64-frame blocks.
  const lastActive = 18495;
  const noteOffX = (1 + 98 * 8820 / lastActive).toFixed(2);
  for (const [index, id] of ['amp', 'filter'].entries()) {
    const plot = renderSynthOneInit(0).match(new RegExp('<svg[^>]*data-init-plot="' + id + '"[^>]*>[\\s\\S]*?</svg>'))?.[0];
    assert.ok(plot);
    assert.match(plot, /role="img"/);
    assert.match(plot, /note off at 200 ms, voice ends at 419 ms/);
    assert.ok(plot.includes('x1="' + noteOffX + '" x2="' + noteOffX + '"'));
    const path = plot.match(/<path d="([^"]+)"/)[1];
    const points = [...path.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(m => m.slice(1));
    const samples = Array.from({length: 42}, (_, i) => i * 441).concat(lastActive);
    assert.deepEqual(points, samples.map((sample, i) => [
      (1 + 98 * sample / lastActive).toFixed(2),
      (22 - INIT.points[i][index] * 20).toFixed(2)
    ]));
  }
});

if (process.env.DNBOX_SYNTH_ONE_FIRMWARE) {
  test('the original compiled note path reproduces all thirteen INIT values and both measured traces', () => {
    const script = fileURLToPath(new URL('../../tools/synth-one-init/generate.py', import.meta.url));
    const result = execFileSync('python3', [script, process.env.DNBOX_SYNTH_ONE_FIRMWARE, '--check'], {encoding:'utf8'});
    assert.match(result,/13 frozen values, 81 paired envelope observations/);
  });
}
