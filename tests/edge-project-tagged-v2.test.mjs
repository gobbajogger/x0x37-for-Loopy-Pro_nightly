// SPDX-License-Identifier: GPL-3.0-only
// Exact firmware144 synthetic producers; no device, user samples or adoption UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { crc32 } from '../web/x0x_breaks.js';
import { PROJECT_OP as OP, ProjectDevice, parseProject, makeProjectFile, readProjectFile,
  readProjectSnapshot, prepareProjectImport, applyProjectImport } from '../web/x0x_projects.js';

// Reuse the unchanged historical suite's stateful wire/flash peer, not its tests.
// This peer is synthetic transaction evidence, not a C validator or hardware.
const regression = readFileSync(new URL('../web/test_projects.mjs', import.meta.url), 'utf8');
const marker = '\ntest("portable and project-only containers';
assert.ok(regression.includes(marker));
const helperSource = regression.slice(0, regression.indexOf(marker))
  .replaceAll('"./x0x_breaks.js"', JSON.stringify(new URL('../web/x0x_breaks.js', import.meta.url).href))
  .replaceAll('"./x0x_projects.js"', JSON.stringify(new URL('../web/x0x_projects.js', import.meta.url).href));
const { Keyboard, snapshot, original, alternate, third } = await import('data:text/javascript;base64,' +
  Buffer.from(helperSource + '\nexport { Keyboard, snapshot, original, alternate, third };').toString('base64'));
const u21 = n => [n & 127, n >> 7 & 127, n >> 14 & 127];
const n21 = a => a[0] | a[1] << 7 | a[2] << 14;
function fixture(name) {
  const f = JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));
  assert.equal(f.synthetic, true); assert.equal(f.contains_user_data, false);
  const bytes = new Uint8Array(inflateSync(Buffer.from(f.zlib_base64, 'base64')));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), f.sha256);
  return bytes;
}
const producers = [0, 1].map(w => fixture(`project-v6-sound11-wbl${w}`));
class TaggedKeyboard extends Keyboard {
  constructor(options = {}) { super({ project: producers[0], ...options }); }
  handle(cmd, a) {
    if (cmd === 9) {
      const op = a[0], args = a.slice(1);
      if (op === OP.QUERY) return [op, 0, 2, ...u21(36452), this.mode];
      if (op === OP.IMPORT && n21(args) === 36428) {
        if (this.mode) return [op, 2];
        this.mode = 2; this.offset = 0; this.previousWrite = null;
        this.validated = false; this.staging = new Uint8Array(36428);
        return [op, 0];
      }
      if (op === OP.VALIDATE && this.staging?.length === 36428) return [op, 9];
    }
    return super.handle(cmd, a);
  }
}
async function connected(options) {
  const keyboard = new TaggedKeyboard(options);
  const device = new ProjectDevice(keyboard, { timeout: 10, now: () => keyboard.clock });
  await device.connect(); return { keyboard, device };
}

for (const [wbl, project] of producers.entries()) {
  test(`actual144 C producer WBL${wbl} parses and round-trips opaque project/sample bytes`, async () => {
    assert.deepEqual(parseProject(project), { length: 36452, payloadLength: 36420,
      fileVersion: 1, projectVersion: 1, patternVersion: 6, soundRevision: 11 });
    const { keyboard, device } = await connected({ project });
    const exported = await readProjectSnapshot(device);
    assert.deepEqual(exported.project, project);
    assert.deepEqual(exported.images, [original, null, third]);
    const bytes = await makeProjectFile(project, exported, { portable: true });
    const prepared = await prepareProjectImport(device, bytes);
    assert.deepEqual((await readProjectFile(prepared.backupBytes)).images, exported.images);
    const result = await applyProjectImport(device, prepared, { confirmed: true });
    assert.deepEqual(result.changedSlots, []);
    assert.deepEqual(keyboard.project, project);
    assert.deepEqual(keyboard.images, exported.images);
    assert.equal(keyboard.sampleWrites().length, 0);
    const validate = keyboard.calls.findIndex(c => c.cmd === 9 && c.args[0] === OP.VALIDATE);
    const commit = keyboard.calls.findIndex(c => c.cmd === 9 && c.args[0] === OP.COMMIT);
    assert.ok(validate >= 0 && commit > validate);
    assert.equal(keyboard.projectCalls(OP.ADOPT_BASS).length, 0);
    assert.equal(device.projectProtocol, 2);
  });
}

