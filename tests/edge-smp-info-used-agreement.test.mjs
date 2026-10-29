// SPDX-License-Identifier: GPL-3.0-only
// EC022: firmware144 editor.c:884-921 emits min(127, used) plus full 14-bit used.
import { withInstallSnapshot } from './fixtures/install-snapshot.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInfo, flashMap, atRisk, backupSlots, installKeepingSlots } from '../web/x0x_breaks.js';

const disagreement = /legacy\/extended used-size disagreement/;
const descriptor = (kb, nz) => [1, 80, nz, ...(nz ? [65] : []), 0, kb];
function reply(used, kb = Math.min(127, used), nz = used ? 1 : 0) {
  return [...descriptor(kb, nz), 0x58, 1, 0x42, 1, 0, 1, used & 127, used >> 7];
}

test('producer-compatible unsaturated and saturated usage remains valid without losing full usage', () => {
  for (let used = 0; used <= 512; used++) {
    const layout = parseInfo(Uint8Array.from(reply(used)));
    assert.equal(layout.slots[0].kb, Math.min(127, used));
    assert.equal(layout.slots[0].used, used);
    assert.equal(layout.ext, true);
  }
  const layout = parseInfo(reply(160));
  assert.deepEqual(atRisk(layout, flashMap(layout), [{ off: 0xc2000, size: 128 * 1024 }]), [0]);
  assert.deepEqual(atRisk(layout, flashMap(layout), [{ off: 0xc2000, size: 256 * 1024 }]), []);
});

test('both directions of disagreement are refused, including saturation boundary and empty descriptors', () => {
  for (const [kb, used, nz] of [[100, 0, 1], [0, 100, 1], [126, 128, 1], [127, 126, 1],
    [100, 99, 1], [100, 101, 1], [0, 1, 0], [1, 0, 0]])
    assert.throws(() => parseInfo(reply(used, kb, nz)), disagreement, `${kb}/${used}/${nz}`);
});

test('genuine legacy and empty extension replies remain valid', () => {
  for (const [kb, nz] of [[0, 0], [1, 1], [80, 1]]) {
    const layout = parseInfo(descriptor(kb, nz));
    assert.equal(layout.ext, false);
    assert.equal(layout.slots[0].used, kb);
  }
  const empty = parseInfo(reply(0));
  assert.equal(empty.slots[0].nz, 0);
  assert.deepEqual(atRisk(empty, flashMap(empty), []), []);
});

function linkFor(bytes) {
  const commands = [], events = [];
  return { commands, events,
    drain() {}, close() { events.push('close'); },
    send(frame) { commands.push(frame[4]); assert.equal(frame[4], 15); return true; },
    async read() { return [0xf0, 0x7d, 0x46, 0x4c, 15, ...bytes, 0xf7]; },
  };
}

test('contradictory usage rejects standalone backup before any sample read or progress', async () => {
  const link = linkFor(reply(0, 100, 1));
  await assert.rejects(backupSlots(link, () => link.events.push('progress')), disagreement);
  assert.deepEqual(link.commands, [15]);
  assert.deepEqual(link.events, []); // standalone caller retains link ownership
});

test('actual installer refuses contradiction before backup, sample commands or OTA and closes its link', async () => {
  for (const version of [900, 16]) {
    const link = linkFor(reply(0, 100, 1));
    const up = {
      async find() { return { link, id: { model: 'SMK-37 Pro', version } }; },
      bind() {}, async install() { link.events.push('OTA'); },
    };
    withInstallSnapshot(link, up);
    await assert.rejects(installKeepingSlots(up, new Uint8Array(80), 'SMK-37 Pro_901', 'smk', {
      save() { link.events.push('save'); return true; }, progress() { link.events.push('progress'); },
    }), e => e.code === 'slotbackup' && disagreement.test(e.message));
    assert.deepEqual(link.commands, [15]);
    assert.deepEqual(link.events, ['close']);
  }
});
