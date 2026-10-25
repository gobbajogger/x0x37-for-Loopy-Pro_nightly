// SPDX-License-Identifier: GPL-3.0-only
// Synthetic complete packages exercise actual bundled admission, not binary distribution.
import assert from 'node:assert/strict';
import {controllerOf,logicalImage,insertCtl} from '../web/fm1pkg.js';
import {validateCatalog,verifyDownloads,installerFingerprint,requiredGates} from '../scripts/render-qualified-nightly.mjs';
import {makePackage,makeController,packageRecord,catalogFor} from './fixtures/bundled-synthetic.mjs';
let cases=0;
const assertReject=async(catalog)=>{await assert.rejects(verifyDownloads(catalog,async()=>new Response(bytes)));cases++;};
let bytes;
for(const model of['elite','pro']){
 bytes=makePackage(model);const p=packageRecord(model,bytes),c=catalogFor({[model]:p});
 assert.deepEqual(Buffer.from(controllerOf(logicalImage(bytes))),makeController());cases++;
 assert.deepEqual(Buffer.from(insertCtl(logicalImage(bytes),makeController())),Buffer.from(logicalImage(bytes)));cases++;
 await verifyDownloads(c,async()=>new Response(bytes));cases++;
 const evidence='https://example.org/independent-evidence';
 const r={source_commit:'1'.repeat(40),source_tree:'2'.repeat(40),size:p.size,product:p.product,url:p.pkg,integration:{ref:'nightly',commit:'1'.repeat(40),tree:'2'.repeat(40),evidence_url:evidence},controller:{strategy:'bundled',size:4096,sha256:p.controller_sha256},budgets:{app_code_free:1,ram_free:1,pool_free:8192},gates:Object.fromEntries(requiredGates.map(g=>[g,{status:'PASS',evidence_url:evidence}])),corresponding_source:'https://example.org/'+'1'.repeat(40)+'/source.tar.gz',notices:evidence};
 const q={schema:1,installer_sha256:installerFingerprint(),packages:{[p.sha256]:r}};validateCatalog(c,q);cases++;
 for(const value of[null,'',true,{},'hosted']){const bad=structuredClone(c);bad.versions[0].models[model].controller_strategy=value;assert.throws(()=>validateCatalog(bad,q),/NOT INSTALLABLE/);cases++;}
 for(const field of['controller_size','controller_sha256']){const bad=structuredClone(c);bad.versions[0].models[model][field]=field==='controller_size'?4095:'f'.repeat(64);assert.throws(()=>validateCatalog(bad,q),/NOT INSTALLABLE/);cases++;await assertReject(bad);}
 for(const gate of['distribution-license','corresponding-source']){const soft=structuredClone(q);soft.packages[p.sha256].gates[gate]={status:'PENDING',evidence_url:evidence};validateCatalog(c,soft);cases++;}
 for(const gate of['independent-qa']){const bad=structuredClone(q);bad.packages[p.sha256].gates[gate].status='PENDING';assert.throws(()=>validateCatalog(c,bad),/NOT INSTALLABLE/);cases++;}
 for(const opts of[{controller:null},{tail:true},{appCrc:true},{outerCrc:true},{noMap:true},{controller:makeController(b=>b.writeUInt32LE(1,20))}]){bytes=makePackage(model,opts);await assertReject(catalogFor({[model]:packageRecord(model,bytes)}));assert.throws(()=>controllerOf(logicalImage(bytes)));cases++;}
 const corrupt=makeController();corrupt[100]^=1;bytes=makePackage(model,{controller:corrupt});await assertReject(catalogFor({[model]:packageRecord(model,bytes)}));
 bytes=makePackage(model==='elite'?'pro':'elite');const wrong=packageRecord(model,bytes);await assertReject(catalogFor({[model]:wrong}));
 // Newly qualified synthetic legacy packages are refused; only the frozen public packages can be retained.
 const legacy=structuredClone(c),lq=structuredClone(q);delete legacy.versions[0].models[model].controller_strategy;delete legacy.versions[0].models[model].controller_size;lq.packages[p.sha256].controller.strategy='owner-supplied';assert.throws(()=>validateCatalog(legacy,lq),/new NIGHTLY candidates must bundle Bluetooth/);cases++;
}
console.log(`PASS bundled-controller: ${cases} actual parser, composition, renderer, qualification and denial assertions; synthetic Elite/Pro only`);
