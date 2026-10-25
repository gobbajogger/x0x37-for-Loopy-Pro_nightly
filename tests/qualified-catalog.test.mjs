// SPDX-License-Identifier: GPL-3.0-only
// Synthetic evidence/bytes exercise preparation; none represents a real approval.
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, symlinkSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Script } from 'node:vm';
import { makePackage, makeController } from './fixtures/bundled-synthetic.mjs';
import { validateCatalog, verifyDownloads, renderInstaller, installerFingerprint, requiredGates }
  from '../scripts/render-qualified-nightly.mjs';

const hash = b => createHash('sha256').update(b).digest('hex');
const raw = makePackage('pro'), product = 'SMK-37 Pro_900';
const digest = hash(raw), ctl = makeController();
const evidence = 'https://github.com/gobbajogger/X0X37-for-Loopy-Pro/pull/103';
const commit = '1'.repeat(40), tree = '2'.repeat(40);
const pkg = { product, sha256: digest, size: raw.length,
  controller_strategy: 'bundled', controller_size: ctl.length, controller_sha256: hash(ctl), pkg: `https://example.org/${digest}/pro.fwsc` };
const catalog = { schema: 1, latest: 'synthetic-test', history: [], versions: [{
  version: 'synthetic-test', label: 'DEV / HARDWARE TEST — DEVICE NOT TESTED',
  status: 'dev-checked', config: 'dev', hardware_tested: false,
  source_commit: commit, source_tree: tree, models: { pro: pkg } }] };
const qualification = { schema: 1, installer_sha256: installerFingerprint(), packages: { [digest]: {
  source_commit: commit, source_tree: tree, size: raw.length, product, url: pkg.pkg,
  integration: { ref: 'nightly', commit, tree, evidence_url: evidence },
  controller: { strategy: 'bundled', sha256: hash(ctl), size: ctl.length },
  budgets: { app_code_free: 5620, ram_free: 460, pool_free: 8324 },
  gates: Object.fromEntries(requiredGates.map(g => [g, { status: 'PASS', evidence_url: evidence }])),
  corresponding_source: `https://github.com/gobbajogger/X0X37-for-Loopy-Pro/archive/${commit}.tar.gz`,
  notices: `https://example.org/${digest}/notices.zip`,
} } };
let negatives = 0;
const reject = mutate => {
  const c = structuredClone(catalog), q = structuredClone(qualification);
  mutate(c, q, q.packages[digest]);
  assert.throws(() => validateCatalog(c, q), /NOT INSTALLABLE/);
  negatives++;
};
validateCatalog(catalog, qualification);
// Only the exact live legacy identities are grandfathered; new blank/local-controller records cannot qualify.
{
  const legacy = JSON.parse(readFileSync(new URL('./fixtures/published-dev-catalog-b7af05f.json', import.meta.url)));
  const q = {schema:1, installer_sha256:installerFingerprint(), packages:{}};
  for (const p of Object.values(legacy.versions[0].models)) q.packages[p.sha256] = {
    ...structuredClone(qualification.packages[digest]), source_commit:legacy.versions[0].source_commit,
    source_tree:legacy.versions[0].source_tree, product:p.product, size:p.size, url:p.pkg,
    integration:{ref:'nightly',commit:legacy.versions[0].source_commit,tree:legacy.versions[0].source_tree,evidence_url:evidence},
    controller:{strategy:'owner-supplied',sha256:p.controller_sha256,size:65492}
  };
  for (const r of Object.values(q.packages)) r.corresponding_source = 'https://example.org/'+r.source_commit+'/source.tar.gz';
  validateCatalog(legacy,q);
  for(const field of ['sha256','pkg','product','size']) {
    const bad=structuredClone(legacy),p=bad.versions[0].models.pro;
    p[field] = field === 'size' ? p[field]+1 : p[field]+'x';
    assert.throws(()=>validateCatalog(bad,q),/NOT INSTALLABLE/);
  }
}
// Optional catalog hints are denials, not independent qualification receipts.
// Both models use exact matching synthetic metadata; no fixture is a real approval.
const approvals = ['qualified', 'installable', 'qa_pass', 'source_licenses_approved',
  'immutable_http_pass', 'backup_integrity_pass', 'model_and_controller_pass'];
