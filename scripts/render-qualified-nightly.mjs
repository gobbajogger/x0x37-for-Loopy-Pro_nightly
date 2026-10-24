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

const notRevoked = value => value && ['revoked', 'blocked', 'withdrawn', 'disabled', 'fromRelease']
  .every(key => value[key] === undefined || value[key] === false) &&
  (value.status === undefined || value.status === 'dev-checked') &&
  !['revoked', 'blocked', 'withdrawn', 'failed'].includes(value.lifecycle);

const packageUrl = value => typeof value === 'string' &&
  /^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]*\/[A-Za-z0-9_./-]+\.fwsc$/.test(value) &&
  !value.includes('..') && httpsUrl(value);

// These are receipts supplied by the existing independent owners, not approvals
// manufactured by this program. SHA bindings make stale receipts unusable.
export function validateCatalog(catalog, qualification, fingerprint = installerFingerprint()) {
  const errors = [];
  const need = (ok, msg) => { if (!ok) errors.push(msg); };
  need(catalog?.schema === 1, 'catalog schema must be 1');
  need(qualification?.schema === 1, 'qualification schema must be 1');
  need(notRevoked(qualification), 'qualification is revoked or blocked');
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
    need(notRevoked(v), `${tag}: revoked or blocked version`);
    need(v?.status === 'dev-checked' && v?.config === 'dev' && v?.hardware_tested === false,
      `${tag}: only DEV / HARDWARE TEST, DEVICE NOT TESTED is accepted`);
    need(hex40(v?.source_commit) && hex40(v?.source_tree), `${tag}: full firmware source commit/tree required`);
    need(hex40(v?.firmware_tree_sha), `${tag}: compiled firmware tree required`);
    need(v?.label === 'DEV / HARDWARE TEST — DEVICE NOT TESTED', `${tag}: hardware-test label required`);
    const models = v?.models && typeof v.models === 'object' ? Object.entries(v.models) : [];
    need(models.length > 0, `${tag}: no models`);
    for (const [key, p] of models) {
      const name = key === 'elite' ? 'SMK-37 Elite' : key === 'pro' ? 'SMK-37 Pro' : null;
      const where = `${tag}/${key}`;
      need(notRevoked(p) && (p?.status === undefined || p.status === 'dev-checked'),
        `${where}: revoked, blocked or failed model`);
      need(!!name && p?.product === `${name}_900`, `${where}: wrong DEV package/model identity`);
      need(hex64(p?.sha256), `${where}: SHA-256 required`);
      need(Number.isSafeInteger(p?.size) && p.size > 960 && p.size <= 2 * 1024 * 1024, `${where}: invalid size`);
      need(packageUrl(p?.pkg) && new URL(p.pkg).pathname.includes(p.sha256), `${where}: immutable HTTPS digest-addressed package required`);
      need(p?.fromRelease !== true, `${where}: unreviewed Release import prohibited`);
      const r = qualification?.packages?.[p?.sha256];
      need(notRevoked(r), `${where}: qualification receipt revoked or blocked`);
      need(r?.source_commit === v?.source_commit && r?.source_tree === v?.source_tree,
        `${where}: qualification must match exact source commit/tree`);
      need(r?.firmware_tree_sha === v?.firmware_tree_sha,
        `${where}: qualification must match compiled firmware tree`);
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
  const verified = {};
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
    verified[p.sha256] = sha256(raw);
  }
  return verified;
}

export async function prepareInstaller(catalog, qualification, fetcher = fetch) {
  // Keep the checked values independent of caller mutations during HTTP work.
  const checked = structuredClone(catalog), receipts = structuredClone(qualification);
  validateCatalog(checked, receipts);
  const verified = await verifyDownloads(checked, fetcher);
  // An installer edit during download invalidates its independent safety receipt.
  validateCatalog(checked, receipts);
  const approvals = {};
  for (const v of checked.versions) {
    v.qa_pass = true;
    v.source_licenses_approved = true;
    for (const [model, p] of Object.entries(v.models)) {
      approvals[`${v.version}/${model}`] = {
        source_commit: v.source_commit, source_tree: v.source_tree,
        firmware_tree_sha: v.firmware_tree_sha, model, product: p.product,
        package_url: p.pkg, package_sha256: p.sha256,
        controller_sha256: p.controller_sha256, host_sha256: verified[p.sha256],
        prehardware_qa_pass: true, license_and_source_ok: true,
        backup_integrity_pass: true, model_and_controller_pass: true,
        immutable_http_pass: true,
      };
    }
  }
  const strip = s => s.replace(/^export\s+/gm, '').replace(/^import .*?;\r?\n/gm, '');
  let html = readFileSync(join(root, inputs[0]), 'utf8');
  const anchor = 'const NIGHTLY_PUBLISHER_APPROVALS = Object.freeze({});';
  if (html.split(anchor).length !== 2) throw new Error('expected one empty publisher approval map');
  html = html.replace(anchor, () => 'const NIGHTLY_PUBLISHER_APPROVALS = Object.freeze(' +
    JSON.stringify(approvals).replace(/</g, '\\u003c') + ');');
  for (const [marker, content] of [['/*LIB*/', inputs.slice(1).map(p => strip(readFileSync(join(root, p), 'utf8'))).join('\n')],
    ['/*CATALOG*/', JSON.stringify(checked).replace(/</g, '\\u003c')]]) {
    if (html.split(marker).length !== 2) throw new Error(`expected one ${marker}`);
    html = html.replace(marker, () => content);
  }
  return { html, catalog: checked };
}

export async function renderInstaller(catalog, qualification, fetcher = fetch) {
  return (await prepareInstaller(catalog, qualification, fetcher)).html;
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
  // Render before writing anything; retain complete existing site navigation.
  const { html, catalog: publishedCatalog } = await prepareInstaller(catalog, qualification);
  try {
    cpSync(join(root, 'docs'), output, { recursive: true });
    mkdirSync(join(output, 'install'), { recursive: true });
    writeFileSync(join(output, 'install/index.html'), html);
    writeFileSync(join(output, 'versions.json'), JSON.stringify(publishedCatalog, null, 2) + '\n');
    writeFileSync(join(output, 'qualification.json'), JSON.stringify(qualification, null, 2) + '\n');
  } catch (err) { rmSync(output, { recursive: true, force: true }); throw err; }
  console.log('PREPARED — HTTP bytes verified; local candidate only. Independent site review and sole publisher deployment/served-byte checks remain required.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 1; });
}
