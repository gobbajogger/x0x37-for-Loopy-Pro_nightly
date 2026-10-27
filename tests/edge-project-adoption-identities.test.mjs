// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectDevice, PROJECT_OP } from '../web/x0x_projects.js';

test('legacy adoption requires two explicit dense identities, never an omitted engine', async () => {
  const device = new ProjectDevice({}), calls = [];
  device.projectProtocol = 2;
  device.command = async (...args) => calls.push(args);
  for (const engines of [new Array(2), [,0], [0,,], [,1], [1,,], [undefined,0], [0,null], [true,0], [0,2], [1,1]]) {
    await assert.rejects(device.adoptLegacyBass(engines, { confirmed: true }), e => e.code === 'identity');
    assert.deepEqual(calls, [], 'invalid identities cannot send an adoption command');
  }
  for (const confirmed of [undefined, false, 1, 'true']) {
    await assert.rejects(device.adoptLegacyBass([0,0], { confirmed }), e => e.code === 'identity');
    assert.deepEqual(calls, []);
  }
  for (const engines of [[0,0], [0,1], [1,0]]) {
    await device.adoptLegacyBass(engines, { confirmed: true });
    assert.deepEqual(calls.at(-1), [PROJECT_OP.ADOPT_BASS, [...engines, 0x58, 0x30]]);
  }
  assert.equal(calls.length, 3);
});
