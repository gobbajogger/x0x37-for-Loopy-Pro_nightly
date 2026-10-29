// SPDX-License-Identifier: GPL-3.0-only
// Actual OTA discovery/binding with a permitted queued WebMIDI event order.
// Synthetic EventTarget/ports only; no hardware or persistent-unit identity claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Updater, pack7 } from '../web/fm1ota.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function scenario({ inputClosed = false, outputClosed = false, failOpen = false } = {}) {
  const listeners = new Set(), events = [], pending = [];
  const access = { inputs: new Map(), outputs: new Map(),
    addEventListener(type, listener) { assert.equal(type, 'statechange'); listeners.add(listener); },
    removeEventListener(type, listener) { assert.equal(type, 'statechange'); listeners.delete(listener); } };
  let probes = 0;
  const dispatch = port => {
    events.push(port.id);
    for (const [listener, once] of [...(port.listeners || [])]) {
      if (once) port.listeners.delete(listener);
      listener({ port });
    }
    for (const listener of [...listeners]) listener({ port });
  };
  const port = (type, closed) => ({
    id: 'selected-' + type, type, name: 'SMK-37 Elite', state: 'connected',
    connection: closed ? 'closed' : 'open', listeners: new Map(), onmidimessage: null,
    addEventListener(kind, listener, options) {
      assert.equal(kind, 'statechange'); this.listeners.set(listener, !!options?.once);
    },
    removeEventListener(kind, listener) { assert.equal(kind, 'statechange'); this.listeners.delete(listener); },
    async open() {
      if (failOpen) throw new Error('synthetic opening refusal');
      if (this.connection === 'closed') {
        this.connection = 'open';
        // open() may resolve while its initial statechange remains queued.
        pending.push(new Promise(resolve => setTimeout(() => { dispatch(this); resolve(); }, 0)));
      }
      return this;
    },
  });
  const input = port('input', inputClosed), output = port('output', outputClosed);
  const text = 'SMK-37 Elite_900', payload = [...text].map(c => c.charCodeAt(0));
  while (payload.length < 27) payload.push(0);
  const reply = Uint8Array.from([0xf0, ...pack7([0, 0x59, 0x11, 27, 0, 0, ...payload,
    ~payload.reduce((sum, byte) => sum + byte, 0) & 255]), 0xf7]);
  output.send = bytes => {
    assert.deepEqual(Array.from(bytes), [0xf0, 0, 0x32, 0x45, 0, 0, 0, 0x40, 0x7f, 0xf7]);
    probes++; input.onmidimessage?.({ data: reply });
  };
  access.inputs.set(input.id, input); access.outputs.set(output.id, output);
  return { up: new Updater(access), access, input, output, listeners, events, dispatch,
    get probes() { return probes; }, settle: () => Promise.all(pending) };
}

for (const [inputClosed, outputClosed] of [[false, false], [true, false], [false, true], [true, true]])
test(`initial opening does not revoke a fresh binding (input closed=${inputClosed}, output closed=${outputClosed})`, async () => {
  const s = scenario({ inputClosed, outputClosed });
  const dev = await s.up.find(() => true);
  assert.ok(dev); s.up.bind(dev);
  await s.settle();
  try {
    assert.doesNotThrow(() => s.up.assertContinuous(dev));
    assert.equal(s.events.length, Number(inputClosed) + Number(outputClosed));
    assert.equal(s.probes, 1);
    assert.equal(s.input.listeners.size + s.output.listeners.size, 0, 'initial-opening listeners are removed');
    assert.equal(s.listeners.size, 1, 'the lifecycle guard is active after binding');
  } finally { dev.link.close(); s.up.close(); }
  assert.equal(s.listeners.size, 0);
});

for (const coalesced of [false, true])
test(`later ${coalesced ? 'coalesced' : 'observed'} disconnect/reconnect still revokes the bound pair`, async () => {
  const s = scenario({ inputClosed: true, outputClosed: true });
  const dev = await s.up.find(() => true); assert.ok(dev); s.up.bind(dev);
  await s.settle();
  s.input.state = 'disconnected';
  if (!coalesced) s.dispatch(s.input);
  s.input.state = 'connected';
  if (coalesced) setTimeout(() => s.dispatch(s.input), 0);
  else s.dispatch(s.input);
  await delay(5);
  try {
    assert.throws(() => s.up.assertContinuous(dev), { code: 'continuity' });
    await assert.rejects(s.up.find(() => true), { code: 'continuity' });
    assert.equal(s.probes, 1, 'no handshake/write on an invalidated binding');
    assert.equal(s.up.verified, false);
  } finally { dev.link.close(); s.up.close(); }
  assert.equal(s.listeners.size, 0);
});

test('an unrelated lifecycle event preserves the freshly opened pair', async () => {
  const s = scenario({ inputClosed: true, outputClosed: true });
  const dev = await s.up.find(() => true); assert.ok(dev); s.up.bind(dev);
  await s.settle();
  try {
    s.dispatch({ id: 'unrelated-input', type: 'input', state: 'disconnected' });
    assert.doesNotThrow(() => s.up.assertContinuous(dev));
  } finally { dev.link.close(); s.up.close(); }
});

test('failed initial open removes temporary listeners and sends no handshake', async () => {
  const s = scenario({ inputClosed: true, outputClosed: true, failOpen: true });
  assert.equal(await s.up.find(() => true), null);
  assert.equal(s.probes, 0);
  assert.equal(s.input.listeners.size + s.output.listeners.size + s.listeners.size, 0);
  assert.equal(s.up.binding, null);
});