for (const model of ['pro', 'elite']) {
  const c = structuredClone(catalog), q = structuredClone(qualification);
  const p = c.versions[0].models.pro, r = q.packages[digest];
  if (model === 'elite') {
    p.product = r.product = 'SMK-37 Elite_900';
    c.versions[0].models = { elite: p };
  }
  validateCatalog(c, q); // Existing qualified metadata needs no optional hints.
  for (const target of [c.versions[0], p]) for (const field of approvals) {
    target[field] = true;
    validateCatalog(c, q);
    assert.ok(renderInstaller(c).includes(`"${field}":true`), 'public projection retains optional hint');
    for (const value of [false, null, 0, 1, 'false', 'true', [], {}, undefined]) {
      target[field] = value;
      assert.throws(() => validateCatalog(c, q), /NOT INSTALLABLE/,
        `${model}/${field}: supplied non-true hint must deny despite checked status and PASS receipts`);
      negatives++;
    }
    delete target[field];
  }
  for (const target of [c.versions[0], p]) for (const field of approvals) target[field] = true;
  r.gates['independent-qa'].status = 'FAIL';
  assert.throws(() => validateCatalog(c, q), /independent-qa is not PASS/,
    'all true client hints cannot override a failed independent receipt');
  r.gates['independent-qa'].status = 'PASS';
  delete q.packages[digest];
  assert.throws(() => validateCatalog(c, q), /qualification must match/,
    'all true client hints cannot replace a missing exact-package receipt');
}
for (const gate of requiredGates) {
  reject((c, q, r) => r.gates[gate].status = 'PENDING');
  reject((c, q, r) => delete r.gates[gate].evidence_url);
}
reject((c, q) => q.installer_sha256 = 'f'.repeat(64));
reject((c, q, r) => r.source_commit = '3'.repeat(40));
reject((c, q, r) => r.integration.ref = 'main');
reject((c, q, r) => r.integration.tree = '3'.repeat(40));
reject((c, q, r) => r.budgets.pool_free = 8191);
reject((c, q, r) => r.budgets.ram_free = -1);
reject((c, q, r) => r.budgets.app_code_free = null);
reject(c => c.versions[0].models.pro.product = 'SMK-37 Elite_900');
reject(c => c.versions[0].models.pro.pkg = `http://example.org/${digest}/p.fwsc`);
reject(c => c.versions[0].models.pro.pkg = 'https://example.org/mutable.fwsc');
reject(c => c.versions[0].models.pro.pkg += '?sha256=' + digest);
reject(c => c.versions[0].models.pro.fromRelease = true);
reject(c => c.versions[0].hardware_tested = true);
reject(c => c.versions[0].status = 'release-checked');
reject(c => c.versions[0].version = '</script>');
reject(c => c.versions[0].models.pro.size = 0);
reject(c => c.versions[0].models.pro.controller_sha256 = 'f'.repeat(64));
reject((c, q, r) => r.controller.strategy = 'hosted');
reject((c, q, r) => r.corresponding_source = 'https://example.org/main.zip');
reject(c => c.latest = 'absent');
reject(c => c.history.push({ status: 'FAILED' }));
reject(c => c.versions.push(structuredClone(c.versions[0])));

for (const field of ['revoked','blocked','withdrawn','qualified','installable']) {
  const value = ['qualified','installable'].includes(field) ? false : true;
  reject(c => c.versions[0][field] = value);
  reject(c => c.versions[0].models.pro[field] = value);
}
reject(c => c.versions[0].models.pro.status = 'failed');

