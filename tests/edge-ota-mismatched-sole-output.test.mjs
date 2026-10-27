// SPDX-License-Identifier: GPL-3.0-only
// EC-023: never route firmware-update SysEx to an unrelated WebMIDI output
// merely because it is the only output. Test-only regression, intentionally RED
// until the installer transport owner provides verified input/output binding.
// All ports and identity frames are simulated; no hardware or firmware writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Updater, pack7 } from '../web/fm1ota.js';

const TARGET_INPUT = 'SMK-37 Elite MIDI';
const UNRELATED_OUTPUT = 'Other Controller MIDI';

function identityFrame(text = 'SMK-37 Elite_900') {
  const payload = new Array(27).fill(0);
  const chars = [...new TextEncoder().encode(text)];
  assert.ok(chars.length <= payload.length, 'fixture identity must fit the protocol');
  chars.forEach((byte, i) => { payload[i] = byte; });
  const checksum = ~payload.reduce((sum, byte) => sum + byte, 0) & 255;
  return Uint8Array.from([0xF0, ...pack7([0, 0x59, 0x11, 27, 0, 0, ...payload, checksum]), 0xF7]);
}

async function discoverWith(outputNames) {
  const sends = [];
  const input = {
    name: TARGET_INPUT,
    state: 'connected',
    onmidimessage: null,
    async open() {},
  };
  const identity = identityFrame();
  const outputs = outputNames.map((name) => ({
    name,
    state: 'connected',
    async open() {},
    send(bytes) {
      sends.push({ name, bytes: [...bytes] });
      // Deliver a syntactically valid identity on the TARGET INPUT while the
      // selected OUTPUT is unrelated. The API cannot prove they are one unit.
      // Simulates an unsolicited/delayed input identity across split ports.
      if (input.onmidimessage) input.onmidimessage({ data: identity });
    },
  }));
  const updater = new Updater({
    inputs: new Map([['keyboard', input]]),
    outputs: new Map(outputs.map((output, index) => [index, output])),
  });
  const device = await updater.find();
  const result = {
    sends,
    identity: device?.id.text ?? null,
    boundOutput: device?.link.output.name ?? null,
  };
  device?.link.close();
  return result;
}

test('baseline: same-name WebMIDI input and output can discover the keyboard', async () => {
  const found = await discoverWith([TARGET_INPUT]);
  assert.equal(found.identity, 'SMK-37 Elite_900');
  assert.equal(found.boundOutput, TARGET_INPUT);
  assert.ok(found.sends.length >= 1);
  assert.equal(found.sends[0].name, TARGET_INPUT);
});

test('negative: sole unrelated output must not receive update handshake or become bound', async () => {
  const found = await discoverWith([UNRELATED_OUTPUT]);
  assert.equal(found.sends.length, 0,
    'FAIL_BEFORE_FIX: unrelated sole output received firmware-update handshake');
  assert.equal(found.identity, null,
    'FAIL_BEFORE_FIX: keyboard identity on a different input must not bind unrelated output');
  assert.equal(found.boundOutput, null);
});

test('control: two unrelated outputs are already rejected by existing fallback', async () => {
  const found = await discoverWith([UNRELATED_OUTPUT, 'Second Synth MIDI']);
  assert.deepEqual(found.sends, []);
  assert.equal(found.identity, null);
  assert.equal(found.boundOutput, null);
});
