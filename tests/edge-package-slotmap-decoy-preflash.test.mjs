// SPDX-License-Identifier: GPL-3.0-only
// EC-20261027-016: preflash safety must ignore forged slot maps in package padding.
// Source baseline: NIGHTLY main 08aed72e1b96db73dea08edca09c83ba22880e9c
// Tested production module blob: dedd45cdd942bba2bb4e03e33603b6d8069242e2
import { withInstallSnapshot } from './fixtures/install-snapshot.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { packageSlotMap, atRisk, crc32, flashMap, parseInfo, installKeepingSlots }
  from '../web/x0x_breaks.js';

import { makePackage } from './fixtures/bundled-synthetic.mjs';
import { logicalImage } from '../web/fm1pkg.js';
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
  const image = logicalImage(makePackage("pro", {slotMap: REAL}));
  if (decoy) putRecord(image, DECOY_OFFSET, DECOY);
  return image;
}
function expectedRisk(image) {
  const layout = parseInfo(SLOT_INFO);
  return atRisk(layout, flashMap(layout), packageSlotMap(image));
}
async function preflight(image, empty = false) {
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
      response = [0xF0, 0x7D, 0x46, 0x4C, 15, ...(empty ? [2,44,0,0,0,0,0,0,0x58,1,0x42,1,40,0,0,0,0x30,1,11,0,0,0] : SLOT_INFO), 0xF7];
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
  withInstallSnapshot(link, up);
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
  assert.ok(actual.sent.every(c => c === 15 || c === 16), 'no sample writes during failed preservation');
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
  assert.ok(actual.sent.every(c => c === 15 || c === 16), 'no sample writes during failed preservation');
});


test('authentic map follows relocated flash.bin and ignores padding decoy', () => {
  const image = logicalImage(makePackage('pro', {flashOffset: 0x800, slotMap: REAL}));
  putRecord(image, DECOY_OFFSET, DECOY);
  assert.deepEqual(packageSlotMap(image), REAL.map(([off,size])=>({off,size})));
});

test('FM-1 uses its own flash-relative map address', () => {
  const map = [[0xA0000,0x14000],[0xB4000,0x14000],[0xC8000,0x14000]];
  const image = logicalImage(makePackage('pro', {slotMap: map, slotMapOffset: 0x92F00}));
  assert.deepEqual(packageSlotMap(image,'fm1'),map.map(([off,size])=>({off,size})));
});

test('unverified package header with valid decoy cannot bypass backup or reach OTA', async () => {
  const image = packageImage(true); image[0] ^= 1;
  assert.deepEqual(packageSlotMap(image),[]);
  const actual=await preflight(image);
  assert.equal(actual.errorCode,'slotbackup');assert.equal(actual.otaCalls,0);
  assert.ok(actual.sent.every(c=>c===15||c===16));
});

test('legacy map requires a valid package loader, never a padding marker', () => {
  assert.equal(packageSlotMap(logicalImage(makePackage('pro',{noMap:true}))).length,2);
  assert.deepEqual(packageSlotMap(new TextEncoder().encode('FELUCCA-LOADER-1')),[]);
});

test('known empty device needs no backup or sample write', async () => {
  const actual=await preflight(packageImage(true),true);
  assert.equal(actual.errorCode,null);assert.equal(actual.otaCalls,1);
  assert.deepEqual(actual.sent,[15]);
});


test('map inspection leaves Buffer and nonzero-offset input bytes unchanged', () => {
  const source=Buffer.from(packageImage(true));const outer=Buffer.alloc(source.length+20);source.copy(outer,7);
  const view=outer.subarray(7,7+source.length),before=Buffer.from(outer);
  assert.deepEqual(packageSlotMap(view),REAL.map(([off,size])=>({off,size})));
  assert.deepEqual(outer,before);
});


for (const [type,name] of [[0,'other.bin'],[0,'flash.bin'],[100,'other.bin'],[100,'ota.bin']]) {
 test(`conflicting package file type ${type} (${name}) cannot hide the installed map`,async()=>{
   const real=logicalImage(makePackage('pro',{slotMap:REAL})).subarray(FLASH_OFFSET,FLASH_OFFSET+0x9d000);
   const image=logicalImage(makePackage('pro',{slotMap:DECOY,extraFiles:[[type,name,Buffer.from(real)]]}));
   assert.deepEqual(packageSlotMap(image),[]);
   const result=await preflight(image);
   assert.equal(result.errorCode,'slotbackup');assert.equal(result.otaCalls,0);
   assert.ok(result.sent.every(c=>c===15||c===16));
 });
}