for (const field of ['device_verified','hardware_tested','fromRelease']) {
  for (const obj of ['version','model']) reject(c => (obj === 'version' ? c.versions[0] : c.versions[0].models.pro)[field] = true);
}
reject(c => c.versions[0].models.pro.fromRelease = 'true');
for (const value of ['revoked','failed','superseded']) {
  reject(c => c.versions[0].lifecycle = value);
  reject(c => c.versions[0].models.pro.lifecycle = value);
}
// F5: reject unknown/private fields at every input schema level.
for (const inject of [
  c => c.internal_controller_image_base64 = 'SYNTHETIC_PRIVATE_BINARY_BYTES_DO_NOT_PUBLISH',
  c => c.versions[0].internal_notes = 'SYNTHETIC_PRIVATE_TOKEN',
  c => c.versions[0].models.pro.auth_token = 'SYNTHETIC_PRIVATE_TOKEN',
  (c,q) => q.internal_library_locator = 'SYNTHETIC_PRIVATE_LIBRARY_LOCATOR',
  (c,q,r) => r.controller.vendor_payload = 'SYNTHETIC_PRIVATE_CTL_IMG',
  (c,q,r) => r.private_receipt = 'SYNTHETIC_PRIVATE_TOKEN',
  (c,q,r) => r.integration.auth_token = 'SYNTHETIC_PRIVATE_TOKEN',
  (c,q,r) => r.budgets.private_path = 'SYNTHETIC_PRIVATE_LIBRARY_LOCATOR',
  (c,q,r) => r.gates['native-build'].auth_token = 'SYNTHETIC_PRIVATE_TOKEN',
  c => c.versions[0].description = {auth_token:'SYNTHETIC_PRIVATE_TOKEN'},
  c => c.versions[0].qualified = {auth_token:'SYNTHETIC_PRIVATE_TOKEN'},
  c => c.versions[0].models.pro.installable = {auth_token:'SYNTHETIC_PRIVATE_TOKEN'},
]) reject(inject);

// Exercise the actual preparation CLI and its real size/SHA/product checks.
// Synthetic fetch bytes stay local; no candidate or private qualification is published.
const dir = mkdtempSync(join(tmpdir(), 'nightly-public-projection-'));
try {
  const catPath = join(dir,'catalog.json'), qualPath = join(dir,'private-qualification.json');
  const shim = join(dir,'fetch.mjs');
  writeFileSync(shim, `globalThis.fetch=async()=>new Response(new Uint8Array(${JSON.stringify([...raw])}));`);
  const cli = (c,q,out) => {
    writeFileSync(catPath, JSON.stringify(c));writeFileSync(qualPath, JSON.stringify(q));
    return spawnSync(process.execPath,['--import',shim,fileURLToPath(new URL('../scripts/render-qualified-nightly.mjs',import.meta.url)),
      '--catalog',catPath,'--qualification',qualPath,'--out',out],{encoding:'utf8',timeout:15000});
  };
  const out = join(dir,'valid-public-output');
  const valid = cli(catalog,qualification,out);
  assert.equal(valid.status,0,valid.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(out,'versions.json'),'utf8')),catalog);
  assert.equal(existsSync(join(out,'qualification.json')),false,'private/full qualification must not be emitted');
  assert.ok(readFileSync(join(out,'install/index.html'),'utf8').includes(digest));
  const root = fileURLToPath(new URL('../',import.meta.url));
  const inside = join(root,'..candidate-synthetic-'+process.pid);
  const alias = join(dir,'outside-alias');
  symlinkSync(root,alias,'dir');
  for (const target of [inside,join(inside,'site'),join(alias,'.hidden-synthetic-'+process.pid)]) {
    const rejected=cli(catalog,qualification,target);
    assert.notEqual(rejected.status,0,'inside/aliased output must be rejected');
    assert.equal(existsSync(target),false,'rejected path must remain absent');
  }
  const nested=join(dir,'new-outside-parent','site');
  assert.equal(cli(catalog,qualification,nested).status,0,'genuine nested outside output remains valid');
  const bad = structuredClone(catalog), privateQ = structuredClone(qualification);
  bad.internal_controller_image_base64='SYNTHETIC_PRIVATE_BINARY_BYTES_DO_NOT_PUBLISH';
  bad.versions[0].models.pro.auth_token='SYNTHETIC_PRIVATE_TOKEN';
  privateQ.internal_library_locator='SYNTHETIC_PRIVATE_LIBRARY_LOCATOR';
  privateQ.packages[digest].controller.vendor_payload='SYNTHETIC_PRIVATE_CTL_IMG';
  const rejectedOut=join(dir,'rejected-output');
  assert.notEqual(cli(bad,privateQ,rejectedOut).status,0);
  assert.equal(existsSync(rejectedOut),false,'invalid input must produce no public folder');
  assert.doesNotMatch(renderInstaller(bad),/SYNTHETIC_PRIVATE_/,'renderer public projection strips unknown fields');
} finally { rmSync(dir,{recursive:true,force:true}); }

