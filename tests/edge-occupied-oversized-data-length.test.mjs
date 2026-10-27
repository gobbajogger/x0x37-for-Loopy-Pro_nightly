// SPDX-License-Identifier: GPL-3.0-only
// EC-021: an occupied SMP_READ header must not authorize reads/allocation beyond the slot.
// Test only. It intentionally fails on NIGHTLY main until the sample-backup owner repairs it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readSlotImage, pack78, crc32, SLOT_SIZE } from '../web/x0x_breaks.js';

function occupiedHeader(dataLen, checksum) {
  const bytes = new Uint8Array(512);
  const v = new DataView(bytes.buffer);
  v.setUint32(0, 0x504d5346, true);
  v.setUint16(4, 1, true);
  bytes[6] = 1;
  bytes[8] = 65;
  v.setUint32(16, dataLen, true);
  v.setUint32(20, checksum, true);
  v.setUint32(32, 0, true);
  v.setUint32(36, 64, true);
  v.setUint32(48, 65536, true);
  return bytes;
}

function fakeSlotLink(header, data) {
  let request;
  const events = [];
  return {
    events,
    drain() {},
    send(frame) {
      assert.equal(frame[4], 16, 'only read requests are expected');
      const offset = frame[6] | (frame[7] << 7) | (frame[8] << 14);
      const n = frame[9] * 2;
      request = { offset, n };
      events.push(request);
      return true;
    },
    async read() {
      const { offset, n } = request;
      const raw = offset < 512
        ? header.subarray(offset, offset + n)
        : data.subarray(offset - 512, offset - 512 + n);
      return [0xf0, 0x7d, 0x46, 0x4c, 16, 0, 0, 0, 0, ...pack78(raw), 0xf7];
    },
  };
}

test('ordinary occupied slot backs up 512-byte header and 128 data bytes', async () => {
  const data = Uint8Array.from({ length: 128 }, (_, i) => (i * 7 + 3) & 255);
  const link = fakeSlotLink(occupiedHeader(data.length, crc32(data)), data);
  const image = await readSlotImage(link, 0, 1);
  assert.equal(image.length, 640);
  assert.deepEqual(link.events.map(({ offset }) => offset), [0, 224, 448, 512]);
});

test('occupied header claiming 2 MiB in an 80 KiB slot fails before data reads', async () => {
  const link = fakeSlotLink(occupiedHeader(0x200000, 0), new Uint8Array());
  await assert.rejects(readSlotImage(link, 0, 1));
  assert.equal(link.events.filter(({ offset }) => offset >= 512).length, 0,
    `oversized header must fail before SMP_READ data, not allocate ${0x200000} bytes and read past ${SLOT_SIZE}`);
});
