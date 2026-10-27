// SPDX-License-Identifier: GPL-3.0-only
// Actual installer + actual Updater + real confirmation body. Synthetic links,
// nonexecutable package fixture, no real MIDI/hardware. Firmware has separate
// actual-C parser/main-loop coverage; this file tests the browser wire contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { setImmediate as tick } from 'node:timers/promises';
import { installKeepingSlots, userSlotRaw, pack78, unpack78, readArchive,
  writeSlotImage, readSlotImage, parseHeader, beginInstallSnapshot, commitInstallSnapshot,
  hasInstallSnapshot } from '../web/x0x_breaks.js';
import { makePackage } from './fixtures/bundled-synthetic.mjs';
import { logicalImage, productOf } from '../web/fm1pkg.js';
import { withInstallSnapshot, SNAPSHOT_INFO } from './fixtures/install-snapshot.mjs';

const PREFIX = [0xF0, 0x7D, 0x46, 0x4C];
const otaSource = readFileSync(new URL('../web/fm1ota.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../web/x0x_installer.html', import.meta.url), 'utf8');
function runtime() {
  let time = 0;
  const ctx = { TextEncoder, Date: class extends Date { static now() { return time; } },
    setTimeout(f, ms) { time += ms || 0; f(); return 0; }, clearTimeout() {} };
  new Script(otaSource.replace(/^export\s+/gm, '') + '\nthis.api={Updater,pack7};').runInNewContext(ctx);
  return ctx.api;
}
function confirmation() {
  const ui = {}, ctx = { Blob, URL: { createObjectURL: () => 'blob:synthetic', revokeObjectURL() {} },
    $: id => ui[id] ??= { hidden: true, onclick: null, focus() {}, textContent: '' },
    setTimeout() {}, t: k => k, log() {}, sayK() {},
    document: { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } } };
  const begin = html.indexOf('async function saveSlotBackup('), end = html.indexOf('\nasync function run(', begin);
  assert.ok(begin >= 0 && end > begin);
  new Script(html.slice(begin, end) + '\nthis.save=saveSlotBackup;').runInNewContext(ctx);
  return { ui, save: ctx.save };
}
function image(marker) {
  const { hdr, data } = userSlotRaw('LOOP', [{ adpcm: new Uint8Array(64).fill(marker), n: 128, rate: 44100 }], 0x14000);
  const out = new Uint8Array(512 + data.length).fill(255); out.set(hdr); out.set(data, 512); return out;
}
function setup({ empty = false, lateMutation = false, rejectCommit = false, legacy = false } = {}) {
  const api = runtime(), panel = confirmation();
  const original = image(0x11), replacement = image(0x33), events = [];
  let current = empty ? null : original, stage, finds = 0, backup = null;
  const raw = makePackage('pro', { slotMap: [] }), target = logicalImage(raw), product = productOf(raw);
  function info() { const h = current && parseHeader(current); return [1, 80, h?.nz || 0,
    ...(h ? [...new TextEncoder().encode(h.name)] : []), 0, h ? 1 : 0,
    0x58, 1, 0x42, 1, 20, 0, h ? 1 : 0, 0]; }
  function link(name) {
    const q = [], sent = [];
    return { name, sent, q, lost: false,
      drain() { q.length = 0; }, close() { events.push(name + ':close'); },
      async read() { return q.shift() || null; },
      send(frame) {
        sent.push(Array.from(frame));
        if (frame[1] === 0x22) { events.push('LEGACY_UPGRADE'); return true; }
        if (frame[1] !== 0x7D) { events.push('OTA_FINISH_ACK'); return true; }
        const cmd = frame[4], a = frame.slice(5, -1); let payload;
        if (cmd === 1) payload = [...new TextEncoder().encode('X0X legacy'), 0, 0, 0, 0, 16, 0, 0];
        else if (cmd === 15) payload = info();
        else if (cmd === 16) { const off = a[1] | a[2] << 7 | a[3] << 14;
          payload = [...a.slice(0, 4), ...pack78(current.subarray(off, off + a[4] * 2))]; }
        else if (cmd === 11) { stage = new Uint8Array(replacement.length).fill(255); payload = [a[0], 0]; }
        else if (cmd === 12) { const off = a[1] | a[2] << 7 | a[3] << 14; stage.set(unpack78(a.slice(4)), off); payload = [...a.slice(0, 4), 0]; }
        else if (cmd === 13) { stage.set(unpack78(a.slice(1))); current = stage; payload = [a[0], 0]; }
        else throw Error('unexpected command ' + cmd);
        q.push([...PREFIX, cmd, ...payload, 0xF7]); return true;
      } };
  }
  const pre = link('preflight'), final = link('final'), external = link('external');
  const watch = legacy ? null : withInstallSnapshot(pre);
  if (watch) { withInstallSnapshot(final, null, watch); withInstallSnapshot(external, null, watch); }
  const sendFinal = final.send;
  final.send = frame => {
    assert.notEqual(frame[1], 0x22, 'guarded path must not send legacy UPGRADE');
    const result = sendFinal(frame);
    if (frame[4] === 48 && frame[5] === 3 && watch.commits) {
      events.push('DEVICE_OTA_ENTRY');
      // A complete ACK is ahead of this genuine first-stage OTA request.
      const b = [0, 0x59, 0x30, 8, 0, 0, 0, 0, 0, 0, 0xE0, 0, 0, 0];
      b.push(~b.slice(6).reduce((a, v) => a + v, 0) & 255);
      final.q.push([0xF0, ...api.pack7(b), 0xF7]);
    }
    return result;
  };
  const name = 'SMK-37 Pro MIDI', port = { name, state: 'connected' };
  const up = new api.Updater({ inputs: new Map([['in', port]]), outputs: new Map() });
  up.find = async () => {
    finds++;
    if (finds === 2 && (lateMutation || rejectCommit)) {
      current = replacement; watch.changed(); events.push('LATE_MUTATION');
    }
    return { name, link: finds === 1 ? pre : final, id: { text: product, model: 'SMK-37 Pro', version: 900 } };
  };
  up.waitFor = async () => { events.push('LOADER_DISCOVERY'); return null; };
  const run = () => installKeepingSlots(up, target, product, 'smk', {
    sameKeyboard: () => true, save(bytes, name) { backup = readArchive(bytes); return panel.save(bytes, name); },
    step: k => events.push('STEP:' + k),
  }).then(value => ({ value }), error => ({ error }));
  return { run, panel, events, watch, original, replacement, external, final, pre,
    info, get current() { return current; }, get backup() { return backup; } };
}

