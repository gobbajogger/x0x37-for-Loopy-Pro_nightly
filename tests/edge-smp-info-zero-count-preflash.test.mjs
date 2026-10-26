// SPDX-License-Identifier: GPL-3.0-only
// EC-20261026-013: zero-slot SMP_INFO must not silently bypass a mandatory
// preflash sample backup. This is source-only; no hardware or firmware write.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInfo, installKeepingSlots } from '../web/x0x_breaks.js';

async function simulateInstall(info) {
  const events = [];
  const link = {
    drain() {},
    send(frame) {
      assert.equal(frame[4], 15, 'only SMP_INFO is allowed before the guard');
      events.push('SMP_INFO_REQUEST');
      return true;
    },
    async read() { return [0xF0, 0x7D, 0x46, 0x4C, 15, ...info, 0xF7]; },
    close() { events.push('CLOSE'); },
  };
  const updater = {
    async find() { return { id: { model: 'SMK-37 Pro', text: 'SMK-37 Pro_900', version: 900 }, link }; },
    bind() {},
    async install() { events.push('OTA_STARTED'); return 'SMK-37 Pro_901'; },
  };
  let result = null, error = null;
  try {
    result = await installKeepingSlots(updater, new Uint8Array(), 'SMK-37 Pro_901', 'smk', {
      sameKeyboard: () => true,
      save() { events.push('BACKUP_SAVED'); },
    });
  } catch (e) { error = e; }
  return { events, result, error };
}

test('baseline: valid two-empty-slot legacy SMP_INFO permits a source-only OTA call', async () => {
  const info = [2, 80, 0, 0, 0, 0];
  const layout = parseInfo(info);
  assert.equal(layout.count, 2);
  assert.equal(layout.slots.length, 2);
  const observed = await simulateInstall(info);
  assert.equal(observed.error, null);
  assert.equal(observed.events.filter(x => x === 'OTA_STARTED').length, 1);
  assert.equal(observed.events.includes('BACKUP_SAVED'), false);
});

test('negative: zero-slot SMP_INFO count is rejected by the parser', () => {
  assert.throws(() => parseInfo([0, 80]), /SMP_INFO|slot|invalid/i);
});

test('negative: zero-slot SMP_INFO cannot trigger OTA or skip backup enforcement', async () => {
  const observed = await simulateInstall([0, 80]);
  assert.equal(observed.events.includes('OTA_STARTED'), false,
    'FAIL_BEFORE_FIX: zero-slot info currently launches OTA with no sample backup');
  assert.ok(observed.error instanceof Error,
    'the invalid layout must fail closed rather than appear as an empty keyboard');
});
