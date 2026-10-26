// SPDX-License-Identifier: GPL-3.0-only
// EC-022: contradictory SMP_INFO usage fields must not hide required sample preservation.
// Test only. Intentionally RED before the installer/sample-layout specialist repairs it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInfo, flashMap, atRisk } from '../web/x0x_breaks.js';

const ORIGINAL_OFFSET = 0xC2000;
const OLD_CAPACITY = 160 * 1024;
const SHRUNK_CAPACITY = 80 * 1024;

// One occupied SMK sample slot: the legacy-compatible descriptor reports 100 KiB
// used. The X0X extension repeats the used-KiB value as a 14-bit field.
// Only the 14-bit extension value varies; the remaining bytes stay valid.
function occupiedInfo(extendedUsedKiB) {
  assert.ok(extendedUsedKiB >= 0 && extendedUsedKiB < 0x4000);
  return Uint8Array.from([
    1, 80,            // one slot, legacy minimum size 80 KiB
    1, 65, 0, 100,    // occupied, name 'A', 100 KiB used
    0x58, 1,          // X0X flash-map extension v1
    0x42, 1,          // offset = 0xC2 * 4096 = 0xC2000
    40, 0,            // physical old slot = 40 sectors = 160 KiB
    extendedUsedKiB & 0x7f, (extendedUsedKiB >> 7) & 0x7f,
  ]);
}

const smallerNewMap = [{ off: ORIGINAL_OFFSET, size: SHRUNK_CAPACITY }];

test('consistent 100 KiB usage is at risk when firmware reduces the slot to 80 KiB', () => {
  const layout = parseInfo(occupiedInfo(100));
  assert.equal(layout.slots[0].kb, 100);
  assert.equal(layout.slots[0].used, 100);
  assert.deepEqual(flashMap(layout), [{ off: ORIGINAL_OFFSET, size: OLD_CAPACITY }]);
  assert.deepEqual(atRisk(layout, flashMap(layout), smallerNewMap), [0]);
  assert.deepEqual(atRisk(layout, flashMap(layout), [{ off: ORIGINAL_OFFSET, size: 120 * 1024 }]), []);
});

test('corrupt extension cannot change a 100 KiB occupied slot into safe-to-overwrite', () => {
  // Device-info corruption changes only extension.used: 100 KiB -> 0.
  // Either reject this internally inconsistent reply or conservatively require backup.
  // The current implementation accepts used=0 and incorrectly returns atRisk=[].
  let layout;
  try {
    layout = parseInfo(occupiedInfo(0));
  } catch {
    return; // safe: invalid preservation metadata refused before OTA
  }
  assert.deepEqual(atRisk(layout, flashMap(layout), smallerNewMap), [0],
    'contradictory SMP_INFO used-KiB fields must never suppress preflash backup');
});
