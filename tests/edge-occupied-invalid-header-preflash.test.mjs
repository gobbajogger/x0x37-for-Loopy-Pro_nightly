// SPDX-License-Identifier: GPL-3.0-only
// EC-20261027-015: an occupied slot whose header disappears while being read
// must not become a valid "empty" pre-OTA backup. Only synthetic MIDI is used.
import { withInstallSnapshot } from './fixtures/install-snapshot.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  userSlotRaw, pack78, readSlotImage, backupSlots, makeArchive, readArchive, installKeepingSlots,
} from '../web/x0x_breaks.js';

const PREFIX = [0xF0, 0x7D, 0x46, 0x4C];
const KI_B = 1024;
const INFO = [...PREFIX, 15, 1, 80, 1, 83, 65, 70, 69, 0, 1, 0xF7];

function deviceLink(img) {
  const slot = new Uint8Array(80 * KI_B).fill(0xFF);
  slot.set(img);
  return {
    reply: null,
    commands: [],
    drain() { this.reply = null; },
    send(frame) {
      this.commands.push([...frame]);
      const cmd = frame[4];
      if (cmd === 15) {
        this.reply = [...INFO];
      } else if (cmd === 16) {
        const k = frame[5], offset = frame[6] | frame[7] << 7 | frame[8] << 14;
        const length = frame[9] * 2;
        this.reply = [...PREFIX, 16, k, frame[6], frame[7], frame[8],
          ...pack78(slot.subarray(offset, offset + length)), 0xF7];
      } else {
        throw new Error(`unexpected synthetic MIDI command ${cmd}`);
      }
      return true;
    },
    async read() { const result = this.reply; this.reply = null; return result; },
    close() {},
  };
}

function occupiedSlotImage() {
  const { hdr, data } = userSlotRaw('SAFE', [
    { adpcm: Uint8Array.from([1, 2, 3, 4]), n: 8, rate: 44100 },
  ]);
  const out = new Uint8Array(512 + data.length);
  out.set(hdr);
  out.set(data, 512);
  return out;
}

test('control: a valid occupied header is retained as a nonempty, verified archive', async () => {
  const { layout, images } = await backupSlots(deviceLink(occupiedSlotImage()));
  assert.equal(layout.slots[0].nz, 1);
  assert.equal(images[0].length, 516);
  const archive = readArchive(makeArchive(layout, images, '2026-10-27T02:14:00'));
  assert.equal(archive.meta.slots[0].empty, false);
  assert.deepEqual(archive.images[0], occupiedSlotImage());
});

test('fail closed: occupied SMP_INFO with invalid read header never proceeds to OTA', async () => {
  // Simulates header erase / torn read between SMP_INFO and SMP_READ. The device
  // still reports one occupied zone; all 512 header bytes now read as erased.
  const tornHeader = new Uint8Array(512).fill(0xFF);
  const link = deviceLink(tornHeader);
  let installs = 0;
  let saved = null;
  const updater = {
    async find() {
      return { id: { model: 'SMK-37 Pro', text: 'SMK-37 Pro_900', version: 900 },
        link };
    },
    bind() {},
    async install(_image, product) { installs++; return product; },
  };
  withInstallSnapshot(link, updater);
  // A package without a slot-map/loader is conservatively treated as writing
  // existing sample sectors, so a complete backup is mandatory first.
  await assert.rejects(
    () => installKeepingSlots(updater, new Uint8Array(80), 'SMK-37 Pro_900', 'smk', {
      sameKeyboard: () => true,
      save: (bytes) => { saved = readArchive(bytes); },
    }),
    /header|occupied|sample|slotbackup|backup|mismatch|invalid|damaged/i,
  );
  assert.equal(installs, 0, 'firmware installation must not begin after a failed occupied-slot backup');
  assert.equal(saved, null, 'no misleading empty-slot backup may be treated as verified');
  assert.ok(link.commands.every(frame => frame[4] === 15 || frame[4] === 16), 'backup failure only queries layout and reads bytes; no sample writes');
});


test('empty slot remains null without any device read or write', async () => {
  const link = deviceLink(new Uint8Array());
  assert.equal(await readSlotImage(link, 0, 0), null);
  assert.deepEqual(link.commands, []);
});

test('occupied invalid header rejects a standalone backup', async () => {
  const link = deviceLink(new Uint8Array(512).fill(0xFF));
  await assert.rejects(() => backupSlots(link), /occupied sample slot has an invalid header/);
  assert.ok(link.commands.every(frame => frame[4] === 15 || frame[4] === 16));
});
