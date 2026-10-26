// SPDX-License-Identifier: GPL-3.0-only
// EC-20261026-014: A slot map placed outside the real flash map must never
// authorize replacing legacy application code with a Bluetooth controller.
import test from "node:test";
import assert from "node:assert/strict";
import { insertCtl, logicalImage, CTL_NO_BLOCK } from "../web/fm1pkg.js";
import { makePackage, makeController, crc32 } from "./fixtures/bundled-synthetic.mjs";

const legacyImage = () => logicalImage(makePackage("pro", {
  // Non-erased bytes represent old application code at the controller address.
  controller: Buffer.alloc(160, 0x42),
  noMap: true
}));

test("legacy application code without a slot map refuses controller insertion", () => {
  assert.throws(() => insertCtl(legacyImage(), makeController()), { message: CTL_NO_BLOCK });
});

test("forged valid slot-map record in unused package padding cannot authorize an overwrite", () => {
  const image = legacyImage();
  const map = Buffer.alloc(48);
  map.write("X0X-SLOTMAP-1\0\0\0", 0, "ascii");
  map.writeUInt32LE(3, 16);
  for (const [index, [off, size]] of [
    [0xc2000, 0x14000], [0xd6000, 0x1e000], [0xb0000, 0xb000]
  ].entries()) {
    map.writeUInt32LE(off, 20 + index * 8);
    map.writeUInt32LE(size, 24 + index * 8);
  }
  map.writeUInt32LE(crc32(map.subarray(0, 44)), 44);
  // This lies in the unused gap BEFORE flash.bin (flash begins at 0x400).
  // The actual slot-map flash address (0x9CF00) remains erased.
  const paddingOffset = 0x300;
  assert.ok(image.subarray(paddingOffset, paddingOffset + 48).every(b => b === 0xff));
  image.set(map, paddingOffset);
  // Pre-fix insertCtl checks for the magic/CRC ANYWHERE in the logical image
  // and overwrites synthetic legacy app bytes. This assertion must fail on
  // the old source and pass once the source owner verifies exact map location.
  assert.throws(() => insertCtl(image, makeController()), {
    message: CTL_NO_BLOCK
  });
});
