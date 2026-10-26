// SPDX-License-Identifier: GPL-3.0-only
// EC-20261027-016: preflash safety must ignore forged slot maps in package padding.
// Source baseline: NIGHTLY main 08aed72e1b96db73dea08edca09c83ba22880e9c
// Tested production module blob: dedd45cdd942bba2bb4e03e33603b6d8069242e2
import test from 'node:test';
import assert from 'node:assert/strict';
import { packageSlotMap, atRisk, crc32, flashMap, parseInfo, installKeepingSlots }
  from '../web/x0x_breaks.js';

const FLASH_OFFSET = 0x400;
const REAL_MAP_OFFSET = FLASH_OFFSET + 0x9CF00;
const DECOY_OFFSET = 0x180;
const REAL = [[0xC2000, 0x14000], [0xD6000, 0x1E000], [0xB0000, 0xB000]];
const DECOY = [[0xC2000, 0x28000], [0xD6000, 0x1E000], [0xB0000, 0xB000]];
const SLOT_INFO = [
  2, 44,
  1, 79, 76, 68, 0, 100,
  0, 0, 0,
  0x58, 1,
  0x42, 1, 40, 0, 100, 0,
  0x30, 1, 11, 0, 0, 0
];
function putRecord(image, at, entries) {
  const magic = 'X0X-SLOTMAP-1\0\0\0';
  const dv = new DataView(image.buffer, image.byteOffset, image.byteLength);
  for (let i = 0; i < magic.length; i++) image[at + i] = magic.charCodeAt(i);
  dv.setUint32(at + 16, entries.length, true);
  for (let i = 0; i < entries.length; i++) {
    dv.setUint32(at + 20 + 8 * i, entries[i][0], true);
    dv.setUint32(at + 24 + 8 * i, entries[i][1], true);
  }
  const end = at + 20 + 8 * entries.length;
  dv.setUint32(end, crc32(image.subarray(at, end)), true);
}
function packageImage(decoy = false) {
  // Synthetic logical package: a pre-flash file-list/padding area precedes
  // flash.bin's canonical slot-map location. No real firmware bytes involved.
  const image = new Uint8Array(0xA2000);
  putRecord(image, REAL_MAP_OFFSET, REAL);
  if (decoy) putRecord(image, DECOY_OFFSET, DECOY);
  return image;
}
function expectedRisk(image) {
  const layout = parseInfo(SLOT_INFO);
  return atRisk(layout, flashMap(layout), packageSlotMap(image));
}
async function preflight(image) {
  let otaCalls = 0;
  const sent = [];
  let response = null;
  const link = {
    drain() {},
    send(frame) {
      const cmd = frame[4];
      sent.push(cmd);
      if (cmd === 16) return false; // fault injection: fail sample backup read
      if (cmd !== 15) throw Error('unexpected slot command ' + cmd);
      response = [0xF0, 0x7D, 0x46, 0x4C, 15, ...SLOT_INFO, 0xF7];
      return true;
    },
    async read() { return response; },
    close() {}
  };
  const device = { link, name: 'SMK-37 Pro',
    id: { model: 'SMK-37 Pro', version: 900, text: 'SMK-37 Pro_900' } };
  const up = {
    async find() { return device; },
    bind() {},
    async install() { otaCalls++; return 'SMK-37 Pro_901'; }
  };
  let errorCode = null;
  try {
    await installKeepingSlots(up, image, 'SMK-37 Pro_901', 'smk',
      { sameKeyboard: () => true, save() { throw Error('backup should fail before download'); } });
  } catch (e) { errorCode = e.code ?? 'unexpected'; }
  return { errorCode, otaCalls, sent };
}

test('baseline: authentic flash slot map requires backup and blocks OTA if SMP_READ fails', async () => {
  const image = packageImage();
  assert.deepEqual(expectedRisk(image), [0]);
  const actual = await preflight(image);
  assert.equal(actual.errorCode, 'slotbackup');
  assert.equal(actual.otaCalls, 0);
  assert.equal(actual.sent.at(-1), 16, 'backup read must be attempted before OTA');
});

test('negative: CRC-valid earlier slot-map decoy cannot hide risky sample shrinkage', async () => {
  const image = packageImage(true);
  // The genuine flash slot at 0xC2000 shrinks from 160 KiB to 80 KiB,
  // while a fake record in padding claims it is still 160 KiB.
  assert.deepEqual(expectedRisk(image), [0], 'preflight must use the authentic map or fail closed');
  const actual = await preflight(image);
  assert.equal(actual.errorCode, 'slotbackup', 'a failed required backup must prevent OTA');
  assert.equal(actual.otaCalls, 0, 'no updater calls after a refused backup');
  assert.equal(actual.sent.at(-1), 16, 'backup read must be attempted before OTA');
});
