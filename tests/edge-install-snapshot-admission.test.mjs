// SPDX-License-Identifier: GPL-3.0-only
// A selection revoked during the final read-only capability query must not
// send the atomic command that enters OTA. No firmware or hardware is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { beginInstallSnapshot, commitInstallSnapshot } from '../web/x0x_breaks.js';
import { withInstallSnapshot } from './fixtures/install-snapshot.mjs';

async function attempt(revokeDuringInfo) {
  const link = { send() { throw Error('Unexpected non-snapshot command'); },
    read: async () => null, drain() {} };
  const state = withInstallSnapshot(link);
  const snapshot = await beginInstallSnapshot(link);
  let admitted = true;
  const read = link.read.bind(link);
  link.read = async (...args) => {
    const frame = await read(...args);
    if (revokeDuringInfo && frame?.[4] === 1) admitted = false;
    return frame;
  };
  let error;
  try { await commitInstallSnapshot(link, snapshot, () => admitted); }
  catch (e) { error = e; }
  return { state, snapshot, error };
}

test('current selection permits one atomic snapshot COMMIT', async () => {
  const { state, snapshot, error } = await attempt(false);
  assert.equal(error, undefined);
  assert.deepEqual(state.operations, [1, 3]);
  assert.equal(state.commits, 1);
  assert.equal(snapshot.consumed, true);
});

test('selection revoked during final INFO sends no atomic COMMIT', async () => {
  const { state, snapshot, error } = await attempt(true);
  assert.equal(error?.code, 'slotbackup');
  assert.match(error.message, /no longer approved/);
  assert.deepEqual(state.operations, [1]);
  assert.equal(state.commits, 0);
  assert.equal(snapshot.consumed, true, 'the rejected snapshot is never reused');
});