test('tagged import validates before replacing a synthetic sample and retains its exact backup', async () => {
  const { keyboard, device } = await connected();
  const bytes = await makeProjectFile(producers[1], snapshot([alternate, null, third]), { portable: true });
  const prepared = await prepareProjectImport(device, bytes);
  assert.deepEqual((await readProjectFile(prepared.backupBytes)).images[0], original);
  await assert.rejects(applyProjectImport(device, prepared, { confirmed: true }), e => e.code === 'backup');
  assert.equal(keyboard.sampleWrites().length, 0);
  await applyProjectImport(device, prepared, { confirmed: true, backupSaved: true });
  assert.deepEqual(keyboard.project, producers[1]);
  assert.deepEqual(keyboard.images, [alternate, null, third]);
  const validate = keyboard.calls.findIndex(c => c.cmd === 9 && c.args[0] === OP.VALIDATE);
  const firstWrite = keyboard.calls.findIndex(c => c.cmd >= 11 && c.cmd <= 14);
  const commit = keyboard.calls.findIndex(c => c.cmd === 9 && c.args[0] === OP.COMMIT);
  assert.ok(validate >= 0 && firstWrite > validate && commit > firstWrite);
  assert.equal(keyboard.projectCalls(OP.ADOPT_BASS).length, 0);
});

for (const stream of [3, 6]) {
  test(`legacy${stream}/10 high-level import remains refused before staging`, async () => {
    const { keyboard, device } = await connected();
    const bytes = await makeProjectFile(fixture(`project-v${stream}-sound10`), snapshot(), { portable: true });
    await assert.rejects(prepareProjectImport(device, bytes), e => e.code === 'version');
    const valid = await makeProjectFile(producers[0], snapshot(), { portable: true });
    const prepared = await prepareProjectImport(device, valid);
    prepared.file = await readProjectFile(bytes);
    await assert.rejects(applyProjectImport(device, prepared, { confirmed: true }), e => e.code === 'version');
    for (const op of [OP.IMPORT, OP.VALIDATE, OP.ADOPT_BASS, OP.COMMIT]) assert.equal(keyboard.projectCalls(op).length, 0);
    assert.equal(keyboard.sampleWrites().length, 0);
  });
  test(`explicit low-level legacy${stream}/10 staging returns identity-needed then aborts without mutation`, async () => {
    const { keyboard, device } = await connected();
    await device.stage(fixture(`project-v${stream}-sound10`));
    await assert.rejects(device.validate(), e => e.code === 'device-9' && e.rc === 9 && /explicitly confirm both legacy bass engine identities/.test(e.message));
    await device.abort();
    assert.equal(keyboard.mode, 0);
    assert.deepEqual(keyboard.project, producers[0]);
    assert.deepEqual(keyboard.images, [original, null, third]);
    assert.equal(keyboard.sampleWrites().length, 0);
    for (const op of [OP.ADOPT_BASS, OP.COMMIT]) assert.equal(keyboard.projectCalls(op).length, 0);
  });
}

test('tagged unsupported streams, revisions, structural lengths and damaged payloads remain refused', () => {
  for (const [stream, sound] of [[3,11],[4,11],[5,11],[7,11],[8,11],[6,12],[6,4]]) {
    const bad = producers[0].slice(), view = new DataView(bad.buffer);
    view.setUint32(20, stream, true); view.setUint32(24, sound, true);
    assert.throws(() => parseProject(bad), e => e.code === 'version');
  }
  for (const length of [36428,36451,36453]) {
    const bad = new Uint8Array(length); bad.set(producers[0].subarray(0, length));
    const view = new DataView(bad.buffer); view.setUint32(8, length - 32, true); view.setUint32(12, crc32(bad.subarray(32)), true);
    assert.throws(() => parseProject(bad), e => e.code === 'version');
  }
  const bad = producers[0].slice(); bad[80] ^= 1;
  assert.throws(() => parseProject(bad), /CRC/);
});

test('QUERY v2 binds exact size and all unsupported protocols fail before staging', async () => {
  for (const [protocol, length] of [[2,36428],[2,36451],[2,36453],[0,36452],[3,36452]]) {
    const device = new ProjectDevice({}), calls = [];
    device.command = async op => { calls.push(op); return [OP.QUERY,0,protocol,...u21(length),0]; };
    await assert.rejects(device.stage(producers[0]), e => e.code === 'version');
    assert.deepEqual(calls, [OP.QUERY]);
  }
});

test('legacy stage exception is not a generic length or schema bypass', async () => {
  for (const [stream, sound, length] of [[3,4,36428],[3,10,36427],[6,10,36429]]) {
    const bad = new Uint8Array(length); bad.set(producers[0].subarray(0,length));
    const v = new DataView(bad.buffer);
    v.setUint32(8,length-32,true); v.setUint32(12,crc32(bad.subarray(32)),true);
    v.setUint32(20,stream,true); v.setUint32(24,sound,true);
    const { keyboard, device } = await connected();
    await assert.rejects(device.stage(bad), e => e.code === 'version');
    assert.equal(keyboard.projectCalls(OP.IMPORT).length,0);
  }
});
