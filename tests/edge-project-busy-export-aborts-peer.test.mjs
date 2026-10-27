// SPDX-License-Identifier: GPL-3.0-only
// EC-20261027-030: a rejected EXPORT BEGIN must not abort a different MIDI client's project import.
// TEST ONLY. Synthetic MIDI/firmware state machine based on firmware/src/app/editor.c op 65/70.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectDevice, readProjectSnapshot, PROJECT_OP } from '../web/x0x_projects.js';

const PROJECT_BYTES = 36452;
const u21 = n => [n & 127, (n >>> 7) & 127, (n >>> 14) & 127];
const frame = values => [0xF0, 0x7D, 0x46, 0x4C, 9, ...values, 0xF7];

function scenario({ anotherClientTakesTransferAfterQuery = false } = {}) {
  let deviceMode = 0;
  let peerWasAborted = false;
  let abortCount = 0;
  let exportCount = 0;
  const sent = [];
  const responses = [];
  const link = {
    drain() { responses.length = 0; },
    send(data) {
      const op = data[5];
      assert.equal(data[4], 9, 'Only project protocol commands are expected');
      sent.push(op);
      if (op === PROJECT_OP.QUERY) {
        responses.push(frame([op, 0, 1, ...u21(PROJECT_BYTES), deviceMode]));
      } else if (op === PROJECT_OP.EXPORT) {
        exportCount++;
        if (anotherClientTakesTransferAfterQuery) {
          // Firmware's QUERY was idle. A second MIDI client begins IMPORT before EXPORT.
          // The actual firmware refuses the later EXPORT with RC=2 and keeps its mode=2.
          deviceMode = 2;
          responses.push(frame([op, 2]));
        } else {
          deviceMode = 1;
          responses.push(frame([op, 0, ...u21(PROJECT_BYTES)]));
        }
      } else if (op === PROJECT_OP.ABORT) {
        // firmware/src/app/editor.c::ed_project_handle case 70 unconditionally ends
        // the current global session. It cannot identify the originating MIDI client.
        abortCount++;
        if (deviceMode === 2) peerWasAborted = true;
        deviceMode = 0;
        responses.push(frame([op, 0]));
      } else {
        throw new Error(`Unexpected command ${op}`);
      }
      return true;
    },
    read() { return Promise.resolve(responses.shift() ?? null); },
  };
  const device = new ProjectDevice(link, { timeout: 100 });
  device.identity = 'X0X simulated device';
  device.projectLength = PROJECT_BYTES;
  // When own EXPORT succeeded, model a later failed read (abort IS then needed).
  device.snapshotSlots = async () => { throw new Error('Controlled interrupted snapshot'); };
  return { device, sent, get state() { return { deviceMode, peerWasAborted, abortCount, exportCount }; } };
}

test('control: interrupted successfully acquired export releases its own transfer', async () => {
  const sim = scenario();
  await assert.rejects(readProjectSnapshot(sim.device), /Controlled interrupted snapshot/);
  assert.equal(sim.state.exportCount, 1);
  assert.equal(sim.state.abortCount, 1);
  assert.equal(sim.state.deviceMode, 0);
  assert.equal(sim.state.peerWasAborted, false);
});

test('negative: rejected BUSY export must not ABORT the concurrent client import', async () => {
  const sim = scenario({ anotherClientTakesTransferAfterQuery: true });
  await assert.rejects(readProjectSnapshot(sim.device), error => error.rc === 2);
  assert.equal(sim.state.exportCount, 1);
  assert.equal(sim.state.abortCount, 0, 'BUSY rejection definitively denied session acquisition');
  assert.equal(sim.state.deviceMode, 2, 'Another MIDI client must retain its import hold');
  assert.equal(sim.state.peerWasAborted, false, 'Never abort a different client\'s project transfer');
});
