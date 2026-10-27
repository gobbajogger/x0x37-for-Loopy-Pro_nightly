// SPDX-License-Identifier: GPL-3.0-only
// EC021: actual per-slot capacities bound backup and post-restore readback.
import { withInstallSnapshot } from './fixtures/install-snapshot.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { readSlotImage, backupSlots, restoreMapped, installKeepingSlots, pack78, crc32,
  SLOT_SIZE, SLOT_HDR_AREA } from '../web/x0x_breaks.js';

const capacityError = /sample data exceeds slot capacity|invalid sample slot capacity/;
function image(length, declared = length) {
  const out = new Uint8Array(512 + length), v = new DataView(out.buffer);
  for (let i = 512; i < out.length; i++) out[i] = (i * 7 + 3) & 255;
  v.setUint32(0, 0x504d5346, true); v.setUint16(4, 1, true);
  out[6] = 1; out[8] = 65;
  v.setUint32(16, declared, true); v.setUint32(20, crc32(out.subarray(512)), true);
  v.setUint32(36, length * 2, true); v.setUint32(48, 65536, true);
  return out;
}
function info(sizes, images, extended = true) {
  const bytes = [sizes.length, Math.min(...sizes) / 1024];
  images.forEach(img => bytes.push(...(img ? [1, 65, 0, Math.min(127, Math.ceil((img.length - 512) / 1024))] : [0, 0, 0])));
  if (extended) {
    bytes.push(0x58, 1);
    let off = 0x80000;
    sizes.forEach((size, k) => {
      for (const n of [off / 4096, size / 4096, images[k] ? Math.ceil((images[k].length - 512) / 1024) : 0])
        bytes.push(n & 127, (n >> 7) & 127);
      off += size;
    });
  }
  return bytes;
}
function linkFor(images, layout = []) {
  let response;
  const events = [];
  return {
    events, drain() {}, close() { events.push({ close: true }); },
    send(frame) {
      const cmd = frame[4], k = frame[5], off = frame[6] | frame[7] << 7 | frame[8] << 14;
      const n = frame[9] * 2;
      events.push({ cmd, k, off, n });
      let payload;
      if (cmd === 15) payload = layout;
      else if (cmd === 16) payload = [k, frame[6], frame[7], frame[8], ...pack78(images[k].subarray(off, off + n))];
      else if (cmd === 11 || cmd === 13) payload = [k, 0];
      else if (cmd === 12) payload = [k, frame[6], frame[7], frame[8], 0];
      else assert.fail(`unexpected command ${cmd}`);
      response = [0xf0, 0x7d, 0x46, 0x4c, cmd, ...payload, 0xf7];
      return true;
    },
    async read() { return response; },
  };
}
function assertHeaderOnly(link, k = 0) {
  assert.deepEqual(link.events.filter(e => e.cmd === 16).map(e => [e.k, e.off]), [[k, 0], [k, 224], [k, 448]]);
}

test('exact-fit occupied images and progress work across smaller and larger capacities', async () => {
  for (const capacity of [4096, 44 * 1024, SLOT_SIZE, 112 * 1024]) {
    const expected = image(capacity - SLOT_HDR_AREA), link = linkFor([expected]), progress = [];
    const actual = await readSlotImage(link, 0, 1, (done, total) => progress.push([done, total]), capacity);
    assert.deepEqual(actual, expected);
    assert.deepEqual(progress.at(-1), [capacity - 512, capacity - 512]);
    assert.ok(link.events.every(e => e.off + e.n <= capacity));
  }
});

test('one byte over each actual capacity is refused before sample data reads', async () => {
  for (const capacity of [4096, 44 * 1024, SLOT_SIZE, 112 * 1024]) {
    const link = linkFor([image(0, capacity - 511)]);
    await assert.rejects(readSlotImage(link, 0, 1, undefined, capacity), capacityError);
    assertHeaderOnly(link);
  }
});

test('invalid explicit capacities refuse before even a header request; empty slots stay read-free', async () => {
  for (const capacity of [0, 511, -1, 512.5, NaN, Infinity, null, '81920']) {
    const link = linkFor([image(128)]);
    await assert.rejects(readSlotImage(link, 0, 1, undefined, capacity), capacityError);
    assert.deepEqual(link.events, []);
  }
  const link = linkFor([]);
  assert.equal(await readSlotImage(link, 0, 0), null);
  assert.deepEqual(link.events, []);
});

