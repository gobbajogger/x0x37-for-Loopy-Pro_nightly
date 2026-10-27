// SPDX-License-Identifier: GPL-3.0-only
// EC020: malformed extension tails must not become legacy preservation maps.
import { withInstallSnapshot } from './fixtures/install-snapshot.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInfo, installKeepingSlots } from '../web/x0x_breaks.js';

const reply = [1, 80, 1, 65, 0, 10, 0x58, 1, 48, 1, 11, 0, 10, 0];
const legacy = reply.slice(0, 6);
const extensionError = /SMP_INFO (?:trailing metadata|flash-map extension)/;

test('every unsupported 7-bit marker with an extension payload is refused', () => {
  for (let marker = 0; marker < 128; marker++) {
    if (marker === 0x58) continue;
    const damaged = [...reply];
    damaged[6] = marker;
    assert.throws(() => parseInfo(damaged), /unknown SMP_INFO trailing metadata/, `marker ${marker}`);
  }
});

test('every partial recognized extension is refused, including a marker alone', () => {
  for (let length = legacy.length + 1; length < reply.length; length++)
    assert.throws(() => parseInfo(reply.slice(0, length)), extensionError, `length ${length}`);
});

test('unsupported extension versions and all extra 7-bit trailing bytes are refused', () => {
  for (let value = 0; value < 128; value++) {
    if (value !== 1) {
      const unsupported = [...reply];
      unsupported[7] = value;
      assert.throws(() => parseInfo(unsupported), extensionError, `version ${value}`);
    }
    assert.throws(() => parseInfo([...reply, value]), extensionError, `extended tail ${value}`);
    assert.throws(() => parseInfo([...legacy, value]), extensionError, `legacy tail ${value}`);
  }
});

test('complete legacy descriptors remain accepted without invented extension requirements', () => {
  for (const bytes of [legacy, [1, 80, 0, 0, 0], [2, 80, 1, 65, 0, 10, 0, 0, 0]]) {
    for (const input of [bytes, Uint8Array.from(bytes)]) {
      const layout = parseInfo(input);
      assert.equal(layout.ext, false);
      assert.equal(layout.count, bytes[0]);
      assert.ok(layout.slots.every(slot => slot.off === null));
    }
  }
  assert.equal(parseInfo(Uint8Array.from(reply)).ext, true);
});

test('malformed metadata closes the preflash link before backup/sample commands or OTA, including stock identity', async () => {
  const damaged = [...reply]; damaged[6] = 0x59;
  const unsupported = [...reply]; unsupported[7] = 2;
  for (const bytes of [damaged, [...legacy, 0], [...legacy, 0x58], reply.slice(0, -1), unsupported, [...reply, 0]]) {
    for (const version of [900, 16]) {
      const commands = [], events = [];
      const link = {
        drain() {}, close() { events.push('close'); },
        send(frame) { commands.push(frame[4]); return true; },
        async read() { return [0xf0, 0x7d, 0x46, 0x4c, 15, ...bytes, 0xf7]; },
      };
      const up = {
        async find() { return { link, id: { model: 'SMK-37 Pro', version } }; },
        bind() {}, async install() { events.push('OTA'); },
      };
      withInstallSnapshot(link, up);
      await assert.rejects(installKeepingSlots(up, new Uint8Array(), 'SMK-37 Pro_901', 'smk', {
        save() { events.push('save'); return true; },
        progress() { events.push('progress'); },
      }), error => error.code === 'slotbackup' && extensionError.test(error.message));
      assert.deepEqual(commands, [15], 'only read-only SMP_INFO may be sent');
      assert.deepEqual(events, ['close'], 'no backup, sample mutation or OTA is reached');
    }
  }
});
