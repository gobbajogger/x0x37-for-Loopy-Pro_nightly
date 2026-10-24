// SPDX-License-Identifier: GPL-3.0-only
// Synthetic evidence/bytes exercise preparation; none represents a real approval.
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { validateCatalog, verifyDownloads, renderInstaller, installerFingerprint, requiredGates }
  from '../scripts/render-qualified-nightly.mjs';

const hash = b => createHash('sha256').update(b).digest('hex');
const raw = Buffer.alloc(1024, 0x7d), product = 'SMK-37 Pro_900';
for (let i = 0; i < product.length; i++) raw[i * 48 + 47] = (product.charCodeAt(i) + i + 1) & 255;
const digest = hash(raw), ctl = new Uint8Array([1, 2, 3]);
const evidence = 'https://github.com/gobbajogger/X0X37-for-Loopy-Pro/pull/103';
const commit = '1'.repeat(40), tree = '2'.repeat(40);
const pkg = { product, sha256: digest, size: raw.length,
  controller_sha256: hash(ctl), pkg: `https://example.org/${digest}/pro.fwsc` };
const catalog = { schema: 1, latest: 'synthetic-test', history: [], versions: [{
  version: 'synthetic-test', label: 'DEV / HARDWARE TEST — DEVICE NOT TESTED',
  status: 'dev-checked', config: 'dev', hardware_tested: false,
  source_commit: commit, source_tree: tree, models: { pro: pkg } }] };
const qualification = { schema: 1, installer_sha256: installerFingerprint(), packages: { [digest]: {
  source_commit: commit, source_tree: tree, size: raw.length, product, url: pkg.pkg,
  integration: { ref: 'nightly', commit, tree, evidence_url: evidence },
  controller: { strategy: 'owner-supplied', sha256: hash(ctl), size: 68 },
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

// Invoke the actual click handler to prove absent/wrong controller blocks run(),
// selection changes during asynchronous hashing cannot flash, and a matching one can.
const source = readFileSync(new URL('../web/x0x_installer.html', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('$("go").addEventListener("click", async'),
  source.indexOf('$("stockgo").addEventListener'));
let callback, runs, messages;
const go = { disabled: false, addEventListener: (event, fn) => callback = fn };
const context = { image: new Uint8Array([7]), selectedProduct: product, writing: false,
  chosenModel: 'pro', ctl: null, loadSerial: 1, currentVersion: () => catalog.versions[0],
  $: () => go, confirmWrite: () => true, sayK: (k, v) => messages.push([k, v]), t: k => k,
  updateInstallGate: () => { go.disabled = false; }, insertCtl: i => i,
  run: () => { runs++; }, sha256Hex: async b => hash(b) };
new Script(handler).runInNewContext(context);
async function click(controller) { runs = 0; messages = []; go.disabled = false; context.ctl = controller; await callback(); }
await click(null); assert.equal(runs, 0);
await click(new Uint8Array([9])); assert.equal(runs, 0);
await click(ctl); assert.equal(runs, 1);
context.sha256Hex = async b => { context.loadSerial++; return hash(b); };
await click(ctl); assert.equal(runs, 0);
context.sha256Hex = async b => hash(b);
context.insertCtl = () => { throw new Error('controller cannot fit package'); };
await click(ctl); assert.equal(runs, 0); assert.equal(go.disabled, false);
console.log(`PASS: qualified local rendering, ${negatives} rejection cases, download-byte verifier and controller/race write guards. Synthetic evidence only; NOT candidate QA.`);
