// SPDX-License-Identifier: GPL-3.0-only
// Build tests/host/remote_actual_core_test.sh in DnBOX at the revision below,
// then run node tests/product-remote/firmware-link-actual-host.mjs /path/to/test.
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {dom} from './tests/firmware-link-dom.mjs';

const [binaryPath, checkout] = process.argv.slice(2);
assert.ok(binaryPath, 'Supply the compiled remote_actual_core_test host');
const binary = resolve(binaryPath);
const product = checkout
  ? pathToFileURL(resolve(checkout) + '/')
  : new URL('../../', import.meta.url);
const app = new URL('web/product-site/remote/firmware-link.mjs', product);
const {mountFirmwareLink} = await import(app);
const {OP, STATUS, decodeCommand, decodeReply} = await import(new URL('./device/vendor/codec.mjs', app));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = execFileSync(binary, ['--catalog'], {timeout: 60000});
const catalog = JSON.parse(manifest);
assert.equal(catalog.testOnly, true);
assert.equal(catalog.admitted, false);
assert.equal(catalog.nativeAdmitted, false);
assert.equal(catalog.count, 326);
assert.equal(catalog.crc, 0xeec38bc1);
const firmware = '246ea3718c6c72ba80bbd1aafcd5356f871c78c8';
// Only this injected transport can consume the test catalog. The generated
// catalog stays marked unadmitted. No product default or device is involved.
const bundle = {
  catalog: {...catalog, admitted: true},
  admission: {testOnly: true, sourceSha: firmware, reviewSha: 'fe9bf3af5902214abf311df5da2f5d231871bbcb3e7ae32f749f69fab4a6f35c', catalogCrc: catalog.crc},
};
const child = spawn(binary, ['--serve'], {stdio: ['pipe', 'pipe', 'inherit']});
const lines = createInterface({input: child.stdout});
// The host initializes its engines before serving MIDI. Synchronize startup so
// the page uses its normal MIDI deadline for a receiver already listening.
const ready = once(lines, 'line');
child.stdin.write('advance 0\n');
const [firstLine] = await ready;
assert.equal(JSON.parse(firstLine).admitted, false);
const transport = new EventTarget();
transport.state = 'connected';
const wire = [];
const commands = [];
lines.on('line', line => {
  const output = JSON.parse(line);
  assert.equal(output.admitted, false);
  const data = Buffer.from(output.hex, 'hex');
  const response = decodeReply(data);
  const command = commands.shift();
  assert.equal(response.request, command.request);
  wire.push({command, response});
  const event = new Event('midimessage');
  event.data = data;
  transport.dispatchEvent(event);
});
const output = {
  state: 'connected',
  send(data) {
    commands.push(decodeCommand(data));
    child.stdin.write(Buffer.from(data).toString('hex') + '\n');
  },
};
const midi = {inputs: new Map([['in', transport]]), outputs: new Map([['out', output]])};
const {document, nodes} = dom();
const status = () => nodes.get('conn-state').textContent;
const link = mountFirmwareLink({document, bundle, navigator: {requestMIDIAccess: async () => midi}});
const receipt = {
  firmware, binarySha256: hash(readFileSync(binary)), catalogSha256: hash(manifest),
  firmwareLinkSha256: hash(readFileSync(fileURLToPath(app))), catalogCrc: catalog.crc,
  catalogCount: catalog.count, testOnly: true, edits: [],
};
async function until(done, operation) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (done()) return;
    if (nodes.get('conn-state').dataset.session === 'disconnected') break;
    await delay(5);
  }
  throw Error(operation + ' failed. Page status: ' + status());
}
function readSnapshot(frames) {
  const reads = frames.filter(frame => frame.command.op === OP.READ);
  assert.deepEqual(reads.map(frame => frame.command.control), catalog.controls.map(c => c.id));
  const revision = reads[0].response.revision;
  return reads.map(({command, response}) => {
    assert.equal(response.control, command.control);
    assert.equal(response.revision, revision);
    assert.ok([STATUS.OK, STATUS.UNSUPPORTED].includes(response.status));
    return {id: command.control, status: response.status, value: response.value};
  });
}
function changes(before, after) {
  return before.flatMap((old, index) => {
    const next = after[index];
    if (old.status === next.status && old.value === next.value) return [];
    const d = catalog.controls[index];
    return [{id: d.id, label: d.label, before: old.value, after: next.value}];
  });
}
async function applyAndCheckUndo(descriptor, expectedDeltas, initial) {
  assert.ok(descriptor);
  const input = nodes.get('fw-' + descriptor.id);
  assert.ok(input);
  const old = Number(input.value);
  const value = old === descriptor.max ? old - 1 : old + 1;
  input.value = String(value);
  input.fire('input');
  assert.equal(nodes.get('apply').disabled, false);
  const start = wire.length;
  await nodes.get('apply').click();
  const otherLabels = expectedDeltas.filter(id => id !== descriptor.id).map(id => catalog.controls[id-1].label);
  const editMessage = 'Stored ' + value + '. Update queued.' +
    (otherLabels.length ? ' Other control values changed (' + otherLabels.join(', ') + ').' : '');
  await until(() => status() === editMessage, descriptor.label + ' edit');
  const frames = wire.slice(start).filter(f => f.command.op !== OP.KEEPALIVE);
  const ack = frames[0].response;
  assert.equal(ack.op, OP.SET);
  assert.equal(ack.status, STATUS.QUEUED);
  assert.equal(ack.control, descriptor.id);
  assert.equal(ack.value, value);
  assert.equal(ack.revision, frames[0].command.revision + 1);
  assert.equal(frames.length, catalog.count + 1);
  assert.equal(frames[1].response.revision, ack.revision);
  const edited = readSnapshot(frames.slice(1));
  const changed = changes(initial, edited);
  assert.deepEqual(changed.map(d => d.id).sort((a,b) => a-b), [...expectedDeltas].sort((a,b) => a-b));
  assert.equal(nodes.get('fw-' + descriptor.id).value, String(value));
  const undoVisible = nodes.get('firmware-controls').children.some(el => el.id === 'firmware-undo');
  if (otherLabels.length) {
    assert.equal(undoVisible, false, 'A scalar inverse would leave macro children changed');
    receipt.edits.push({id: descriptor.id, label: descriptor.label, old, value, editRevision: ack.revision,
                        changed, undoOffered: false, editMessage});
    return edited;
  }
  assert.equal(undoVisible, true);
  const undoStart = wire.length;
  await nodes.get('firmware-undo').click();
  const expectedMessage = 'Restored stored value ' + old + '. Update queued.';
  await until(() => status() === expectedMessage, descriptor.label + ' Undo');
  const restoredFrames = wire.slice(undoStart).filter(f => f.command.op !== OP.KEEPALIVE);
  assert.equal(restoredFrames.length, catalog.count + 2);
  const guard = restoredFrames[0].response;
  assert.deepEqual([guard.op, guard.control, guard.revision, guard.value], [OP.READ, descriptor.id, ack.revision, value]);
  const restore = restoredFrames[1].response;
  assert.deepEqual([restore.op, restore.status, restore.control, restore.value, restore.revision], [OP.SET, STATUS.QUEUED, descriptor.id, old, ack.revision + 1]);
  assert.equal(restoredFrames[1].command.revision, guard.revision);
  assert.equal(restoredFrames[2].response.revision, restore.revision);
  const restored = readSnapshot(restoredFrames.slice(2));
  const remaining = changes(initial, restored);
  assert.deepEqual(remaining, []);
  assert.equal(nodes.get('fw-' + descriptor.id).value, String(old));
  receipt.edits.push({id: descriptor.id, label: descriptor.label, old, value, editRevision: ack.revision, undoRevision: restore.revision, changed, remaining, expectedMessage});
  return restored;
}
try {
  await nodes.get('connect').click();
  await until(() => status().startsWith('Connected.'), 'Connect');
  const initial = readSnapshot(wire);
  receipt.confirmed = initial.filter(r => r.status === STATUS.OK).length;
  assert.equal(receipt.confirmed, 294);
  const cutoffs = catalog.controls.filter(d => d.bank === 0 && d.label.toLowerCase() === 'cutoff');
  assert.deepEqual(cutoffs.map(d => d.voice), [0, 1]);
  const master = catalog.controls.filter(d => d.target === catalog.controls[catalog.diagnosticMasterMakeup-1].target);
  const compressor = master.find(d => d.label.toLowerCase() === 'comp');
  const threshold = master.find(d => d.label === 'THRESH').id;
  let afterChicago = initial;
  for (const cutoff of cutoffs) {
    afterChicago = await applyAndCheckUndo(cutoff, [cutoff.id], afterChicago);
  }
  const final = await applyAndCheckUndo(compressor, [threshold, compressor.id], afterChicago);
  assert.equal(afterChicago[threshold - 1].value, 64);
  assert.equal(final[threshold - 1].value, 60);
  assert.equal(final[catalog.diagnosticMasterMakeup - 1].value, 85);
  assert.equal(await link.destroy(), true);
  assert.equal(wire.at(-1).response.op, OP.CLOSE);
  assert.equal(wire.at(-1).response.status, STATUS.OK);
  receipt.reads = wire.filter(f => f.command.op === OP.READ).length;
  receipt.writes = wire.filter(f => f.command.op === OP.SET).length;
  assert.equal(receipt.reads, 6 * catalog.count + 2);
  assert.equal(receipt.writes, 5);
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await link.destroy();
  child.stdin.end();
  lines.close();
  child.kill();
}
