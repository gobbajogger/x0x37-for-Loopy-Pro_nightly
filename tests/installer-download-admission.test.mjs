// SPDX-License-Identifier: GPL-3.0-only
// Execute the real installer admission/download functions with synthetic publisher
// attestations and bytes. No firmware, HTTP host or physical device is qualified.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Script, createContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
const source=readFileSync(fileURLToPath(new URL('../web/x0x_installer.html',import.meta.url)),'utf8');
assert.doesNotMatch(source,/mergeGitHubReleases|api\.github\.com\/repos\//);
assert.match(source,/const NIGHTLY_PUBLISHER_APPROVALS = Object\.freeze\(\{\}\);/,
  'real publisher allowlist must remain empty until independent qualification');
assert.doesNotMatch(source,/href=["']https:\/\/[^"']+\.fwsc["']/,
  'no unchecked direct firmware links, including vendor recovery files');
const span=(first,next)=>{
  const start=source.indexOf(first),end=source.indexOf(next,start);
  assert.ok(start>=0 && end>start,'required function missing: '+first);
  return source.slice(start,end);
};
const code=[
  span('const NIGHTLY_PUBLISHER_APPROVALS =','\nfunction versions()'),
  span('function modelKeyForProduct(product) {','\nfunction availableModels'),
  span('function isCatalogChecked(v,p) {','\nfunction buildBadge'),
  span('async function sha256Hex(buf) {','\nfunction versionOptionCaption')
].join('\n');
function fixture() {
  const p={product:'SMK-37 Pro_900',pkg:'https://example.org/sha256/pro.fwsc',
    sha256:'a'.repeat(64),controller_sha256:'b'.repeat(64),size:4};
  const v={status:'dev-checked',version:'test',source_commit:'1'.repeat(40),
    firmware_tree_sha:'2'.repeat(40),source_tree:'3'.repeat(40),qa_pass:true,source_licenses_approved:true,models:{pro:p}};
  const a={prehardware_qa_pass:true,license_and_source_ok:true,backup_integrity_pass:true,
    model_and_controller_pass:true,immutable_http_pass:true,model:'pro',product:p.product,
    source_commit:v.source_commit,source_tree:v.source_tree,firmware_tree_sha:v.firmware_tree_sha,
    package_url:p.pkg,package_sha256:p.sha256,controller_sha256:p.controller_sha256,host_sha256:p.sha256};
  return {v,p,a};
}
function runtime({v,p,a}, approved=true) {
  const revoked=[];let serial=0;const model=a.model;
  const elems={};
  const ctx=createContext({
    URL:{...URL,createObjectURL:()=>`blob:verified-${++serial}`,revokeObjectURL:u=>revoked.push(u)},
    Blob,Uint8Array,crypto:webcrypto,console,chosenModel:model,image:null,selectedProduct:null,
    writing:false,loadSerial:0,verifiedDownload:null,ctl:null,ctlHash:null,ctlNeedsResolution:false,
    currentVersion:()=>v,
    $:id=>elems[id]||=(id==='devagree'?{checked:true}:{hidden:false,disabled:true,textContent:'',
      removeAttribute(name){delete this[name];}}),
    renderBuildInfo:()=>{},sayK:(key)=>{ctx.lastMessage=key;},say:()=>{},t:key=>key,
    productOf:()=>p.product,logicalImage:b=>b,MODELS:{pro:'SMK-37 Pro'},
    fetch:async()=>({ok:true,arrayBuffer:async()=>Uint8Array.from([1,2,3,4]).buffer})
  });
  // URL is a real parser; its object-URL operations alone are synthetic.
  ctx.URL=class extends URL {};
  ctx.URL.createObjectURL=()=>`blob:verified-${++serial}`;
  ctx.URL.revokeObjectURL=u=>revoked.push(u);
  const approvals=approved?{[`test/${model}`]:a}:{};
  new Script(code.replace('Object.freeze({});',`Object.freeze(${JSON.stringify(approvals)});`)+
    '\nglobalThis.admit=isCatalogChecked;globalThis.refresh=refreshMeta;globalThis.load=loadSelectedPackage;globalThis.gate=updateInstallGate;')
    .runInContext(ctx);
  return {ctx,elems,revoked};
}
let assertions=0;
function admitted(f,expected,approved=true) {
  const {ctx}=runtime(f,approved);
  assert.equal(ctx.admit(f.v,f.p),expected);assertions++;
}
admitted(fixture(),true);
admitted(fixture(),false,false);
for (const [key,name] of [['elite','SMK-37 Elite'],['pro','SMK-37 Pro']]) {
 const f=fixture();f.p.product=f.a.product=name+'_900100';f.a.model=key;f.v.models={[key]:f.p};admitted(f,true);
}

for(const layer of ['v','p','a']) for(const key of ['revoked','blocked','withdrawn','disabled','fromRelease']) {
  for(const value of [true,'true',1,null]) {const f=fixture();f[layer][key]=value;admitted(f,false);}
}
for(const layer of ['v','p','a']) {const f=fixture();f[layer].status='failed';admitted(f,false);}
for(const value of ['SMK-37 ProEVIL_900','SMK-37 Pro','SMK-37 Elite_900','SMK-37 Pro_900x','SMK-37 Pro_901']) {
  const f=fixture();f.p.product=f.a.product=value;admitted(f,false);
}
for(const value of ['https://','http://example.org/pro.fwsc','https://user@example.org/pro.fwsc',
  'https://example.org/a/../pro.fwsc','https://example.org/%2e%2e/pro.fwsc','https://example.org/pro.fwsc?token=1',
  'https://example.org/pro.fwsc#download','https://example.org:443/pro.fwsc']) {
  const f=fixture();f.p.pkg=f.a.package_url=value;admitted(f,false);
}
for(const key of ['prehardware_qa_pass','license_and_source_ok','backup_integrity_pass','model_and_controller_pass','immutable_http_pass']) {
  const f=fixture();f.a[key]=false;admitted(f,false);
}
for(const [layer,key,value] of [['v','qa_pass',false],['v','source_licenses_approved',false],
 ['v','source_commit','3'.repeat(40)],['v','source_tree','4'.repeat(40)],['v','firmware_tree_sha','4'.repeat(40)],
 ['p','sha256','c'.repeat(64)],['p','controller_sha256','c'.repeat(64)],['p','size',0],['p','size',1.5],
 ['a','model','elite'],['a','host_sha256','c'.repeat(64)]]) {
 const f=fixture();f[layer][key]=value;admitted(f,false);
}
// Admission cannot expose a download until actual received bytes are verified.
{
 const f=fixture(),{ctx,elems}=runtime(f);ctx.refresh();
 assert.equal(elems.download.hidden,true);assert.equal(elems.download.href,undefined);assertions+=2;
 f.p.sha256=f.a.package_sha256=f.a.host_sha256=Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256',Uint8Array.from([1,2,3,4]))),b=>b.toString(16).padStart(2,'0')).join('');
 const r=runtime(f);await r.ctx.load();
 assert.equal(r.elems.download.href,'blob:verified-1');assert.equal(r.elems.download.hidden,false);assertions+=2;
 r.ctx.$('devagree').checked=true;r.ctx.gate();assert.equal(r.elems.go.disabled,false);assertions++;
 r.ctx.ctlNeedsResolution=true;r.ctx.gate();assert.equal(r.elems.go.disabled,true);assertions++;
 r.ctx.ctlNeedsResolution=false;r.ctx.ctl=new Uint8Array([1]);r.ctx.ctlHash='c'.repeat(64);r.ctx.gate();assert.equal(r.elems.go.disabled,true);assertions++;
 r.ctx.ctlHash=f.p.controller_sha256;r.ctx.gate();assert.equal(r.elems.go.disabled,false);assertions++;
 f.v.revoked=true;r.ctx.refresh();
 assert.equal(r.elems.download.href,undefined);assert.equal(r.elems.download.hidden,true);
 assert.equal(r.elems.go.disabled,true);assert.deepEqual(r.revoked,['blob:verified-1']);assertions+=4;
}
// A late response from a previous model must neither replace bytes nor create a Blob.
{
 const f=fixture();let resolve;
 const r=runtime(f);r.ctx.fetch=()=>new Promise(done=>{resolve=done;});
 const pending=r.ctx.load();r.ctx.chosenModel='elite';resolve({ok:true,arrayBuffer:async()=>new Uint8Array([1,2,3,4]).buffer});
 await pending;assert.equal(r.ctx.image,null);assert.equal(r.ctx.verifiedDownload,null);assertions+=2;
}
// HTTP failure, byte-count mismatch and changed digest are all non-downloadable.
for(const mode of ['http','size','digest']) {
 const f=fixture(),r=runtime(f);
 r.ctx.fetch=async()=>({ok:mode!=='http',status:503,arrayBuffer:async()=>new Uint8Array(mode==='size'?[1]:[1,2,3,4]).buffer});
 await r.ctx.load();assert.equal(r.ctx.image,null);assert.equal(r.ctx.verifiedDownload,null);assertions+=2;
}
console.log(`PASS: ${assertions} publisher admission, verified download, stale-selection and install-gate assertions (synthetic only)`);
