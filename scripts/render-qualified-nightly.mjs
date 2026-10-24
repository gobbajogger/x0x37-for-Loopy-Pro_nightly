// SPDX-License-Identifier: GPL-3.0-only
// Local candidate preparation only. The sole publisher still owns review/deployment.
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, rmSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { productOf } from '../web/fm1pkg.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha256 = b => createHash('sha256').update(b).digest('hex');
const hex40 = s => typeof s === 'string' && /^[a-f0-9]{40}$/.test(s);
const hex64 = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const inputs = ['web/x0x_installer.html', 'web/fm1pkg.js', 'web/fm1ota.js', 'web/x0x_breaks.js'];
export const requiredGates = ['native-build', 'package-integrity', 'model-controller',
  'memory-flash', 'host-regressions', 'backup-restore-readback', 'interruption-recovery',
  'ota-target-binding', 'independent-qa', 'distribution-license', 'corresponding-source'];

export function installerFingerprint() {
  return sha256(JSON.stringify([...inputs, 'scripts/render-qualified-nightly.mjs']
    .map(p => [p, sha256(readFileSync(join(root, p)))])));
}

function httpsUrl(value) {
  try {
    const u = new URL(value);
    return typeof value === 'string' && u.protocol === 'https:' && !u.username &&
      !u.password && !u.hash && !u.search && value === u.href;
  } catch { return false; }
}

// These are receipts supplied by the existing independent owners, not approvals
// manufactured by this program. SHA bindings make stale receipts unusable.
export function validateCatalog(catalog, qualification, fingerprint = installerFingerprint()) {
  const errors = [];
  const need = (ok, msg) => { if (!ok) errors.push(msg); };
  need(catalog?.schema === 1, 'catalog schema must be 1');
  need(qualification?.schema === 1, 'qualification schema must be 1');
  need(qualification?.installer_sha256 === fingerprint, 'installer safety receipt is stale or missing');
  need(Array.isArray(catalog?.versions) && catalog.versions.length > 0, 'candidate needs a checked version');
  need(Array.isArray(catalog?.history) && catalog.history.length === 0,
    'noninstallable history belongs in build-status, not the flashable catalog');
  const versions = Array.isArray(catalog?.versions) ? catalog.versions : [];
  need(versions.some(v => v.version === catalog?.latest), 'latest must name a qualified version');
  const ids = new Set();
  for (const v of versions) {
    const tag = v?.version;
    need(typeof tag === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(tag) && !ids.has(tag), 'invalid/duplicate version');
    ids.add(tag);
    need(v?.status === 'dev-checked' && v?.config === 'dev' && v?.hardware_tested === false,
      `${tag}: only DEV / HARDWARE TEST, DEVICE NOT TESTED is accepted`);
    need(hex40(v?.source_commit) && hex40(v?.source_tree), `${tag}: full firmware source commit/tree required`);
    need(v?.label === 'DEV / HARDWARE TEST — DEVICE NOT TESTED', `${tag}: hardware-test label required`);
    const models = v?.models && typeof v.models === 'object' ? Object.entries(v.models) : [];
    need(models.length > 0, `${tag}: no models`);
    for (const [key, p] of models) {
      const name = { elite: 'SMK-37 Elite', pro: 'SMK-37 Pro' }[key];
      const where = `${tag}/${key}`;
      need(!!name && p?.product === `${name}_900`, `${where}: wrong DEV package/model identity`);
      need(hex64(p?.sha256), `${where}: SHA-256 required`);
      need(Number.isSafeInteger(p?.size) && p.size > 960 && p.size <= 2 * 1024 * 1024, `${where}: invalid size`);
      need(httpsUrl(p?.pkg) && new URL(p.pkg).pathname.includes(p.sha256), `${where}: immutable HTTPS digest-addressed package required`);
      need(p?.fromRelease !== true, `${where}: unreviewed Release import prohibited`);
      const r = qualification?.packages?.[p?.sha256];
      need(r?.source_commit === v?.source_commit && r?.source_tree === v?.source_tree,
        `${where}: qualification must match exact source commit/tree`);
      need(r?.product === p?.product && r?.size === p?.size && r?.url === p?.pkg,
        `${where}: qualification must match exact product, size and URL`);
      need(r?.integration?.ref === 'nightly' && hex40(r?.integration?.commit) &&
        r.integration.tree === v?.source_tree && httpsUrl(r?.integration?.evidence_url),
        `${where}: accepted firmware nightly tree receipt required`);
      need(r?.controller?.strategy === 'owner-supplied' && hex64(r?.controller?.sha256) &&
        p?.controller_sha256 === r?.controller?.sha256 &&
        Number.isSafeInteger(r?.controller?.size) && r.controller.size >= 68 && r.controller.size <= 65536,
        `${where}: matching checked owner-supplied controller required; never host ctl.img`);
      for (const gate of requiredGates) {
        const g = r?.gates?.[gate];
        need(g?.status === 'PASS' && httpsUrl(g?.evidence_url), `${where}: ${gate} is not PASS with evidence`);
      }
      for (const [budget, min] of [['app_code_free', 0], ['ram_free', 0], ['pool_free', 8192]]) {
        need(Number.isSafeInteger(r?.budgets?.[budget]) && r.budgets[budget] >= min, `${where}: ${budget} below limit or unmeasured`);
      }
      need(httpsUrl(r?.corresponding_source) && r.corresponding_source.includes(v?.source_commit),
        `${where}: exact corresponding source URL required`);
      need(httpsUrl(r?.notices), `${where}: distribution notices URL required`);
    }
  }
  if (errors.length) throw new Error('NOT INSTALLABLE:\n' + errors.join('\n'));
  return catalog;
}

