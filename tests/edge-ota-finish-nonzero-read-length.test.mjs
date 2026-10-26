// SPDX-License-Identifier: GPL-3.0-only
// EC-20261027-017: a finish-address request must not claim OTA transfer
// completion when its on-wire read length is nonzero.
// This is test-only; all firmware bytes, MIDI ports, and device replies are synthetic.
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

async function runScenario(finishLength) {
  const pending = [request(0, 8), request(0xf0000000, finishLength)];
  const transmissions = [];
  const link = {
    get lost() { return false; },
    async read() { return pending.shift() || null; },
    send(frame) { transmissions.push([...frame]); return true; },
  };
  const updater = new Updater({ inputs: new Map(), outputs: new Map() });
  let result = null, error = null;
  try {
    result = await updater.serve(link, new Uint8Array(32), 0xf0000000, 20);
  } catch (e) { error = e; }
  return { result, error, transmissions };
}

test('baseline: zero-length finish after a valid data request completes OTA stage', async () => {
  const { result, error, transmissions } = await runScenario(0);
  assert.equal(error, null);
  assert.equal(result.served, 1);
  assert.equal(result.finished, true);
  assert.equal(transmissions.length, 2);
});

test('negative: checksummed finish request with a nonzero read length must fail closed', async () => {
  const { result, error, transmissions } = await runScenario(1);
  assert.ok(error || !result?.finished,
    'FAIL_BEFORE_FIX: the OTA server treated a finish-address request for one byte as transfer completion');
  assert.ok(transmissions.length <= 2, 'must not send further firmware chunks after invalid finish');
});
