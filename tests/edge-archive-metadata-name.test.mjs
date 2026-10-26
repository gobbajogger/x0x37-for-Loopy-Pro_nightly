// SPDX-License-Identifier: GPL-3.0-only
// Edge-Case Hunt EC-20261026-006: the restore confirmation labels samples
// using archive metadata, so metadata names must match embedded slot headers.
// Test-only regression; the existing browser/installer owner owns the repair.
import test from "node:test";
import assert from "node:assert/strict";
import { crc32, makeArchive, readArchive, planRestore, parseHeader, userSlotRaw } from "../web/x0x_breaks.js";

const layout = {
  count: 2,
  size: 81920,
  slots: [{ size: 81920 }, { size: 81920 }],
};

function image(name, bytes) {
  const { hdr, data } = userSlotRaw(name, [
    { adpcm: Uint8Array.from(bytes), n: bytes.length * 2, rate: 44100 },
  ]);
  const result = new Uint8Array(512 + data.length);
  result.fill(0xff);
  result.set(hdr);
  result.set(data, 512);
  return result;
}

function validArchive() {
  return makeArchive(layout, [
    image("ONE", [1, 2, 3, 4]),
    image("TWO", [5, 6, 7, 8]),
  ], "2026-10-26T08:00:00");
}

function changeOnlyDisplayedName(archive) {
  const result = archive.slice();
  const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
  const metadataLength = view.getUint32(12, true);
  const meta = JSON.parse(new TextDecoder().decode(result.subarray(16, 16 + metadataLength)));
  assert.deepEqual(meta.slots.map((entry) => entry.slot), [1, 2]);
  assert.equal(meta.slots[0].name, "ONE");

  // Equal ASCII byte length deliberately leaves payload offsets untouched.
  // Both embedded slot images, their checksums and slot identities are genuine.
  meta.slots[0].name = "YES";
  const encoded = new TextEncoder().encode(JSON.stringify(meta));
  assert.equal(encoded.length, metadataLength);
  result.set(encoded, 16);
  view.setUint32(result.length - 4, crc32(result.subarray(0, result.length - 4)), true);
  assert.equal(view.getUint32(result.length - 4, true),
    crc32(result.subarray(0, result.length - 4)));
  return result;
}

test("baseline valid backup presents and restores matching sample names", () => {
  const parsed = readArchive(validArchive());
  assert.deepEqual(parsed.meta.slots.map((entry) => entry.name), ["ONE", "TWO"]);
  assert.deepEqual(parsed.images.map((item) => parseHeader(item).name), ["ONE", "TWO"]);
  assert.deepEqual(planRestore(layout, parsed.images).todo.map((item) => item.k), [0, 1]);
});

test("CRC-valid but false sample-name metadata must be rejected before restore confirmation", () => {
  const forged = changeOnlyDisplayedName(validArchive());
  // Currently red: readArchive accepts display name YES while slot-1's
  // parsed header still says ONE. web/x0x_breaks.html uses meta.slots[].name
  // in the confirmation dialog and planRestore would write the actual ONE.
  assert.throws(() => readArchive(forged),
    /metadata|name|mismatch|damaged|invalid|corrupt/i,
    "FAIL_BEFORE_FIX: altered preview name was accepted despite an intact, different slot image");
});
