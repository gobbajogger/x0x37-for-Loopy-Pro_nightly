// SPDX-License-Identifier: GPL-3.0-only
// Actual Updater/Link with synthetic WebMIDI. No hardware or unit-serial claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const context = { TextEncoder, setTimeout(fn, ms) { return setTimeout(fn, Math.min(ms, 2)); }, clearTimeout };
new Script(readFileSync(new URL('../web/fm1ota.js', import.meta.url), 'utf8').replace(/^export\s+/gm, '') +
  '\nthis.api={Updater,pack7,unpack7,sameKeyboard};').runInNewContext(context);
const { Updater, pack7, unpack7, sameKeyboard } = context.api;
const image = new Uint8Array(1024);
function identity(text) {
  const data = [...text].map(c => c.charCodeAt(0));
  while (data.length < 27) data.push(0);
  return [0xf0, ...pack7([0, 0x59, 0x11, 27, 0, 0, ...data,
    ~data.reduce((a, b) => a + b, 0) & 255]), 0xf7];
}
function request(address, len = 8) {
  const data = [0, 0x59, 0x30, 8, 0, 0, 0, address & 255, address >>> 8 & 255,
    address >>> 16 & 255, address >>> 24 & 255, len & 255, len >>> 8 & 255, 0];
  return [0xf0, ...pack7([...data, ~data.slice(6).reduce((a, b) => a + b, 0) & 255]), 0xf7];
}
function scenario({ model = 'SMK-37 Elite', loaderModel = model, initialLoader = false,
  change = 'none', afterVersion = '901', revoke = null } = {}) {
  const listeners = new Set();
  const access = { inputs: new Map(), outputs: new Map(),
    addEventListener(type, fn) { assert.equal(type, 'statechange'); listeners.add(fn); },
    removeEventListener(type, fn) { listeners.delete(fn); } };
  let stage = initialLoader ? 'loader' : 'app', admitted = true;
  const state = { appStarts: 0, loaderStarts: 0, appReplies: 0, loaderReplies: 0 };
  let input, output;
  const dispatch = port => { for (const fn of listeners) fn({ port }); };
  const createPorts = (name = 'SMK selected') => {
    const pairInput = { id: 'selected-in', name, state: 'connected', onmidimessage: null, async open() {} };
    const pairOutput = { id: 'selected-out', name, state: 'connected', async open() {}, send(bytes) {
      if (bytes.length === 10 && bytes[1] === 0 && bytes[2] === 0x32 && bytes[3] === 0x45) {
        const name = stage === 'loader' ? 'ota-' + loaderModel : stage === 'back' ? model : model;
        pairInput.onmidimessage?.({ data: identity(name + '_' + (stage === 'back' ? afterVersion : '900')) });
        if (revoke === 'handshake') admitted = false;
        return;
      }
      if (bytes[1] === 0x22) {
        if (stage === 'loader') state.loaderStarts++; else state.appStarts++;
        pairInput.onmidimessage?.({ data: request(0) });
        pairInput.onmidimessage?.({ data: request(stage === 'loader' ? 0xf0000000 : 0xe0000000) });
        if (stage === 'loader' && revoke === 'loader-start') admitted = false;
        return;
      }
      const data = unpack7(bytes.slice(1, -1));
      const addr = (data[7] | data[8] << 8 | data[9] << 16 | data[10] << 24) >>> 0;
      if (addr === 0xe0000000) {
        stage = 'loader';
        if (change === 'replace' || change === 'rename') createPorts(change === 'rename' ? 'ota foreign' : 'SMK selected');
        else if (change === 'deferred-reconnect') dispatch(pairInput);
        else if (change === 'disconnect') { pairInput.state = 'disconnected'; dispatch(pairInput); }
        else if (change === 'unrelated') dispatch({ id: 'other-in', name: 'Other synth', state: 'disconnected' });
      } else if (addr === 0xf0000000) {
        stage = 'back';
        if (change === 'after-write-reconnect') dispatch(pairInput);
      } else if (stage === 'loader') state.loaderReplies++; else state.appReplies++;
    } };
    input = pairInput; output = pairOutput;
    access.inputs = new Map([['selected-in', input]]); access.outputs = new Map([['selected-out', output]]);
  };
  createPorts();
  const up = new Updater(access);
  return { up, state, access, listeners, admitted: () => admitted,
    get input() { return input; }, get output() { return output; } };
}

for (const change of ['none', 'unrelated']) test('uninterrupted matching-model pair completes: ' + change, async () => {
  const s = scenario({ change });
  try {
    assert.equal(await s.up.install(image, 'SMK-37 Elite_901'), 'SMK-37 Elite_901');
    assert.deepEqual(s.state, { appStarts: 1, loaderStarts: 1, appReplies: 1, loaderReplies: 1 });
    assert.equal(s.up.verified, true);
  } finally { s.up.close(); }
  assert.equal(s.listeners.size, 0);
});

