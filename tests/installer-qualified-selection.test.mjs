// SPDX-License-Identifier: GPL-3.0-only
// Actual picker population body; fake catalog/DOM. No network, package or device.
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';import{Script}from'node:vm';
const s=readFileSync(process.argv[2]||new URL('../web/x0x_installer.html',import.meta.url),'utf8');
const begin=s.indexOf('function fillVersions() {'),end=s.indexOf('\nfunction confirmWrite',begin);
assert.ok(begin>=0&&end>begin);const code=s.slice(begin,end);
let cases=0;
function check(latest,versions,current,expected){
 const sel={children:[],_value:current,set innerHTML(v){this.children=[];this._value='';},get value(){return this._value;},
  set value(v){this._value=this.children.some(o=>o.value===v)?v:'';},
  append(o){this.children.push(o);if(!this._value)this._value=o.value;}};
 const ui={version:sel};let loads=0;
 const c={catalogLive:{latest},loadSerial:0,image:null,selectedProduct:null,versions:()=>versions,
  availableModels:v=>v.eligible?['pro']:[],$:id=>ui[id]||={},discardVerifiedDownload(){},refreshModelUi(){},cancelPackageDownload(){},
  loadSelectedPackage(){loads++;},renderBuildHistory(){},say(){},t:k=>k,versionOptionCaption:v=>v.version,
  document:{createElement:()=>({})}};
 new Script(code+'\nfillVersions();').runInNewContext(c);
 assert.equal(sel.value,expected,'eligible picker selection lost');
 assert.deepEqual(sel.children.map(o=>o.value),versions.filter(v=>v.eligible).map(v=>v.version));
 if(expected===''){assert.equal(ui.go.disabled,true);assert.equal(loads,0);}else assert.equal(loads,1);
 cases++;
}
const old={version:'older-checked',eligible:true},latest={version:'latest-revoked',eligible:false},newer={version:'newer-checked',eligible:true};
check(latest.version,[latest,old],'',old.version);
check('absent',[latest,old],'',old.version);
check(newer.version,[newer,old],'',newer.version);
check(newer.version,[newer,old],old.version,old.version);
check(latest.version,[latest,old],latest.version,old.version);
check(latest.version,[latest],'','');
console.log('PASS '+cases+' actual-source last-qualified picker continuity scenarios; synthetic only');
