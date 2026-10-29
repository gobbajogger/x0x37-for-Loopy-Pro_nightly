// SPDX-License-Identifier: GPL-3.0-only
// EC-20261027-031: a one-byte NZ corruption cannot authorize an unbacked OTA.
// TEST ONLY. Web MIDI traffic and updater are simulated; no hardware is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInfo, installKeepingSlots } from '../web/x0x_breaks.js';
import { withInstallSnapshot } from './fixtures/install-snapshot.mjs';

const descriptor = (nz, name, used) => [nz, ...Array.from(name, ch => ch.charCodeAt(0)), 0, used];
const extension = [0x58, 1,
  66, 1, 20, 0, 1, 0,    // SMK slot 1: 0xC2000, 80 KiB, 1 KiB used
  86, 1, 30, 0, 0, 0,    // SMK slot 2: 0xD6000, 120 KiB, empty
  48, 1, 11, 0, 0, 0];   // SMK slot 3: 0xB0000, 44 KiB, empty

const occupied = [3, 44,
  ...descriptor(1, 'LOOP', 1), ...descriptor(0, '', 0), ...descriptor(0, '', 0),
  ...extension];
const trulyEmpty = [3, 44,
  ...descriptor(0, '', 0), ...descriptor(0, '', 0), ...descriptor(0, '', 0),
  ...extension.slice(0, 6), 0, 0, ...extension.slice(8)];
const corrupt = [...occupied];
corrupt[2] = 0; // Exactly ONE byte changed: occupied NZ=1 -> empty NZ=0.

function rig(smpInfo) {
  const events = [];
  let pending = null;
  const link = {
    drain() { pending = null; },
    send(frame) {
      const cmd = frame[4];
      events.push(`cmd:${cmd}`);
      if (cmd === 15) {
        pending = [0xF0, 0x7D, 0x46, 0x4C, 15, ...smpInfo, 0xF7];
        return true;
      }
      if (cmd === 16) return false; // Intentionally unavailable read: must block OTA.
      throw new Error(`Unexpected project/sample command ${cmd}`);
    },
    async read() { const pkt = pending; pending = null; return pkt; },
    close() {},
  };
  const updater = {
    async find() {
      return { link, name: 'SMK-37 Pro', id: { model: 'SMK-37 Pro', text: 'SMK-37 Pro_900' } };
    },
    bind() {},
    async install() { events.push('OTA_BEGIN'); return 'SMK-37 Pro_900'; },
  };
  withInstallSnapshot(link, updater);
  const run = () => installKeepingSlots(updater, new Uint8Array(128),
    'SMK-37 Pro_900', 'smk', { sameKeyboard: (a, b) => a === b, save() { return false; } });
  return { events, run };
}

test('consistent occupied slot blocks OTA when backup read fails', async () => {
  const parsed = parseInfo(occupied);
  assert.equal(parsed.slots[0].nz, 1);
  assert.equal(parsed.slots[0].used, 1);
  const { run, events } = rig(occupied);
  await assert.rejects(run(), err => err.code === 'slotbackup');
  assert.ok(events.includes('cmd:16'), 'required backup read was attempted');
  assert.ok(!events.includes('OTA_BEGIN'), 'OTA was not started');
});

test('legitimate empty slot descriptors preserve normal OTA admission', async () => {
  const parsed = parseInfo(trulyEmpty);
  assert.ok(parsed.slots.every(slot => slot.nz === 0 && slot.used === 0 && !slot.name));
  const { run, events } = rig(trulyEmpty);
  await run();
  assert.deepEqual(events, ['cmd:15', 'OTA_BEGIN']);
});

test('EC031: NZ corruption conflicting with name and used-size must stop OTA', async () => {
  assert.equal(occupied.length, corrupt.length);
  assert.deepEqual(occupied.flatMap((n, i) => n !== corrupt[i] ? [i] : []), [2]);
  const { run, events } = rig(corrupt);
  await assert.rejects(run(), 'contradictory SMP_INFO must fail closed before flashing');
  assert.ok(!events.includes('OTA_BEGIN'), 'OTA must not begin after contradictory metadata');
});
