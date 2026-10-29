// SPDX-License-Identifier: GPL-3.0-only
// Build a source-only browser preview. It deliberately cannot add hosted firmware.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (name) => readFileSync(join(root, name), 'utf8');
const catalog = JSON.parse(read('preview-catalog.json'));
if (catalog.latest !== null || catalog.versions.length || catalog.history.length) {
  throw new Error('Nightly UI preview must not publish firmware catalog entries');
}
function replaceOnce(source, marker, replacement, where) {
  if (source.split(marker).length !== 2) throw new Error(`${where}: expected exactly one ${marker}`);
  return source.replace(marker, replacement);
}
function stripModule(source) {
  return source.replace(/^export\s+/gm, '').replace(/^import .*?;\r?\n/gm, '');
}
const installerLibraries = ['web/fm1pkg.js', 'web/fm1ota.js', 'web/x0x_breaks.js']
  .map((name) => stripModule(read(name))).join('\n');
let installer = replaceOnce(read('web/x0x_installer.html'), '/*LIB*/', installerLibraries, 'installer');
installer = replaceOnce(installer, '/*CATALOG*/', JSON.stringify(catalog), 'installer');
installer = replaceOnce(installer, '/*PACKAGE_VERSION_ASSIGNMENTS*/[]',
  JSON.stringify(JSON.parse(read('package-version-assignments.json')).assignments).replace(/</g, '\\u003c'), 'installer');
const sampleImporter = replaceOnce(read('web/x0x_breaks.html'), '/*LIB*/',
  stripModule(read('web/x0x_breaks.js')), 'sample importer');
const projects = read('web/x0x_projects.html').replace(
  /^import .* from "\.\/x0x_projects.js";$/m, '/*LIB*/');
const projectPage = replaceOnce(projects, '/*LIB*/',
  ['web/x0x_breaks.js', 'web/x0x_projects.js'].map(name => stripModule(read(name))).join('\n'), 'projects');
const outputs = {
  'docs/install/index.html': installer,
  'docs/breaks/index.html': sampleImporter,
  'docs/projects/index.html': projectPage,
  'docs/versions.json': JSON.stringify(catalog, null, 2) + '\n',
};
const check = process.argv.includes('--check');
for (const [path, content] of Object.entries(outputs)) {
  if (check) {
    if (read(path) !== content) throw new Error(`${path} differs from source; run npm run build`);
  } else {
    const fullPath = join(root, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }
}
console.log(`${check ? 'CHECK' : 'BUILD'} PASS — self-contained nightly installer, samples, projects and empty catalog; no firmware files`);
