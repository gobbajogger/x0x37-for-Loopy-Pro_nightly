// SPDX-License-Identifier: GPL-3.0-only
// EC034: an occupied SMP_READ header must not request more bytes than the
// corresponding SMP_INFO slot capacity. Exact production page function, mocked
// WebMIDI reads; the sentinel prevents test execution from allocating 1 MiB.
// Run from NIGHTLY repository root:
// node --test tests/edge-sample-workspace-overcapacity-read.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseInfo, parseSlot, crc32, SLOT_DATA_OFF, SLOT_HDR_LEN } from '../web/x0x_breaks.js';

const page = readFileSync(new URL('../web/x0x_breaks.html', import.meta.url), 'utf8');
const start = page.indexOf('async function readSlots() {');
const end = page.indexOf('\nasync function readAll()', start);
assert.ok(start >= 0 && end > start, 'production readSlots() extraction must succeed');
const production = page.slice(start, end);
const info = [1, 8, 1, 76, 79, 79, 80, 0, 1]; // 1 occupied 8 KiB slot.
const data = Uint8Array.from([31, 40, 55, 71]);

function environment(advertisedDataLen) {
  const header = new Uint8Array(SLOT_DATA_OFF);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x504D5346, true); // FSMP
  view.setUint16(4, 1, true);
  header[6] = 1;
  header.set([76, 79, 79, 80, 0], 8); // LOOP
  view.setUint32(16, advertisedDataLen, true);
  view.setUint32(20, crc32(data), true);
  assert.equal(parseSlot(header.subarray(0, SLOT_HDR_LEN))?.dataLen, advertisedDataLen);
  const calls = [];
  const readBytes = async (slot, offset, size) => {
    calls.push({ slot, offset, size });
    if (offset === 0) return header;
    // Fail safely before allocating an unreasonable Uint8Array in this test.
    if (size > 65536) throw new Error('EC034_SAFE_OVERSIZE_INTERCEPT');
    return data.slice(0, size);
  };
  const progress = { hidden: true, value: 0 };
  const readSlots = runInNewContext(`${production}\nreadSlots;`, {
    link: { req: async (command) => {
      assert.equal(command, 15);
      return info;
    } },
    parseInfo, parseSlot, crc32, readBytes,
    SLOT_DATA_OFF, SLOT_HDR_LEN,
    $: (id) => {
      assert.equal(id, 'progress');
      return progress;
    },
  });
  return { readSlots, calls, progress };
}

test('valid occupied 8 KiB sample slot keeps its bytes', async () => {
  const ctx = environment(data.length);
  const snapshot = await ctx.readSlots();
  assert.equal(snapshot.lay.slots[0].size, 8192);
  assert.equal(snapshot.dev[0].image.length, SLOT_DATA_OFF + data.length);
  assert.deepEqual(Array.from(snapshot.dev[0].data), Array.from(data));
  assert.deepEqual(ctx.calls.map(({ offset, size }) => [offset, size]), [[0, 512], [512, 4]]);
});

test('oversized occupied-slot header fails before requesting or allocating sample data', async () => {
  const ctx = environment(1048576); // 1 MiB in a declared 8 KiB slot.
  await assert.rejects(ctx.readSlots(), /can't send its loops back|slot capacity|invalid header/i);
  // Red on NIGHTLY main: readSlots issues SMP_READ(0,512,1048576).
  assert.deepEqual(ctx.calls.map(({ offset, size }) => [offset, size]), [[0, 512]],
    'over-capacity images must be rejected from the header before any data read');
});
