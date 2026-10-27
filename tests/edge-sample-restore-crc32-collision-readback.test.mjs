// SPDX-License-Identifier: GPL-3.0-only
// EC-20261027-029, test-only: a CRC32 collision must not turn a different,
// internally valid sample image into a verified post-write readback.
// The test uses the real restoreMapped/readSlotImage/writeSlotImage/CRC32 code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { userSlotRaw, crc32, parseHeader, restoreMapped, pack78 } from '../web/x0x_breaks.js';

const PREFIX = [0xF0, 0x7D, 0x46, 0x4C];
const PATCH_AT = 400; // Unused header zone (slot contains only one zone).
const byteSame = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

function sample(seed) {
  const adpcm = Uint8Array.from({ length: 32 }, (_, i) => (seed + 17 * i) & 255);
  const { hdr, data } = userSlotRaw('BEAT', [{ adpcm, n: 64, rate: 44100 }]);
  const image = new Uint8Array(512 + data.length);
  image.set(hdr);
  image.set(data, 512);
  return image;
}

// CRC32 is linear over GF(2). Solve four otherwise unused header bytes so a
// second, valid sample with different audio has the same WHOLE-IMAGE CRC32.
// This is a deterministic collision fixture, not a random corruption lottery.
function differentValidImageWithSameCRC(wanted) {
  const actual = sample(97);
  const baseline = crc32(actual), target = crc32(wanted);
  const pivot = Array(32).fill(0), combination = Array(32).fill(0n);
  for (let i = 0; i < 32; i++) {
    const changed = actual.slice();
    changed[PATCH_AT + (i >> 3)] ^= 1 << (i & 7);
    let vector = (crc32(changed) ^ baseline) >>> 0;
    let mask = 1n << BigInt(i);
    for (let bit = 31; bit >= 0; bit--) {
      if (!((vector >>> bit) & 1)) continue;
      if (pivot[bit]) { vector = (vector ^ pivot[bit]) >>> 0; mask ^= combination[bit]; }
      else { pivot[bit] = vector; combination[bit] = mask; break; }
    }
  }
  let delta = (target ^ baseline) >>> 0, flips = 0n;
  for (let bit = 31; bit >= 0; bit--) {
    if (!((delta >>> bit) & 1)) continue;
    assert.notEqual(pivot[bit], 0, 'the 32-byte CRC patch matrix has full rank');
    delta = (delta ^ pivot[bit]) >>> 0;
    flips ^= combination[bit];
  }
  assert.equal(delta, 0);
  for (let i = 0; i < 32; i++) {
    if (flips & (1n << BigInt(i))) actual[PATCH_AT + (i >> 3)] ^= 1 << (i & 7);
  }
  assert.equal(crc32(actual), crc32(wanted), 'the full images have identical CRC32');
  assert.ok(!byteSame(actual, wanted), 'sample images differ');
  assert.ok(!byteSame(actual.subarray(512), wanted.subarray(512)), 'actual ADPCM differs');
  for (const image of [wanted, actual]) {
    const header = parseHeader(image.subarray(0, 480));
    assert.ok(header && header.nz === 1 && header.dataLen === 32);
    assert.equal(header.crc, crc32(image.subarray(512)), 'inner sample-data CRC is valid');
  }
  return actual;
}

function mockedKeyboard(readback) {
  return {
    history: [], reply: null,
    drain() { this.reply = null; },
    send(frame) {
      this.history.push([...frame]);
      const cmd = frame[4], slot = frame[5];
      if (cmd === 11 || cmd === 13 || cmd === 14) {
        this.reply = [...PREFIX, cmd, slot, 0, 0xF7];
      } else if (cmd === 12) {
        this.reply = [...PREFIX, cmd, slot, frame[6], frame[7], frame[8], 0, 0xF7];
      } else if (cmd === 15) {
        this.reply = [...PREFIX, 15, 1, 80, 1, 66, 69, 65, 84, 0, 1, 0xF7];
      } else if (cmd === 16) {
        const off = frame[6] | frame[7] << 7 | frame[8] << 14;
        const wireLength = frame[9] * 2;
        this.reply = [...PREFIX, 16, slot, frame[6], frame[7], frame[8],
          ...pack78(readback.subarray(off, off + wireLength)), 0xF7];
      } else { throw new Error('Unexpected MIDI command ' + cmd); }
      return true;
    },
    async read() { const r = this.reply; this.reply = null; return r; },
  };
}

const wanted = sample(1);
const collidingReadback = differentValidImageWithSameCRC(wanted);
const mapping = [{ k: 0, j: 0 }];

test('control: byte-for-byte sample readback is accepted', async () => {
  const device = mockedKeyboard(wanted);
  await restoreMapped(device, mapping, [wanted]);
  assert.ok(device.history.some((frame) => frame[4] === 16), 'actual SMP_READ was used');
});

test('negative: changed ADPCM with a valid inner CRC and colliding outer CRC must fail readback', async () => {
  const device = mockedKeyboard(collidingReadback);
  await assert.rejects(restoreMapped(device, mapping, [wanted]), /read back differs|sample.*mismatch|integrity/i,
    'FAIL_BEFORE_FIX: restoreMapped accepts a different, internally valid sample with the same image CRC32');
  assert.ok(device.history.some((frame) => frame[4] === 16), 'the entire image was read back');
});
