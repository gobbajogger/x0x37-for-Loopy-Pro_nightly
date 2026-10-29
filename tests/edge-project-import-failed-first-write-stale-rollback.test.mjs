// SPDX-License-Identifier: GPL-3.0-only
// EC039 test-only. Run: node --test tests/edge-project-import-failed-first-write-stale-rollback.test.mjs
// Production function is extracted directly from ../web/x0x_projects.js, not reimplemented.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const filename = new URL('../web/x0x_projects.js', import.meta.url);
const source = fs.readFileSync(filename, 'utf8');
const start = source.indexOf('export async function applyProjectImport(');
const end = source.indexOf('\n// Mode 3 can outlive', start);
const body = source.slice(start, end >= 0 ? end : source.length);
assert.ok(start >= 0 && body.includes('touched.push(k);') && body.includes('await device.abort();'),
  'Production project-import function and cleanup path must be present');

function scenario(peerChanged) {
  const prior = Uint8Array.of(1), otherClient = Uint8Array.of(2), wanted = Uint8Array.of(3);
  const project = Uint8Array.of(42), layout = { count: 1, size: 4096, slots: [{ off: 0, nz: 1, size: 4096 }] };
  const before = { project, images: [prior], layout };
  const file = { project, images: [wanted], portable: true, bytes: Uint8Array.of(7) };
  const backup = { project, images: [prior], portable: true };
  const backupBytes = Uint8Array.of(8);
  const prepared = { file, backupBytes, before, recovery: false };
  let live = Uint8Array.from(prior), beginSnapshot = null, writes = 0;
  const events = [];
  const sameBytes = (a, b) => a && b && a.length === b.length && a.every((x, k) => x === b[k]);
  const device = {
    projectLength: 1, mode: 0, active: false,
    async query() { return 1; },
    async stage() {
      // Deterministic second-client interleaving: after the last read-only freshness
      // snapshot, before the firmware accepts IMPORT and snapshots live slots.
      if (peerChanged) { live = Uint8Array.from(otherClient); events.push('peer replaced A with B before IMPORT'); }
      beginSnapshot = Uint8Array.from(live); this.mode = 2; this.active = true; events.push('IMPORT acquired hold');
    },
    async validate() { events.push('project VALIDATE accepted'); },
    async snapshotSlots() { return { layout, images: [Uint8Array.from(live)] }; },
    async writeSlot(k, image) {
      writes++;
      if (writes === 1) {
        events.push('first destination SMP_BEGIN rejected before data write');
        throw new Error('Injected definitive first sample write rejection');
      }
      live = Uint8Array.from(image);
      events.push(`rollback wrote sample ${live[0]}`);
    },
    async abort() {
      if (!sameBytes(live, beginSnapshot)) {
        this.mode = 3; events.push('firmware recovery hold after sample snapshot mismatch');
        throw Object.assign(new Error('Recovery hold rc=2'), { rc: 2 });
      }
      this.mode = 0; this.active = false; events.push('firmware ABORT released hold');
    }
  };
  const sandbox = {
    Uint8Array, JSON,
    fail: (message, code) => Object.assign(new Error(message), { code }),
    sameBytes,
    readProjectFile: async (bytes) => bytes === file.bytes ? file : backup,
    planProjectImport: async () => ({ changes: [{ k: 0 }], collisions: [{ k: 0 }], unchanged: [] }),
    readProjectSnapshot: async () => before,
    slotSize: () => 4096,
    verifyImages: async (_device, images) => assert.ok(sameBytes(live, images[0]), 'rollback verification is byte-exact'),
    applyRecoveryImport() { throw new Error('recovery path not expected'); }
  };
  vm.createContext(sandbox);
  vm.runInContext(body.replace('export async function', 'async function') + '\nthis.runImport = applyProjectImport;', sandbox,
    { filename: 'web/x0x_projects.js' });
  return { run: () => sandbox.runImport(device, prepared, { confirmed: true, backupSaved: true }), events,
    state: () => ({ live: Array.from(live), mode: device.mode, writes }) };
}

test('control: failed first write with no peer preserves original sample and exits hold', async () => {
  const s = scenario(false);
  await assert.rejects(s.run(), /Injected definitive first sample write rejection/);
  assert.deepEqual(s.state(), { live: [1], mode: 0, writes: 2 });
});

test('negative: failed import must preserve new peer sample written after snapshot, before BEGIN', async () => {
  const s = scenario(true);
  await assert.rejects(s.run(), error => error.code === 'changed');
  assert.deepEqual(s.state().live, [2], 'peer-owned newer sample must not be erased by stale recovery backup');
  assert.equal(s.state().mode, 0, 'failed import must not strand recovery hold');
  assert.equal(s.state().writes, 0, 'stage-time mismatch must reject before destination or rollback writes');
});
