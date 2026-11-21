// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInfo, RemoteConnection} from '../../web/product-site/remote/identity/remote.mjs';
import * as publicModule from '../../web/product-site/remote/remote.mjs';

// Captured from app/editor.c at 76040daa by stock-editor-probe.c.
const current = [...Buffer.from('f07d464c0158305820444556000000004000005853470130f7', 'hex')];
const legacy = [...current.slice(0, -6), 0xf7];

test('legacy and stock snapshot-capable replies identify firmware without admitting controls', () => {
  for (const frame of [legacy, current]) {
    const info = {version: 'X0X DEV', steps: 64, remoteControl: false, authority: 'uncorrelated identity reply'};
    assert.deepEqual(parseInfo(frame), info);
    assert.deepEqual(publicModule.parseInfo(frame), info);
  }
  assert.throws(() => new RemoteConnection().command(), /does not expose/);
});

test('identity rejects partial, unknown and extended XSG capabilities', () => {
  const ext = current.slice(-6, -1);
  const envelope = tail => [...legacy.slice(0, -1), ...tail, 0xf7];
  for (let n = 1; n < ext.length; n++) assert.throws(() => parseInfo(envelope(ext.slice(0, n))));
  for (let i = 0; i < ext.length; i++) {
    const changed = ext.slice();
    changed[i] ^= 1;
    assert.throws(() => parseInfo(envelope(changed)));
  }
  assert.throws(() => parseInfo(envelope([...ext, 0])));
  const changedCounts = current.slice();
  changedCounts[changedCounts.indexOf(0, 5) + 1] = 1;
  assert.throws(() => parseInfo(changedCounts));
});