for (const declared of [SLOT_SIZE - 511, 0x200000, 0xffffffff]) {
  test(`full production module rejects length ${declared} before requesting a data allocation`, async () => {
    // Intercept numeric allocations in an isolated realm; never allocate a 4-GiB test buffer.
    const source = readFileSync(new URL('../web/x0x_breaks.js', import.meta.url), 'utf8');
    const attempts = [], link = linkFor([image(0, declared)]);
    const GuardedBytes = new Proxy(Uint8Array, { construct(target, args) {
      if (typeof args[0] === 'number') {
        attempts.push(args[0]);
        if (args[0] > SLOT_SIZE - 512) throw new Error('allocation sentinel: ' + args[0]);
      }
      return Reflect.construct(target, args);
    } });
    const context = { Uint8Array: GuardedBytes, DataView, TextEncoder, TextDecoder };
    new Script(source.replace(/^export\s+/gm, '') + '\nthis.readImage = readSlotImage;').runInNewContext(context);
    await assert.rejects(context.readImage(link, 0, 1), capacityError);
    assert.deepEqual(attempts, [512], 'only the fixed-size header buffer is allocated');
    assertHeaderOnly(link);
  });
}

test('backup propagates mixed extension sizes and genuine legacy capacity, preserving occupied and empty slots', async () => {
  for (const [sizes, images, extended] of [
    [[4096, 112 * 1024, 4096], [image(128), image(112 * 1024 - 512), null], true],
    [[40 * 1024, 40 * 1024], [image(128), null], false],
  ]) {
    const link = linkFor(images, info(sizes, images, extended));
    const snapshot = await backupSlots(link);
    assert.deepEqual(snapshot.images, images);
    assert.deepEqual(snapshot.layout.slots.map(s => s.size), sizes);
    assert.ok(link.events.filter(e => e.cmd === 16).every(e => e.off + e.n <= sizes[e.k]));
  }
});

test('backup uses the small actual slot, not legacy default or another slot capacity', async () => {
  for (const extended of [true, false]) {
    const sizes = extended ? [4096, 112 * 1024] : [4096, 4096];
    const images = [image(0, 4096), null], link = linkFor(images, info(sizes, images, extended));
    await assert.rejects(backupSlots(link), capacityError);
    assertHeaderOnly(link);
    assert.ok(link.events.every(e => e.cmd === 15 || e.cmd === 16));
  }
});

test('restore readback propagates fresh destination capacity, both valid large and invalid small', async () => {
  const big = image(112 * 1024 - 512), sizes = [4096, 112 * 1024];
  const good = linkFor([null, big], info(sizes, [null, big]));
  await restoreMapped(good, [{ k: 0, j: 1 }], [big]);
  assert.ok(good.events.filter(e => e.cmd === 16).every(e => e.off + e.n <= sizes[e.k]));
  const expected = image(128), bad = image(0, 4096);
  const link = linkFor([null, bad], info([4096, 4096], [null, bad]));
  await assert.rejects(restoreMapped(link, [{ k: 0, j: 1 }], [expected]), capacityError);
  assertHeaderOnly(link, 1);
  assert.ok(link.events.findIndex(e => e.cmd === 13) < link.events.findIndex(e => e.cmd === 15),
    'this checks readback after simulated restore writes, not a prewrite gate');
});

test('oversized occupied backup aborts installer before save, progress, sample writes or OTA', async () => {
  const images = [image(0, 4096)], link = linkFor(images, info([4096], images)), events = [];
  const up = {
    async find() { return { link, id: { model: 'SMK-37 Pro', version: 900 } }; },
    bind() {}, async install() { events.push('OTA'); },
  };
  withInstallSnapshot(link, up);
  await assert.rejects(installKeepingSlots(up, new Uint8Array(80), 'SMK-37 Pro_901', 'smk', {
    save() { events.push('save'); return true; }, progress() { events.push('progress'); },
  }), error => error.code === 'slotbackup' && capacityError.test(error.message));
  assertHeaderOnly(link);
  assert.deepEqual(events, []);
  assert.ok(link.events.every(e => e.close || e.cmd === 15 || e.cmd === 16));
  assert.equal(link.events.filter(e => e.close).length, 1);
});
