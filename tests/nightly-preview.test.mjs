// SPDX-License-Identifier: GPL-3.0-only
// Static + integrity checks for the preview only. Never a hardware test.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const gitBlobSha = (p) => {
  const bytes = readFileSync(join(root, p));
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
};
const provenance = JSON.parse(read('SOURCE_PROVENANCE.json'));
for (const [path, expected] of Object.entries(provenance.publicSourceBlobs)) {
  assert.equal(gitBlobSha(path), expected, `source provenance mismatch: ${path}`);
}
const catalog = JSON.parse(read('docs/versions.json'));
assert.deepEqual(catalog.versions, [], 'preview must contain zero firmware packages');
assert.deepEqual(catalog.history, [], 'preview must not offer cached binary history');
assert.equal(catalog.latest, null);
assert.equal(existsSync(join(root, 'docs/firmware')), false, 'hosted firmware directory must be absent');
const inst = read('docs/install/index.html');
const breaks = read('docs/breaks/index.html');
for (const [name, html] of [['installer',inst], ['sample importer',breaks]]) {
  assert.doesNotMatch(html, /\/\*LIB\*\/|\/\*CATALOG\*\//, `${name} must be compiled`);
  const js = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(js, `${name} module is missing`);
  new Script(js, { filename: `${name}.js` });
}
const markup = inst.slice(0, inst.indexOf('<script type="module">'));
const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map((x) => x[1]);
assert.equal(ids.length, new Set(ids).size, 'duplicate HTML control IDs');
for (const id of ['version', 'models', 'go', 'devagree', 'stockfile',
  'stockconfirm', 'stockgo', 'ctlfile', 'status', 'connbtn', 'bar', 'log']) {
  assert.ok(ids.includes(id), `installer lost control: ${id}`);
}
for (const guard of ['stockLoadSerial', 'ctlLoadSerial', 'installKeepingSlots',
  'sha256Hex', 'confirmWrite', 'sameKeyboard', 'updateInstallGate']) {
  assert.ok(inst.includes(guard), `missing critical safety guard: ${guard}`);
}
assert.match(markup, /id="status" role="status" aria-live="polite"/, 'missing screen-reader install status');
assert.match(markup, /id="modeldetails"/, 'missing visible model choice');
assert.match(markup, /@media\s*\(max-width:/, 'missing responsive CSS');
assert.match(read('docs/index.html'), /NIGHTLY/i);
assert.ok(existsSync(join(root,'docs/manual/index.html')));
assert.ok(existsSync(join(root,'docs/new/index.html')));
console.log('PASS: upstream public-blob identity, generated scripts, accessibility, safeguards, empty firmware catalog, site links');


// The history page must not confuse Nightly prehardware DEV testing with production promotion.
const historyPage = read('docs/builds/index.html');
const notice = historyPage.match(/<div class="notice" role="note"[^>]*>([\s\S]*?)<\/div>/)?.[1];
assert.ok(notice, 'accessible Nightly/production distribution notice is required');
assert.match(notice, /NIGHTLY.*DEV \/ HARDWARE TEST, DEVICE NOT TESTED/);
assert.match(notice, /Prior physical-device PASS and separate per-candidate owner approval are not Nightly prerequisites/);
assert.match(notice, /exact-source per-model firmware\/controller, SHA-256\/CRC/);
assert.match(notice, /independent QA, licensing and immutable HTTP download checks/);
assert.match(notice, /PRODUCTION.*hardware-proven only/);
assert.match(notice, /matching-model, same-byte physical-device PASS/);
assert.match(notice, /explicit production publication approval/);
assert.doesNotMatch(notice, /The public installer will show a build only after matching-model physical-device verification/);
assert.doesNotMatch(historyPage, /\b(?:href|src)=["'][^"']*\.(?:fwsc|img)(?:[?\#]|["'])/i,
  'read-only history must never link installable firmware or controller images');
const historyJs = historyPage.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(historyJs, 'history renderer required');
new Script(historyJs, {filename:'build-history.js'});
console.log('PASS: Nightly versus production gates, history read-only and renderer syntax');
