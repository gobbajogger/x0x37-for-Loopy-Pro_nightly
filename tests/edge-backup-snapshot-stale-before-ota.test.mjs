// SPDX-License-Identifier: GPL-3.0-only
// EC-20261027-026: the saved preflash recovery image must still describe the
// device at the irreversible OTA boundary, not just at the start of backup.
// TEST ONLY: synthetic SMP_INFO/SMP_READ and stub OTA; no real MIDI or flash.
// Run from a NIGHTLY checkout:
//   node --test tests/edge-backup-snapshot-stale-before-ota.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { withInstallSnapshot } from './fixtures/install-snapshot.mjs';
import { userSlotRaw, pack78, readArchive, installKeepingSlots } from '../web/x0x_breaks.js';

const PREFIX = [0xF0, 0x7D, 0x46, 0x4C];
const INFO = [1, 80, 1, 76, 79, 79, 80, 0, 1, 0x58, 1, 0x42, 1, 20, 0, 1, 0];

function image(marker) {
  const { hdr, data } = userSlotRaw('LOOP', [
    { adpcm: new Uint8Array(64).fill(marker), n: 128, rate: 44100 },
  ], 0x14000);
  const out = new Uint8Array(512 + data.length).fill(255);
  out.set(hdr);
  out.set(data, 512);
  return out;
}

async function simulate({ mutateDuringConfirmation = false } = {}) {
  const original = image(0x11), replacement = image(0x33);
  const state = {
    current: original, backup: null, events: [], commands: [], readsAtConfirmation: 0,
  };
  const link = {
    response: null,
    drain() { this.response = null; },
    send(frame) {
      const command = frame[4], args = frame.slice(5, -1);
      state.commands.push(command);
      let payload;
      if (command === 15) payload = INFO;
      else if (command === 16) {
        const offset = args[1] | args[2] << 7 | args[3] << 14;
        payload = [...args.slice(0, 4),
          ...pack78(state.current.subarray(offset, offset + args[4] * 2))];
      } else throw new Error('Unexpected destructive MIDI command: ' + command);
      this.response = [...PREFIX, command, ...payload, 0xF7];
      return true;
    },
    async read() { return this.response; },
    close() { state.events.push('CLOSE_PREFLIGHT_LINK'); },
  };
  const updater = {
    async find() {
      return { id: { model: 'SMK-37 Pro', version: 900, text: 'SMK-37 Pro_900' }, link };
    },
    bind() {},
    async install() {
      state.events.push('OTA_START');
      return 'SMK-37 Pro_901';
    },
  };
  state.snapshot = withInstallSnapshot(link, updater);
  let result = null, error = null;
  try { result = await installKeepingSlots(updater, new Uint8Array(64),
    'SMK-37 Pro_901', 'smk', {
      sameKeyboard: () => true,
      async save(archive) {
        const parsed = readArchive(archive);
        state.backup = parsed.images[0];
        state.events.push('RECOVERY_BACKUP_ASSEMBLED');
        state.readsAtConfirmation = state.commands.filter(c => c === 16).length;
        if (mutateDuringConfirmation) {
          // External sample transfer changes real bytes but leaves SMP_INFO:
          // same slot number, occupied count, used KiB, name and capacity.
          state.current = replacement;
          state.snapshot.changed(); // Firmware observes the external sample mutation.
          state.events.push('SAMPLE_CHANGED_WHILE_USER_CONFIRMED_BACKUP');
        }
        // The browser user confirms they retained the old recovery archive.
        state.events.push('USER_CONFIRMS_ARCHIVE_RETAINED');
        return true;
      },
    }); } catch (e) { error = e; }
  return { result, error, state, original, replacement };
}

test('control: unchanged sample image and confirmed backup allow OTA', async () => {
  const { result, error, state, original } = await simulate();
  assert.equal(error, null);
  assert.deepEqual(result.move.risk, [0]);
  assert.deepEqual(state.backup, original);
  assert.deepEqual(state.current, state.backup);
  assert.deepEqual(state.events, [
    'RECOVERY_BACKUP_ASSEMBLED', 'USER_CONFIRMS_ARCHIVE_RETAINED',
    'CLOSE_PREFLIGHT_LINK', 'OTA_START',
  ]);
  assert.ok(state.commands.every(c => c === 15 || c === 16));
});

test('negative: new sample bytes after backup confirmation require fail-closed preflash freshness', async () => {
  const { state, original, replacement } = await simulate({ mutateDuringConfirmation: true });
  assert.deepEqual(state.backup, original, 'the retained archive has the older image');
  assert.deepEqual(state.current, replacement, 'the keyboard now contains different, valid bytes');
  assert.notDeepEqual(state.backup, state.current, 'same SMP_INFO does not prove bytes stayed unchanged');
  assert.equal(state.events.includes('OTA_START'), false,
    'FAIL_BEFORE_FIX: do not start irreversible OTA when the saved backup is stale');
  assert.equal(state.snapshot.commits, 0);
});
