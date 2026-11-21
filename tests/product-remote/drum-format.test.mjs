// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {drumDisplay} from '../../web/product-site/remote/drum-format.mjs';

const components = JSON.parse(readFileSync(new URL('../../web/product-site/remote/components.json', import.meta.url)));
const defaults = JSON.parse(readFileSync(new URL('./fixtures/drum-firmware-defaults.json', import.meta.url)));
const controls = components.screens.filter(screen => screen.path.includes('-voice-')).flatMap(screen =>
  screen.controls.map((control, index) => ({...control, expected: defaults[screen.path][index]})));

test('Draft drum displays match firmware at all captured raw settings and preserve native domains', () => {
  assert.equal(controls.length, 83);
  const unique = new Set();
  let readings = 0;
  for (const control of controls) {
    const {identity, context} = control;
    assert.equal(drumDisplay(identity, Number(context.raw)), control.expected, identity);
    if (unique.has(identity)) continue;
    unique.add(identity);
    const maximum = context.name === 'Sound' ? 1 : 127;
    for (let value = 0; value <= maximum; value++) {
      assert.ok(drumDisplay(identity, value)?.length, `${identity} at ${value}`);
      readings++;
    }
    assert.equal(drumDisplay(identity, maximum + 1), null);
    assert.equal(drumDisplay(identity, -1), null);
    assert.equal(drumDisplay(identity, 0.5), null);
  }
  assert.equal(unique.size, 63);
  assert.equal(readings, 7434);
  assert.equal(drumDisplay('1:9:0:0', 1), null);
  assert.equal(drumDisplay('__proto__', 12), null);
  assert.equal(drumDisplay('1:1:2:3', 1), 'CONGA');
  assert.equal(drumDisplay('1:0:0:5', 46), '+0.4st');
  assert.equal(drumDisplay('1:0:11:1', 126), '99%');
});

if (process.env.DNBOX_DRUM_FIRMWARE) {
  test('every rendered display matches the compiled original firmware C', () => {
    const generator = fileURLToPath(new URL('../../tools/generate-drum-displays.py', import.meta.url));
    const result = execFileSync('python3', [generator, process.env.DNBOX_DRUM_FIRMWARE, '--check'], {encoding:'utf8'});
    assert.match(result, /7434 source readouts/);
  });
}
