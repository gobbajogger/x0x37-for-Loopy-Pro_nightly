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
const changes = new Map((provenance.nightlySourceChanges || []).map(x => [x.file, x]));
for (const [path, upstreamBlob] of Object.entries(provenance.publicSourceBlobs)) {
  const change = changes.get(path);
  if (change) {
    assert.equal(change.baseUpstreamBlob, upstreamBlob, `upstream provenance mismatch: ${path}`);
    assert.equal(gitBlobSha(path), change.nightlySourceBlob, `nightly derived source mismatch: ${path}`);
  } else {
    assert.equal(gitBlobSha(path), upstreamBlob, `source provenance mismatch: ${path}`);
  }
}
for (const path of changes.keys()) {
  assert.ok(Object.hasOwn(provenance.publicSourceBlobs, path), `untracked nightly source change: ${path}`);
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