// Actual CLI regression for the publisher's async output-parent rebind.
// Copy source to scratch so RED writes can never touch the real checkout.
const raceDir = mkdtempSync(join(tmpdir(), 'nightly-output-rebind-'));
try {
  const replica=join(raceDir,'repo');mkdirSync(replica);
  const root=fileURLToPath(new URL('../',import.meta.url));
  for(const name of ['web','scripts','docs'])cpSync(join(root,name),join(replica,name),{recursive:true});
  writeFileSync(join(replica,'package.json'),'{"type":"module"}');
  const inside=join(replica,'review-preview');mkdirSync(inside);
  writeFileSync(join(inside,'keep.txt'),'source sentinel');
  const catPath=join(raceDir,'catalog.json'),qualPath=join(raceDir,'qualification.json');
  writeFileSync(catPath,JSON.stringify(catalog));writeFileSync(qualPath,JSON.stringify(qualification));
  for(const rebind of [false,true]){
    const parent=join(raceDir,rebind?'rebound-parent':'stable-parent');mkdirSync(parent);
    const output=join(parent,'candidate'),shim=join(raceDir,`fetch-${rebind}.mjs`);
    writeFileSync(shim,`import{renameSync,symlinkSync,existsSync}from'node:fs';
      globalThis.fetch=async()=>{await Promise.resolve();
      if(existsSync(${JSON.stringify(output)}))throw Error('output visible before verification');
      ${rebind?`renameSync(${JSON.stringify(parent)},${JSON.stringify(parent+'.moved')});symlinkSync(${JSON.stringify(inside)},${JSON.stringify(parent)},'dir');`:''}
      return new Response(new Uint8Array(${JSON.stringify([...raw])}));};`);
    const result=spawnSync(process.execPath,['--import',shim,join(replica,'scripts/render-qualified-nightly.mjs'),
      '--catalog',catPath,'--qualification',qualPath,'--out',output],{encoding:'utf8',timeout:15000});
    console.log(JSON.stringify({case:rebind?'async-parent-rebind':'stable-parent-control',exit:result.status,
      wrote_inside:existsSync(join(inside,'candidate/versions.json')),stderr:result.stderr.trim()}));
    if(rebind){
      assert.notEqual(result.status,0,'parent rebound inside source during awaited fetch must reject');
      assert.equal(existsSync(join(inside,'candidate')),false,'rebound destination must remain untouched');
      assert.equal(readFileSync(join(inside,'keep.txt'),'utf8'),'source sentinel');
    }else{
      assert.equal(result.status,0,result.stderr);
      assert.deepEqual(JSON.parse(readFileSync(join(output,'versions.json'),'utf8')),catalog);
      assert.ok(readFileSync(join(output,'install/index.html'),'utf8').includes(digest));
    }
  }
} finally {rmSync(raceDir,{recursive:true,force:true});}

let calls = 0;
await verifyDownloads(catalog, async (url, opts) => {
  calls++; assert.equal(url, pkg.pkg); assert.equal(opts.redirect, 'error');
  return new Response(raw);
});
assert.equal(calls, 1);
for (const response of [new Response('missing', { status: 404 }), new Response(raw.subarray(1)),
  new Response(Buffer.concat([raw, Buffer.of(0)])), new Response(Buffer.alloc(raw.length))]) {
  await assert.rejects(verifyDownloads(catalog, async () => response)); negatives++;
}
await assert.rejects(verifyDownloads(catalog, async () => { throw new Error('TLS/network failure'); }));
const html = renderInstaller(catalog);
assert.ok(html.includes(pkg.pkg) && html.includes(digest));
assert.ok(html.includes('DEV / HARDWARE TEST — DEVICE NOT TESTED'));
assert.doesNotMatch(html, /\/\*CATALOG\*\/|\/\*LIB\*\//);
new Script(html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);

// Full generated-page Chromium suite covers actual DEV/stock handlers and retries.
console.log(`PASS: qualified local rendering, ${negatives} rejection cases and download-byte verifier. Synthetic evidence only; NOT candidate QA.`);
