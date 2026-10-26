// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, makeArchive, readArchive, parseHeader, userSlotRaw } from '../web/x0x_breaks.js';

const layout = { count: 3, size: 81920, slots: [{ size: 81920 }, { size: 122880 }, { size: 45056 }] };
function image(name, seed = 1) {
  const { hdr, data } = userSlotRaw(name, [
    { adpcm: Uint8Array.from([seed, seed + 1, seed + 2]), n: 5, rate: 22050 },
    { adpcm: Uint8Array.from([seed + 3, seed + 4]), n: 4, rate: 44100 },
  ]);
  const bytes = new Uint8Array(512 + data.length).fill(255);
  bytes.set(hdr); bytes.set(data, 512);
  return bytes;
}
const backup = () => makeArchive(layout, [image('ONE'), null, image('THREE', 9)], '2026-10-26T10:00:00Z');
function edit(archive, change) {
  const n = new DataView(archive.buffer, archive.byteOffset, archive.byteLength).getUint32(12, true);
  const meta = JSON.parse(new TextDecoder().decode(archive.subarray(16, 16 + n)));
  const state = { meta, payload: archive.slice(16 + n, -4), header: archive.slice(0, 16) };
  change(state);
  const js = new TextEncoder().encode(JSON.stringify(state.meta));
  const bytes = new Uint8Array(16 + js.length + state.payload.length + 4);
  bytes.set(state.header); bytes.set(js, 16); bytes.set(state.payload, 16 + js.length);
  const v = new DataView(bytes.buffer);
  v.setUint32(12, js.length, true);
  v.setUint32(bytes.length - 4, crc32(bytes.subarray(0, -4)), true);
  return bytes;
}

test('real archive roundtrip retains interspersed empty slots, multizone data and nonzero buffer offset', () => {
  const original = backup(), padded = new Uint8Array(original.length + 13);
  padded.set(original, 7);
  const { images } = readArchive(padded.subarray(7, 7 + original.length));
  assert.deepEqual(images.map(x => x && parseHeader(x).name), ['ONE', null, 'THREE']);
  assert.deepEqual(images[0], image('ONE'));
  assert.deepEqual(images[2], image('THREE', 9));
});

test('genuine all-empty archive remains valid and contains no payload', () => {
  const { images } = readArchive(makeArchive(layout, [null, null, null], '2026-10-26T10:00:00Z'));
  assert.deepEqual(images, [null, null, null]);
});

for (const [label, change] of [
  ['alias', s => { s.meta.slots[2].offset = 0; }],
  ['gap', s => { s.meta.slots[0].offset = 1; }],
  ['negative offset', s => { s.meta.slots[0].offset = -1; }],
  ['fractional length', s => { s.meta.slots[0].length += 0.5; }],
  ['string offset', s => { s.meta.slots[0].offset = '0'; }],
  ['out-of-range length', s => { s.meta.slots[0].length = Number.MAX_SAFE_INTEGER; }],
  ['CRC type', s => { s.meta.slots[0].crc32 = String(s.meta.slots[0].crc32); }],
  ['false empty', s => { s.meta.slots[0].empty = true; }],
  ['nonboolean empty', s => { s.meta.slots[0].empty = 0; }],
  ['empty with display metadata', s => { s.meta.slots[1].name = 'UNTRUE'; }],
  ['unreferenced trailing payload', s => { s.payload = Uint8Array.from([...s.payload, 0]); }],
  ['wrong format', s => { s.meta.format = 'other'; }],
  ['wrong metadata version', s => { s.meta.version = 2; }],
  ['fractional count', s => { s.meta.count = 3.1; }],
  ['reserved framing flags', s => { s.header[10] = 1; }],
  ['source size too small', s => { s.meta.slots[0].size = 512; }],
]) {
  test(`CRC-valid ${label} is refused before restore`, () => {
    assert.throws(() => readArchive(edit(backup(), change)));
  });
}

for (const [field, value] of [
  ['name', 'FALSE'], ['zones', 1], ['samples', [5, 3]], ['rates', [44100, 44100]],
  ['data_len', 0], ['data_crc32', 0],
]) {
  test(`preview ${field} must agree with embedded image`, () => {
    assert.throws(() => readArchive(edit(backup(), s => { s.meta.slots[0][field] = value; })), /metadata/);
  });
}

test('false-empty with image fields stripped cannot leave the original payload hidden', () => {
  const forged = edit(backup(), s => {
    s.meta.slots[0] = { slot: 1, size: 81920, empty: true };
  });
  assert.throws(() => readArchive(forged));
});

test('CRC-valid image with an out-of-bounds zone is refused', () => {
  const forged = edit(backup(), s => {
    new DataView(s.payload.buffer).setUint32(32, 0xFFFFFFFF, true);
    s.meta.slots[0].crc32 = crc32(s.payload.subarray(0, s.meta.slots[0].length));
  });
  assert.throws(() => readArchive(forged), /zone/);
});

test('metadata framing cannot run past payload and final CRC', () => {
  const forged = backup();
  const v = new DataView(forged.buffer);
  v.setUint32(12, 0xFFFFFFFF, true);
  v.setUint32(forged.length - 4, crc32(forged.subarray(0, -4)), true);
  assert.throws(() => readArchive(forged), /metadata/);
});
