// SPDX-License-Identifier: GPL-3.0-only
// EC-20261026-009: the browser must reject corrupted OTA identity frames.
// Firmware ota_send_msg(0x11) declares body length 27 and appends ~sum(body).
// Test-only; the installer/OTA specialist owns the implementation repair.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Updater, pack7 } from '../web/fm1ota.js';

function identityFrame(text = 'SMK-37 Pro_900') {
  const name = Array.from(new TextEncoder().encode(text));
  assert.ok(name.length <= 27);
  const payload = Array.from({ length: 27 }, (_, i) => name[i] || 0);
  return [0, 0x59, 0x11, 27, 0, 0, ...payload,
    (~payload.reduce((sum, byte) => sum + byte, 0)) & 0xff];
}

async function discover(raw) {
  const input = {
    name: 'SMK-37 Pro MIDI', state: 'connected', onmidimessage: null,
    async open() {},
  };
  const output = {
    name: input.name, state: 'connected', async open() {},
    send() {
      if (input.onmidimessage) input.onmidimessage({
        data: new Uint8Array([0xf0, ...pack7(raw), 0xf7]),
      });
    },
  };
  const updater = new Updater({
    inputs: new Map([['in', input]]),
    outputs: new Map([['out', output]]),
  });
  const dev = await updater.find();
  if (dev) dev.link.close();
  return dev ? dev.id.text : null;
}

test('positive: checksummed identity frame discovers the correct model and version', async () => {
  assert.equal(await discover(identityFrame()), 'SMK-37 Pro_900');
});

test('negative: corrupt identity checksum must not bind a keyboard', async () => {
  const frame = identityFrame();
  frame[33] ^= 1;
  assert.equal(await discover(frame), null,
    'FAIL_BEFORE_FIX: OTA identity with corrupt checksum was trusted');
});

test('negative: corrupted version byte with unchanged checksum must not bind', async () => {
  const frame = identityFrame();
  frame[6 + 'SMK-37 Pro_90'.length] = '1'.charCodeAt(0);
  assert.equal(await discover(frame), null,
    'FAIL_BEFORE_FIX: corrupted product identity was accepted');
});

test('negative: contradictory identity length header must not bind', async () => {
  const frame = identityFrame();
  frame[3] = 26;
  assert.equal(await discover(frame), null,
    'FAIL_BEFORE_FIX: identity frame declared 26 bytes but carried 27');
});
