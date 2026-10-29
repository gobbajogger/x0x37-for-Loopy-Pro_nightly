// SPDX-License-Identifier: GPL-3.0-only
// Exercise real generators with the existing nine-version catalog. No firmware
// bytes, device calls, network requests, publication, or large new fixtures.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const relativeInputs = [
  'package.json', 'preview-catalog.json', 'package-version-assignments.json', 'build-status.json',
  'scripts/build-preview.mjs', 'scripts/render-qualified-nightly.mjs',
  'scripts/verify-pages-source-parity.mjs', 'scripts/legacy-controller-packages.json',
  'web/x0x_installer.html', 'web/fm1pkg.js', 'web/fm1ota.js', 'web/x0x_breaks.html',
  'web/x0x_breaks.js', 'web/x0x_projects.html', 'web/x0x_projects.js',
];

async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'pages-source-parity-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const path of relativeInputs) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    cpSync(join(root, path), join(dir, path));
  }
  // Run the actual generator in this isolated source tree. No child-process
  // permission is needed and production source/generated files are untouched.
  await import(pathToFileURL(join(dir, 'scripts/build-preview.mjs')));
  const retained = join(dir, 'retained-catalog.json');
  cpSync(join(root, 'tests/fixtures/published-dev-catalog-c7503b19.json'), retained);
  const catalog = JSON.parse(readFileSync(retained, 'utf8'));
  assert.equal(catalog.versions.length, 9);
  const candidate = join(dir, 'candidate');
  for (const page of ['install', 'breaks', 'projects']) mkdirSync(join(candidate, page), { recursive: true });
  const { renderInstaller } = await import(pathToFileURL(join(dir, 'scripts/render-qualified-nightly.mjs')));
  writeFileSync(join(candidate, 'install/index.html'), renderInstaller(catalog));
  for (const page of ['breaks', 'projects'])
    cpSync(join(dir, 'docs', page, 'index.html'), join(candidate, page, 'index.html'));
  cpSync(retained, join(candidate, 'versions.json'));
  for (const path of ['package-version-assignments.json', 'build-status.json'])
    cpSync(join(dir, path), join(candidate, path));
  const { verifyPagesSourceParity } = await import(pathToFileURL(join(dir, 'scripts/verify-pages-source-parity.mjs')));
  return { dir, candidate, retained, catalog, renderInstaller,
    verify: () => verifyPagesSourceParity(candidate, retained) };
}

const paths = result => [...new Set(result.mismatches.map(item => item.path))].sort();

test('current source-generated pages retain all nine published versions and pass read-only parity', async t => {
  const f = await fixture(t);
  const result = f.verify();
  assert.equal(result.ok, true, JSON.stringify(result.mismatches));
  assert.equal(result.scope, 'source-parity-only');
  assert.equal(result.retained_versions, 9);
  assert.equal(result.checked_paths.length, 6);
  const cli = spawnSync(process.execPath, [join(f.dir, 'scripts/verify-pages-source-parity.mjs'),
    '--candidate', f.candidate, '--retained-catalog', f.retained], { encoding: 'utf8' });
  assert.ifError(cli.error);
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.deepEqual(JSON.parse(cli.stdout), result);
});

test('sample preparation moved above the installer is refused even with current libraries and catalog', async t => {
  const f = await fixture(t);
  const file = join(f.candidate, 'install/index.html'), html = readFileSync(file, 'utf8');
  const panel = html.match(/  <section class="sample-prep"[\s\S]*?<\/section>/)?.[0];
  assert.ok(panel, 'fixture must contain the actual sample-preparation panel');
  assert.ok(html.includes('<body>'));
  writeFileSync(file, html.replace(panel, '').replace('<body>', `<body>\n${panel}`));
  const result = f.verify();
  assert.equal(result.ok, false);
  assert.deepEqual(paths(result), ['install/index.html']);
});

test('stale generated docs cannot hide changed Breaks and Projects source', async t => {
  const f = await fixture(t);
  // The candidate still matches docs exactly, but both production modules moved.
  // A verifier that trusts docs instead of expanding web sources would pass.
  for (const path of ['web/x0x_breaks.js', 'web/x0x_projects.js'])
    writeFileSync(join(f.dir, path), readFileSync(join(f.dir, path), 'utf8') + '\n// New source revision: old generated runtime must be refused.\n');
  for (const page of ['breaks', 'projects'])
    assert.equal(readFileSync(join(f.candidate, page, 'index.html'), 'utf8'),
      readFileSync(join(f.dir, 'docs', page, 'index.html'), 'utf8'));
  const result = f.verify();
  assert.equal(result.ok, false);
  assert.deepEqual(paths(result), ['breaks/index.html', 'install/index.html', 'projects/index.html']);
});

test('self-consistent empty preview pages cannot replace a retained catalog', async t => {
  const f = await fixture(t);
  const empty = JSON.parse(readFileSync(join(f.dir, 'preview-catalog.json'), 'utf8'));
  writeFileSync(join(f.candidate, 'versions.json'), JSON.stringify(empty));
  writeFileSync(join(f.candidate, 'install/index.html'), f.renderInstaller(empty));
  assert.equal(f.verify().ok, false);
  assert.deepEqual(paths(f.verify()), ['versions.json']);
  // Supplying that empty preview as its own retention baseline also fails.
  writeFileSync(f.retained, JSON.stringify(empty));
  assert.equal(f.verify().ok, false);
  assert.match(f.verify().mismatches[0].reason, /empty preview/);
});

test('coherently altered package metadata still fails retained-catalog comparison', async t => {
  const f = await fixture(t);
  f.catalog.versions[0].models.elite.size++;
  writeFileSync(join(f.candidate, 'versions.json'), JSON.stringify(f.catalog));
  writeFileSync(join(f.candidate, 'install/index.html'), f.renderInstaller(f.catalog));
  assert.deepEqual(paths(f.verify()), ['versions.json']);
  const cli = spawnSync(process.execPath, [join(f.dir, 'scripts/verify-pages-source-parity.mjs'),
    '--candidate', f.candidate, '--retained-catalog', f.retained], { encoding: 'utf8' });
  assert.ifError(cli.error);
  assert.equal(cli.status, 1, cli.stderr || cli.stdout);
  assert.deepEqual(paths(JSON.parse(cli.stdout)), ['versions.json']);
});

test('renumbered assignments and stale history are reported by their exact paths', async t => {
  const f = await fixture(t);
  const assignments = JSON.parse(readFileSync(join(f.candidate, 'package-version-assignments.json'), 'utf8'));
  assignments.assignments[0].package_version = '0.0.99';
  writeFileSync(join(f.candidate, 'package-version-assignments.json'), JSON.stringify(assignments));
  const history = JSON.parse(readFileSync(join(f.candidate, 'build-status.json'), 'utf8'));
  history.history = history.history.slice(0, -3);
  writeFileSync(join(f.candidate, 'build-status.json'), JSON.stringify(history));
  const result = f.verify();
  assert.equal(result.ok, false);
  assert.deepEqual(paths(result), ['build-status.json', 'package-version-assignments.json']);
});

test('a missing staged page is a failing path instead of a partial pass', async t => {
  const f = await fixture(t);
  rmSync(join(f.candidate, 'projects/index.html'));
  const result = f.verify();
  assert.equal(result.ok, false);
  assert.deepEqual(paths(result), ['projects/index.html']);
});
