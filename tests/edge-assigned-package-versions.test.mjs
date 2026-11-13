// SPDX-License-Identifier: GPL-3.0-only
// Actual deployed catalog bytes and generated runtime; no synthetic numbered release.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const raw = readFileSync(new URL('./fixtures/published-dev-catalog-c7503b19.json', import.meta.url));
assert.equal(createHash('sha256').update(raw).digest('hex'), '1862395fa364e185393bfe579928e5461fda5d0f01d2c7f45bd2472e0fc18ebc');
const catalog = JSON.parse(raw);
const source = readFileSync(new URL('../docs/install/index.html', import.meta.url), 'utf8');
const span = (a, b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));
const ctx = { t: key => key, catalogLive: catalog };
runInNewContext(span('function nightlyProductIdentity(', 'function modelKeyForProduct(') +
  span('function isRecord(', 'function currentVersion(') +
  span('function buildDisplayLabel(', 'function evidenceUrl(') +
  span('function versionOptionCaption(', 'function refreshVersionLabels(') +
  ';globalThis.label=buildDisplayLabel;globalThis.caption=versionOptionCaption;globalThis.ordered=versions;', ctx);
const expected = [
  ['nightly-54f2ffbc-dev', '0.0.1'], ['nightly-6df0f81f-dev', '0.0.2'],
  ['nightly-8a74ff52-dev', '0.0.3'], ['nightly-af494784-dev', '0.0.4'],
  ['nightly-de11b6d7-dev', '0.0.5'], ['nightly-b42bcba4-dev', '0.0.6'],
  ['nightly-092589b8-dev', '0.0.7'], ['nightly-b48cd800-dev', '0.0.8'],
  ['nightly-0e77d923-dev', '0.0.9'],
];
const version = id => structuredClone(catalog.versions.find(v => v.version === id));

test('all nine real builds and all eighteen packages have assigned numeric labels', () => {
  assert.equal(catalog.versions.length, 9);
  for (const [id, number] of expected) {
    const v = version(id);
    assert.equal(ctx.label(v), `DnBOX ${number}`);
    for (const p of Object.values(v.models)) assert.equal(ctx.label(v, p), `DnBOX ${number}`);
    assert.equal(ctx.caption(v), `DnBOX ${number} · ${id === catalog.latest ? 'verlatest' : 'verdev'}`);
  }
});

test('assignment and descending choice order survive catalog reordering', () => {
  const before = Array.from(ctx.ordered(), v => ctx.label(v));
  ctx.catalogLive = { ...catalog, versions: [...catalog.versions].reverse() };
  assert.deepEqual(Array.from(ctx.ordered(), v => ctx.label(v)), before);
  assert.deepEqual(before, [...expected].reverse().map(([, n]) => `DnBOX ${n}`));
  ctx.catalogLive = catalog;
});

test('changed identity bytes or metadata cannot borrow an assigned number', () => {
  for (const mutate of [
    v => v.source_commit = '0'.repeat(40), v => v.source_tree = '0'.repeat(40),
    v => v.models.pro.sha256 = '0'.repeat(64), v => v.models.elite.product = 'SMK-37 Pro_900',
    v => v.models.pro.controller_sha256 = '0'.repeat(64), v => v.models.elite.size++,
    v => delete v.models.pro, v => v.models.other = { ...v.models.pro },
    v => v.package_version = '0.0.1', v => v.models.pro.package_version = '0.0.1',
    v => v.firmware_version = '0.0.9', v => v.models.pro.release_display = '0.0.9_openbeta',
  ]) {
    const v = version('nightly-0e77d923-dev');
    mutate(v);
    assert.match(ctx.label(v), /^verunverified · /);
  }
  const v = version('nightly-0e77d923-dev');
  assert.match(ctx.label(v, version('nightly-b48cd800-dev').models.elite), /^verunverified · /);
});

test('package numbers do not alter real firmware identities or grant qualification', () => {
  for (const v of catalog.versions) for (const [model, p] of Object.entries(v.models)) {
    assert.equal(p.product, `SMK-37 ${model === 'elite' ? 'Elite' : 'Pro'}_900`);
    assert.equal(v.hardware_tested, false);
  }
  const v = version('nightly-0e77d923-dev');
  v.package_version = '0.0.9';
  v.models.elite.package_version = '0.0.9';
  assert.equal(ctx.label(v), 'DnBOX 0.0.9');
  v.version = 'unassigned-build';
  assert.match(ctx.label(v), /^verunverified · /);
});

test('corrected 0.0.26 candidate has a bound numeric identity without hardware promotion', () => {
 const assignments=JSON.parse(readFileSync(new URL('../package-version-assignments.json',import.meta.url),'utf8'));
 const a=assignments.assignments.find(a=>a.catalog_id==='nightly-94197fc8-dev');
 assert.ok(a);
 const v={version:a.catalog_id,source_commit:a.source_commit,source_tree:a.source_tree,models:structuredClone(a.models),status:'dev-checked',hardware_tested:false};
 assert.equal(ctx.label(v),'DnBOX 0.0.26');
 for(const p of Object.values(v.models))assert.equal(ctx.label(v,p),'DnBOX 0.0.26');
 for(const mutate of [x=>x.source_commit='0'.repeat(40),x=>x.models.pro.sha256='0'.repeat(64),x=>x.models.elite.size++]) {
 const bad=structuredClone(v);mutate(bad);assert.match(ctx.label(bad),/^verunverified/);
 }
 assert.equal(v.hardware_tested,false);
});

test('real historical catalog revisions survive regeneration without losing firmware identity', () => {
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/published-revision-labels-80c50ea9.json',import.meta.url),'utf8'));
 for(const v of fixture.versions) {
   const fw=v.version==='nightly-79280e76-dev'?'0.0.25':'0.0.24';
   const expected='DnBOX '+v.display_version+' (firmware '+fw+')';
   assert.equal(ctx.label(v),expected);
   for(const p of Object.values(v.models))assert.equal(ctx.label(v,p),expected);
   for(const mutate of [x=>x.source_commit='0'.repeat(40),x=>x.models.pro.sha256='0'.repeat(64),x=>x.models.elite.size++]) {
     const bad=structuredClone(v);mutate(bad);assert.match(ctx.label(bad),/^verunverified/);
   }
   for(const revision of ['0.0.99.1',fw+'.0',fw+'.01',fw+'.1junk']) {
     const bad=structuredClone(v);bad.display_version=revision;assert.equal(ctx.label(bad),'DnBOX '+fw);
   }
 }
});