test('real confirmation + real Updater preserves queued OTA read and sends no second UPGRADE', async () => {
  const f = setup(), pending = f.run(); await tick();
  assert.equal(f.panel.ui['backup-confirmation'].hidden, false);
  assert.deepEqual(f.backup.images[0], f.original);
  assert.deepEqual(f.watch.operations, [1]);
  assert.equal(f.events.includes('DEVICE_OTA_ENTRY'), false);
  f.panel.ui['backup-retained'].onclick();
  const r = await pending;
  assert.equal(r.error?.code, 'noloader', 'test stops only after genuine first-stage completion');
  assert.deepEqual(f.watch.operations, [1, 3]);
  assert.ok(f.events.indexOf('preflight:close') < f.events.indexOf('DEVICE_OTA_ENTRY'));
  assert.ok(f.events.includes('OTA_FINISH_ACK') && f.events.includes('LOADER_DISCOVERY'));
  assert.equal(f.events.includes('LEGACY_UPGRADE'), false);
});

test('normal external BEGIN/WRITE/END during real confirmation invalidates same-shape archive', async () => {
  const f = setup(), pending = f.run(); await tick(); const oldInfo = f.info();
  await writeSlotImage(f.external, 0, f.replacement);
  assert.deepEqual(await readSlotImage(f.external, 0, 1, undefined, 0x14000), f.replacement);
  assert.deepEqual(f.info(), oldInfo);
  f.panel.ui['backup-retained'].onclick();
  const r = await pending;
  assert.equal(r.error?.code, 'slotbackup'); assert.match(r.error.message, /samples changed/);
  assert.deepEqual(f.backup.images[0], f.original);
  assert.equal(f.watch.commits, 0); assert.equal(f.events.includes('DEVICE_OTA_ENTRY'), false);
  assert.equal(f.events.includes('LOADER_DISCOVERY'), false);
});

test('mutation on final freshly bound link is rejected, after all backup UI work', async () => {
  const f = setup({ lateMutation: true }), pending = f.run(); await tick();
  f.panel.ui['backup-retained'].onclick(); const r = await pending;
  assert.equal(r.error?.code, 'slotbackup'); assert.equal(f.watch.commits, 0);
  assert.ok(f.events.includes('LATE_MUTATION')); assert.equal(f.events.includes('DEVICE_OTA_ENTRY'), false);
});

test('empty-to-occupied after first SMP_INFO cannot take an unguarded no-backup path', async () => {
  const f = setup({ empty: true, lateMutation: true }), r = await f.run();
  assert.equal(f.backup, null); assert.equal(r.error?.code, 'slotbackup');
  assert.equal(f.watch.commits, 0); assert.deepEqual(f.watch.operations, [1, 3]);
});

