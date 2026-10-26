// SPDX-License-Identifier: GPL-3.0-only
// Test-only EC007 extension. Extract actual browser transport/read code and use
// firmware's SMP_READ echo: slot, offset low/middle/high 7-bit bytes, packed data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../web/x0x_breaks.html', import.meta.url), 'utf8');
const HDR = [0x7d, 0x46, 0x4c];
assert.match(html, /const HDR\s*=\s*\[0x7D, 0x46, 0x4C\]/);
function part(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'missing actual browser source: ' + start);
  return html.slice(a, b);
}
const production = [
  part('class Link {', '\n\nasync function connect()'),
  part('function unpack7(a) {', '\n\n// a slot\'s bytes'),
  part('async function readBytes(k, off, n, onPart) {', '\n\n// every slot as it is'),
].join('\n');
function pack(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i += 7) {
    const group = bytes.slice(i, i + 7);
    let mask = 0;
    group.forEach((v, j) => { if (v & 128) mask |= 1 << j; });
    out.push(mask, ...group.map(v => v & 127));
  }
  return out;
}
const tick = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
function setup() {
  let now = 0, id = 0;
  const timers = new Map(), sent = [];
  const setTimer = (fn, ms) => {
    const key = ++id; timers.set(key, { due: now + ms, fn }); return key;
  };
  const clearTimer = key => timers.delete(key);
  const advance = ms => {
    now += ms;
    for (const [key, timer] of [...timers].sort((a, b) => a[1].due - b[1].due)) {
      if (timer.due <= now && timers.has(key)) { timers.delete(key); timer.fn(); }
    }
  };
  const impl = new Function('HDR', 'setTimeout', 'clearTimeout',
    'let link;\n' + production + '\nreturn { Link, readBytes, setLink: x => { link = x; } };'
  )(HDR, setTimer, clearTimer);
  const input = {}, link = new impl.Link(input, { send: frame => sent.push(frame) });
  impl.setLink(link);
  const reply = (slot, offset, bytes) => input.onmidimessage({ data: Uint8Array.from([
    0xf0, ...HDR, 16, slot, offset & 127, (offset >> 7) & 127, (offset >> 14) & 127,
    ...pack(bytes), 0xf7,
  ]) });
  const rawReply = data => input.onmidimessage({ data: Uint8Array.from(data) });
  return { advance, reply, rawReply, sent, link, timers, readBytes: impl.readBytes };
}
function observe(promise) {
  const state = { done: false, value: null, error: null };
  promise.then(value => { state.done = true; state.value = value; }, error => { state.done = true; state.error = error; });
  return state;
}
async function completed(state) {
  await tick();
  assert.equal(state.done, true, 'valid correlated reply must settle without real timers or a hanging test');
  if (state.error) throw state.error;
  return state.value;
}
const offset = frame => frame[6] + (frame[7] << 7) + (frame[8] << 14);
const a = Uint8Array.from({ length: 224 }, (_, i) => (i * 13) & 255);
const b = Uint8Array.from({ length: 224 }, (_, i) => (i * 17 + 91) & 255);

test('positive: firmware envelopes echo offsets 0 and 224 for distinct chunks', async () => {
  const f = setup(), state = observe(f.readBytes(0, 0, 448));
  await tick(); assert.equal(offset(f.sent[0]), 0);
  f.reply(0, 0, a); await tick(); assert.equal(offset(f.sent[1]), 224);
  f.reply(0, 224, b);
  assert.deepEqual(await completed(state), Uint8Array.from([...a, ...b]));
  assert.equal(f.timers.size, 0);
});

test('negative: stale retry offset 0 cannot consume pending offset 224', async () => {
  const f = setup(), state = observe(f.readBytes(0, 0, 448));
  await tick(); f.advance(3000); await tick();
  assert.deepEqual(f.sent.map(offset), [0, 0]);
  f.reply(0, 0, a); await tick(); assert.deepEqual(f.sent.map(offset), [0, 0, 224]);
  f.reply(0, 0, a); await tick(); // delayed duplicate from retry
  f.reply(0, 224, b); // correct response must still be accepted
  assert.deepEqual(await completed(state), Uint8Array.from([...a, ...b]),
    'FAIL_BEFORE_FIX: stale offset consumed the current chunk wait');
  assert.equal(f.timers.size, 0);
});

test('negative: wrong-slot echo leaves the matching read wait intact', async () => {
  const f = setup(), state = observe(f.readBytes(1, 224, 224));
  await tick(); const wait = f.link.wait;
  f.reply(0, 224, a); await tick();
  const keptWait = f.link.wait === wait;
  f.reply(1, 224, b);
  const data = await completed(state);
  assert.equal(keptWait, true, 'FAIL_BEFORE_FIX: wrong-slot reply consumed a different slot wait');
  assert.deepEqual(data, b);
  assert.equal(f.timers.size, 0);
});

test('positive: nonzero slot and high offset with odd final pair padding', async () => {
  const f = setup(), progress = [], tail = Uint8Array.from([201, 202, 203, 204]);
  const start = 0x4567, state = observe(f.readBytes(2, start, 227, x => progress.push(x)));
  await tick(); assert.equal(offset(f.sent[0]), start);
  f.reply(2, start, a); await tick();
  assert.equal(offset(f.sent[1]), start + 224);
  assert.equal(f.sent[1][9], 2, 'odd three-byte tail requests two pairs');
  f.reply(2, start + 224, tail);
  assert.deepEqual(await completed(state), Uint8Array.from([...a, ...tail.slice(0, 3)]));
  assert.deepEqual(progress, [224 / 227, 1]);
  assert.equal(f.timers.size, 0);
});


test('negative: truncated echoed address cannot consume the read wait', async () => {
  const f = setup(), state = observe(f.readBytes(1, 224, 224));
  await tick(); const wait = f.link.wait;
  f.rawReply([0xf0, ...HDR, 16, 1, 96, 1, 0xf7]); // missing high address byte
  await tick(); const keptWait = f.link.wait === wait;
  f.reply(1, 224, b);
  const data = await completed(state);
  assert.equal(keptWait, true, 'truncated address consumed the valid pending wait');
  assert.deepEqual(data, b);
  assert.equal(f.timers.size, 0);
});

for (const [label, frame] of [
  ['missing SysEx terminator', [0xf0, ...HDR, 16, 1, 96, 1, 0, ...pack(a), 0]],
  ['address prefix without payload', [0xf0, ...HDR, 16, 1, 96, 1, 0, 0xf7]],
]) {
  test('negative: ' + label + ' leaves the matching wait intact', async () => {
    const f = setup(), state = observe(f.readBytes(1, 224, 224));
    await tick(); const wait = f.link.wait;
    f.rawReply(frame); await tick(); const keptWait = f.link.wait === wait;
    f.reply(1, 224, b);
    const data = await completed(state);
    assert.equal(keptWait, true, label + ' consumed the valid pending wait');
    assert.deepEqual(data, b);
    assert.equal(f.timers.size, 0);
  });
}
