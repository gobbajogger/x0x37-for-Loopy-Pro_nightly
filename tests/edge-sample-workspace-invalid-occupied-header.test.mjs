// SPDX-License-Identifier: GPL-3.0-only
// EC-20261027-033. Test-only negative regression for the sample workspace.
// Source baseline: NIGHTLY main 3735b1e41a6673675f9cb796b6ac7307308a4f6f.
// `readSlots()` must not report an occupied slot as empty when SMP_READ returns
// an invalid header. This source path is distinct from x0x_breaks.js::backupSlots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseInfo, parseSlot, crc32, makeArchive, readArchive,
  SLOT_DATA_OFF, SLOT_HDR_LEN } from '../web/x0x_breaks.js';

const page = readFileSync(new URL('../web/x0x_breaks.html', import.meta.url), 'utf8');
const start = page.indexOf('async function readSlots() {');
const end = page.indexOf('\nasync function readAll()', start);
assert.ok(start >= 0 && end > start, 'actual production sample readSlots() must be present');
const production = page.slice(start, end);
const occupiedInfo = [1, 80, 1, 76, 79, 79, 80, 0, 1]; // SLOT 1, one zone, 1 KiB used
const emptyInfo = [1, 80, 0, 0, 0];
const sample = Uint8Array.from([15, 5]);
const validHeader = Uint8Array.from({ length: SLOT_DATA_OFF }, () => 255);
const headerView = new DataView(validHeader.buffer);
headerView.setUint32(0, 0x504d5346, true);   // FSMP
headerView.setUint16(4, 1, true);
validHeader[6] = 1;
validHeader.set([76, 79, 79, 80, 0], 8);   // LOOP\0
headerView.setUint32(16, sample.length, true);
headerView.setUint32(20, crc32(sample), true);
headerView.setUint32(32, 0, true);          // ADPCM zone byte offset
headerView.setUint32(36, 4, true);          // Four decoded samples
headerView.setUint32(48, 65536, true);     // 1x pitch rate Q16
validHeader[56] = 0;                      // Root semitone
const corruptHeader = validHeader.slice();
corruptHeader[0] = 0;                     // One-byte invalid FSMP magic

async function snapshot(info, head) {
  const calls = [];
  const link = { async req(cmd) { calls.push(['req', cmd]); return info; } };
  const readBytes = async (slot, off, len) => {
    calls.push(['read', slot, off, len]);
    return off === 0 ? head : sample;
  };
  const progress = { hidden: true, value: 0 };
  const actualReadSlots = new Function('parseInfo', 'parseSlot', 'crc32', 'link',
    'readBytes', '$', 'SLOT_DATA_OFF', 'SLOT_HDR_LEN',
    production + '\nreturn readSlots;')(
    parseInfo, parseSlot, crc32, link, readBytes,
    () => progress, SLOT_DATA_OFF, SLOT_HDR_LEN);
  return { result: await actualReadSlots(), calls };
}

function archiveOf(result) {
  return readArchive(makeArchive(result.lay,
    result.dev.map((entry) => entry ? entry.image : null),
    '2026-10-27T10:45:00'));
}

test('control: genuinely empty slot can safely produce an empty archive entry', async () => {
  const { result, calls } = await snapshot(emptyInfo, corruptHeader);
  assert.equal(result.lay.slots[0].nz, 0);
  assert.equal(result.dev[0], null);
  assert.equal(archiveOf(result).meta.slots[0].empty, true);
  assert.deepEqual(calls, [['req', 15]]);
});

test('control: valid occupied header is read and retained byte-exactly', async () => {
  const { result, calls } = await snapshot(occupiedInfo, validHeader);
  assert.equal(result.lay.slots[0].nz, 1);
  assert.equal(result.dev[0].image.length, SLOT_DATA_OFF + sample.length);
  assert.equal(archiveOf(result).meta.slots[0].empty, false);
  assert.deepEqual(calls.map(([kind]) => kind), ['req', 'read', 'read']);
});

test('negative: occupied slot with an invalid read header must fail closed', async () => {
  await assert.rejects(snapshot(occupiedInfo, corruptHeader), /invalid|header|read|slot|send/i,
    'FAIL_BEFORE_FIX: sample workspace silently skipped corrupted occupied slot, ' +
    'so the downloadable archive falsely marked it empty');
});