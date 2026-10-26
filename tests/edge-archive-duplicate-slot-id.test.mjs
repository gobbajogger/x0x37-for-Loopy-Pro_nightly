// SPDX-License-Identifier: GPL-3.0-only
// Negative regression: CRC-valid duplicate backup slot identities must be rejected
// before the browser chooses physical restore destinations by array index.
import { makeArchive, readArchive, crc32, parseHeader, planRestore } from '../web/x0x_breaks.js';

function sample(name, seed) {
  const image = new Uint8Array(516);
  const v = new DataView(image.buffer);
  for (let i = 512; i < image.length; i++) image[i] = (seed * 31 + i * 17) & 255;
  v.setUint32(0, 0x504d5346, true);
  v.setUint16(4, 1, true);
  image[6] = 1;
  for (let i = 0; i < name.length; i++) image[8 + i] = name.charCodeAt(i);
  v.setUint32(16, 4, true);
  v.setUint32(20, crc32(image.subarray(512)), true);
  v.setUint32(32, 0, true);
  v.setUint32(36, 8, true);
  v.setUint32(48, 65536, true);
  image[56] = 36;
  return image;
}


function run() {
  const layout = { count: 2, size: 1024,
    slots: [{ nz: 1, size: 1024 }, { nz: 1, size: 1024 }] };
  const valid = makeArchive(layout, [sample('ONE', 1), sample('TWO', 2)],
    '2026-10-26T00:00:00Z');
  const original = readArchive(valid);
  if (original.meta.slots.map((s) => s.slot).join(',') !== '1,2' ||
      original.images.map((b) => parseHeader(b).name).join(',') !== 'ONE,TWO')
    throw Error('Canonical archive fixture roundtrip failed.');

  const view = new DataView(valid.buffer);
  const metadataLength = view.getUint32(12, true);
  const metadata = JSON.parse(new TextDecoder().decode(
    valid.subarray(16, 16 + metadataLength)));
  metadata.slots[1].slot = 1;
  const encoded = new TextEncoder().encode(JSON.stringify(metadata));
  if (encoded.length !== metadataLength)
    throw Error('Duplicate-ID fixture changed metadata size.');

  const tampered = valid.slice();
  tampered.set(encoded, 16);
  new DataView(tampered.buffer).setUint32(tampered.length - 4,
    crc32(tampered.subarray(0, tampered.length - 4)), true);
  if (crc32(tampered.subarray(0, tampered.length - 4)) !==
      new DataView(tampered.buffer).getUint32(tampered.length - 4, true))
    throw Error('Duplicate-ID fixture has an invalid CRC.');

  // Only the archive parser's refusal counts as PASS; planning failures
  // or unrelated fixture failures must not give a false green result.
  let accepted = null;
  try {
    accepted = readArchive(tampered);
  } catch (error) {
    if (!error || typeof error.message !== 'string')
      throw Error('Archive rejected with an unexpected non-Error value.');
    return;
  }
  const plan = planRestore(layout, accepted.images);
  if (accepted.meta.slots.map((s) => s.slot).join(',') !== '1,1' ||
      plan.todo.map((p) => p.k + 1).join(',') !== '1,2' ||
      parseHeader(plan.todo[1].img).name !== 'TWO')
    throw Error('Fixture did not reproduce duplicate-ID restore-by-position.');

  throw Error('FAIL_BEFORE_FIX: duplicate slot IDs [1,1] passed readArchive ' +
    'and the second sample was planned for destination slot 2.');
}
run();
