// SPDX-License-Identifier: GPL-3.0-only
// EC043 regression: zero-byte streamed chunks must not defeat bounded-download memory safety.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pinnedSource = `async function readApprovedPackage(response, expectedSize, isLatest) {
  if (!response.body || typeof response.body.getReader !== "function") {
    // A non-streaming response cannot be bounded before allocation.
    // Fail closed rather than buffering potentially unbounded remote bytes.
    return null;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0, reject = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (!isLatest()) { reject = true; break; }
      if (done) break;
      if (!(value instanceof Uint8Array) || value.byteLength > expectedSize - length) {
        reject = true; break;
      }
      chunks.push(value);
      length += value.byteLength;
    }
  } catch (error) {
    reject = true;
    throw error;
  } finally {
    if (reject) { try { await reader.cancel(); } catch (_) {} }
    try { reader.releaseLock(); } catch (_) {}
  }
  if (reject || length !== expectedSize) return null;
  const raw = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.byteLength; }
  return raw;
}`;
function fnv1a32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; ++i) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
assert.equal(fnv1a32(pinnedSource), '7d420b48', 'pinned source drifted');
const directory = fileURLToPath(new URL('.', import.meta.url));
const sourcePath = resolve(directory, '../web/x0x_installer.html');
let production = pinnedSource;
let mode = 'exact pinned production excerpt';
if (existsSync(sourcePath)) {
  const html = readFileSync(sourcePath, 'utf8');
  const match = html.match(/async function readApprovedPackage\([^]*?\n}(?=\s*async function loadSelectedPackage)/);
  assert.ok(match, 'production bounded reader must be available for checkout regression');
  production = match[0];
  mode = 'live repository production body';
}
console.log(`EC043 source=${mode} fnv1a32=${fnv1a32(production)}`);

class CountedBytes extends Uint8Array {
  static setCalls = 0;
  set(source, offset) { CountedBytes.setCalls++; return super.set(source, offset); }
}
// Compile the genuine source function. No stubbed implementation of the function under test.
const readApprovedPackage = new Function('Uint8Array', `${production}\nreturn readApprovedPackage;`)(CountedBytes);
function mockResponse(zeroChunks) {
  let n = 0;
  let cancelled = false;
  const response = { body: { getReader() { return {
    async read() {
      if (n++ < zeroChunks) return { done: false, value: new CountedBytes(0) };
      if (n === zeroChunks + 1) return { done: false, value: new CountedBytes([1, 2, 3, 4]) };
      return { done: true };
    },
    async cancel() { cancelled = true; },
    releaseLock() {},
  }; } } };
  return { response, wasCancelled: () => cancelled };
}

test('control: a valid four-byte streamed firmware package is accepted', async () => {
  CountedBytes.setCalls = 0;
  const { response } = mockResponse(0);
  const out = await readApprovedPackage(response, 4, () => true);
  assert.deepEqual([...out], [1, 2, 3, 4]);
  assert.equal(CountedBytes.setCalls, 1);
});

test('negative: thousands of zero-byte chunks cannot accumulate unbounded retained references', async () => {
  CountedBytes.setCalls = 0;
  const { response } = mockResponse(16384);
  const out = await readApprovedPackage(response, 4, () => true);
  // Refusing the hostile stream is safe; accepting it without retaining 16384
  // empty chunks is also safe. A one-time four-byte copy is sufficient.
  if (out !== null) assert.deepEqual([...out], [1, 2, 3, 4]);
  assert.ok(CountedBytes.setCalls <= 16,
    `Retained ${CountedBytes.setCalls} stream chunks for only 4 actual bytes; a bounded byte counter did not bound array growth`);
});