test('real Cancel consumes watch without an OTA authorization', async () => {
  const f = setup(), pending = f.run(); await tick();
  f.panel.ui['backup-cancel'].onclick(); const r = await pending;
  assert.equal(r.error?.code, 'slotbackupconfirm'); assert.deepEqual(f.watch.operations, [1, 2]);
  assert.equal(f.watch.commits, 0); assert.equal(f.events.includes('STEP:start'), false);
});

for (const empty of [false, true]) test(`old firmware ${empty ? 'empty' : 'occupied'} slots require a separate verified preservation path`, async () => {
  const f = setup({ legacy: true, empty }), r = await f.run();
  assert.equal(r.error?.code, 'slotbackup'); assert.match(r.error.message, /cannot atomically protect/);
  assert.equal(f.backup, null); assert.equal(f.events.includes('LEGACY_UPGRADE'), false);
  assert.ok(f.pre.sent.every(p => [1, 15].includes(p[4])));
});

function ackLink(edit = r => [r]) {
  const queue = [], sent = [];
  return { sent, lost: false, drain() { queue.length = 0; },
    async read() { return queue.shift() || null; },
    send(p) {
      sent.push([...p]); const op = p[5], token = p.slice(6, 22);
      const ticket = op === 1 ? [1, 0, 0, 0] : p.slice(22, 26);
      const ack = [...PREFIX, 48, op, 0, ...token, ...ticket, 0xF7];
      queue.push(...edit(ack)); return true;
    } };
}
test('stray token/ticket ACKs do not replace the requested snapshot, and COMMIT is one-shot', async () => {
  const link = ackLink(r => { const wrong = [...r]; wrong[7] ^= 1; return [wrong, r]; });
  const snapshot = await beginInstallSnapshot(link);
  await commitInstallSnapshot(link, snapshot);
  await assert.rejects(commitInstallSnapshot(link, snapshot), /already been consumed/);
  assert.deepEqual(link.sent.map(p => p[5]), [1, 3]);
});
for (const mode of ['missing', 'short', 'high-bit', 'zero-ticket', 'wrong-ticket', 'wrong-op', 'bad-rc'])
test(`COMMIT ${mode} acknowledgement refuses without retry`, async () => {
  let phase = 0;
  const link = ackLink(r => {
    if (!phase++) return [r];
    const b = [...r];
    if (mode === 'missing') return [];
    if (mode === 'short') b.splice(8, 1);
    if (mode === 'high-bit') b[7] |= 128;
    if (mode === 'zero-ticket') b.fill(0, 23, 27);
    if (mode === 'wrong-ticket') b[23] = 2;
    if (mode === 'wrong-op') b[5] = 1;
    if (mode === 'bad-rc') b[6] = 127;
    return [b];
  });
  const snapshot = await beginInstallSnapshot(link);
  await assert.rejects(commitInstallSnapshot(link, snapshot), { code: 'slotbackup' });
  await assert.rejects(commitInstallSnapshot(link, snapshot), /already been consumed/);
  assert.equal(link.sent.length, 2);
});
test('observed disconnect rejects before sending COMMIT', async () => {
  const link = ackLink(), snapshot = await beginInstallSnapshot(link); link.lost = true;
  await assert.rejects(commitInstallSnapshot(link, snapshot), /connection was lost/);
  assert.equal(link.sent.length, 1);
});
test('missing START ACK abandons the attempt without any ticket or retry', async () => {
  const link = ackLink(() => []);
  await assert.rejects(beginInstallSnapshot(link), { code: 'slotbackup' });
  assert.deepEqual(link.sent.map(p => p[5]), [1]);
});
test('missing or wrong-family preflight cannot discover a later device and bypass its backup', async () => {
  let installs = 0, closed = 0;
  const up = { async find() { return null; }, async install() { installs++; } };
  await assert.rejects(installKeepingSlots(up, new Uint8Array(), 'SMK-37 Pro_900', 'smk'), { code: 'notfound' });
  up.find = async () => ({ id: { model: 'FM-1' }, link: { close() { closed++; } } });
  await assert.rejects(installKeepingSlots(up, new Uint8Array(), 'SMK-37 Pro_900', 'smk',
    { sameKeyboard: () => false }), { code: 'model' });
  assert.equal(installs, 0); assert.equal(closed, 1);
});
test('capability requires exact X0X versioned extension; an unknown command is never probed', async () => {
  for (const payload of [SNAPSHOT_INFO.slice(0, -1), [...SNAPSHOT_INFO, 0],
    [...SNAPSHOT_INFO.slice(0, -2), 2, 48], [...SNAPSHOT_INFO].fill(0)]) {
    let sent;
    const link = { drain() {}, send(p) { sent = p; return true; }, async read() { return [...PREFIX, 1, ...payload, 0xF7]; } };
    assert.equal(await hasInstallSnapshot(link), false); assert.equal(sent[4], 1);
  }
});
