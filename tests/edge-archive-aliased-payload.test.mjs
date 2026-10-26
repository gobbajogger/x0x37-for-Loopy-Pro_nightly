// SPDX-License-Identifier: GPL-3.0-only
// Edge-Case Hunt EC-20261026-004: a CRC-valid backup must not alias
// two destination slots to the same serialized sample image.
// Regression only. The browser source owner owns the implementation repair.
import test from "node:test";
import assert from "node:assert/strict";
import { crc32, makeArchive, readArchive, planRestore, userSlotRaw } from "../web/x0x_breaks.js";

const layout = {
  count: 2,
  size: 81920,
  slots: [{ size: 81920 }, { size: 81920 }],
};

function image(name, data) {
  const { hdr, data: encoded } = userSlotRaw(name,
    [{ adpcm: Uint8Array.from(data), n: data.length * 2, rate: 44100 }]);
  const out = new Uint8Array(512 + encoded.length);
  out.fill(0xff);
  out.set(hdr);
  out.set(encoded, 512);
  return out;
}

function canonicalBackup() {
  return makeArchive(layout, [
    image("ONE", [1, 2, 3, 4]),
    image("TWO", [12, 13, 14, 15]),
  ], "2026-10-26T08:00:00");
}

function aliasSecondSampleToFirst(archive) {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const originalMetaLength = view.getUint32(12, true);
  const meta = JSON.parse(new TextDecoder().decode(archive.subarray(16, 16 + originalMetaLength)));
  assert.deepEqual(meta.slots.map((slot) => slot.slot), [1, 2]);
  assert.notEqual(meta.slots[0].offset, meta.slots[1].offset);

  // Keep canonical slot numbers [1,2] and both original names, but redirect
  // the second entry to the first image. The displaced second image remains in
  // the archive unreferenced. Recompute the full archive CRC to preserve it.
  meta.slots[1].offset = meta.slots[0].offset;
  meta.slots[1].length = meta.slots[0].length;
  meta.slots[1].crc32 = meta.slots[0].crc32;

  const json = new TextEncoder().encode(JSON.stringify(meta));
  const payload = archive.subarray(16 + originalMetaLength, archive.length - 4);
  const edited = new Uint8Array(16 + json.length + payload.length + 4);
  edited.set(archive.subarray(0, 16));
  const editedView = new DataView(edited.buffer);
  editedView.setUint32(12, json.length, true);
  edited.set(json, 16);
  edited.set(payload, 16 + json.length);
  editedView.setUint32(edited.length - 4, crc32(edited.subarray(0, -4)), true);
  assert.equal(editedView.getUint32(edited.length - 4, true), crc32(edited.subarray(0, -4)));
  return edited;
}

test("baseline: distinct slot images have distinct restore targets", () => {
  const original = canonicalBackup();
  const parsed = readArchive(original);
  assert.deepEqual(parsed.meta.slots.map((slot) => slot.slot), [1, 2]);
  assert.deepEqual(parsed.images.map((img) => new TextDecoder().decode(img.subarray(8, 11))), ["ONE", "TWO"]);
  const plan = planRestore(layout, parsed.images);
  assert.deepEqual(plan.todo.map((item) => item.k + 1), [1, 2]);
  assert.notDeepEqual([...plan.todo[0].img.subarray(512, 516)], [...plan.todo[1].img.subarray(512, 516)]);
});

test("negative: CRC-valid alias of slot 2 to slot 1 must be rejected before any restore", () => {
  const tampered = aliasSecondSampleToFirst(canonicalBackup());
  assert.throws(() => readArchive(tampered), Error,
    "FAIL_BEFORE_FIX: CRC-valid aliased archive maps sample ONE into both slot 1 and slot 2");
});
