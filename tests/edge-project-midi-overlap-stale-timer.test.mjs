// SPDX-License-Identifier: GPL-3.0-only
// EC042: ProjectMidiLink must not let an earlier read timeout orphan a newer reader.
// This is an intentionally red, test-only regression. No production implementation.
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

test('EC042: older read timer must not steal a newer read or its MIDI reply', async () => {
  const ok = fixture();
  const single = ok.link.read(100);
  ok.timer.advance(20);
  ok.input.emit(FRAME);
  assert.deepEqual(await single, FRAME, 'control: single reader receives its reply');
  ok.link.close();

  const race = fixture();
  const prior = race.link.read(10);
  const newer = race.link.read(100);
  race.timer.advance(10);
  assert.equal(await prior, null, 'the original read can expire');
  race.timer.advance(20);
  race.input.emit(FRAME); // Arrives 80ms before the newer read's own deadline.
  race.timer.advance(100);
  const received = await newer;
  assert.deepEqual(received, FRAME,
    'a valid MIDI frame arriving before the newer deadline must not turn into a timeout');
  race.link.close();
});
