// SPDX-License-Identifier: GPL-3.0-only
// EC037: after a model change, a stalled old NIGHTLY package stream must be
// actively cancelled without waiting for another byte from the remote server.
// Production function bodies are extracted from the actual installer HTML.
// Run: node --test tests/edge-installer-stale-download-cancellation.test.mjs
// Optional offline replay: append the path to an exact-source HTML fixture.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(process.argv[2] || new URL('../web/x0x_installer.html', import.meta.url), 'utf8');
function span(start, after) {
  const i = source.indexOf(start), j = source.indexOf(after, i);
  assert.ok(i >= 0 && j > i, `production function boundary missing: ${start}`);
  return source.slice(i, j);
}
const production = span('async function readApprovedPackage(', '\nasync function loadSelectedPackage') + '\n' +
  span('async function loadSelectedPackage(', '\nfunction versionOptionCaption');

function fixture() {
  const pkgPro = {product: 'SMK-37 Pro_900', pkg: 'https://example.invalid/pro', size: 2, sha256: 'a'.repeat(64)};
  const pkgElite = {product: 'SMK-37 Elite_900', pkg: 'https://example.invalid/elite', size: 2, sha256: 'b'.repeat(64)};
  const version = {version: 'synthetic-dev', models: {pro: pkgPro, elite: pkgElite}};
  const info = {reads: 0, cancels: 0, aborted: 0, pending: null, firstFetchSignal: null, statuses: [], fetches: []};
  const ui = new Map();
  const firstReader = {
    read() {
      info.reads++;
      if (info.reads === 1) return Promise.resolve({done: false, value: Uint8Array.of(7)});
      return new Promise(resolve => { info.pending = resolve; });
    },
    async cancel() {
      info.cancels++;
      info.pending?.({done: true});
    },
    releaseLock() {},
  };
  let freshReads = 0;
  const secondReader = {
    read() {
      return Promise.resolve(freshReads++ ? {done: true} : {done: false, value: Uint8Array.of(9, 10)});
    },
    async cancel() {},
    releaseLock() {},
  };
  async function fakeFetch(url, options = {}) {
    info.fetches.push({url, hasAbortSignal: !!options.signal});
    if (url === pkgPro.pkg) {
      info.firstFetchSignal = options.signal || null;
      options.signal?.addEventListener('abort', () => {
        info.aborted++;
        info.pending?.({done: true});
      }, {once: true});
      return {ok: true, redirected: false, body: {getReader: () => firstReader, async cancel() {info.cancels++;info.pending?.({done: true});}}};
    }
    assert.equal(url, pkgElite.pkg);
    return {ok: true, redirected: false, body: {getReader: () => secondReader}};
  }
  const mock = {
    catalog: version, Blob, Uint8Array,
    $: id => {if (!ui.has(id)) ui.set(id, {checked: false, disabled: false});return ui.get(id);},
    URL: {createObjectURL: () => 'blob:synthetic-verified', revokeObjectURL() {}},
    MODELS: {pro: 'Pro', elite: 'Elite'},
    fetch: fakeFetch,
    productOf: raw => raw[0] === 9 ? pkgElite.product : pkgPro.product,
    logicalImage: raw => raw,
    sha256Hex: async buf => new Uint8Array(buf)[0] === 9 ? pkgElite.sha256 : pkgPro.sha256,
    bundledController: () => false,
    verifyBundledController: async () => {},
    renderBuildInfo() {},
    sayK: (...args) => info.statuses.push(args.join(':')),
    say: () => {},
  };
  const ctx = createContext(mock);
  const boot = `
    let loadSerial = 0, chosenModel = 'pro', image = null, selectedProduct = null,
        verifiedDownload = null, bundledFailure = false;
    const currentVersion = () => catalog;
    const currentSelection = () => ({version: catalog, pkg: catalog.models[chosenModel]});
    const selectionIdentity = (v, p) => JSON.stringify([v, chosenModel, p]);
    const isCatalogChecked = (v, p) => v === catalog && catalog.models[chosenModel] === p;
    const discardVerifiedDownload = () => {verifiedDownload = null; image = null; selectedProduct = null;};
    const refreshMeta = () => {};
    ${production}
    globalThis.startPackageLoad = loadSelectedPackage;
    globalThis.selectModel = m => {chosenModel = m;};
    globalThis.verifiedProduct = () => selectedProduct;
  `;
  new Script(boot, {filename: 'x0x_installer.production-extract.js'}).runInContext(ctx);
  return {ctx, info, pkgElite};
}

async function flushMicrotasks(n = 50) {for (let i = 0; i < n; i++) await Promise.resolve();}

test('control: uninterrupted package completes bounded read with simulated digest and identity', async () => {
  const {ctx, info, pkgElite} = fixture();
  ctx.selectModel('elite');
  await ctx.startPackageLoad();
  assert.equal(ctx.verifiedProduct(), pkgElite.product);
  assert.deepEqual(info.fetches.map(f => f.url), [pkgElite.pkg]);
  assert.deepEqual(info.statuses, []);
});

test('negative: changing model cancels the obsolete stalled network read immediately', async () => {
  const {ctx, info, pkgElite} = fixture();
  let oldSettled = false;
  const old = ctx.startPackageLoad().finally(() => {oldSettled = true;});
  await flushMicrotasks();
  assert.equal(info.reads, 2, 'old package must be blocked on its second network read');
  assert.equal(typeof info.pending, 'function', 'the read is suspended by the simulated network');

  ctx.selectModel('elite');
  await ctx.startPackageLoad();
  await flushMicrotasks();
  assert.equal(ctx.verifiedProduct(), pkgElite.product, 'valid new package should still become available');
  assert.equal(info.fetches.length, 2, 'both model requests must be distinguishable');

  try {
    // A stale stream must be cancelled without waiting for the server to send another byte.
    // A code fix may cancel the reader directly or abort its fetch signal.
    assert.ok(info.cancels + info.aborted > 0 || oldSettled,
      'FAIL_BEFORE_FIX: obsolete in-flight read remains pending with no cancel/abort signal');
  } finally {
    info.pending?.({done: true}); // Unblock the mocked server for clean test shutdown.
    await old;
  }
});