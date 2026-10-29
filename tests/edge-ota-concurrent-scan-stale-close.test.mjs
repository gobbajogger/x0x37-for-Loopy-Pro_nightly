// SPDX-License-Identifier: GPL-3.0-only
// EC038: a stale OTA discovery scan must not unregister a newer scan's MIDI listener.
// Run from this repository root: node --test tests/edge-ota-concurrent-scan-stale-close.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = resolve(base, 'web/fm1ota.js');
const source = readFileSync(path, 'utf8');
// Load the actual production implementation without changing its exports or source file.
// fm1ota.js has no imports, so stripping its ESM export keywords is sufficient.
const { Updater, pack7 } = new Function(source.replace(/^export\s+/gm, '') +
  '\nreturn { Updater, pack7 };')();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const id = 'SMK-37 Pro_900';
const identity = [...id].map((char) => char.charCodeAt(0));
while (identity.length < 27) identity.push(0);
const crc = (~identity.reduce((sum, b) => sum + b, 0)) & 255;
const wire = Uint8Array.from([0xF0, ...pack7([0, 0x59, 0x11, 27, 0, 0, ...identity, crc]), 0xF7]);

function fakeMidi({ secondOnly = false } = {}) {
  let sends = 0;
  const input = { name: 'SMK-37 Pro', state: 'connected', onmidimessage: null, async open() {} };
  const output = { name: 'SMK-37 Pro', state: 'connected', async open() {}, send() {
    sends++;
    if ((!secondOnly && sends === 1) || (secondOnly && sends === 2))
      setTimeout(() => deliver(), 0);
  } };
  const access = { inputs: new Map([['input', input]]), outputs: new Map([['output', output]]) };
  function deliver() {
    input.onmidimessage?.({ data: wire });
  }
  return { access, input, output, deliver, get sends() { return sends; } };
}

test('control: a single scan can identify the keyboard and receive a later packet', async () => {
  const midi = fakeMidi();
  const device = await new Updater(midi.access, () => {}).find(() => true);
  assert.ok(device, 'valid identity must produce a device');
  midi.deliver();
  const packet = await device.link.read(30);
  assert.ok(packet, 'the current listener must receive a packet');
  assert.equal(packet.length, wire.length);
  device.link.close();
});

test('negative: earlier timed-out scan cannot unregister a newer successful scan', async () => {
  const midi = fakeMidi({ secondOnly: true });
  // Scan A begins waiting for a handshake. Scan B starts on the same USB port,
  // becomes the current listener, and receives its valid identity reply.
  const scanA = new Updater(midi.access, () => {}).find(() => true);
  await delay(30);
  const scanB = new Updater(midi.access, () => {}).find(() => true);
  const newDevice = await scanB;
  assert.ok(newDevice, 'the newer scan must identify the keyboard');
  midi.deliver();
  assert.ok(await newDevice.link.read(30), 'newer link must receive before stale close');
  // The first scan times out and closes its own stale Link. The production
  // Link.close currently does `input.onmidimessage = null` unconditionally,
  // destroying the newer link's handler, although the new scan owns the port.
  assert.equal(await scanA, null, 'stale scan must not acquire a device');
  midi.deliver();
  const packet = await newDevice.link.read(30);
  newDevice.link.close();
  assert.ok(packet, 'newer scan must still receive MIDI after stale scan closes');
  assert.equal(packet.length, wire.length);
});
