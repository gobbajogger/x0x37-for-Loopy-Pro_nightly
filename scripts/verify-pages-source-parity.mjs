// SPDX-License-Identifier: GPL-3.0-only
// Read-only source parity for a staged Pages repair. This is not firmware
// qualification, publication authorization, or verification of served HTTP bytes.
import { readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { renderInstaller } from './render-qualified-nightly.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path => readFileSync(join(root, path), 'utf8');
const digest = text => createHash('sha256').update(text).digest('hex');
const stripModule = text => text.replace(/^export\s+/gm, '').replace(/^import .*?;\r?\n/gm, '');

function expandLibrary(html, library) {
  if (html.split('/*LIB*/').length !== 2) throw new Error('expected exactly one library marker');
  // Match build-preview's existing expansion, using web inputs rather than docs.
  return html.replace('/*LIB*/', library);
}

function renderBreaks() {
  return expandLibrary(source('web/x0x_breaks.html'), stripModule(source('web/x0x_breaks.js')));
}

function renderProjects() {
  const html = source('web/x0x_projects.html');
  const marker = /^import .* from "\.\/x0x_projects.js";$/gm;
  if ((html.match(marker) || []).length !== 1) throw new Error('expected exactly one project import');
  return expandLibrary(html.replace(marker, '/*LIB*/'),
    ['web/x0x_breaks.js', 'web/x0x_projects.js'].map(path => stripModule(source(path))).join('\n'));
}

export function verifyPagesSourceParity(candidateDirectory, retainedCatalogPath) {
  const mismatches = [], checked = [];
  const fail = (path, reason, extra = {}) => mismatches.push({ path, reason, ...extra });
  const read = path => readFileSync(join(candidateDirectory, path), 'utf8');
  function check(path, expected) {
    checked.push(path);
    try {
      const wanted = Buffer.from(expected(), 'utf8');
      const actual = readFileSync(join(candidateDirectory, path));
      if (!actual.equals(wanted)) fail(path, 'differs from current source rendering', {
        expected_sha256: digest(wanted), actual_sha256: digest(actual),
      });
    } catch (error) { fail(path, error.message); }
  }

  let catalog, retained;
  checked.push('versions.json');
  try {
    if (!retainedCatalogPath) throw new Error('a retained catalog file is required');
    retained = JSON.parse(readFileSync(retainedCatalogPath, 'utf8'));
    if (!Array.isArray(retained?.versions) || retained.versions.length === 0)
      throw new Error('retained catalog must contain existing versions; an empty preview is not a publication baseline');
    catalog = JSON.parse(read('versions.json'));
    if (!Array.isArray(catalog?.versions) || catalog.versions.length === 0)
      fail('versions.json', 'empty preview catalog would remove retained versions');
    if (!isDeepStrictEqual(catalog, retained))
      fail('versions.json', 'does not preserve the retained catalog, including package identities and latest selection');
  } catch (error) { fail('versions.json', error.message); }

  check('install/index.html', () => {
    if (!catalog) throw new Error('cannot render installer without a readable candidate versions.json');
    return renderInstaller(catalog);
  });
  check('breaks/index.html', renderBreaks);
  check('projects/index.html', renderProjects);
  check('package-version-assignments.json', () => source('package-version-assignments.json'));
  check('build-status.json', () => source('build-status.json'));

  return { ok: mismatches.length === 0, scope: 'source-parity-only',
    retained_versions: retained?.versions?.length ?? null, checked_paths: checked, mismatches };
}

function main(argv) {
  if (argv.length !== 4 || argv[0] !== '--candidate' || argv[2] !== '--retained-catalog') {
    throw new Error('Usage: node scripts/verify-pages-source-parity.mjs --candidate DIRECTORY --retained-catalog FILE');
  }
  const result = verifyPagesSourceParity(resolve(argv[1]), resolve(argv[3]));
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

function launchedAsCli() {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; }
  catch { return import.meta.url === pathToFileURL(resolve(process.argv[1])).href; }
}

if (launchedAsCli()) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
