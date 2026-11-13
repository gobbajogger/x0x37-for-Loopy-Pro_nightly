// SPDX-License-Identifier: GPL-3.0-only
// Full-file diff of renderInstaller(live catalog 24a8b208aa) against live
// gh-pages install/index.html (blob 15d43a0a, tip 6a9953de). Only allowlisted
// hunks may remain; each has a declared reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderInstaller, publicCatalog } from '../scripts/render-qualified-nightly.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_INSTALL_BLOB = '15d43a0a8398a69c70e73aa7b6a6dc6bbe5bace0';
const LIVE_CATALOG_BLOB = '24a8b208aa01d539b5ef4e23af73d9c4aa2ac3d8';
const gitBlob = sha => execSync(`git cat-file -p ${sha}`, { cwd: root, encoding: 'utf8', maxBuffer: 10e6 });

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, sortKeys(value[k])]));
  return value;
}
function normalize(html) {
  return html.split('\n').map(line => {
    if (line.startsWith('const catalog = ')) {
      const raw = line.slice('const catalog = '.length).replace(/;?\s*$/, '');
      return 'const catalog = ' + JSON.stringify(sortKeys(JSON.parse(raw))) + ';';
    }
    return line;
  }).join('\n');
}

// Allowlisted remaining hunks. Anything else fails the test.
const ALLOWED = [
  {
    id: 'slot-map-port-comment',
    reason: 'Source documents the 9fde4dbe slot-map port so a later render cannot drop it; live has the same pkHasSlotMap logic without this comment.',
    renderOnly: ['  // Port of live gh-pages 9fde4dbe so a later site render cannot drop 0.0.25 packages.'],
    liveOnly: [],
  },
  {
    // Adjacent comment + body are one unified-diff hunk.
    id: 'starry-alias-keyboardModel',
    reason: 'Intended #121: source keyboardModel maps starrykey-37 play / starrykey-37 to smk-37 pro (and documents that). Live is the strict #806 form (`return name === "fm-1" ? null : name`) with no Starry alias. A later publish would add this alias on live and must be called out.',
    renderOnly: [
      '// Package models are distinct even when boards share a family. The verified',
      '// Starrykey stock identity names the Pro model; it is not an Elite alias.',
      '  if (name === "fm-1") return null; // SMK installer: never admit the other board.',
      '  return name === "starrykey-37 play" || name === "starrykey-37" ? "smk-37 pro" : name;',
    ],
    liveOnly: [
      '// Strict model match (X0X37-for-Loopy-Pro #806 62cf11e98): a package is written only',
      '// when its model equals the model the keyboard reports (case-insensitive, "ota-"',
      '// ignored). No family or alias match, and an FM-1 is never flashed.',
      '  return name === "fm-1" ? null : name;',
    ],
  },
];

function parseUnifiedHunks(diff) {
  const hunks = [], lines = diff.split('\n');
  let cur = null;
  for (const line of lines) {
    if (line.startsWith('@@')) {
      if (cur) hunks.push(cur);
      cur = { liveOnly: [], renderOnly: [], header: line };
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) cur.renderOnly.push(line.slice(1));
    else if (line.startsWith('-') && !line.startsWith('---')) cur.liveOnly.push(line.slice(1));
  }
  if (cur) hunks.push(cur);
  return hunks;
}

test('full rendered installer vs live gh-pages differs only by allowlisted hunks', () => {
  const live = gitBlob(LIVE_INSTALL_BLOB);
  const catalog = JSON.parse(gitBlob(LIVE_CATALOG_BLOB));
  const rendered = renderInstaller(catalog);
  const a = normalize(live), b = normalize(rendered);
  const dir = mkdtempSync(join(tmpdir(), 'installer-diff-'));
  const livePath = join(dir, 'live.html'), rendPath = join(dir, 'rendered.html');
  writeFileSync(livePath, a.endsWith('\n') ? a : a + '\n');
  writeFileSync(rendPath, b.endsWith('\n') ? b : b + '\n');
  let diff = '';
  try {
    execSync(`diff -u ${livePath} ${rendPath}`, { encoding: 'utf8', maxBuffer: 10e6 });
  } catch (e) {
    // diff exits 1 on differences
    if (e.status !== 1) throw e;
    diff = e.stdout;
  }
  const hunks = parseUnifiedHunks(diff);
  const unused = new Set(ALLOWED.map(x => x.id));
  const unexpected = [];
  for (const h of hunks) {
    const match = ALLOWED.find(allow =>
      JSON.stringify(allow.liveOnly) === JSON.stringify(h.liveOnly) &&
      JSON.stringify(allow.renderOnly) === JSON.stringify(h.renderOnly));
    if (!match) unexpected.push({ header: h.header, liveOnly: h.liveOnly, renderOnly: h.renderOnly });
    else unused.delete(match.id);
  }
  assert.equal(unexpected.length, 0, 'unexpected hunks: ' + JSON.stringify(unexpected, null, 2));
  assert.equal(unused.size, 0, 'allowlisted hunk missing from the live diff: ' + [...unused]);
  assert.equal(hunks.length, ALLOWED.length);
});

test('publicCatalog keeps display_version so 0.0.25.1 stays 0.0.25.1', () => {
  const catalog = JSON.parse(gitBlob(LIVE_CATALOG_BLOB));
  const pub = publicCatalog(catalog);
  const v = pub.versions.find(x => x.display_version === '0.0.25.1');
  assert.ok(v, '0.0.25.1 must survive publicCatalog()');
  assert.equal(v.display_version, '0.0.25.1');
  assert.equal(v.version, 'nightly-79280e76-dev');
  assert.equal(pub.versions.filter(x => x.display_version).length, 13);
  const html = renderInstaller(catalog);
  assert.match(html, /"display_version":"0\.0\.25\.1"/);
  // Label is computed at runtime from display_version; the source function is inlined.
  assert.match(html, /v\.display_version \+ " \(firmware " \+ assigned\.version \+ "\)"/);
});