test('foreign Pro loader cannot replace selected Elite even on the same MIDI pair', async () => {
  const s = scenario({ loaderModel: 'SMK-37 Pro' });
  try { await assert.rejects(s.up.install(image, 'SMK-37 Elite_901'), { code: 'model' }); }
  finally { s.up.close(); }
  assert.equal(s.state.loaderStarts, 0); assert.equal(s.state.loaderReplies, 0);
});

for (const change of ['replace', 'rename', 'disconnect', 'deferred-reconnect'])
test('replaced or interrupted bound pair cannot enter loader writes: ' + change, async () => {
  const s = scenario({ change });
  try { await assert.rejects(s.up.install(image, 'SMK-37 Elite_901'), { code: 'continuity' }); }
  finally { s.up.close(); }
  assert.equal(s.state.loaderStarts, 0); assert.equal(s.state.loaderReplies, 0);
  assert.equal(s.up.verified, false);
});

test('post-write lifecycle change cannot authorize automatic restore or report verified', async () => {
  const s = scenario({ change: 'after-write-reconnect' });
  try { await assert.rejects(s.up.install(image, 'SMK-37 Elite_901'), { code: 'continuity' }); }
  finally { s.up.close(); }
  assert.equal(s.state.loaderReplies, 1); assert.equal(s.up.verified, false);
});

test('fresh explicit matching-loader resume is separate from prior continuity', async () => {
  const s = scenario({ initialLoader: true });
  try { assert.equal(await s.up.resume(image, null, 'SMK-37 Elite_901', s.admitted), true); }
  finally { s.up.close(); }
  assert.equal(s.state.appStarts, 0); assert.equal(s.state.loaderStarts, 1);
});

test('wrong-model fresh resume refuses before any UPGRADE', async () => {
  const s = scenario({ initialLoader: true, model: 'SMK-37 Pro' });
  try { await assert.rejects(s.up.resume(image, null, 'SMK-37 Elite_901'), { code: 'model' }); }
  finally { s.up.close(); }
  assert.equal(s.state.loaderStarts, 0);
});

test('a rejected atomic start sends no fallback legacy UPGRADE', async () => {
  const s = scenario();
  const denied = new Error('snapshot refused');
  try { await assert.rejects(s.up.install(image, 'SMK-37 Elite_901', null, async () => { throw denied; }), e => e === denied); }
  finally { s.up.close(); }
  assert.equal(s.state.appStarts, 0); assert.equal(s.state.loaderStarts, 0);
});

test('atomic start callback owns OTA entry with no second UPGRADE', async () => {
  const s = scenario();
  try {
    await s.up.install(image, 'SMK-37 Elite_901', null, async ({ link }) => {
      // Callback boundary only: the separate snapshot suite checks COMMIT bytes.
      link.send([0xf0, 0x22, 0x24, 0x35, 0x7f, 0xf7]);
    });
  } finally { s.up.close(); }
  assert.equal(s.state.appStarts, 1); assert.equal(s.state.loaderStarts, 1);
});

test('approval revoked during discovery blocks first legacy UPGRADE', async () => {
  const s = scenario({ revoke: 'handshake' });
  try { await assert.rejects(s.up.install(image, 'SMK-37 Elite_901', null, null, s.admitted), { code: 'admission' }); }
  finally { s.up.close(); }
  assert.equal(s.state.appStarts, 0); assert.equal(s.state.loaderStarts, 0);
});

test('approval revoked after loader starts blocks first image response', async () => {
  const s = scenario({ initialLoader: true, revoke: 'loader-start' });
  try { await assert.rejects(s.up.resume(image, null, 'SMK-37 Elite_901', s.admitted), { code: 'admission' }); }
  finally { s.up.close(); }
  assert.equal(s.state.loaderStarts, 1); assert.equal(s.state.loaderReplies, 0);
});

test('a returned wrong version is not verified completion', async () => {
  const s = scenario({ afterVersion: '900' });
  try { await assert.rejects(s.up.install(image, 'SMK-37 Elite_901'), { code: 'mismatch' }); }
  finally { s.up.close(); }
  assert.equal(s.up.verified, false);
});

test('verified Starry alias stays Pro, while Elite and other model names stay distinct', () => {
  assert.equal(sameKeyboard('STARRYKEY-37 Play', 'SMK-37 Pro'), true);
  assert.equal(sameKeyboard('ota-STARRYKEY-37 Play', 'SMK-37 Pro'), true);
  assert.equal(sameKeyboard('STARRYKEY-37 Play', 'SMK-37 Elite'), false);
  assert.equal(sameKeyboard('SMK-37 Pro', 'SMK-37 Elite'), false);
  assert.equal(sameKeyboard('MKE-P37', 'MKE-P37'), true);
  assert.equal(sameKeyboard('MKE-P37', 'SMK-37 Elite'), false);
  assert.equal(sameKeyboard('', ''), false);
});
