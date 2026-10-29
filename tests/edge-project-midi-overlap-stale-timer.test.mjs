// SPDX-License-Identifier: GPL-3.0-only
// EC042: ProjectMidiLink must not let an earlier read timeout orphan a newer reader.
// Single-reader contract: overlap is explicitly rejected without replacing the
// original request, and its timers/close cannot orphan a later read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FRAME = [0xF0, 0x7D, 0x46, 0x4C, 9, 0xF7];
function fakeClock() {
  let time = 0, next = 0;
  const timers = [];
  return {
    setTimeout(fn, delay) {
      const id = ++next;
      timers.push({ id, at: time + delay, fn, live: true });
      return id;
    },
    clearTimeout(id) {
      for (const timer of timers) if (timer.id === id) timer.live = false;
    },
    advance(target) {
      assert.ok(target >= time);
      for (;;) {
        const due = timers.filter(t => t.live && t.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        time = due.at;
        due.live = false;
        due.fn();
      }
      time = target;
    },
  };
}
function fixture() {
  const timer = fakeClock();
  const file = readFileSync(fileURLToPath(new URL('../web/x0x_projects.js', import.meta.url)), 'utf8');
  const marker = 'export class ProjectMidiLink {';
  const at = file.indexOf(marker);
  assert.ok(at >= 0, 'production ProjectMidiLink class exists');
  const source = file.slice(at).replace(/^export /, '');
  const fail = (message, code) => Object.assign(new Error(message), { code });
  // Evaluate the EXACT production class, with only clock and fail dependencies injected.
  const ProjectMidiLink = new Function('setTimeout', 'clearTimeout', 'fail',
    source + '\nreturn ProjectMidiLink;')(timer.setTimeout, timer.clearTimeout, fail);
  const listeners = new Map();
  const input = {
    state: 'connected',
    addEventListener(name, cb) { listeners.set(name, cb); },
    removeEventListener(name, cb) { if (listeners.get(name) === cb) listeners.delete(name); },
    emit(data) { listeners.get('midimessage')?.({ data: Uint8Array.from(data) }); },
  };
  const output = { state: 'connected', send() {} };
  return { timer, input, link: new ProjectMidiLink(input, output) };
}

test('EC042: overlapping read is refused and preserves the original reply owner', async () => {
  const ok = fixture();
  const single = ok.link.read(100);
  ok.timer.advance(20);
  ok.input.emit(FRAME);
  assert.deepEqual(await single, FRAME, 'control: single reader receives its reply');
  ok.link.close();

  const race = fixture();
  const prior = race.link.read(100);
  const refusal = assert.rejects(race.link.read(10), error => error.code === 'busy');
  race.timer.advance(10);
  await refusal;
  race.timer.advance(20);
  race.input.emit(FRAME);
  assert.deepEqual(await prior, FRAME, 'overlap cannot replace the accepted pending reader');
  const newer = race.link.read(100);
  race.timer.advance(100);
  race.input.emit(FRAME);
  const received = await newer;
  assert.deepEqual(received, FRAME, 'the completed read timer cannot steal a later read');
  race.link.close();
});

test('EC042: timeout followed by another read preserves its deadline and close settles its owner', async () => {
  const f = fixture();
  const expired = f.link.read(10);
  f.timer.advance(10);
  assert.equal(await expired, null);
  const current = f.link.read(100);
  const refusal = assert.rejects(f.link.read(1), error => error.code === 'busy');
  f.timer.advance(11);
  await refusal;
  f.timer.advance(20);
  f.link.close();
  assert.equal(await current, null, 'close settles the one accepted read');
  assert.equal(f.link.pending, null);
  f.timer.advance(110);
  assert.equal(f.link.pending, null, 'no detached timer may recreate pending work');
});

