// SPDX-License-Identifier: GPL-3.0-only
// EC-20261026-011. An unsolicited SysEx storm cannot grow the OTA MIDI queue without bound.
// Test-only: OTA/installer specialist owns overflow recovery and production changes.
// Synthetic input; no firmware, hardware, or flash operations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Exercise the actual private Link class from the repo source rather than a rewritten mock.
function makeLink() {
  const source = readFileSync(new URL('../web/fm1ota.js', import.meta.url), 'utf8');
  const start = source.indexOf('class Link {');
  const end = source.indexOf('\nasync function handshake(', start);
  assert.ok(start !== -1 && end > start, 'production OTA Link class must be present');
  const Link = runInNewContext(source.slice(start, end) + '\nLink',
    { Array, Promise, setTimeout, clearTimeout });
  const input = { state: 'connected', onmidimessage: null };
  const output = { state: 'connected', send() {} };
  const link = new Link(input, output);
  return { link, input };
}

const unrelatedSysEx = Uint8Array.from([0xF0, 0x7D, 0x02, 0xF7]);
function inject(input, count) {
  for (let i = 0; i < count; i++) input.onmidimessage({ data: unrelatedSysEx });
}

test('baseline: idle Link handles a finite ordinary incoming SysEx batch', () => {
  const { link, input } = makeLink();
  inject(input, 64);
  assert.equal(link.q.length, 64);
  link.close();
});

test('negative: unrelated SysEx storm cannot accumulate an unbounded OTA queue', () => {
  const { link, input } = makeLink();
  inject(input, 16000);
  assert.ok(link.q.length <= 64,
    `FAIL_BEFORE_FIX: ${link.q.length} unsolicited MIDI packets retained without a bound`);
  link.close();
});