// Fetch again during preparation; a receipt saying HTTP passed is insufficient.
// No redirect, credentials, binary Git write, hardware access or publication.
export async function verifyDownloads(catalog, fetcher = fetch) {
  for (const v of catalog.versions) for (const p of Object.values(v.models)) {
    const response = await fetcher(p.pkg, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok || response.redirected) throw new Error(`download failed: ${p.product}`);
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > p.size) throw new Error(`download size exceeded: ${p.product}`);
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks);
    if (size !== p.size || sha256(raw) !== p.sha256 || productOf(raw) !== p.product) {
      throw new Error(`download bytes/hash/model mismatch: ${p.product}`);
    }
  }
}

export function renderInstaller(catalog) {
  const strip = s => s.replace(/^export\s+/gm, '').replace(/^import .*?;\r?\n/gm, '');
  let html = readFileSync(join(root, inputs[0]), 'utf8');
  for (const [marker, content] of [['/*LIB*/', inputs.slice(1).map(p => strip(readFileSync(join(root, p), 'utf8'))).join('\n')],
    ['/*CATALOG*/', JSON.stringify(catalog).replace(/</g, '\\u003c')]]) {
    if (html.split(marker).length !== 2) throw new Error(`expected one ${marker}`);
    html = html.replace(marker, () => content);
  }
  return html;
}

async function main(argv) {
  if (argv.length !== 6 || argv[0] !== '--catalog' || argv[2] !== '--qualification' || argv[4] !== '--out') {
    throw new Error('Usage: node scripts/render-qualified-nightly.mjs --catalog FILE --qualification FILE --out NEW_DIRECTORY');
  }
  const catalog = JSON.parse(readFileSync(argv[1], 'utf8'));
  const qualification = JSON.parse(readFileSync(argv[3], 'utf8'));
  validateCatalog(catalog, qualification);
  const output = resolve(argv[5]);
  if (existsSync(output) || !relative(root, output).startsWith('..')) throw new Error('output must be a new directory outside the repository');
  await verifyDownloads(catalog);
  // Render before writing anything; retain complete existing site navigation.
  const html = renderInstaller(catalog);
  try {
    cpSync(join(root, 'docs'), output, { recursive: true });
    mkdirSync(join(output, 'install'), { recursive: true });
    writeFileSync(join(output, 'install/index.html'), html);
    writeFileSync(join(output, 'versions.json'), JSON.stringify(catalog, null, 2) + '\n');
    writeFileSync(join(output, 'qualification.json'), JSON.stringify(qualification, null, 2) + '\n');
  } catch (err) { rmSync(output, { recursive: true, force: true }); throw err; }
  console.log('PREPARED — HTTP bytes verified; local candidate only. Independent site review and sole publisher deployment/served-byte checks remain required.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 1; });
}
