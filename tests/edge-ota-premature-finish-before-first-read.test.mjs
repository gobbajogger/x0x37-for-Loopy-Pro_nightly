// SPDX-License-Identifier: GPL-3.0-only
// Edge-Case Hunt EC-20261027-036: OTA transfer must not complete from an
// out-of-order terminal SysEx before the device has requested image data.
// Test-only. No firmware flash, physical device or production-source edit.
//
// Pin for original negative demonstration:
// NIGHTLY PR #61 head 5e1881d2ac54efc2408cd070029f4eadfb247e80
// web/fm1ota.js blob 7c07f3d67d27da317d77d0b48b364399abb6cf28.
// Firmware firmware/src/ota.c ota_ufw always requests image offsets 0 and 512
// (512 bytes each) before ota_stage can issue terminal read E0000000+8.
//
// Run from a full checkout containing this test:
// node --test tests/edge-ota-premature-finish-before-first-read.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Updater, pack7, unpack7 } from '../web/fm1ota.js';

function otaRequest(addr, len) {
  const q = [0, addr & 255, (addr >>> 8) & 255, (addr >>> 16) & 255,
    (addr >>> 24) & 255, len & 255, (len >>> 8) & 255,
    (len >>> 16) & 255];
  const body = [0, 0x59, 0x30, 8, 0, 0, ...q];
  body.push(~body.slice(6).reduce((a, b) => a + b, 0) & 255);
  return [0xf0, ...pack7(body), 0xf7];
}

async function serve(frames) {
  const queue = frames.map(([addr, len]) => otaRequest(addr, len));
  const sent = [];
  const link = {
    lost: false,
    async read() {
      const frame = queue.shift();
      if (!frame) this.lost = true;
      return frame ?? null;
    },
    send(frame) { sent.push([...frame]); return true; },
  };
  const updater = new Updater({ inputs: new Map(), outputs: new Map() });
  try {
    const result = await updater.serve(link, new Uint8Array(1024), 0xe0000000, 1000);
    return { result, sent, error: null };
  } catch (error) { return { result: null, sent, error }; }
}

function terminalAck(frames) {
  return frames.some(frame => {
    const u = unpack7(frame.slice(1, -1));
    const addr = (u[7] | u[8] << 8 | u[9] << 16 | u[10] << 24) >>> 0;
    return addr === 0xe0000000 &&
      u.slice(14, 22).join(',') === '115,117,99,99,101,115,115,0';
  });
}

test('control: two ordinary image reads then real eight-byte finish are accepted', async () => {
  const { result, sent, error } = await serve([[0, 8], [512, 8], [0xe0000000, 8]]);
  assert.equal(error, null);
  assert.equal(result?.finished, true);
  assert.equal(result?.served, 2);
  assert.equal(sent.length, 3);
  assert.equal(terminalAck(sent), true);
});

test('control: a malformed seven-byte terminal request is rejected', async () => {
  const { result, sent, error } = await serve([[0xe0000000, 7]]);
  assert.equal(result, null);
  assert.equal(error?.code, 'badreq');
  assert.equal(sent.length, 0);
});

test('negative: a valid early terminal must not acknowledge or complete an untouched image', async () => {
  // The actual OTA app cannot legally send this as its first request. A stale,
  // reordered or forged MIDI frame must not make the browser report success.
  const { result, sent } = await serve([[0xe0000000, 8]]);
  assert.equal(terminalAck(sent), false,
    'FAIL_BEFORE_FIX: accepted a terminal finish without receiving any firmware-data read');
  assert.notEqual(result?.finished, true,
    'FAIL_BEFORE_FIX: browser finished OTA stage after zero image bytes were requested');
});
