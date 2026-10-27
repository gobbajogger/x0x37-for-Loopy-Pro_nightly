// SPDX-License-Identifier: GPL-3.0-only
// Actual installer caller with DOM-only mocks; not a rendered browser/device test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { setImmediate as nextTurn } from 'node:timers/promises';

const source = readFileSync(new URL('../web/x0x_installer.html', import.meta.url), 'utf8');
const start = source.indexOf('async function saveSlotBackup(');
const end = source.indexOf('\nasync function run(', start);
assert.ok(start >= 0 && end > start);
const body = source.slice(start, end);
assert.match(source.slice(end), /const retained = await saveSlotBackup\(file, name\);/);
assert.match(source, /id="backup-confirmation"[^>]+hidden/);
assert.match(source, /id="backup-cancel"/);
assert.match(source, /id="backup-retained"/);
assert.match(source, /cannot verify that it was saved/);
assert.doesNotMatch(source, /Slots saved \(downloaded\)/);

function runtime(fault) {
  const state = { events: [], downloads: [], blobs: [], revoked: [], timers: [], logs: [] };
  const ui = Object.fromEntries(['backup-confirmation', 'backup-retained', 'backup-cancel', 'backup-name']
    .map(id => [id, { hidden: true, textContent: '', onclick: null, focus() { state.events.push('focus ' + id); } }]));
  const env = {
    $: id => ui[id], Blob,
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
  return { ctx, state, ui };
}
const bytes = Uint8Array.from([1, 2, 3]);

test('download request alone never settles; explicit retained-file click returns true', async () => {
  const { ctx, state, ui } = runtime();
  let settled = false;
  const result = ctx.save(bytes, 'exact.x0xslots').then(value => { settled = true; return value; });
  await nextTurn();
  assert.equal(settled, false);
  assert.deepEqual(state.downloads, [{ href: 'blob:backup-1', name: 'exact.x0xslots' }]);
  assert.deepEqual(new Uint8Array(await state.blobs[0].arrayBuffer()), bytes);
  assert.deepEqual(state.logs, ['slotdownload:exact.x0xslots']);
  assert.equal(ui['backup-confirmation'].hidden, false);
  assert.equal(ui['backup-name'].textContent, 'exact.x0xslots');
  assert.ok(state.events.includes('focus backup-cancel'));
  ui['backup-retained'].onclick();
  assert.equal(await result, true);
  assert.deepEqual(state.logs, ['slotdownload:exact.x0xslots', 'slotsaved:exact.x0xslots']);
  assert.equal(ui['backup-confirmation'].hidden, true);
  assert.equal(ui['backup-retained'].onclick, null); assert.equal(ui['backup-cancel'].onclick, null);
  state.timers.forEach(fn => fn()); assert.deepEqual(state.revoked, ['blob:backup-1']);
});

test('cancel returns false and retry requires acknowledgement of the new archive', async () => {
  const { ctx, state, ui } = runtime();
  const first = ctx.save(bytes, 'first.x0xslots');
  const oldConfirm = ui['backup-retained'].onclick;
  ui['backup-cancel'].onclick(); assert.equal(await first, false);
  assert.equal(ui['backup-confirmation'].hidden, true);
  assert.ok(state.logs.every(line => !line.startsWith('slotsaved:')));
  let settled = false;
  const retry = ctx.save(bytes, 'retry.x0xslots').then(value => { settled = true; return value; });
  oldConfirm(); await nextTurn();
  assert.equal(settled, false, 'old acknowledgement must not authorize a new archive');
  assert.equal(ui['backup-name'].textContent, 'retry.x0xslots');
  ui['backup-retained'].onclick(); assert.equal(await retry, true);
  assert.equal(state.downloads.length, 2);
  assert.equal(state.logs.at(-1), 'slotsaved:retry.x0xslots');
});

for (const fault of ['url', 'click']) test(`${fault} failure rejects without retained acknowledgement`, async () => {
  const { ctx, state, ui } = runtime(fault);
  await assert.rejects(ctx.save(bytes, 'failed.x0xslots'), /denied/);
  assert.equal(ui['backup-confirmation'].hidden, true);
  assert.equal(ui['backup-retained'].onclick, null);
  assert.deepEqual(state.logs, []);
  if (fault === 'click') {
    assert.ok(state.events.includes('anchor removed'));
    state.timers.forEach(fn => fn()); assert.deepEqual(state.revoked, ['blob:backup-1']);
  }
});
