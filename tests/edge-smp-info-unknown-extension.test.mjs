// SPDX-License-Identifier: GPL-3.0-only
// EC-020: corrupt X0X SMP_INFO extension marker must not downgrade occupied flash slots to legacy.
// No hardware, firmware transfer, source repair or publisher operation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInfo, flashMap, atRisk } from '../web/x0x_breaks.js';

// One occupied slot, 10 KiB used, located at 0xB0000 (44 KiB capacity),
// while the new firmware preserves the legacy 0xC2000 position, not 0xB0000.
// The 14-bit extension fields are in 4-KiB sectors (offset/size) and KiB (used).
const reply = Uint8Array.from([1, 80, 1, 65, 0, 10, 0x58, 1, 48, 1, 11, 0, 10, 0]);
const newMap = [{ off: 0xC2000, size: 0x14000 }];

test('valid flash-map extension accurately requires backup', () => {
  const layout = parseInfo(reply);
  assert.equal(layout.ext, true);
  assert.deepEqual(flashMap(layout), [{ off: 0xB0000, size: 0xB000 }]);
  assert.deepEqual(atRisk(layout, flashMap(layout), newMap), [0]);
});

test('genuine legacy reply without any extension remains accepted', () => {
  const layout = parseInfo(reply.slice(0, 6));
  assert.equal(layout.ext, false);
  assert.deepEqual(atRisk(layout, flashMap(layout), newMap), []);
});

test('one-byte corrupted extension marker must fail closed, not erase backup requirement', () => {
  const damaged = Uint8Array.from(reply);
  damaged[6] = 0x59; // changed X -> Y; the remaining 7 extension bytes still exist
  assert.throws(() => parseInfo(damaged), /unknown SMP_INFO trailing metadata|unsupported SMP_INFO.*extension/);
});
