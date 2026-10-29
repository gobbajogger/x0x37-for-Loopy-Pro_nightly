// SPDX-License-Identifier: GPL-3.0-only
// EC-20261026-010. M-UPGRADE read requests must declare their eight-byte body.
// Test-only regression: the OTA/installer specialist owns the production repair.
// Synthetic MIDI only. No hardware or firmware is written.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Updater, pack7 } from '../web/fm1ota.js';

function readRequest(declaredLength, address = 0, requestedLength = 8) {
  // Firmware firmware/src/ota.c: ota_read() calls ota_send_msg(0x30,q,8).
  // The checksum covers body bytes 6..13, not the length header 3..5.
  const body = [
    0, 0x59, 0x30,
    declaredLength & 0xff, (declaredLength >>> 8) & 0xff,
    (declaredLength >>> 16) & 0xff,
    0, address & 0xff, (address >>> 8) & 0xff,
    (address >>> 16) & 0xff, (address >>> 24) & 0xff,
    requestedLength & 0xff, (requestedLength >>> 8) & 0xff, 0,
  ];
  const checksum = (~body.slice(6).reduce((sum, value) => sum + value, 0)) & 0xff;
  return [0xf0, ...pack7([...body, checksum]), 0xf7];
}

async function serveOne(declaredLength) {
  const packets = [
    readRequest(declaredLength, 0, 8),
    readRequest(8, 0xf0000000, 8), // Valid normal loader finish request.
  ];
  const transmitted = [];
  const link = {
    lost: false,
    async read() { return packets.shift() || null; },
    send(packet) { transmitted.push(packet); return true; },
  };
  const updater = new Updater({ inputs: new Map(), outputs: new Map() });
  const firmware = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
  let result, error;
  try { result = await updater.serve(link, firmware, 0xf0000000, 1000); }
  catch (failure) { error = failure; }
  return { ...result, error, transmitted };
}

test('positive: valid length-8 request reads one chunk then finishes', async () => {
  const result = await serveOne(8);
  assert.equal(result.error, undefined);
  assert.equal(result.served, 1);
  assert.equal(result.finished, true);
  assert.equal(result.transmitted.length, 2, 'one data reply and one finish reply');
});

for (const length of [7, 0x010008]) {
  test(`negative: contradictory 24-bit length ${length} must not read firmware bytes`, async () => {
    const result = await serveOne(length);
    assert.equal(result.error?.code, 'badreq',
      'without a valid data request the terminal cannot complete the stage');
    assert.equal(result.transmitted.length, 0,
      'FAIL_BEFORE_FIX: invalid data and premature finish must receive no replies');
  });
}
