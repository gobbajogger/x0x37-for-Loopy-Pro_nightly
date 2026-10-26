// SPDX-License-Identifier: GPL-3.0-only
// EC-20261027-018: A canceled or unconfirmed sample-backup download must stop OTA.
// TEST ONLY: simulated WebMIDI and updater, no physical flash or device writes.
// In a NIGHTLY checkout:
//   node --test tests/edge-backup-download-confirmation-preflash.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { userSlotRaw, pack78, readArchive, installKeepingSlots } from '../web/x0x_breaks.js';

const enc14 = (value) => [value & 127, (value >> 7) & 127];
const SLOT_SIZE = 0x14000;

function occupiedLayout() {
  // One populated legacy slot at SMK flash 0xC2000, 80 KiB allocated.
  return [1, 80, 1, 65, 0, 1, 0x58, 1,
    ...enc14(0xC2), ...enc14(20), ...enc14(1)];
}

function occupiedSample() {
  const { hdr, data } = userSlotRaw('A', [{
    adpcm: new Uint8Array(64).fill(17), n: 128, rate: 44100,
  }], SLOT_SIZE);
  const out = new Uint8Array(512 + data.length).fill(255);
  out.set(hdr);
  out.set(data, 512);
  return out;
}

async function simulate(save) {
  const sample = occupiedSample();
  const events = [], saved = [], commands = [];
  let response = null;
  const link = {
    drain() { response = null; },
    send(packet) {
      const cmd = packet[4], args = packet.slice(5, -1);
      commands.push(cmd);
      let data;
      if (cmd === 15) data = occupiedLayout();
      else if (cmd === 16) {
        const slot = args[0], off = args[1] | args[2] << 7 | args[3] << 14;
        assert.equal(slot, 0);
        data = [...args.slice(0, 4),
          ...pack78(sample.subarray(off, off + args[4] * 2))];
      } else throw Error('Unexpected destructive sample command ' + cmd);
      response = [0xF0, 0x7D, 0x46, 0x4C, cmd, ...data, 0xF7];
      return true;
    },
    async read() { return response; },
    close() { events.push('MIDI_CLOSE'); },
  };
  const dev = {
    id: { text: 'SMK-37 Pro_900', model: 'SMK-37 Pro', version: 900 }, link,
  };
  const updater = {
    async find() { return dev; },
    bind() {},
    async install() {
      events.push('OTA_INSTALL_CALLED');
      return 'SMK-37 Pro_901';
    },
  };
  let result = null, error = null;
  try {
    // A non-current 64-byte synthetic image has no preserving slot map;
    // this isolates the mandatory backup gate, not package admission.
    result = await installKeepingSlots(updater, new Uint8Array(64),
      'SMK-37 Pro_901', 'smk', {
        sameKeyboard: () => true,
        save(bytes, name) {
          events.push('BACKUP_DOWNLOAD_REQUESTED');
          readArchive(bytes);
          saved.push({ bytes, name });
          return save(bytes, name);
        },
      });
  } catch (caught) { error = caught; }
  return { result, error, events, saved, commands };
}

test('control: confirmed recovery-backup download precedes simulated OTA', async () => {
  const run = await simulate(() => true);
  assert.equal(run.error, null);
  assert.equal(run.saved.length, 1);
  assert.equal(readArchive(run.saved[0].bytes).images.filter(Boolean).length, 1);
  assert.deepEqual(run.result.move.risk, [0]);
  assert.ok(run.events.indexOf('BACKUP_DOWNLOAD_REQUESTED') <
    run.events.indexOf('OTA_INSTALL_CALLED'));
  assert.ok(!run.commands.some((cmd) => [11, 12, 13, 14].includes(cmd)));
});

test('negative: asynchronously canceled download must block OTA before sample loss', async () => {
  // Browser downloads may be delayed, canceled, blocked by permissions or fail
  // after a.click(). An asynchronous save/confirmation hook returns false here.
  const run = await simulate(() => Promise.resolve(false));
  assert.equal(run.saved.length, 1, 'a CRC-valid backup was assembled in memory');
  assert.equal(run.events.includes('OTA_INSTALL_CALLED'), false,
    'FAIL_BEFORE_FIX: OTA started even though the backup download was declined');
  assert.ok(!run.commands.some((cmd) => [11, 12, 13, 14].includes(cmd)));
});
