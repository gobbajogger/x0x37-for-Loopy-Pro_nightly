// SPDX-License-Identifier: GPL-3.0-only
// EC-20261026-007: test-only coverage for delayed SMP_READ replies crossing
// a retry boundary into the next 224-byte chunk. Source fix belongs to browser owner.
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
  const packed = [];
  for (let i = 0; i < bytes.length; i += 7) {
    const group = bytes.slice(i, i + 7);
    let mask = 0;
    group.forEach((v, j) => { if (v & 128) mask |= 1 << j; });
    packed.push(mask, ...group.map(v => v & 127));
  }
  return packed;
}
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
  const input = {};
  impl.setLink(new impl.Link(input, { send: frame => sent.push(frame) }));
  const reply = bytes => input.onmidimessage({ data: Uint8Array.from([
    0xf0, ...HDR, 16, 0, 0, 0, 0, ...pack(bytes), 0xf7,
  ]) });
  return { advance, reply, sent, readBytes: impl.readBytes };
}
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const a = Uint8Array.from({ length: 224 }, (_, i) => i % 60 + 1);
const b = Uint8Array.from({ length: 224 }, (_, i) => i % 60 + 61);
const offset = frame => frame[6] + (frame[7] << 7) + (frame[8] << 14);

test('baseline: in-order SMP_READ responses keep both 224-byte chunks distinct', async () => {
  const f = setup(), pending = f.readBytes(0, 0, 448);
  await tick(); assert.equal(f.sent.length, 1); assert.equal(offset(f.sent[0]), 0);
  f.reply(a); await tick();
  assert.equal(f.sent.length, 2); assert.equal(offset(f.sent[1]), 224);
  f.reply(b);
  const data = await pending;
  assert.ok(data.subarray(0, 224).every((v, i) => v === a[i]));
  assert.ok(data.subarray(224).every((v, i) => v === b[i]));
});

test('negative: a delayed retry response cannot stand in for the next chunk', async () => {
  const f = setup(), pending = f.readBytes(0, 0, 448);
  await tick(); assert.equal(f.sent.length, 1); assert.equal(offset(f.sent[0]), 0);
  f.advance(3000); await tick();
  assert.equal(f.sent.length, 2); assert.equal(offset(f.sent[1]), 0);
  f.reply(a); await tick(); // original address-0 reply completes its retry
  assert.equal(f.sent.length, 3); assert.equal(offset(f.sent[2]), 224);
  f.reply(a); // retry address-0 reply now races with the address-224 response
  const data = await pending;
  assert.ok(data.subarray(0, 224).every((v, i) => v === a[i]));
  assert.ok(data.subarray(224).every((v, i) => v === b[i]),
    'FAIL_BEFORE_FIX: old SMP_READ reply for address 0 was accepted for address 224');
});
