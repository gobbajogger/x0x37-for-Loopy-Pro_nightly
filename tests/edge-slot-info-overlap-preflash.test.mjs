// SPDX-License-Identifier: GPL-3.0-only
// EC-20261026-012: corrupt/overlapping SMP_INFO flash offsets must not skip a
// mandatory pre-update sample backup. Run in NIGHTLY checkout:
// node --test tests/edge-slot-info-overlap-preflash.test.mjs
// No physical hardware or actual firmware transfer: updater and MIDI transport are mocked.
import { withInstallSnapshot } from './fixtures/install-snapshot.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, userSlotRaw, pack78, readArchive, parseInfo, flashMap, atRisk,
  installKeepingSlots } from '../web/x0x_breaks.js';

import { makePackage } from './fixtures/bundled-synthetic.mjs';
import { logicalImage } from '../web/fm1pkg.js';

const enc14 = x => [x & 127, (x >> 7) & 127];
const OLD_SLOT_A = 0xC2000;
const OLD_SLOT_B = 0xD6000;
const SLOT_SIZE = 0x14000;

function slotInfo(secondOffset, afterUpdate = false) {
  const r = afterUpdate
    ? [1, 80, 1, 65, 0, 1, 0x58, 1]
    : [2, 80, 1, 65, 0, 1, 1, 66, 0, 1, 0x58, 1];
  const extension = afterUpdate
    ? [[0xC2, 20, 1]]
    : [[0xC2, 20, 1], [secondOffset >> 12, 20, 1]];
  for (const part of extension) for (const value of part) r.push(...enc14(value));
  return r;
}

function sampleImage(name) {
  const { hdr, data } = userSlotRaw(name, [
    { adpcm: new Uint8Array(64).fill(17), n: 128, rate: 44100 },
  ], SLOT_SIZE);
  const img = new Uint8Array(512 + data.length).fill(255);
  img.set(hdr);
  img.set(data, 512);
  return img;
}

function replacementFirmware() {
  return logicalImage(makePackage('pro', {slotMap: [[OLD_SLOT_A, SLOT_SIZE]]}));
}

async function simulateInstall(secondOffset) {
  const images = [sampleImage('A'), sampleImage('B')];
  const events = [], commands = [], saved = [];
  let installed = false, response = null;
  const link = {
    drain() { response = null; },
    send(request) {
      const cmd = request[4], args = request.slice(5, -1);
      commands.push(cmd);
      let data;
      if (cmd === 15) data = slotInfo(secondOffset, installed);
      else if (cmd === 16) {
        const k = args[0], addr = args[1] | args[2] << 7 | args[3] << 14;
        data = [...args.slice(0, 4),
          ...pack78(images[k].subarray(addr, addr + args[4] * 2))];
      } else {
        throw Error(`Unexpected destructive MIDI sample command ${cmd}`);
      }
      response = [0xF0, 0x7D, 0x46, 0x4C, cmd, ...data, 0xF7];
      return true;
    },
    async read() { return response; },
    close() { events.push('link.close'); },
  };
  const device = {
    id: { text: 'SMK-37 Pro_900', model: 'SMK-37 Pro', version: 900 },
    link,
  };
  const updater = {
    async find() { return device; },
    bind() { events.push('bind'); },
    async install() {
      events.push('OTA_INSTALL_INVOKED');
      installed = true;
      return 'SMK-37 Pro_901';
    },
    async waitFor() { return device; },
  };
  withInstallSnapshot(link, updater);
  let result = null, error = null;
  try {
    result = await installKeepingSlots(updater, replacementFirmware(),
      'SMK-37 Pro_901', 'smk', {
        sameKeyboard: () => true,
        save(bytes, name) {
          events.push('BACKUP_SAVED');
          saved.push({ bytes, name });
          return true; // Simulated explicit retained-backup acknowledgement.
        },
      });
  } catch (e) { error = e; }
  return { result, error, events, commands, saved };
}

test('baseline: distinct occupied SMP_INFO offsets save both slots BEFORE OTA install', async () => {
  const layout = parseInfo(slotInfo(OLD_SLOT_B));
  assert.deepEqual(flashMap(layout), [
    { off: OLD_SLOT_A, size: SLOT_SIZE }, { off: OLD_SLOT_B, size: SLOT_SIZE },
  ]);
  assert.deepEqual(atRisk(layout, flashMap(layout),
    [{ off: OLD_SLOT_A, size: SLOT_SIZE }]), [1]);
  const r = await simulateInstall(OLD_SLOT_B);
  assert.equal(r.error, null);
  assert.equal(r.saved.length, 1);
  assert.equal(readArchive(r.saved[0].bytes).images.filter(Boolean).length, 2);
  assert.ok(r.events.indexOf('BACKUP_SAVED') < r.events.indexOf('OTA_INSTALL_INVOKED'));
  assert.deepEqual(r.result.move.risk, [1]);
  assert.ok(!r.commands.some(cmd => [11, 12, 13, 14].includes(cmd)),
    'simulation must not write, erase, or flash real sample slots');
});

test('negative: duplicate occupied flash offsets fail closed before OTA starts', async () => {
  const r = await simulateInstall(OLD_SLOT_A);
  assert.ok(r.error instanceof Error,
    'FAIL_BEFORE_FIX: overlapping SMP_INFO was accepted as a safe, no-backup layout');
  assert.equal(r.events.includes('OTA_INSTALL_INVOKED'), false,
    'must refuse the update before any firmware write when the slot map is ambiguous');
  assert.ok(!r.commands.some(cmd => [11, 12, 13, 14].includes(cmd)));
});
