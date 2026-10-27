// SPDX-License-Identifier: GPL-3.0-only
// EC-025: a stopped/closed project WebMIDI link must not retransmit an
// in-flight WRITE chunk to an orphaned output when only the input disappears.
// Test-only regression; no hardware or sample/project writes are performed.
// From the NIGHTLY source checkout:
// node --test tests/edge-project-closed-midi-link-write-retry.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectDevice, ProjectMidiLink, PROJECT_OP } from '../web/x0x_projects.js';

function fixture() {
  const frames = [];
  let listener = null;
  const input = {
    state: 'connected',
    addEventListener(type, fn) {
      assert.equal(type, 'midimessage'); listener = fn;
    },
    removeEventListener(type, fn) {
      assert.equal(type, 'midimessage');
      assert.equal(fn, listener);
      listener = null;
    },
    emit(data) { if (listener) listener({ data: Uint8Array.from(data) }); },
    listening() { return listener !== null; },
  };
  const output = {
    state: 'connected',
    send(frame) { frames.push(Array.from(frame)); },
  };
  const link = new ProjectMidiLink(input, output);
  const device = new ProjectDevice(link, { timeout: 30 });
  device.identity = 'X0X keyboard';
  return { frames, input, output, link, device };
}

function startWrite(f) {
  // Project WRITE is replay-safe only while the *same live link* remains valid.
  return f.device.command(PROJECT_OP.WRITE, [0, 0, 0, 1], {
    length: 5, offset: 1, tries: 2, timeout: 30,
  });
}

test('control: a live paired link accepts one WRITE acknowledgment', async () => {
  const f = fixture();
  const p = startWrite(f);
  assert.equal(f.frames.length, 1);
  assert.deepEqual(f.frames[0].slice(0, 6), [0xF0, 0x7D, 0x46, 0x4C, 9, PROJECT_OP.WRITE]);
  f.input.emit([0xF0, 0x7D, 0x46, 0x4C, 9, PROJECT_OP.WRITE, 0, 1, 0, 0, 0xF7]);
  await p;
  assert.equal(f.frames.length, 1);
});

test('negative: closing the input link during a pending WRITE must stop retransmission', async () => {
  const f = fixture();
  const p = startWrite(f);
  assert.equal(f.frames.length, 1, 'the first request was sent while connected');
  assert.ok(f.link.pending, 'the WRITE acknowledgment was still pending');
  // WebMIDI can report an input disconnection while the output remains connected.
  f.input.state = 'disconnected';
  f.link.close();
  assert.equal(f.input.listening(), false, 'listener is removed');
  assert.equal(f.output.state, 'connected', 'the unrelated output state need not change');
  await assert.rejects(p, 'a closed transfer must fail safely');
  assert.equal(f.frames.length, 1,
    'FAIL_BEFORE_FIX: project WRITE was retransmitted after input disconnection and link.close()');
});
