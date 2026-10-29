// SPDX-License-Identifier: GPL-3.0-only
import { withInstallSnapshot } from './fixtures/install-snapshot.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInfo, installKeepingSlots } from '../web/x0x_breaks.js';

test('zero slots are invalid in both legacy and extended SMP_INFO', () => {
  for (const reply of [[0, 80], [0, 80, 0x58, 1]])
    assert.throws(() => parseInfo(reply), /invalid SMP_INFO slot count/);
});

test('well-formed one/two empty legacy slots and empty extended slots remain valid', () => {
  for (const reply of [
    [1, 80, 0, 0, 0],
    [2, 80, 0, 0, 0, 0, 0, 0],
    [1, 80, 0, 0, 0, 0x58, 1, 0x42, 1, 20, 0, 0, 0],
  ]) {
    const layout = parseInfo(reply);
    assert.equal(layout.count, reply[0]);
    assert.equal(layout.slots.length, reply[0]);
    assert.ok(layout.slots.every(slot => slot.nz === 0 && slot.used === 0));
  }
});

test('zero count closes the preflash link with slotbackup and only an INFO request', async () => {
  const commands = [], events = [];
  const link = {
    drain() {}, close() { events.push('close'); },
    send(frame) { commands.push(frame[4]); return true; },
    async read() { return [0xf0, 0x7d, 0x46, 0x4c, 15, 0, 80, 0xf7]; },
  };
  const updater = {
    async find() { return { link, id: { model: 'SMK-37 Pro', version: 900 } }; },
    bind() {}, async install() { events.push('OTA'); },
  };
  withInstallSnapshot(link, updater);
  await assert.rejects(installKeepingSlots(updater, new Uint8Array(), 'SMK-37 Pro_901', 'smk', {
    save() { events.push('save'); },
  }), e => e.code === 'slotbackup' && /invalid SMP_INFO slot count/.test(e.message));
  assert.deepEqual(commands, [15]);
  assert.deepEqual(events, ['close']);
});
