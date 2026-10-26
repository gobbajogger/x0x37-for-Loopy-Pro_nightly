// SPDX-License-Identifier: GPL-3.0-only
// Exact production identity parser plus a synthetic WebMIDI discovery path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Updater, pack7, unpack7 } from '../web/fm1ota.js';

const source = readFileSync(new URL('../web/fm1ota.js', import.meta.url), 'utf8');
const fn = source.match(/function parseIdentity\(pkt\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(fn, 'test must execute the actual production parser');
const parseIdentity = new Function('pack7', 'unpack7', `${fn}\nreturn parseIdentity;`)(pack7, unpack7);
function raw(text = 'SMK-37 Elite_900') {
  const payload = new Array(27).fill(0);
  [...new TextEncoder().encode(text)].forEach((x, i) => { payload[i] = x; });
  assert.equal(payload.length, 27, 'fixture identity must fit the firmware envelope');
  return [0, 0x59, 0x11, 27, 0, 0, ...payload, ~payload.reduce((a, b) => a + b, 0) & 255];
}
const frame = body => [0xF0, ...pack7(body), 0xF7];
for (const name of ['FM-1_015', 'FM-1_016', 'SMK-37 Pro_016', 'SMK-37 Elite_016',
  'SMK-37 Elite_900', 'ota-SMK-37 Elite_900', 'MKE-P37_900', 'Felucca_000']) {
  test(`valid current/legacy identity ${name} remains accepted`, () => {
    assert.equal(parseIdentity(Uint8Array.from(frame(raw(name)))).text, name);
  });
}
for (const length of [0, 26, 28, 27 + 256, 27 + 65536]) {
  test(`contradictory 24-bit payload length ${length} is rejected`, () => {
    const body = raw(); body[3] = length & 255; body[4] = length >> 8 & 255; body[5] = length >> 16 & 255;
    assert.equal(parseIdentity(frame(body)), null);
  });
}
for (const [name, mutate] of [
  ['missing F0', x => { x[0] = 0; }],
  ['missing F7', x => { x[x.length - 1] = 0; }],
  ['interior status byte', x => { x[10] |= 128; }],
  ['nonzero packed padding', x => { x[x.length - 2] |= 64; }],
  ['truncated frame', x => { x.splice(10, 1); }],
  ['extra packed octet', x => { x.splice(-1, 0, 0); }],
]) {
  test(`${name} is rejected before identity admission`, () => {
    const bytes = frame(raw()); mutate(bytes); assert.equal(parseIdentity(bytes), null);
  });
}
test('a different version with a correct checksum is valid framing, not authenticated identity', () => {
  assert.equal(parseIdentity(frame(raw('SMK-37 Elite_901'))).version, 901);
});
test('malformed identity followed by valid identity does not poison discovery', async () => {
  const invalid = raw(); invalid[33] ^= 1;
  const input = { name: 'SMK-37 Elite MIDI', state: 'connected', onmidimessage: null, async open() {} };
  const output = { name: input.name, state: 'connected', async open() {}, send() {
    for (const body of [invalid, raw()]) input.onmidimessage({ data: Uint8Array.from(frame(body)) });
  } };
  const updater = new Updater({ inputs: new Map([['in', input]]), outputs: new Map([['out', output]]) });
  const dev = await updater.find();
  assert.equal(dev.id.text, 'SMK-37 Elite_900');
  assert.equal(updater.target, null, 'discovery itself does not bind a target');
  dev.link.close();
});
