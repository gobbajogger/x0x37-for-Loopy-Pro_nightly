// SPDX-License-Identifier: GPL-3.0-only
// EC-20261027-027. Project Workspace WebMIDI receive buffering must have
// an aggregate byte limit, not only a maximum queue frame count.
// Tests the real production ProjectMidiLink from the local repository.
// Synthetic MIDI only: no connected keyboard or physical project/sample writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectMidiLink, ProjectDevice, PROJECT_OP } from '../web/x0x_projects.js';

const MAX_EXPECTED_QUEUED_BYTES = 65536; // existing OTA receiver budget
function fixture() {
  let handler = null, detached = null, removals = 0;
  const input = {
    state: 'connected',
    addEventListener(type, fn) {
      assert.equal(type, 'midimessage');
      handler = fn;
    },
    removeEventListener(type, fn) {
      assert.equal(type, 'midimessage');
      assert.equal(fn, handler);
      detached = handler; handler = null; removals++;
    },
  };
  const sent = [];
  const output = { state: 'connected', send(frame) { sent.push([...frame]); } };
  const link = new ProjectMidiLink(input, output);
  return { link, sent, input, output,
    emit(data) { handler?.({ data }); },
    late(data) { detached?.({ data }); },
    listening: () => handler !== null, removals: () => removals,
  };
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
    // browser-allocation size. The unfixed implementation retained 100,000
    // bytes because it checked frame count but not aggregate byte size.
    for (let i = 0; i < 4; i++) f.emit(reply(25000, i));
    const buffered = f.link.queue.reduce((n, frame) => n + frame.length, 0);
    assert.ok(buffered <= MAX_EXPECTED_QUEUED_BYTES,
      'ProjectMidiLink buffered ' + buffered + ' incoming bytes; aggregate SysEx must be bounded independently of the 64-frame cap');
  } finally { f.link.close(); }
});

const overflow = (error) => error.code === 'overflow' && /Reconnect/.test(error.message);
function assertClosed(f) {
  assert.equal(f.link.closed, true);
  assert.equal(f.link.connected(), false);
  assert.equal(f.listening(), false);
  assert.equal(f.link.queue.length, 0);
  assert.equal(f.link.rxBytes, 0);
  assert.equal(f.link.pending, null);
}

test('aggregate byte boundary is accepted; the next frame closes rather than dropping replies', async () => {
  const f = fixture();
  try {
    f.emit(reply(32768, 1)); f.emit(reply(32768, 2));
    assert.equal(f.link.closed, false); assert.equal(f.link.rxBytes, 65536);
    f.emit(reply(9, 3));
    assertClosed(f);
    await assert.rejects(f.link.read(10000), overflow);
    assert.throws(() => f.link.send(reply(9)), overflow);
  } finally { f.link.close(); }
});

test('the 64-frame boundary is accepted; frame 65 closes even under the byte budget', () => {
  const f = fixture();
  try {
    for (let i = 0; i < 64; i++) f.emit(reply(9, i));
    assert.equal(f.link.queue.length, 64); assert.equal(f.link.rxBytes, 576);
    f.emit(reply(9));
    assertClosed(f);
  } finally { f.link.close(); }
});

test('reading and draining release byte budget, including a maximum-sized frame', async () => {
  const f = fixture();
  try {
    f.emit(reply(65536, 1));
    assert.deepEqual(await f.link.read(1), Array.from(reply(65536, 1)));
    assert.equal(f.link.rxBytes, 0);
    f.emit(reply(32768, 2)); f.emit(reply(32768, 3));
    assert.deepEqual(await f.link.read(1), Array.from(reply(32768, 2)));
    assert.equal(f.link.rxBytes, 32768);
    f.emit(reply(32768, 4)); assert.equal(f.link.rxBytes, 65536);
    f.link.drain(); assert.equal(f.link.rxBytes, 0);
    f.emit(reply(65536, 5)); assert.equal(f.link.closed, false);
  } finally { f.link.close(); }
});

for (const waiting of [false, true]) test(`one oversized frame closes before copy, pending read=${waiting}`, async () => {
  const f = fixture();
  try {
    const read = waiting ? f.link.read(10000) : null;
    // A typed array with a throwing iterator proves no Array.from copy occurs.
    const oversized = reply(65537);
    oversized[Symbol.iterator] = () => { throw new Error('oversized frame was copied'); };
    f.emit(oversized);
    assertClosed(f);
    await assert.rejects(read || f.link.read(10000), overflow);
  } finally { f.link.close(); }
});

test('overflow remains sticky through drain, close, port replug and detached callbacks; fresh link works', async () => {
  const f = fixture();
  f.emit(reply(65537));
  f.link.drain(); f.link.close(); f.link.close();
  f.input.state = 'disconnected'; f.input.state = 'connected';
  f.late(reply(9));
  assertClosed(f); assert.equal(f.removals(), 1);
  assert.throws(() => f.link.send(reply(9)), overflow);
  await assert.rejects(f.link.read(10000), overflow);
  assert.equal(f.sent.length, 0);
  const fresh = new ProjectMidiLink(f.input, f.output);
  try {
    f.emit(reply(9, 7));
    assert.deepEqual(await fresh.read(1), Array.from(reply(9, 7)));
    assert.equal(fresh.send(reply(9)), true);
  } finally { fresh.close(); }
});

for (const ackFirst of [false, true]) test(`overflow stops WRITE retries and follow-on COMMIT, ACK already delivered=${ackFirst}`, async () => {
  const f = fixture(), device = new ProjectDevice(f.link, { timeout: 100 });
  device.identity = 'X0X keyboard';
  try {
    const operation = (async () => {
      await device.command(PROJECT_OP.WRITE, [0, 0, 0, 1], { length: 5, offset: 1, tries: 2 });
      await device.commit();
    })();
    assert.equal(f.sent.length, 1);
    if (ackFirst) {
      f.emit(Uint8Array.from([0xF0, 0x7D, 0x46, 0x4C, 9, PROJECT_OP.WRITE, 0, 1, 0, 0, 0xF7]));
      for (let i = 0; i < 3; i++) f.emit(reply(25000));
    } else f.emit(reply(65537));
    await assert.rejects(operation, overflow);
    assertClosed(f); assert.equal(f.sent.length, 1, 'no retry or COMMIT after overflow');
    assert.equal(device.lastProject, 0, 'poisoned ACK must not count as an accepted command');
  } finally { f.link.close(); }
});

test('unrelated MIDI input is ignored without consuming the project receive budget', async () => {
  const f = fixture();
  try {
    const read = f.link.read(10000);
    f.emit(Uint8Array.from([0x90, 60, 100]));
    const unrelated = reply(65537); unrelated[1] = 0x7E; f.emit(unrelated);
    assert.equal(f.link.closed, false); assert.equal(f.link.rxBytes, 0);
    f.emit(reply(9, 4)); assert.deepEqual(await read, Array.from(reply(9, 4)));
  } finally { f.link.close(); }
});
