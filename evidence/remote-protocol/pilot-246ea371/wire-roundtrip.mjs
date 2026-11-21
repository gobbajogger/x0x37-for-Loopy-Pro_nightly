// SPDX-License-Identifier: GPL-3.0-only
// Run the archived host program first; see README.md.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

if (process.argv.length !== 3) throw Error('Supply the pinned firmware checkout as the only argument.');
const repo = resolve(process.argv[2]);
const source = '246ea3718c6c72ba80bbd1aafcd5356f871c78c8';
const codec = join(repo, 'tests/host/dnr2_reference/browser_codec.mjs');
const binary = join(repo, 'build/host/remote-actual-core/test');
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim(), source);
execFileSync('git', ['diff', '--quiet', 'HEAD', '--'], {cwd: repo});
const codecSha256 = sha256(codec);
assert.equal(codecSha256, '2ba77fa371114c978dc00d25f2205ff69593a9ab4f24a3a406c262426bdf50d2');
const {encodeCommand, decodeReply, OP, STATUS} = await import(pathToFileURL(codec));
const catalog = JSON.parse(execFileSync(binary, ['--catalog'], {encoding: 'utf8', timeout: 45000}));
assert.equal(catalog.testOnly, true);
assert.equal(catalog.nativeAdmitted, false);
assert.equal(catalog.count, 326);
assert.equal(catalog.crc, 0xeec38bc1);

const child = spawn(binary, ['--serve'], {stdio: ['pipe', 'pipe', 'inherit']});
const closed = once(child, 'close');
const replies = createInterface({input: child.stdout})[Symbol.asyncIterator]();
const deadline = setTimeout(() => child.kill('SIGKILL'), 60000);
let request = 0, revision = 0, epoch = 0, reads = 0;
const restored = [];
const unavailable = [];

async function exchange(line) {
  child.stdin.write(line + '\n');
  const reply = await replies.next();
  assert.equal(reply.done, false, 'Host closed before replying');
  return JSON.parse(reply.value);
}

async function call(op, control = 0, value = 0, expectedRevision = revision) {
  const hello = op === OP.HELLO;
  const command = {
    version: 2, op, unit: hello ? 0 : 1, unitHigh: hello ? [0, 0, 0] : [2, 3, 4],
    client: 7, epoch, request: ++request, revision: expectedRevision, control, token: 0, value
  };
  const bytes = encodeCommand(command);
  assert.equal(bytes.length, 51);
  const envelope = await exchange(Buffer.from(bytes).toString('hex'));
  const reply = decodeReply(Buffer.from(envelope.hex, 'hex'));
  assert.equal(envelope.admitted, false);
  assert.equal(reply.op, op);
  assert.equal(reply.request, request);
  revision = reply.revision;
  if (op === OP.READ) reads++;
  return reply;
}

try {
  const hello = await call(OP.HELLO);
  assert.equal(hello.status, STATUS.OK);
  assert.equal(hello.control, catalog.count);
  assert.equal(hello.value, catalog.crc);
  const open = await call(OP.OPEN, 0, 0, 0);
  assert.equal(open.status, STATUS.OK);
  epoch = open.epoch;

  for (const {id, bank, label, max} of catalog.controls) {
    const before = await call(OP.READ, id);
    if (before.status === STATUS.UNSUPPORTED) {
      assert.equal(bank, 1);
      unavailable.push({id, bank, label});
      continue;
    }
    assert.equal(before.status, STATUS.OK);
    const original = before.value;
    const changed = original === max ? 0 : original + 1;
    assert.notEqual(original, changed);
    assert(changed <= max);

    const write = await call(OP.SET, id, changed, before.revision);
    assert.equal(write.status, STATUS.QUEUED);
    assert.equal(write.value, changed);
    const after = await call(OP.READ, id);
    assert.equal(after.status, STATUS.OK);
    assert.equal(after.value, changed);
    assert.equal(after.revision, write.revision);

    const inverse = await call(OP.SET, id, original, after.revision);
    assert.equal(inverse.status, STATUS.QUEUED);
    assert.equal(inverse.value, original);
    const final = await call(OP.READ, id);
    assert.equal(final.status, STATUS.OK);
    assert.equal(final.value, original);
    assert.equal(final.revision, inverse.revision);
    restored.push({id, bank, label, original, changed, readAfterEdit: after.value, readAfterRestore: final.value});
    await exchange('advance 15');
  }
  assert.equal(restored.length, 294);
  assert.equal(unavailable.length, 32);

  const id = catalog.diagnosticMasterMakeup;
  const before = await call(OP.READ, id);
  assert.equal(before.status, STATUS.OK);
  const requested = before.value === 23 ? 25 : 23;
  const write = await call(OP.SET, id, requested, before.revision);
  assert.equal(write.status, STATUS.QUEUED);
  const observed = await call(OP.READ, id);
  assert.equal(observed.status, STATUS.OK);
  assert.equal(observed.value, requested);
  const external = await exchange('external 24');
  assert.equal(external.value, 24);
  assert(external.revision > observed.revision);
  const stale = await call(OP.SET, id, before.value, observed.revision);
  assert.equal(stale.status, STATUS.CONFLICT);
  const preserved = await call(OP.READ, id);
  assert.equal(preserved.status, STATUS.OK);
  assert.equal(preserved.value, 24);

  const close = await call(OP.CLOSE);
  assert.equal(close.status, STATUS.OK);
  child.stdin.end();
  const [code] = await closed;
  assert.equal(code, 0);
  const result = {
    source, codecSha256, binarySha256: sha256(binary),
    transport: 'archived real-app host over stdio', nativeAdmitted: catalog.nativeAdmitted,
    catalogCRC: catalog.crc, catalogCount: catalog.count, wireRequests: request, reads,
    staleRestore: {id, original: before.value, requested, external: 24, status: stale.status, preserved: preserved.value},
    restored, unavailable
  };
  console.log(JSON.stringify(result));
} finally {
  clearTimeout(deadline);
  child.kill();
}
