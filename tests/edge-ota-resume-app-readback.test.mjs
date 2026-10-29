// SPDX-License-Identifier: GPL-3.0-only
// EC019: a loader's finish acknowledgment is not proof that the installed
// application rebooted and reports the requested firmware identity.
// Regression-only, intentionally RED on NIGHTLY main d8660c2caf01f67ca07628fef7a8489570ccb96a.
// Simulated discovery and successful loader transfer; NO device flash.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const source = readFileSync(new URL('../web/fm1ota.js', import.meta.url), 'utf8');
const context = { TextEncoder, setTimeout, clearTimeout };
new Script(source.replace(/^export\s+/gm, '') + '\nthis.Updater = Updater;')
  .runInNewContext(context);
const { Updater } = context;

test('OTA resume refuses completed-install success when application never returns', async () => {
  const product = 'SMK-37 Elite_900';
  const name = 'SMK-37 Elite';
  const input = { name, state: 'connected' }, output = { name, state: 'connected' };
  const listeners = new Set();
  const loader = {
    name,
    id: { model: 'ota-SMK-37 Elite', version: 900, text: 'ota-SMK-37 Elite_900' },
    link: { input, output, close() {} },
  };
  const access = {
    inputs: new Map([['keyboard', input]]),
    outputs: new Map([['keyboard', output]]),
    addEventListener(type, listener) { assert.equal(type, 'statechange'); listeners.add(listener); },
    removeEventListener(type, listener) { assert.equal(type, 'statechange'); listeners.delete(listener); },
  };
  const updater = new Updater(access);
  const image = new Uint8Array(128);
  let loaderTransfers = 0;
  let postBootChecks = 0;

  updater.find = async filter => {
    assert.equal(filter(loader.id), true, 'fixture models a valid matching-model OTA loader');
    return loader;
  };
  updater.write = async (_loader, bytes) => {
    assert.equal(_loader, loader);
    assert.equal(bytes, image);
    loaderTransfers++;
    return { served: 3, finished: true }; // transport ACK succeeds
  };
  updater.waitFor = async () => {
    postBootChecks++;
    return null; // device never reboots to an application exposing its identity
  };

  let result;
  try { result = await updater.resume(image, () => {}, product); }
  catch (error) { result = error; }

  assert.equal(loaderTransfers, 1, 'the loader transfer must complete in this scenario');
  assert.ok(postBootChecks > 0,
    'a successful loader ACK must be followed by a new application identity readback');
  assert.notEqual(result, true,
    'an absent application must not be reported to the installer UI as Done');
  assert.equal(result?.code, 'noreturn');
  assert.equal(updater.verified, false);
  updater.close();
  assert.equal(listeners.size, 0);
});
