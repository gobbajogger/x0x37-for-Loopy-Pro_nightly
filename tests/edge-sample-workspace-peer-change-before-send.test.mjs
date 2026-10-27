// SPDX-License-Identifier: GPL-3.0-only
// EC035: the Sample Workspace must not erase another client's newer sample
// after its own preview becomes stale during review. Test-only regression.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pack78, crc32, SLOT_DATA_OFF, SLOT_HDR_LEN } from '../web/x0x_breaks.js';

const html = readFileSync(new URL('../web/x0x_breaks.html', import.meta.url), 'utf8');
function extract(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'production function boundary missing: ' + start);
  return html.slice(a, b);
}
const source = extract('async function writeImage(k, img, onPart) {', '\nasync function run(fn)') + '\n' +
  extract('$("send").onclick = () => run(async () => {', '\n$("backup").onclick');

function scenario(peerChangesDuringReview) {
  const data = new Uint8Array(32).fill(5); // 64 decoded ADPCM samples
  const hdr = new Uint8Array(SLOT_HDR_LEN).fill(255), v = new DataView(hdr.buffer);
  v.setUint32(0, 0x504d5346, true); // FSMP
  v.setUint16(4, 1, true); hdr[6] = 1; hdr.set([76,79,79,80,0], 8);
  v.setUint32(16, data.length, true); v.setUint32(20, crc32(data), true);
  v.setUint32(32, 0, true); v.setUint32(36, 64, true);
  v.setUint32(48, 65536, true); hdr[56] = 0;
  const im = { hdr, data }, writes = [], events = [], send = { onclick: null };
  let deviceSample = 11; // previously read sample ID; 99 denotes a valid newer peer sample
  const link = {
    async req(cmd) {
      writes.push(cmd);
      if (cmd === 11) deviceSample = null; // destructive erase
      if (cmd === 13) deviceSample = 5;   // accepted replacement
      return [0, 0];
    },
    async retry(cmd) { writes.push(cmd); return [0,0,0,0,0]; },
  };
  const ctx = {
    link, pack78, SLOT_DATA_OFF, SLOT_HDR_LEN, sampleActive: true, readOk: true,
    $: (key) => key === 'send' ? send : { hidden: true, value: 0 },
    packLoops: () => [[{ label: 'preview based on sample 11' }]],
    changedSlots: () => [{ k: 0, im }],
    reviewLoops: async () => {
      if (peerChangesDuringReview) { deviceSample = 99; events.push('peer-written'); }
      return true;
    },
    run: (fn) => fn(), say: () => {}, readAll: async () => events.push('post-write-read'),
  };
  new Function('ctx', 'with (ctx) { ' + source + '\n }')(ctx);
  return { click: () => send.onclick(), writes, events, sample: () => deviceSample };
}

test('control: unchanged slot accepts the confirmed sample replacement', async () => {
  const s = scenario(false);
  await s.click();
  assert.deepEqual(s.writes, [11,12,13]);
  assert.equal(s.sample(), 5);
});

test('negative: peer updates sample during review; stale preview must not erase it', async () => {
  const s = scenario(true);
  await s.click().catch(() => {}); // An explicit fail-closed rejection is acceptable.
  assert.ok(s.events.includes('peer-written'));
  assert.deepEqual(s.writes.filter((cmd) => [11,12,13].includes(cmd)), [],
    'FAIL_BEFORE_FIX: source ignores concurrent sample update and sends erase/write');
  assert.equal(s.sample(), 99, 'Peer sample must survive until a fresh user confirmation');
});
