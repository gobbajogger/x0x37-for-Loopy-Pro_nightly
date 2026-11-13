// SPDX-License-Identifier: GPL-3.0-only
// Actual installer caller with DOM-only mocks; not a rendered browser/device test.
// Live gh-pages 6a9953de: saveSlotBackup requests the download and returns true
// immediately. There is no confirmation panel; the browser cannot prove the file
// was retained. A failed URL/click still rejects (installKeepingSlots then
// continues OTA unprotected).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

const source = readFileSync(new URL('../web/x0x_installer.html', import.meta.url), 'utf8');
const start = source.indexOf('async function saveSlotBackup(');
const end = source.indexOf('\nasync function run(', start);
assert.ok(start >= 0 && end > start);
const body = source.slice(start, end);
assert.match(source, /id="backup-warning"/);
assert.doesNotMatch(source, /id="backup-confirmation"/);
assert.doesNotMatch(source, /id="backup-cancel"/);
assert.doesNotMatch(source, /id="backup-retained"/);
assert.match(body, /return true; \/\/ Requested only/);
assert.match(body, /the browser cannot prove the file was retained/i);
assert.match(source, /save: \(file, name\) => saveSlotBackup\(file, name\)/);

function runtime(fault) {
  const state = { events: [], downloads: [], blobs: [], revoked: [], timers: [], logs: [] };
  const env = {
    $: id => { throw Error('live saveSlotBackup does not use $("'+id+'")'); },
    Blob,
    URL: {
      createObjectURL(blob) { if (fault === 'url') throw Error('URL denied'); state.blobs.push(blob); return 'blob:backup-' + state.blobs.length; },
      revokeObjectURL(url) { state.revoked.push(url); },
    },
    document: {
      createElement(tag) {
        assert.equal(tag, 'a');
        return { click() { if (fault === 'click') throw Error('download denied'); state.downloads.push({ href: this.href, name: this.download }); },
          remove() { state.events.push('anchor removed'); } };
      },
      body: { appendChild() { state.events.push('anchor appended'); } },
    },
    setTimeout(fn, ms) { assert.equal(ms, 60000); state.timers.push(fn); },
    t: key => key + ':', log: line => state.logs.push(line), sayK: key => state.events.push(key),
  };
  const ctx = createContext(env);
  new Script(body + '\nglobalThis.save = saveSlotBackup;').runInContext(ctx);
  return { ctx, state };
}
const bytes = Uint8Array.from([1, 2, 3]);

test('download request settles true immediately and revokes the blob after 60s', async () => {
  const { ctx, state } = runtime();
  const result = await ctx.save(bytes, 'exact.x0xslots');
  assert.equal(result, true);
  assert.deepEqual(state.downloads, [{ href: 'blob:backup-1', name: 'exact.x0xslots' }]);
  assert.deepEqual(new Uint8Array(await state.blobs[0].arrayBuffer()), bytes);
  assert.deepEqual(state.logs, ['slotdownload:exact.x0xslots']);
  assert.ok(state.events.includes('anchor appended'));
  assert.ok(state.events.includes('anchor removed'));
  assert.equal(state.revoked.length, 0, 'revoke is deferred 60s');
  state.timers.forEach(fn => fn());
  assert.deepEqual(state.revoked, ['blob:backup-1']);
});

test('a second save is an independent download and also returns true', async () => {
  const { ctx, state } = runtime();
  assert.equal(await ctx.save(bytes, 'first.x0xslots'), true);
  assert.equal(await ctx.save(bytes, 'retry.x0xslots'), true);
  assert.equal(state.downloads.length, 2);
  assert.deepEqual(state.downloads[1], { href: 'blob:backup-2', name: 'retry.x0xslots' });
  assert.equal(state.logs.at(-1), 'slotdownload:retry.x0xslots');
  state.timers.forEach(fn => fn());
  assert.deepEqual(state.revoked, ['blob:backup-1', 'blob:backup-2']);
});

for (const fault of ['url', 'click']) test(`${fault} failure rejects without a completed download request`, async () => {
  const { ctx, state } = runtime(fault);
  await assert.rejects(ctx.save(bytes, 'failed.x0xslots'), /denied/);
  if (fault === 'url') {
    assert.deepEqual(state.logs, []);
    assert.equal(state.downloads.length, 0);
    assert.equal(state.revoked.length, 0);
  } else {
    assert.ok(state.events.includes('anchor removed'));
    assert.equal(state.downloads.length, 0);
    state.timers.forEach(fn => fn());
    assert.deepEqual(state.revoked, ['blob:backup-1']);
  }
});
