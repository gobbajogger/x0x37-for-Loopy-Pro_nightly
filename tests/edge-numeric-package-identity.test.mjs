// SPDX-License-Identifier: GPL-3.0-only
// Actual pinned allocator/label vectors; synthetic nonexecutable package bytes only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {makePackage,makeController,hash,catalogFor,packageRecord} from './fixtures/bundled-synthetic.mjs';
import {validateCatalog,verifyDownloads,renderInstaller,installerFingerprint,requiredGates} from '../scripts/render-qualified-nightly.mjs';
import {productOf} from '../web/fm1pkg.js';
const vectors=JSON.parse(readFileSync(new URL('./fixtures/numeric-product-identity.json',import.meta.url)));
const source=readFileSync(new URL('../web/x0x_installer.html',import.meta.url),'utf8');
const span=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const browser={chosenModel:'pro',URL};
new Script(span('function isRecord','function availableModels')+'\n'+span('function bundledController','function hasVerifiedNightlySelection')+'\nthis.admit=isCatalogChecked;').runInNewContext(browser);
const evidence='https://example.org/synthetic-evidence';
const rawCache=new Map();
function setup(vector) {
 const {model,product,firmware_version,release_display}=vector;
 let raw=rawCache.get(product);
 if(!raw){
  raw=makePackage(model);
  // The 20-byte identity marker is outside the unchanged logical package/CRCs.
  for(let i=0;i<20;i++)raw[i*48+47]=i<product.length?(product.charCodeAt(i)+i+1)&255:125;
  rawCache.set(product,raw);
 }
 assert.equal(productOf(raw),product);
 const p=packageRecord(model,raw,{product,firmware_version,release_display});
 const c=catalogFor({[model]:p}),v=c.versions[0];
 Object.assign(v,{firmware_version,release_display}); // catalog id deliberately stays an independent label.
 const r={source_commit:v.source_commit,source_tree:v.source_tree,size:p.size,product,url:p.pkg,firmware_version,release_display,
  integration:{ref:'nightly',commit:v.source_commit,tree:v.source_tree,evidence_url:evidence},
  controller:{strategy:'bundled',sha256:hash(makeController()),size:4096},
  budgets:{app_code_free:1,ram_free:1,pool_free:8192},gates:Object.fromEntries(requiredGates.map(g=>[g,{status:'PASS',evidence_url:evidence}]))};
 const q={schema:1,installer_sha256:installerFingerprint(),packages:{[p.sha256]:r}};
 browser.chosenModel=model;
 return {model,raw,p,c,v,r,q};
}
for(const vector of vectors.vectors) test(`actual producer ${vector.model} ${vector.firmware_version} reaches renderer and browser`,async()=>{
 const x=setup(vector);assert.doesNotThrow(()=>validateCatalog(x.c,x.q));
 assert.equal(browser.admit(x.v,x.p),true);
 const rendered=renderInstaller(x.c);assert.ok(rendered.includes(`"firmware_version":"${vector.firmware_version}"`));
 assert.ok(rendered.includes(`"release_display":"${vector.release_display}"`));
 if(vector.firmware_version==='0.1.0')await verifyDownloads(x.c,async()=>new Response(x.raw));
});

test('metadata is optional, but every supplied numeric label must agree with embedded product',()=>{
 for(const vector of vectors.vectors.filter(v=>v.firmware_version==='0.1.0')){
  let x=setup(vector);for(const r of [x.v,x.p,x.r]){delete r.firmware_version;delete r.release_display;}
  assert.doesNotThrow(()=>validateCatalog(x.c,x.q));assert.equal(browser.admit(x.v,x.p),true);
  for(const place of ['v','p','r'])for(const field of ['firmware_version','release_display'])for(const wrong of [null,undefined,0,[],{},'0.1.00','0.2.0','0.1.0_OPENBETA','0.1.0_openbeta\n']){
   x=setup(vector);x[place][field]=wrong;
   assert.throws(()=>validateCatalog(x.c,x.q),/NOT INSTALLABLE/);
   if(place!=='r')assert.equal(browser.admit(x.v,x.p),false);
  }
 }
});
test('legacy unversioned identity stays valid only with omitted or null metadata',()=>{
 const x=setup({...vectors.vectors[0],product:'SMK-37 Pro_900',firmware_version:null,release_display:null});
 assert.doesNotThrow(()=>validateCatalog(x.c,x.q));assert.equal(browser.admit(x.v,x.p),true);
 for(const r of [x.v,x.p,x.r]){delete r.firmware_version;delete r.release_display;}
 assert.doesNotThrow(()=>validateCatalog(x.c,x.q));assert.equal(browser.admit(x.v,x.p),true);
 for(const place of ['v','p','r'])for(const field of ['firmware_version','release_display']){
  x[place][field]=field==='firmware_version'?'0.1.0':'0.1.0_openbeta';
  assert.throws(()=>validateCatalog(x.c,x.q),/NOT INSTALLABLE/);
  if(place!=='r')assert.equal(browser.admit(x.v,x.p),false);
  delete x[place][field];
 }
});
test('malformed, foreign and truncated products remain refused with otherwise matching receipts',()=>{
 for(const product of ['SMK-37 Pro_900010','SMK-37 Pro_90001000','SMK-37 Pro_9000100x','SMK-37 Pro_9000100\n','SMK-37 Pro_９０００１００','SMK-37 Pro_8000100','SMK-37 Pro_0.1.0','SMK-37 ProEVIL_9000100','SMK-37 Elite_9000100','FM-1_9000100','SMK-37 Pro_901']){
  const x=setup(vectors.vectors[0]);x.p.product=x.r.product=product;
  assert.throws(()=>validateCatalog(x.c,x.q),/NOT INSTALLABLE/);assert.equal(browser.admit(x.v,x.p),false);
 }
});
test('numeric acceptance cannot weaken controller, integrity, source or independent receipt gates',async()=>{
 const x=setup(vectors.vectors[0]);
 x.r.gates['independent-qa'].status='FAIL';assert.throws(()=>validateCatalog(x.c,x.q),/NOT INSTALLABLE/);
 x.r.gates['independent-qa'].status='PASS';x.r.source_tree='3'.repeat(40);assert.throws(()=>validateCatalog(x.c,x.q),/NOT INSTALLABLE/);
 x.r.source_tree=x.v.source_tree;x.p.controller_sha256='4'.repeat(64);assert.throws(()=>validateCatalog(x.c,x.q),/NOT INSTALLABLE/);
 x.p.controller_sha256=x.r.controller.sha256;x.p.pkg=x.p.pkg.replace('https:','http:');assert.equal(browser.admit(x.v,x.p),false);
 x.p.pkg=x.r.url;const bad=x.raw.slice();bad[bad.length-1]^=1;
 await assert.rejects(verifyDownloads(x.c,async()=>new Response(bad)),/bytes\/hash\/model mismatch/);
});
