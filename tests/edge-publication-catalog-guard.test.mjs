// SPDX-License-Identifier: GPL-3.0-only
// Empty preview catalogs must not be usable as a publication / qualified-render input.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { assertPublicationCatalog, publicCatalog, RETAINED_LIVE_CATALOG_BLOB } from '../scripts/render-qualified-nightly.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('assertPublicationCatalog refuses the empty docs/versions.json preview', () => {
  const empty = JSON.parse(readFileSync(join(root, 'docs/versions.json'), 'utf8'));
  assert.equal(empty.versions.length, 0);
  assert.throws(() => assertPublicationCatalog(empty, 'docs/versions.json'), e => {
    assert.match(String(e.message), /REFUSING PUBLICATION/);
    assert.match(String(e.message), /docs\/versions\.json/);
    assert.match(String(e.message), /empty preview/);
    assert.match(String(e.message), new RegExp(RETAINED_LIVE_CATALOG_BLOB.slice(0, 12)));
    return true;
  });
  assert.throws(() => assertPublicationCatalog({ versions: [] }, 'preview-catalog.json'), /REFUSING PUBLICATION/);
  assert.throws(() => assertPublicationCatalog({}, ''), /REFUSING PUBLICATION/);
});

test('render-qualified-nightly CLI refuses an empty catalog before writing any output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'empty-catalog-guard-'));
  const out = join(dir, 'candidate');
  const qual = join(dir, 'qualification.json');
  writeFileSync(qual, JSON.stringify({ schema: 1, installer_sha256: 'x', packages: {} }));
  let err;
  try {
    execFileSync(process.execPath, [
      join(root, 'scripts/render-qualified-nightly.mjs'),
      '--catalog', join(root, 'docs/versions.json'),
      '--qualification', qual,
      '--out', out,
    ], { encoding: 'utf8', cwd: root });
  } catch (e) { err = e; }
  assert.ok(err, 'CLI must fail');
  assert.match(String(err.stderr || err.stdout || err), /REFUSING PUBLICATION/);
  assert.equal(err.status, 1);
});

test('publicCatalog keeps 0.0.25.1 display_version from a live-shaped catalog', () => {
  const catalog = {
    schema: 1, repo: 'https://example.example/repo', pages: 'https://example.example/pages',
    latest: 'nightly-79280e76-dev', history: [],
    versions: [{
      version: 'nightly-79280e76-dev', display_version: '0.0.25.1', firmware_version: '0.0.25',
      status: 'dev-checked', models: { elite: { product: 'SMK-37 Elite_900', sha256: 'a'.repeat(64), size: 1 } },
    }],
  };
  const pub = publicCatalog(catalog);
  assert.equal(pub.versions[0].display_version, '0.0.25.1');
  assert.ok(!('history' in pub), 'picker catalog must not carry build-status history');
});
