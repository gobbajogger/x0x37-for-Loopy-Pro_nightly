// SPDX-License-Identifier: GPL-3.0-only
// Execute current admission predicates; all candidate metadata is synthetic.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const source=readFileSync(new URL('../web/x0x_installer.html',import.meta.url),'utf8');
assert.doesNotMatch(source,/mergeGitHubReleases|api\.github\.com\/repos\//);
const span=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const context={chosenModel:'pro', URL};
new Script(span('function isRecord','function availableModels')+'\n'+
  span('function bundledController','function hasVerifiedNightlySelection')+'\nthis.admit=isCatalogChecked;').runInNewContext(context);
const good={product:'SMK-37 Pro_900',sha256:'a'.repeat(64),controller_sha256:'b'.repeat(64),size:1024,pkg:`https://example.org/${'a'.repeat(64)}/test.fwsc`};
const make=()=>({status:'dev-checked',version:'synthetic',models:{pro:{...good}}});
let count=0;
const check=(mutate,expected=false)=>{const v=make();mutate(v,v.models.pro);assert.equal(context.admit(v,v.models.pro),expected);count++;};
check(()=>{},true);
check((v,p)=>Object.defineProperty(p,'product',{get(){throw new Error('malformed getter');}}));
{const v=make(),p=v.models.pro;Object.defineProperty(v,'models',{get(){throw new Error('malformed model map');}});assert.equal(context.admit(v,p),false);count++;}
for(const field of ['revoked','blocked','withdrawn'])for(const value of [true,'false',1,{}]) {
  check(v=>v[field]=value);check((v,p)=>p[field]=value);
}
for(const field of ['qualified','installable']){check(v=>v[field]=false);check((v,p)=>p[field]=false);}
for(const product of ['SMK-37 ProEVIL_900','SMK-37 Pro','SMK-37 Elite_900','SMK-37 Pro_900x'])check((v,p)=>p.product=product);
for(const url of ['https://','http://example.org/x','javascript:alert(1)',good.pkg+'?x=1',good.pkg+'#x','https://u:p@example.org/'+good.sha256])check((v,p)=>p.pkg=url);
for(const hash of ['',null,'a'.repeat(63),'G'.repeat(64)])check((v,p)=>p.sha256=hash);
check((v,p)=>p.status='failed');check(v=>v.lifecycle='revoked');check((v,p)=>p.fromRelease=true);
for(const f of ['device_verified','hardware_tested','fromRelease']){check(v=>v[f]=true);check((v,p)=>p[f]=true);}
check((v,p)=>p.fromRelease='true');check(v=>v.lifecycle='superseded');
check((v,p)=>delete p.controller_sha256);check((v,p)=>p.size=0);
console.log(`PASS: ${count} admission cases, including all six independent audit negatives`);
