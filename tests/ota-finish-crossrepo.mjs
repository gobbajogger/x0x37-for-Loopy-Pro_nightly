// SPDX-License-Identifier: GPL-3.0-only
// Explicit host-only cross-repo proof. No firmware packages or devices accessed.
// node tests/ota-finish-crossrepo.mjs /path/to/pinned/firmware/repo
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Updater, unpack7 } from '../web/fm1ota.js';
const root = resolve(process.argv[2] || '');
assert.ok(process.argv[2], 'explicit pinned firmware checkout required');
const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const tmp = mkdtempSync(join(tmpdir(), 'ec028-contract-'));
try {
  // Reuse existing host HAL stubs, but replace the synthetic host responder
  // with capture-only output. The production ota_read/ota_send_msg/pack7 run.
  let harness = readFileSync(join(root, 'tests/ota_test.c'), 'utf8').split(/int main\s*\(/)[0];
  const start = harness.indexOf('static int ota_wire_send(');
  const end = harness.indexOf('static int ota_frame_get(', start);
  assert.ok(start > 0 && end > start);
  harness = harness.slice(0, start) + `static int ota_wire_send(const uint8_t *p, uint32_t n) {
    fwrite(p, 1, n, stdout); return -1;
  }\n` + harness.slice(end);
  harness = harness.replace('#include "../firmware/src/ota.c"', '#include ' + JSON.stringify(join(root, 'firmware/src/ota.c')));
  for (const [file, marker] of [['firmware/src/ota.c', 0xe0000000], ['firmware/loader/ldr_core.c', 0xf0000000]]) {
    const source = readFileSync(join(root, file), 'utf8');
    const hex = marker.toString(16);
    const match = source.match(new RegExp('ota_read\\(0x' + hex + 'u,\\s*\\w+,\\s*(\\d+)\\)', 'i'));
    assert.ok(match, 'actual terminal call site missing: ' + file);
    writeFileSync(join(tmp, 'wire.c'), harness + `int main(void) { uint8_t b[512]; ota_read(0x${hex}u, b, ${match[1]}); return 0; }\n`);
    execFileSync('cc', ['-o', join(tmp, 'wire'), join(tmp, 'wire.c')]);
    const packet = [...execFileSync(join(tmp, 'wire'))];
    const request = unpack7(packet.slice(1, -1));
    assert.deepEqual(request.slice(6, 14), [0, 0, 0, 0, marker >>> 24, 8, 0, 0]);
    const queue = [packet], sent = [];
    const link = { lost: false, async read() { return queue.shift() || null; }, send(p) { sent.push(p); return true; } };
    const result = await new Updater({ inputs: new Map(), outputs: new Map() }).serve(link, new Uint8Array(0), marker, 10);
    assert.equal(result.finished, true);
    assert.equal(sent.length, 1);
    const response = unpack7(sent[0].slice(1, -1));
    assert.equal(response[11], 8);
    assert.deepEqual(response.slice(14, 22), [115, 117, 99, 99, 101, 115, 115, 0]);
    console.log(JSON.stringify({ source: sha, file, marker: hex, wire: packet, result, proof: 'compiled production sender + production browser server; no hardware' }));
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
