// SPDX-License-Identifier: GPL-3.0-only
// EC-20261027-027. Project Workspace WebMIDI receive buffering must have
// an aggregate byte limit, not only a maximum queue frame count.
// Tests the real production ProjectMidiLink from the local repository.
// Synthetic MIDI only: no connected keyboard, flash or source repair.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectMidiLink } from '../web/x0x_projects.js';

const MAX_EXPECTED_QUEUED_BYTES = 65536; // existing OTA receiver budget
function fixture() {
  let handler = null;
  const input = {
    state: 'connected',
    addEventListener(type, fn) {
      assert.equal(type, 'midimessage');
      handler = fn;
    },
    removeEventListener(type, fn) {
      assert.equal(type, 'midimessage');
      assert.equal(fn, handler);
      handler = null;
    },
  };
  const sent = [];
  const output = { state: 'connected', send(frame) { sent.push([...frame]); } };
  const link = new ProjectMidiLink(input, output);
  return { link, sent, emit(data) { assert.ok(handler); handler({ data }); } };
}
function reply(n, marker = 0) {
  assert.ok(n >= 9);
  const b = new Uint8Array(n);
  b.set([0xF0, 0x7D, 0x46, 0x4C, 0x09, marker & 127]);
  b[n - 1] = 0xF7;
  return b;
}

test('control: small project SysEx replies retain FIFO behavior', async () => {
  const f = fixture();
  try {
    f.emit(reply(9, 1));
    f.emit(reply(10, 2));
    assert.deepEqual(await f.link.read(1), Array.from(reply(9, 1)));
    assert.deepEqual(await f.link.read(1), Array.from(reply(10, 2)));
  } finally { f.link.close(); }
});

test('negative: idle project MIDI receive queue must be bounded by bytes', () => {
  const f = fixture();
  try {
    // Four malformed, 7-bit-clean project-prefix SysEx frames: each is much
    // larger than the <=224-byte project READ chunk, but below an extreme
    // browser-allocation size. Current implementation queues all 100 KiB
    // because it checks frame count (64) but not aggregate byte size.
    for (let i = 0; i < 4; i++) f.emit(reply(25000, i));
    const buffered = f.link.queue.reduce((n, frame) => n + frame.length, 0);
    assert.ok(buffered <= MAX_EXPECTED_QUEUED_BYTES,
      'ProjectMidiLink buffered ' + buffered + ' incoming bytes; aggregate SysEx must be bounded independently of the 64-frame cap');
  } finally { f.link.close(); }
});
