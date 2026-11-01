// NIGHTLY installer slot-preservation regression. No hardware is connected.
// Run with: node --test install/tests/slot-backup-compat.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function section(start, end) {
  const a = html.indexOf(start);
  assert.ok(a >= 0, 'missing: ' + start);
  const b = html.indexOf(end, a + start.length);
  assert.ok(b > a, 'missing: ' + end);
  return html.slice(a, b);
}
const keys = [
  'hasInstallSnapshot', 'beginInstallSnapshot', 'cancelInstallSnapshot',
  'readSlotLayout', 'flashMap', 'packageSlotMap', 'atRisk', 'backupSlots',
  'archiveStamp', 'makeArchive', 'readArchive', 'commitInstallSnapshot',
  'planMigration', 'guardMigrationLoopMenu', 'restoreMapped'
];
const flow = new Function(...keys, section('async function installKeepingSlots(', 'const $ =')
  + '\nreturn installKeepingSlots;');

async function mockInstall(o = {}) {
  const log = { writes: 0, restores: 0, saves: 0, warnings: [], cancels: 0, atomic: 0 };
  const layout = { count: 1, size: 81920, ext: false,
    slots: [{ nz: 1, used: 1, off: null, size: 81920 }] };
  const link = { lost: !!o.lost, close() {} };
  const device = { link, id: { model: o.model || 'SMK-37 Elite', text: 'X0X 0.9' } };
  const d = {
    hasInstallSnapshot: async () => {
      if (o.infoTimeout) throw Error('timeout on INFO');
      return !!o.snapshot;
    },
    beginInstallSnapshot: async () => {
      if (o.startFailed) throw Error('snapshot start failed');
      return { consumed: false };
    },
    cancelInstallSnapshot: async () => { log.cancels++; },
    readSlotLayout: async () => {
      if (o.layoutTimeout) throw Error('The keyboard did not answer (slot command 15).');
      return layout;
    },
    flashMap: () => [{ off: 0xC2000, size: 81920 }],
    packageSlotMap: () => [{ off: 0xD6000, size: 81920 }],
    atRisk: () => [0],
    backupSlots: async () => {
      if (o.readFailed) throw Error('The keyboard did not answer (slot command 16).');
      return { layout, images: [new Uint8Array([1, 2, 3])] };
    },
    archiveStamp: () => ({ name: 'saved.x0xslots', created: '2026-11-01T18:15:00' }),
    makeArchive: () => {
      if (o.badArchive) throw Error('invalid backup archive');
      return new Uint8Array([1, 2, 3]);
    },
    readArchive: () => {},
    commitInstallSnapshot: async () => { log.atomic++; },
    planMigration: () => ({ todo: [{ k: 0, j: 0 }], skipped: [] }),
    guardMigrationLoopMenu: (...args) => ({ todo: args[6], skipped: args[7] }),
    restoreMapped: async () => { log.restores++; }
  };
  const install = flow(...keys.map(k => d[k]));
  const updater = {
    async find() { return device; },
    bind() {},
    async install(_im, _prod, _step, start, admitted) {
      if (!admitted()) throw Error('not admitted');
      if (start) await start({ link });
      log.writes++;
      return 'SMK-37 Elite_900';
    },
    async waitFor() { return device; }
  };
  const h = {
    sameKeyboard: (a, b) => a.toLowerCase() === b.toLowerCase(),
    admitted: () => o.admitted !== false,
    say: (key, detail) => {
      if (key === 'slotunprotectedwarning') log.warnings.push(String(detail));
    },
    save: async () => {
      log.saves++;
      if (o.downloadThrows) throw Error('browser refused download');
      return !o.downloadDeclines;
    }
  };
  try {
    log.result = await install(updater, new Uint8Array([1]),
      'SMK-37 Elite_900', 'smk', h);
  } catch (e) { log.error = e.code || e.message; }
  return log;
}

for (const [name, conditions] of Object.entries({
  '0.9 atomic snapshot unsupported': {},
  '0.9 no SMP_INFO command 15': { layoutTimeout: true },
  'snapshot capability request timeout': { infoTimeout: true },
  'snapshot start failed': { startFailed: true, snapshot: true },
  'backup read command 16 failed': { readFailed: true, snapshot: true },
  'backup archive invalid': { badArchive: true, snapshot: true },
  'backup download throws': { downloadThrows: true, snapshot: true },
  'backup download returns false': { downloadDeclines: true, snapshot: true },
  'backup timeout while device link lost': { lost: true, layoutTimeout: true }
})) {
  test(name + ': warning, no backup block, OTA attempted', async () => {
    const r = await mockInstall(conditions);
    assert.equal(r.writes, 1);
    assert.equal(r.warnings.length, 1);
    assert.equal(r.result.unprotected, true);
    assert.equal(r.restores, 0);
  });
}

test('current firmware: successful snapshot, backup, install, restore', async () => {
  const r = await mockInstall({ snapshot: true });
  assert.equal(r.writes, 1);
  assert.equal(r.saves, 1);
  assert.equal(r.atomic, 1);
  assert.equal(r.restores, 1);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.result.unprotected, false);
});

test('strict model mismatch is still a hard block', async () => {
  const r = await mockInstall({ model: 'SMK-37 Pro' });
  assert.equal(r.writes, 0);
  assert.equal(r.error, 'model');
  assert.deepEqual(r.warnings, []);
});

test('revoked package is still a hard block', async () => {
  const r = await mockInstall({ admitted: false });
  assert.equal(r.writes, 0);
  assert.equal(r.error, 'unapproved');
});

test('firmware exact model identity ignores USB port naming', () => {
  const model = new Function(section('function keyboardModel(', '// errors carry a code')
    + '\nreturn sameKeyboard;')();
  assert.equal(model('SMK-37 Elite', 'SMK-37 Elite'), true);
  assert.equal(model('SMK-37 Pro', 'SMK-37 Elite'), false);
  assert.equal(model('FM-1', 'SMK-37 Elite'), false);
});

test('bundled Bluetooth image mismatch still prevents update', async () => {
  const body = section('function bundledController(', 'function isCatalogChecked');
  const verify = new Function('controllerOf', 'sha256Hex', 't', body
    + '\nreturn verifyBundledController;')(
    () => new Uint8Array([1, 2, 3]), async () => 'actual-hash', k => k);
  await assert.rejects(verify(null,
    { controller_size: 3, controller_sha256: 'a334208b' }));
  await assert.doesNotReject(verify(null,
    { controller_size: 3, controller_sha256: 'actual-hash' }));
});

test('iPhone WebMIDI: warning is in-page, with no second backup approval', () => {
  assert.ok(html.includes('id="backup-warning"'));
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes('$("backup-warning").hidden = false'));
  assert.ok(!html.includes('confirmUnprotectedInstall('));
  assert.ok(!html.includes('id="backup-retained"'));
  assert.ok(html.includes('navigator.requestMIDIAccess({ sysex: true })'));
  assert.ok(html.includes('function confirmWrite(product)'));
});

test('all inline JavaScript compiles; no catalog mutation', () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0);
  for (const script of scripts) assert.doesNotThrow(() => new Function(script[1]));
  assert.ok(html.includes('const catalog = {"schema":1,'));
  assert.ok(html.includes('"display_version":"0.0.24.1"'));
});
