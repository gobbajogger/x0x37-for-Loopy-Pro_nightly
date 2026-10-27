// SPDX-License-Identifier: GPL-3.0-only
// Local candidate preparation only. The sole publisher still owns review/deployment.
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, rmSync, realpathSync, mkdtempSync, renameSync } from 'node:fs';
import { join, resolve, relative, dirname, basename, sep, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { productOf, logicalImage, controllerOf } from '../web/fm1pkg.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const legacyControllers = JSON.parse(readFileSync(join(root, 'scripts/legacy-controller-packages.json'), 'utf8'));
const sha256 = b => createHash('sha256').update(b).digest('hex');
const hex40 = s => typeof s === 'string' && /^[a-f0-9]{40}$/.test(s);
const hex64 = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const inputs = ['web/x0x_installer.html', 'web/fm1pkg.js', 'web/fm1ota.js', 'web/x0x_breaks.js'];
// Distribution licensing is not a nightly qualification gate. Corresponding
// source existed only to satisfy that license, so it does not block either.
// Both names may still appear on a receipt; neither is required to be PASS.
export const retiredLicenseGates = ['distribution-license', 'corresponding-source'];
// A missing native-build receipt does not reject. A present object must still
// be PASS with an https evidence_url. Do not write a PASS to fill a gap.
// native-build stays on the gates allow-list so a real PASS is not unknown.
export const requiredGates = ['package-integrity', 'model-controller',
  'memory-flash', 'host-regressions', 'backup-restore-readback', 'interruption-recovery',
  'ota-target-binding', 'independent-qa'];
const gateNames = ['native-build', ...requiredGates, ...retiredLicenseGates];

export function installerFingerprint() {
  return sha256(JSON.stringify([...inputs, 'web/x0x_breaks.html', 'web/x0x_projects.html', 'web/x0x_projects.js', 'scripts/build-preview.mjs', 'scripts/render-qualified-nightly.mjs', 'scripts/legacy-controller-packages.json']
    .map(p => [p, sha256(readFileSync(join(root, p)))])));
}

function httpsUrl(value) {
  try {
    const u = new URL(value);
    return typeof value === 'string' && u.protocol === 'https:' && !u.username &&
      !u.password && !u.hash && !u.search && value === u.href;
  } catch { return false; }
}

// Optional catalog hints can deny a candidate, never replace independent receipts.
const approvalKeys = ['qualified', 'installable', 'qa_pass', 'source_licenses_approved',
  'immutable_http_pass', 'backup_integrity_pass', 'model_and_controller_pass'];
function denied(record) {
  return !record || ['revoked', 'blocked', 'withdrawn'].some(k => record[k] !== undefined && record[k] !== false) ||
    approvalKeys.some(k => Object.hasOwn(record, k) && record[k] !== true) ||
    (record.fromRelease !== undefined && record.fromRelease !== false) ||
    record.device_verified === true || record.hardware_tested === true ||
    (record.lifecycle !== undefined && record.lifecycle !== 'current');
}

// Exact firmware release_alloc / firmware_build_labels codec; catalog IDs remain labels.
function nightlyProductIdentity(product) {
  if (typeof product !== "string") return null;
  const m = /^(SMK-37 Pro|SMK-37 Elite)_(900|9([0-9]{2})([0-9]{2})([0-9]{2}))$/.exec(product);
  if (!m || m[0] !== product) return null;
  return { model: m[1] === "SMK-37 Pro" ? "pro" : "elite",
    version: m[2] === "900" ? null : m.slice(3).map(Number).join(".") };
}
function versionMetadataMatches(record, identity) {
  if (!record || !identity) return false;
  const version = identity.version, display = version === null ? null : `${version}_openbeta`;
  return (!Object.hasOwn(record, "firmware_version") || record.firmware_version === version) &&
    (!Object.hasOwn(record, "release_display") || record.release_display === display);
}

// Only the documented public catalog schema may reach public candidate files.
const catalogKeys = ['schema', 'repo', 'pages', 'latest', 'versions', 'history'];
const versionKeys = ['version', 'firmware_version', 'release_display', 'label', 'status', 'config', 'hardware_tested', 'source_commit', 'source_tree',
  'models', 'title', 'description', 'built_at', 'evidence_url', 'lifecycle', 'revoked', 'blocked', 'withdrawn',
  ...approvalKeys, 'fromRelease', 'device_verified'];
const packageKeys = ['product', 'firmware_version', 'release_display', 'sha256', 'size', 'controller_sha256', 'controller_strategy', 'controller_size', 'pkg', 'status', 'lifecycle',
  'revoked', 'blocked', 'withdrawn', ...approvalKeys, 'fromRelease', 'device_verified', 'hardware_tested'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function checkInputFields(catalog, qualification, need) {
  const fields = (value, allowed, where) => {
    if (!record(value)) { need(false, `${where}: object required`); return false; }
    need(Object.keys(value).every(key => allowed.includes(key)), `${where}: unknown/private field`);
    return true;
  };
  const texts = (value, names, where) => {
    for (const name of names) if (value[name] !== undefined)
      need(typeof value[name] === 'string', `${where}/${name}: text required`);
  };
  const flags = (value, where) => {
    for (const name of ['revoked', 'blocked', 'withdrawn', ...approvalKeys, 'fromRelease', 'device_verified', 'hardware_tested'])
      if (value[name] !== undefined) need(typeof value[name] === 'boolean', `${where}/${name}: boolean required`);
  };
  if (fields(catalog, catalogKeys, 'catalog')) {
    texts(catalog, ['repo', 'pages'], 'catalog');
    for (const v of Array.isArray(catalog.versions) ? catalog.versions : []) {
      if (!fields(v, versionKeys, 'version')) continue;
      flags(v, 'version');
      texts(v, ['title', 'description', 'built_at', 'evidence_url'], 'version');
      if (fields(v.models, ['elite', 'pro'], 'models'))
        for (const p of Object.values(v.models)) if (fields(p, packageKeys, 'package')) flags(p, 'package');
    }
  }
  if (!fields(qualification, ['schema', 'installer_sha256', 'packages'], 'qualification') ||
      !record(qualification.packages)) { need(false, 'qualification/packages: object required'); return; }
  for (const [digest, r] of Object.entries(qualification.packages)) {
    need(hex64(digest), 'qualification/packages: SHA-256 key required');
    if (!fields(r, ['source_commit', 'source_tree', 'size', 'product', 'firmware_version', 'release_display', 'url', 'integration', 'controller',
      'budgets', 'gates', 'corresponding_source', 'notices'], 'receipt')) continue;
    fields(r.integration, ['ref', 'commit', 'tree', 'evidence_url'], 'integration');
    fields(r.controller, ['strategy', 'sha256', 'size'], 'controller');
    fields(r.budgets, ['app_code_free', 'ram_free', 'pool_free'], 'budgets');
    if (fields(r.gates, gateNames, 'gates'))
      for (const [name, gate] of Object.entries(r.gates)) {
        // Absent means the key is missing, or the value is null or undefined.
        if (name === 'native-build' && (gate === undefined || gate === null)) continue;
        fields(gate, ['status', 'evidence_url'], 'gate');
      }
  }
}
const pick = (value, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
function publicCatalog(catalog) {
  const result = pick(catalog, catalogKeys);
  result.versions = catalog.versions.map(v => ({...pick(v, versionKeys),
    models: Object.fromEntries(Object.entries(v.models).filter(([key]) => ['elite', 'pro'].includes(key))
      .map(([key, p]) => [key, pick(p, packageKeys)]))}));
  result.history = []; // Read-only history belongs in build-status, never this picker.
  return result;
}

// These are receipts supplied by the existing independent owners, not approvals
// manufactured by this program. SHA bindings make stale receipts unusable.
export function validateCatalog(catalog, qualification, fingerprint = installerFingerprint()) {
  const errors = [];
  const need = (ok, msg) => { if (!ok) errors.push(msg); };
  checkInputFields(catalog, qualification, need);
  if (errors.length) throw new Error('NOT INSTALLABLE:\n' + errors.join('\n'));
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
    need(!denied(v), `${tag}: version revoked/unqualified`);
    need(v?.status === 'dev-checked' && v?.config === 'dev' && v?.hardware_tested === false,
      `${tag}: only DEV / HARDWARE TEST, DEVICE NOT TESTED is accepted`);
    need(hex40(v?.source_commit) && hex40(v?.source_tree), `${tag}: full firmware source commit/tree required`);
    need(v?.label === 'DEV / HARDWARE TEST — DEVICE NOT TESTED', `${tag}: hardware-test label required`);
    const models = v?.models && typeof v.models === 'object' ? Object.entries(v.models) : [];
    need(models.length > 0, `${tag}: no models`);
    for (const [key, p] of models) {
      need(!denied(p) && (p?.status === undefined || p.status === 'dev-checked'), `${tag}/${key}: model revoked/unqualified`);
      const identity = nightlyProductIdentity(p?.product);
      const where = `${tag}/${key}`;
      need(identity?.model === key, `${where}: wrong DEV package/model identity`);
      need(versionMetadataMatches(v, identity) && versionMetadataMatches(p, identity),
        `${where}: firmware version/display contradicts package identity`);
      need(hex64(p?.sha256), `${where}: SHA-256 required`);
      need(Number.isSafeInteger(p?.size) && p.size > 960 && p.size <= 2 * 1024 * 1024, `${where}: invalid size`);
      need(httpsUrl(p?.pkg) && new URL(p.pkg).pathname.includes(p.sha256), `${where}: immutable HTTPS digest-addressed package required`);
      need(p?.fromRelease !== true, `${where}: unreviewed Release import prohibited`);
      const r = qualification?.packages?.[p?.sha256];
      need(versionMetadataMatches(r, identity), `${where}: receipt firmware version/display contradicts package identity`);
      need(r?.source_commit === v?.source_commit && r?.source_tree === v?.source_tree,
        `${where}: qualification must match exact source commit/tree`);
      need(r?.product === p?.product && r?.size === p?.size && r?.url === p?.pkg,
        `${where}: qualification must match exact product, size and URL`);
      need(r?.integration?.ref === 'nightly' && hex40(r?.integration?.commit) &&
        r.integration.tree === v?.source_tree && httpsUrl(r?.integration?.evidence_url),
        `${where}: accepted firmware nightly tree receipt required`);
      const strategy = Object.hasOwn(p, 'controller_strategy') ? p.controller_strategy : 'owner-supplied';
      need(['owner-supplied', 'bundled'].includes(strategy) && r?.controller?.strategy === strategy && hex64(r?.controller?.sha256) &&
        p?.controller_sha256 === r?.controller?.sha256 &&
        Number.isSafeInteger(r?.controller?.size) && r.controller.size >= 68 && r.controller.size <= 65536,
        `${where}: matching checked controller strategy/hash/size required`);
      if (strategy === 'bundled') need(p?.controller_size === r?.controller?.size,
        `${where}: exact bundled controller size required`);
      else need(v.source_commit === legacyControllers.source_commit && v.source_tree === legacyControllers.source_tree &&
        Object.entries(legacyControllers.models[key] || {}).length > 0 &&
        Object.entries(legacyControllers.models[key] || {}).every(([field,value]) => p[field] === value) &&
        r?.controller?.size === legacyControllers.controller_size,
        `${where}: new NIGHTLY candidates must bundle Bluetooth; only pinned existing legacy packages may require a local controller`);
      for (const gate of requiredGates) {
        const g = r?.gates?.[gate];
        need(g?.status === 'PASS' && httpsUrl(g?.evidence_url), `${where}: ${gate} is not PASS with evidence`);
      }
      // Missing, null, and undefined do not reject. Any other present value must
      // be status PASS with an https evidence_url. Do not insert a PASS object.
      const nativeBuild = r?.gates?.['native-build'];
      if (nativeBuild !== undefined && nativeBuild !== null) {
        need(nativeBuild.status === 'PASS' && httpsUrl(nativeBuild.evidence_url),
          `${where}: native-build is not PASS with evidence`);
      }
      for (const [budget, min] of [['app_code_free', 0], ['ram_free', 0], ['pool_free', 8192]]) {
        need(Number.isSafeInteger(r?.budgets?.[budget]) && r.budgets[budget] >= min, `${where}: ${budget} below limit or unmeasured`);
      }
      // corresponding_source and notices may be present. They are not gates.
      // distribution-license and corresponding-source are not in requiredGates
      // and have no status check, so a missing or non-PASS value does not reject.
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
    if (p.controller_strategy === 'bundled') {
      const embedded = controllerOf(logicalImage(raw));
      if (embedded.length !== p.controller_size || sha256(embedded) !== p.controller_sha256)
        throw new Error(`bundled controller bytes/hash/size mismatch: ${p.product}`);
    }
  }
}

export function renderInstaller(catalog) {
  const strip = s => s.replace(/^export\s+/gm, '').replace(/^import .*?;\r?\n/gm, '');
  let html = readFileSync(join(root, inputs[0]), 'utf8');
  for (const [marker, content] of [['/*LIB*/', inputs.slice(1).map(p => strip(readFileSync(join(root, p), 'utf8'))).join('\n')],
    ['/*CATALOG*/', JSON.stringify(publicCatalog(catalog)).replace(/</g, '\\u003c')]]) {
    if (html.split(marker).length !== 2) throw new Error(`expected one ${marker}`);
    html = html.replace(marker, () => content);
  }
  return html;
}

// Enforce the existing outside-repository contract by path segments and real
// ancestors, including symlink aliases and absent nested output parents.
function checkedOutput(value) {
  const output = resolve(value);
  if (existsSync(output)) throw new Error('output must be a new directory outside the repository');
  const tail = [basename(output)];
  let parent = dirname(output);
  while (!existsSync(parent)) {
    tail.unshift(basename(parent));
    const next = dirname(parent);
    if (next === parent) throw new Error('output parent cannot be resolved');
    parent = next;
  }
  const canonical = resolve(realpathSync(parent), ...tail);
  const delta = relative(realpathSync(root), canonical);
  if (!(isAbsolute(delta) || delta === '..' || delta.startsWith('..' + sep)))
    throw new Error('output must be a new directory outside the repository');
  return canonical;
}

async function main(argv) {
  if (argv.length !== 6 || argv[0] !== '--catalog' || argv[2] !== '--qualification' || argv[4] !== '--out') {
    throw new Error('Usage: node scripts/render-qualified-nightly.mjs --catalog FILE --qualification FILE --out NEW_DIRECTORY');
  }
  const catalog = JSON.parse(readFileSync(argv[1], 'utf8'));
  const qualification = JSON.parse(readFileSync(argv[3], 'utf8'));
  validateCatalog(catalog, qualification);
  const output = checkedOutput(argv[5]);
  await verifyDownloads(catalog);
  // Render before writing anything; retain complete existing site navigation.
  const published = publicCatalog(catalog);
  const html = renderInstaller(published);
  // Downloads yield control: never reuse a destination approved before that await.
  // Resolve aliases again, then keep generation/publish synchronous. This is a
  // trusted local tool, not a sandbox against hostile same-user OS mutation.
  const recheckOutput = () => {
    if (checkedOutput(argv[5]) !== output) throw new Error('output parent changed during verification');
  };
  recheckOutput();
  mkdirSync(dirname(output), { recursive: true });
  // Stage beside the destination for a same-filesystem atomic directory rename.
  // No destination/staging path is kept open across an asynchronous operation.
  const staged = mkdtempSync(join(dirname(output), '.nightly-candidate-'));
  try {
    cpSync(join(root, 'docs'), staged, { recursive: true });
    mkdirSync(join(staged, 'install'), { recursive: true });
    writeFileSync(join(staged, 'install/index.html'), html);
    writeFileSync(join(staged, 'versions.json'), JSON.stringify(published, null, 2) + '\n');
    // Full qualification remains a private input; it is never copied to public output.
    recheckOutput();
    renameSync(staged, output);
  } catch (err) { rmSync(staged, { recursive: true, force: true }); throw err; }
  console.log('PREPARED — HTTP bytes verified; local candidate only. Independent site review and sole publisher deployment/served-byte checks remain required.');
}

// import.meta.url uses the real path. macOS tmpdir() is under /var, a symlink
// to /private/var, so a direct launch through that path must still run.
function launchedAsCli() {
  const argvPath = process.argv[1];
  if (!argvPath) return false;
  if (import.meta.url === pathToFileURL(resolve(argvPath)).href) return true;
  try { return import.meta.url === pathToFileURL(realpathSync(argvPath)).href; }
  catch { return false; }
}
if (launchedAsCli()) {
  main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 1; });
}
