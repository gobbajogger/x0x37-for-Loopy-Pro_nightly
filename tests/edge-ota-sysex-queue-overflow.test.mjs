// SPDX-License-Identifier: GPL-3.0-only
// EC-20261026-011. An unsolicited SysEx storm cannot grow the OTA MIDI queue without bound.
// Bounded fail-closed receive buffering, including outstanding read/send behavior.
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
  const helperStart = source.indexOf('function fail(');
  const helperEnd = source.indexOf('\n\nexport function pack7', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'production error helper must be present');
  const Link = runInNewContext(source.slice(helperStart, helperEnd) + '\n' + source.slice(start, end) + '\nLink',
    { Array, Promise, setTimeout, clearTimeout });
  const input = { state: 'connected', onmidimessage: null };
  const output = { state: 'connected', send() {} };
  const link = new Link(input, output);
  return { link, input };
}

const unrelatedSysEx = Uint8Array.from([0xF0, 0x7D, 0x02, 0xF7]);
function inject(input, count) {
  for (let i = 0; i < count && input.onmidimessage; i++) input.onmidimessage({ data: unrelatedSysEx });
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
  assert.equal(link.q.length, 0);
  assert.equal(link.rxBytes, 0);
  assert.equal(input.onmidimessage, null);
  assert.equal(link.rxError.code, 'overflow');
  link.close();
});

test('normal reads preserve FIFO and free the byte budget', async () => {
  const { link, input } = makeLink();
  for (let i=0;i<64;i++) input.onmidimessage({data:[0xF0,0x7D,i,0xF7]});
  assert.equal(link.rxBytes,256);
  for (let i=0;i<64;i++) assert.equal((await link.read(1))[2],i);
  assert.equal(link.rxBytes,0); link.close();
});

test('overflow wakes a waiting reader and blocks future writes even after drain', async () => {
  const { link, input } = makeLink();
  const pending = assert.rejects(link.read(10000), e => e.code === 'overflow');
  const bytes = new Uint8Array(65537); bytes[0]=0xF0;
  const handler = input.onmidimessage;
  handler({data:bytes});
  await pending;
  link.drain();
  assert.throws(() => link.send([1]), e => e.code === 'overflow');
  await assert.rejects(link.read(1), e => e.code === 'overflow');
  handler({data:unrelatedSysEx});
  assert.equal(link.q.length,0);
});

test('aggregate bytes are bounded independently of frame count', () => {
  const { link, input } = makeLink();
  const a=new Uint8Array(40000),b=new Uint8Array(30000);a[0]=b[0]=0xF0;
  input.onmidimessage({data:a});input.onmidimessage({data:b});
  assert.equal(link.rxError.code,'overflow');
  assert.equal(link.q.length,0);assert.equal(link.rxBytes,0);
});

test('a new connection remains usable after another link overflowed', async () => {
  const a=makeLink();inject(a.input,65);
  const b=makeLink();b.input.onmidimessage({data:[0x90,60,100]});
  assert.equal(b.link.q.length,0);
  b.input.onmidimessage({data:unrelatedSysEx});
  assert.equal((await b.link.read(1))[0],0xF0);
  assert.equal(b.link.send([1]),true);b.link.close();
});
