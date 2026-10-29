// SPDX-License-Identifier: GPL-3.0-only
// EC-012: exercise the production parser and preflash path using synthetic replies.
import { withInstallSnapshot } from './fixtures/install-snapshot.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInfo, flashMap, atRisk, installKeepingSlots } from '../web/x0x_breaks.js';

const A = 0xC2000, B = 0xD6000, SIZE = 0x14000;
function info(map, occupied = map.map(() => 1)) {
  const bytes = [map.length, 80];
  occupied.forEach(nz => bytes.push(nz, ...(nz ? [65] : []), 0, nz ? 1 : 0));
  bytes.push(0x58, 1);
  map.forEach(({ off, size }, k) => {
    for (const n of [off / 4096, size / 4096, occupied[k] ? 1 : 0])
      bytes.push(n & 127, (n >> 7) & 127);
  });
  return bytes;
}
const map = [{ off: A, size: SIZE }, { off: B, size: SIZE }];

test('valid touching ranges, reverse order and empty descriptors retain their map', () => {
  for (const ranges of [map, [...map].reverse()]) {
    for (const occupied of [[1, 1], [1, 0], [0, 1], [0, 0]]) {
      const layout = parseInfo(info(ranges, occupied));
      assert.deepEqual(flashMap(layout), ranges);
      assert.deepEqual(atRisk(layout, ranges, []), occupied.flatMap((n, k) => n ? [k] : []));
    }
  }
});

test('legacy occupied and empty slots retain inferred SMK map', () => {
  for (const occupied of [[1, 1], [1, 0], [0, 0]]) {
    const extended = info(map, occupied);
    const layout = parseInfo(extended.slice(0, extended.length - 14));
    assert.equal(layout.ext, false);
    assert.deepEqual(flashMap(layout), map);
  }
});

test('duplicate, partial, enclosing and empty-slot overlap ranges are rejected', () => {
  for (const ranges of [
    [map[0], map[0]],
    [map[0], { off: A + 4096, size: SIZE }],
    [{ off: A, size: SIZE * 2 }, map[1]],
    [map[0], { off: A - 4096, size: SIZE * 2 }],
  ]) for (const occupied of [[1, 1], [1, 0], [0, 0]])
    assert.throws(() => parseInfo(info(ranges, occupied)), /overlapping SMP_INFO/);
});

test('zero ranges, overflowing usage and partial extensions cannot become legacy maps', () => {
  for (const entry of [{ off: 0, size: SIZE }, { off: A, size: 0 }])
    assert.throws(() => parseInfo(info([entry])), /invalid.*SMP_INFO/);
  const overused = info([map[0]]);
  overused.splice(-2, 2, 81, 0);
  assert.throws(() => parseInfo(overused), /invalid.*SMP_INFO/);
  const reply = info(map);
  for (let n = reply.length - 13; n < reply.length; n++)
    assert.throws(() => parseInfo(reply.slice(0, n)), /SMP_INFO flash-map extension/);
});

test('invalid ranges fail before sample reads, backup save or OTA on the actual installer path', async () => {
  for (const second of [A, A + 4096]) {
    const commands = [], events = [];
    let response;
    const link = {
      drain() {}, close() { events.push('close'); },
      send(frame) {
        commands.push(frame[4]);
        assert.equal(frame[4], 15);
        response = [0xf0, 0x7d, 0x46, 0x4c, 15,
          ...info([map[0], { off: second, size: SIZE }]), 0xf7];
        return true;
      },
      async read() { return response; },
    };
    const up = {
      async find() { return { link, id: { model: 'SMK-37 Pro', version: 900 } }; },
      bind() {}, async install() { events.push('OTA'); },
    };
    withInstallSnapshot(link, up);
    await assert.rejects(installKeepingSlots(up, new Uint8Array(), 'SMK-37 Pro_901', 'smk', {
      save() { events.push('save'); },
    }), e => e.code === 'slotbackup' && /overlapping SMP_INFO/.test(e.message));
    assert.deepEqual(commands, [15]);
    assert.deepEqual(events, ['close']);
  }
});
