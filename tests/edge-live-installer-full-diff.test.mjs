// SPDX-License-Identifier: GPL-3.0-only
// Full-file diff of renderInstaller(live catalog 24a8b208aa) against live
// gh-pages install/index.html (blob 15d43a0a, tip 6a9953de). Only allowlisted
// hunks may remain; each has a declared reason.
import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderInstaller, publicCatalog } from '../scripts/render-qualified-nightly.mjs';

import { liveInstaller as live, readLiveCatalog } from './fixtures/pinned-live-installer.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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
  // Exact reviewed UI and admission changes for the owner-tested 94197fc8 release.
  ...JSON.parse(readFileSync(join(root, 'tests/fixtures/installer-v0026-reviewed-hunks.json'), 'utf8')),
  {
    id: 'programmed-sample-header-padding',
    reason: 'Restore preserves bytes 480..511 when programmed; erased padding retains the legacy short-header commit. Verified by actual-writer simulated-flash regressions, not a physical-device claim.',
    liveOnly: ['  const e = await slotReq(link, 13, [k, ...pack78(img.subarray(0, SLOT_HDR_LEN))], 5000);'],
    renderOnly: ['  const e = await slotReq(link, 13, [k, ...pack78(img.subarray(0, img.subarray(SLOT_HDR_LEN, SLOT_HDR_AREA).some(byte => byte !== 0xff) ? SLOT_HDR_AREA : SLOT_HDR_LEN))], 5000);'],
  },
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
      '// Strict model match (DnBOX #806 62cf11e98): a package is written only',
      '// when its model equals the model the keyboard reports (case-insensitive, "ota-"',
      '// ignored). No family or alias match, and an FM-1 is never flashed.',
      '  return name === "fm-1" ? null : name;',
    ],
  },
  {
    "id": "bounded-download-deadline",
    "reason": "Reviewed download lifetime bound; native header/body cancellation and post-await fences prevent expired bytes from enabling Install. Covered by actual downloader and browser timeout/reload tests.",
    "renderOnly": [
      "  const isUsable = () => isLatest() && !controller.signal.aborted;",
      "  // Bound headers, body and late asynchronous verification as one download.",
      "  const deadline = setTimeout(() => {",
      "    controller.abort();",
      "    if (isLatest()) sayK(\"loadfail\", \"Download took too long. Reload this page to retry.\");",
      "  }, 20000);",
      "    if (!isUsable()) { try { await r.body?.cancel(); } catch {} return; }",
      "    if (!isUsable()) return;",
      "    if (!isUsable()) return;",
      "      catch (e) { if (isUsable()) { bundledFailure = true; renderBuildInfo(ver,pkg); sayK(\"ctlbundlebad\", \" \" + e.message); } return; }",
      "      if (!isUsable()) return;"
    ],
    "liveOnly": [
      "    if (!isLatest()) { try { await r.body?.cancel(); } catch {} return; }",
      "    if (!isLatest()) return;",
      "    if (!isLatest()) return;",
      "      catch (e) { if (isLatest()) { bundledFailure = true; renderBuildInfo(ver,pkg); sayK(\"ctlbundlebad\", \" \" + e.message); } return; }",
      "      if (!isLatest()) return;"
    ]
  },
  {
    "id": "bounded-download-timer-cleanup",
    "reason": "Always release the per-download deadline; reuse the identical selection-and-abort predicate for error reporting, preserving its evaluation order and controller identity cleanup.",
    "renderOnly": [
      "  } catch (e) { if (isUsable()) sayK(\"loadfail\", e.message); }",
      "    clearTimeout(deadline);"
    ],
    "liveOnly": [
      "  } catch (e) { if (isLatest() && !controller.signal.aborted) sayK(\"loadfail\", e.message); }"
    ]
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

function assertAllowedRendered(rendered) {
  // The repos were renamed after this live snapshot (X0X37-for-Loopy-Pro -> DnBOX,
  // x0x37-for-Loopy-Pro_nightly -> DnBOX-nightly). Map the old names in the
  // snapshot and in the catalog it carries, so the rename itself is not reported as a hunk.
  const renamed = live.replaceAll('x0x37-for-Loopy-Pro_nightly', 'DnBOX-nightly').replaceAll('X0X37-for-Loopy-Pro', 'DnBOX');
  // This pinned clip-mode instruction predates the DnBOX name.
  const oldInstruction = 'return to normal X0X operation with KNOB BANK';
  assert.equal(renamed.split(oldInstruction).length, 2);
  const a = normalize(renamed.replace(oldInstruction, 'return to normal DnBOX operation with KNOB BANK'));
  const b = normalize(rendered);
  const dir = mkdtempSync(join(tmpdir(), 'installer-diff-'));
  let diff = '';
  try {
    const livePath = join(dir, 'live.html'), rendPath = join(dir, 'rendered.html');
    writeFileSync(livePath, a.endsWith('\n') ? a : a + '\n');
    writeFileSync(rendPath, b.endsWith('\n') ? b : b + '\n');
    try {
      execFileSync('diff', ['-u', livePath, rendPath], { encoding: 'utf8', maxBuffer: 10e6 });
    } catch (e) {
      // diff exits 1 on differences
      if (e.status !== 1) throw e;
      diff = e.stdout;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const hunks = parseUnifiedHunks(diff);
  const unused = new Set(ALLOWED.map(x => x.id));
  const unexpected = [];
  for (const h of hunks) {
    // Use exact byte digests for reviewed multi-function hunks to avoid duplicating the renderer.
    const digest = createHash('sha256').update(JSON.stringify([h.liveOnly,h.renderOnly])).digest('hex');
    const match = ALLOWED.find(allow => allow.hunk_sha256 ? digest === allow.hunk_sha256 :
      JSON.stringify(allow.liveOnly) === JSON.stringify(h.liveOnly) &&
      JSON.stringify(allow.renderOnly) === JSON.stringify(h.renderOnly));
    if (!match) unexpected.push({ header: h.header, liveOnly: h.liveOnly, renderOnly: h.renderOnly });
    else unused.delete(match.id);
  }
  assert.equal(unexpected.length, 0, 'unexpected hunks: ' + JSON.stringify(unexpected, null, 2));
  assert.equal(unused.size, 0, 'allowlisted hunk missing from the live diff: ' + [...unused]);
  assert.equal(hunks.length, ALLOWED.length);
}
function currentRendered() {
  return renderInstaller(readLiveCatalog()).replaceAll('x0x37-for-Loopy-Pro_nightly', 'DnBOX-nightly').replaceAll('X0X37-for-Loopy-Pro', 'DnBOX');
}
test('full rendered installer vs live gh-pages differs only by allowlisted hunks', () => {
  assertAllowedRendered(currentRendered());
});
test('exact Restore allowance rejects lost padding, forced full headers and unrelated changes', () => {
  const rendered=currentRendered();
  const selector='img.subarray(SLOT_HDR_LEN, SLOT_HDR_AREA).some(byte => byte !== 0xff) ? SLOT_HDR_AREA : SLOT_HDR_LEN';
  assert.equal(rendered.split(selector).length,2);
  for(const changed of [rendered.replace(selector,'SLOT_HDR_LEN'),rendered.replace(selector,'SLOT_HDR_AREA'),rendered.replace(selector,selector.replace('!==','===')),rendered.replace('if (name === "fm-1") return null;','if (name === "smk-37") return null;')]) {
    assert.notEqual(changed,rendered);
    assert.throws(()=>assertAllowedRendered(changed),/unexpected hunks|allowlisted hunk missing/);
  }
});

test('approved release diff rejects drift in the restart handshake and report bindings', () => {
  const current = currentRendered();
  for (const old of ['restartTicket, dev, up.ports().length === 1','receiptBuild: selectedInstallBuild(ver, pkg, chosenModel)']) {
    assert.equal(current.split(old).length,2);
    assert.throws(()=>assertAllowedRendered(current.replace(old,'undefined')),/unexpected hunks|allowlisted hunk missing/);
  }
});

test('publicCatalog keeps display_version so 0.0.25.1 stays 0.0.25.1', () => {
  const catalog = readLiveCatalog();
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
