// SPDX-License-Identifier: GPL-3.0-only
// EC-20261026-008: an OTA finish notification cannot count as a completed
// transfer when the browser cannot send the finish acknowledgment.
// Test-only. Ownership of the production updater remains with its specialist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Updater, pack7 } from '../web/fm1ota.js';

function request(addr, len) {
  const body = [
    0x00, 0x59, 0x30, 0x08, 0x00, 0x00, 0x00,
    addr & 0xff, (addr >>> 8) & 0xff, (addr >>> 16) & 0xff,
    (addr >>> 24) & 0xff,
    len & 0xff, (len >>> 8) & 0xff, (len >>> 16) & 0xff,
  ];
  body.push((~body.slice(6).reduce((sum, byte) => sum + byte, 0)) & 0xff);
  return [0xf0, ...pack7(body), 0xf7];
}

async function runScenario(finishAckDisconnects) {
  const packets = [request(0, 8), request(0xf0000000, 0)];
  const sent = [];
  let disconnected = false;
  const link = {
    get lost() { return disconnected; },
    async read() { return packets.shift() || null; },
    send(bytes) {
      sent.push([...bytes]);
      if (finishAckDisconnects && sent.length === 2) {
        disconnected = true;
        return false; // Link.send reports a WebMIDI output disconnection.
      }
      return true;
    },
  };
  const updater = new Updater({ inputs: new Map(), outputs: new Map() });
  const result = await updater.serve(link, new Uint8Array(32), 0xf0000000, 100);
  return { result, sent, disconnected };
}

test('positive: an acknowledged OTA completion succeeds after serving a data request', async () => {
  const { result, sent, disconnected } = await runScenario(false);
  assert.equal(result.served, 1);
  assert.equal(result.finished, true);
  assert.equal(disconnected, false);
  assert.equal(sent.length, 2);
});

test('negative: a lost OTA finish acknowledgment must not report completion', async () => {
  const { result, sent, disconnected } = await runScenario(true);
  assert.equal(sent.length, 2);
  assert.equal(disconnected, true);
  assert.equal(result.served, 1);
  assert.equal(result.finished, false,
    'FAIL_BEFORE_FIX: disconnected finish acknowledgment was silently treated as an OTA success');
  assert.equal(result.lost, true,
    'FAIL_BEFORE_FIX: lost finish acknowledgment must surface USB transport loss');
});
