// SPDX-License-Identifier: GPL-3.0-only
// EC044: A truncated legacy SMP_INFO slot descriptor must fail closed before OTA.
// Sample commands stay read-only; the synthetic atomic-watch fixture records
// its separate capability/watch operations just like the existing EC026 cases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInfo, installKeepingSlots } from '../web/x0x_breaks.js';
import { withInstallSnapshot } from './fixtures/install-snapshot.mjs';

async function simulatePreflight(info) {
  const commands = [], events = [];
  const link = {
    drain() {},
    send(frame) { commands.push(frame[4]); return true; },
    async read() { return [0xF0, 0x7D, 0x46, 0x4C, 15, ...info, 0xF7]; },
    close() { events.push('CLOSE'); },
  };
  const updater = {
    async find() { return { link, id: { model: 'SMK-37 Pro', version: 900, text: 'SMK-37 Pro_900' } }; },
    bind() {},
    async install() { events.push('OTA_STARTED'); return 'SMK-37 Pro_901'; },
  };
  withInstallSnapshot(link, updater);
  let error = null;
  try {
    await installKeepingSlots(updater, new Uint8Array(), 'SMK-37 Pro_901', 'smk', {
      save() { events.push('BACKUP_SAVED'); return true; },
    });
  } catch (e) { error = e; }
  return { commands, events, error };
}

test('control: complete one-slot empty legacy descriptor permits simulated OTA', async () => {
  const reply = [1, 80, 0, 0, 0];
  const layout = parseInfo(reply);
  assert.equal(layout.count, 1);
  assert.equal(layout.slots[0].used, 0);
  const observed = await simulatePreflight(reply);
  assert.equal(observed.error, null);
  assert.deepEqual(observed.commands, [15]);
  assert.deepEqual(observed.events, ['CLOSE', 'OTA_STARTED']);
});

test('negative: a missing used-size byte is an invalid legacy slot descriptor', () => {
  assert.throws(() => parseInfo([1, 80, 0, 0]), /SMP_INFO|slot|truncat|invalid|malformed/i,
    'FAIL_BEFORE_FIX: a truncated final descriptor must never look like a valid empty slot');
});

test('negative: partial final slot cannot authorize OTA without backup', async () => {
  const observed = await simulatePreflight([1, 80, 0, 0]);
  assert.deepEqual(observed.commands, [15], 'no destructive sample commands may follow corrupt INFO');
  assert.equal(observed.events.includes('OTA_STARTED'), false,
    'FAIL_BEFORE_FIX: truncated SMP_INFO currently bypasses the preservation gate');
  assert.equal(observed.error?.code, 'slotbackup',
    'a malformed INFO descriptor must be a preflight failure');
});

test('negative: truncation of the last of two descriptors cannot look like an empty device', async () => {
  const observed = await simulatePreflight([2, 80, 0, 0, 0, 0, 0]);
  assert.deepEqual(observed.commands, [15]);
  assert.equal(observed.events.includes('OTA_STARTED'), false,
    'FAIL_BEFORE_FIX: a missing last-slot used byte must stop OTA');
  assert.equal(observed.error?.code, 'slotbackup');
});
