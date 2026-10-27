// SPDX-License-Identifier: GPL-3.0-only
// EC008 integration coverage against the production Updater, composed with
// EC011 receive-overflow and EC017 finish-length guards. Synthetic MIDI only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Updater, pack7 } from '../web/fm1ota.js';

function request(addr, len = 0) {
  const body = [0, 0x59, 0x30, 8, 0, 0, 0,
    addr & 0xff, (addr >>> 8) & 0xff, (addr >>> 16) & 0xff,
    (addr >>> 24) & 0xff, len & 0xff, (len >>> 8) & 0xff,
    (len >>> 16) & 0xff];
  body.push((~body.slice(6).reduce((sum, byte) => sum + byte, 0)) & 0xff);
  return [0xf0, ...pack7(body), 0xf7];
}

function syntheticLink(packets, sendResult = () => true) {
  const pending = [...packets];
  return {
    lost: false, sent: [], reads: 0, closed: 0,
    async read() { this.reads++; return pending.shift() || null; },
    send(frame) { this.sent.push([...frame]); return sendResult(this.sent.length); },
    close() { this.closed++; },
  };
}

function updaterFor(link, loader = true) {
  const name = 'FM-1';
  const input = { name, state: 'connected' };
  const updater = new Updater({ inputs: new Map([['input', input]]), outputs: new Map() });
  // Discovery is synthetic; bind, serve, write, install and resume stay production code.
  updater.find = async () => ({ name, link,
    id: { text: loader ? 'ota-FM-1_1' : 'FM-1_1', model: loader ? 'ota-FM-1' : 'FM-1', version: 1 } });
  return updater;
}

test('failed ACK for either finish marker stops both stages even before port state changes', async () => {
  for (const marker of [0xe0000000, 0xf0000000]) {
    for (const expected of [0xe0000000, 0xf0000000]) {
      const link = syntheticLink([request(0, 8), request(marker), request(expected)], n => n !== 2);
      const result = await updaterFor(link).serve(link, new Uint8Array(32), expected, 20);
      assert.deepEqual(result, { served: 1, finished: false, lost: true });
      assert.equal(link.reads, 2, 'failed ACK must not consume a later completion request');
      assert.equal(link.sent.length, 2, 'failed ACK must stop the exchange');
    }
  }
});

test('acknowledged other-stage marker preserves the later valid expected finish', async () => {
  for (const expected of [0xe0000000, 0xf0000000]) {
    const other = expected === 0xe0000000 ? 0xf0000000 : 0xe0000000;
    const link = syntheticLink([request(0, 8), request(other), request(expected)]);
    const result = await updaterFor(link).serve(link, new Uint8Array(32), expected, 20);
    assert.deepEqual(result, { served: 1, finished: true });
    assert.equal(link.sent.length, 3);
  }
});

test('failed ordinary data reply still reports transport loss without progress', async () => {
  const link = syntheticLink([request(0, 8), request(0xf0000000)], () => false);
  const progress = [];
  const result = await updaterFor(link).serve(link, new Uint8Array(32), 0xf0000000, 20, n => progress.push(n));
  assert.deepEqual(result, { served: 0, finished: false, lost: true });
  assert.deepEqual(progress, []);
  assert.equal(link.reads, 1);
});

test('a latched receive error is propagated, not converted into successful completion', async () => {
  const overflow = Object.assign(new Error('MIDI receive overflow'), { code: 'overflow' });
  const link = syntheticLink([request(0xf0000000)], () => { throw overflow; });
  await assert.rejects(updaterFor(link).serve(link, new Uint8Array(32), 0xf0000000, 20), error => error === overflow);
});

test('resume returns false and closes the link when the loader finish ACK fails', async () => {
  const link = syntheticLink([request(0, 8), request(0xf0000000)], n => n !== 3);
  const steps = [];
  const result = await updaterFor(link).resume(new Uint8Array(32), (...args) => steps.push(args), 'FM-1_2');
  assert.equal(result, false);
  assert.equal(link.closed, 1);
  assert.deepEqual(steps, [['write', 1]]);
  assert.equal(link.sent.length, 3); // upgrade, data, failed finish ACK
});

test('a fresh resume still succeeds after a previous failed finish ACK', async () => {
  const failed = syntheticLink([request(0xf0000000)], n => n !== 2);
  const updater = updaterFor(failed);
  assert.equal(await updater.resume(new Uint8Array(32), null, 'FM-1_2'), false);
  assert.equal(failed.closed, 1);
  const retry = syntheticLink([request(0, 8), request(0xf0000000)]);
  updater.find = updaterFor(retry).find;
  const back = syntheticLink([]);
  updater.waitFor = async filter => {
    const id = { text: 'FM-1_2', model: 'FM-1', version: 2 };
    assert.equal(filter(id), true);
    return { name: 'FM-1', id, link: back };
  };
  const steps = [];
  assert.equal(await updater.resume(new Uint8Array(32), (...args) => steps.push(args), 'FM-1_2'), true);
  assert.equal(retry.closed, 1);
  assert.equal(back.closed, 1);assert.equal(updater.verified, true);
  assert.deepEqual(steps, [['write', 1], ['reboot'], ['done', 'FM-1_2']]);
  assert.equal(retry.sent.length, 3);
});

test('install aborts before loader discovery when first-stage finish ACK fails', async () => {
  const link = syntheticLink([request(0, 8), request(0xe0000000)], n => n !== 3);
  const updater = updaterFor(link, false);
  updater.waitFor = async () => { assert.fail('failed first-stage ACK must not enter loader discovery'); };
  const steps = [];
  await assert.rejects(updater.install(new Uint8Array(32), 'FM-1_2', (...args) => steps.push(args)), { code: 'lost' });
  assert.equal(link.closed, 1);
  assert.equal(updater.verified, false);
  assert.deepEqual(steps, [['start', 'FM-1_1'], ['verify', 1]]);
});
