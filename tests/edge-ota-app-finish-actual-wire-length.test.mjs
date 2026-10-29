// SPDX-License-Identifier: GPL-3.0-only
// EC-20261027-028. Cross-repository protocol contract, regression only.
// Firmware firmware/src/ota.c at ef0ce103f1baf11ab537121181c0bf83f016ca2b
// (blob 735e6791540b7586ed78ebe73b720fcd62310162) calls
// ota_read(0xE0000000u, b, 8), and ota_read encodes len into q[5:7]
// before ota_send_msg(0x30,q,8). The site's stage-one host MUST answer
// the eight-byte terminal read with exactly "success\0".
// No firmware/device/flash operations. An existing OTA source owner fixes production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Updater, pack7, unpack7 } from '../web/fm1ota.js';

function otaReadRequest(addr, len) {
  // Exact ota_read wire layout: fl, addr32, len24, with 8-byte body.
  const q = [0, addr & 255, (addr >>> 8) & 255,
    (addr >>> 16) & 255, (addr >>> 24) & 255,
    len & 255, (len >>> 8) & 255, (len >>> 16) & 255];
  const body = [0, 0x59, 0x30, 8, 0, 0, ...q];
  body.push((~body.slice(6).reduce((sum, b) => sum + b, 0)) & 255);
  return [0xf0, ...pack7(body), 0xf7];
}

async function serveTerminalRead(len) {
  const queue = [otaReadRequest(0, 8), otaReadRequest(0xe0000000, len)];
  const sent = [];
  const link = {
    lost: false,
    async read() { return queue.shift() || null; },
    send(bytes) { sent.push([...bytes]); return true; },
  };
  const updater = new Updater({ inputs: new Map(), outputs: new Map() });
  try {
    const result = await updater.serve(link, new Uint8Array(32), 0xe0000000, 500);
    return { result, sent, error: null };
  } catch (error) { return { result: null, sent, error }; }
}

test('control: genuinely invalid terminal length 7 refuses success', async () => {
  const { result, sent, error } = await serveTerminalRead(7);
  assert.equal(result, null);
  assert.equal(error?.code, 'badreq');
  assert.equal(sent.length, 1, 'normal 8-byte read replied before malformed finish');
});

test('negative: exact deployed app ota_read(0xE0000000,b,8) receives success', async () => {
  const { result, sent, error } = await serveTerminalRead(8);
  assert.equal(error, null,
    `FAIL_BEFORE_FIX: browser rejects the real firmware terminal 8-byte read: ${error?.message}`);
  assert.equal(result?.finished, true);
  assert.equal(result?.served, 1);
  assert.equal(sent.length, 2, 'normal data reply plus terminal 8-byte success');
  const decoded = unpack7(sent[1].slice(1, -1));
  assert.equal(decoded[11], 8, 'terminal response declares eight data bytes');
  assert.deepEqual(decoded.slice(14, 22), [115, 117, 99, 99, 101, 115, 115, 0]);
});
