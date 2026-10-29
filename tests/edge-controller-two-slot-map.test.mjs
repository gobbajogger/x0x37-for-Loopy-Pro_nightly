// SPDX-License-Identifier: GPL-3.0-only
// Full synthetic packages exercise the production decrypt/CRC/controller path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { controllerOf, insertCtl, logicalImage, CTL_NO_BLOCK } from '../web/fm1pkg.js';
import { makePackage, makeController } from './fixtures/bundled-synthetic.mjs';
const current = [[0xc2000, 0x14000], [0xd6000, 0x1e000]];
for (const model of ['elite', 'pro']) test('current exact two-slot full package admits bundled controller: ' + model, () => {
  const image = logicalImage(makePackage(model, { slotMap: current }));
  assert.deepEqual(Buffer.from(controllerOf(image)), makeController());
  assert.deepEqual(Buffer.from(insertCtl(image, makeController())), Buffer.from(image));
});
const invalid = [
  ['third VM-spare slot', [...current, [0xb0000, 0xb000]]],
  ['first VM-spare offset', [[0xb0000, 0x14000], current[1]]],
  ['first zero size', [[0xc2000, 0], current[1]]],
  ['first size +1', [[0xc2000, 0x14001], current[1]]],
  ['first offset +1', [[0xc2001, 0x14000], current[1]]],
  ['second overlapping offset', [current[0], [0xc2000, 0x1e000]]],
  ['second zero size', [current[0], [0xd6000, 0]]],
  ['second size +1', [current[0], [0xd6000, 0x1e001]]],
  ['second offset +1', [current[0], [0xd6001, 0x1e000]]],
  ['one-slot record', [current[0]]],
  ['empty record', []],
];
for (const [name, slotMap] of invalid) test('CRC-valid malformed map is rejected: ' + name, () => {
  assert.throws(() => controllerOf(logicalImage(makePackage('pro', { slotMap }))), /slot map/);
});
test('relocated correct two-slot decoy cannot satisfy fixed-address admission', () => {
  assert.throws(() => controllerOf(logicalImage(makePackage('pro', { slotMap: current, slotMapOffset: 0x9cf80 }))), /slot map/);
});
test('missing map remains ineligible for bundled controller', () => {
  assert.throws(() => controllerOf(logicalImage(makePackage('pro', { noMap: true }))), /slot map/);
});
test('legacy explicit insertion retains a proven empty controller block without claiming bundled eligibility', () => {
  const legacy = logicalImage(makePackage('pro', { noMap: true, controller: null }));
  const inserted = insertCtl(legacy, makeController());
  assert.ok(inserted.length === legacy.length);
  assert.throws(() => controllerOf(inserted), /slot map/);
});
test('legacy application-owned block is never overwritten without current valid map', () => {
  const legacy = logicalImage(makePackage('pro', { noMap: true, controller: Buffer.alloc(100, 0x42) }));
  assert.throws(() => insertCtl(legacy, makeController()), { message: CTL_NO_BLOCK });
});
