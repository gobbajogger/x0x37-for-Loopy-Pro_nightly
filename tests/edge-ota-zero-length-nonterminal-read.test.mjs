// SPDX-License-Identifier: GPL-3.0-only
// EC-20261027-032. Test-only adversarial OTA input; production repair belongs to OTA owner.
// A zero-length application/loader data read is not a progress-bearing request.
// The actual firmware requests positive chunk sizes; its terminal request uses
// the separate 0xE0000000/0xF0000000 address path (and an 8-byte length).
// Source baseline: NIGHTLY main 3735b1e41a6673675f9cb796b6ac7307308a4f6f,
// web/fm1ota.js blob cddeab7ed223efdccf5451dd0accccebf7f70454.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Updater, pack7 } from '../web/fm1ota.js';

function readRequest(addr, length) {
  const body = [0, 0x59, 0x30, 8, 0, 0, 0,
    addr & 255, (addr >>> 8) & 255, (addr >>> 16) & 255, (addr >>> 24) & 255,
    length & 255, (length >>> 8) & 255, (length >>> 16) & 255];
  let checksum = 0;
  for (let i = 6; i < 14; i++) checksum += body[i];
  body.push(~checksum & 255);
  return Uint8Array.from([0xF0, ...pack7(body), 0xF7]);
}

async function serveOne(length) {
  const transmitted = [], progress = [], request = readRequest(4, length);
  let count = 0, lost = false;
  const link = {
    get lost() { return lost; },
    async read() {
      if (++count === 1) return request;
      lost = true;  // End the synthetic session, with no terminal request dependency.
      return null;
    },
    send(frame) { transmitted.push([...frame]); return true; },
  };
  const updater = new Updater({ inputs: new Map(), outputs: new Map() });
  let result, error;
  try {
    result = await updater.serve(link, Uint8Array.from({ length: 64 }, (_, i) => i),
      0xF0000000, 1000, (...args) => progress.push(args));
  } catch (e) { error = e; }
  return { transmitted, progress, result, error };
}

test('control: positive-length read is answered and advances OTA request count', async () => {
  const result = await serveOne(4);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.result, { served: 1, finished: false, lost: true });
  assert.equal(result.transmitted.length, 1);
  assert.deepEqual(result.progress, [[1, 4]]);
});

test('negative: zero-length ordinary read is not acknowledged as data or progress', async () => {
  const result = await serveOne(0);
  if (result.error) {
    assert.equal(result.error.code, 'badreq', 'fail closed with a protocol error');
  } else {
    assert.deepEqual(result.result, { served: 0, finished: false, lost: true });
  }
  assert.equal(result.transmitted.length, 0,
    'FAIL_BEFORE_FIX: installer transmitted an empty success response to a nonterminal read');
  assert.deepEqual(result.progress, [],
    'FAIL_BEFORE_FIX: installer reported progress although no firmware bytes were sent');
});
