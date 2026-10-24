// SPDX-License-Identifier: GPL-3.0-only
// Expected RED against immutable original public source, not a passing runtime test.
import {execFileSync} from 'node:child_process';
import {createContext,runInContext} from 'node:vm';
const source=execFileSync('git',['show','ddbd8d89f7c4dfd5afa432dd51e940b6dd428592:web/x0x_installer.html'],{encoding:'utf8'});
const span=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const context=createContext({chosenModel:'pro'});
runInContext(span('function modelKeyForProduct(product) {','\nfunction availableModels')+'\n'+
 span('function isCatalogChecked(v,p) {','\nfunction updateInstallGate')+'\nthis.check=isCatalogChecked;',context);
const v={status:'dev-checked'},p={product:'SMK-37 Pro_900',pkg:'https://example.org/model.fwsc',sha256:'a'.repeat(64)};
let failures=0;
for(const [label,version,model] of [
 ['revoked model',v,{...p,revoked:true}],['revoked version',{...v,revoked:true},p],
 ['blocked version',{...v,blocked:true},p],['withdrawn version',{...v,withdrawn:true},p],
 ['failed model',v,{...p,status:'failed'}],['malformed product',v,{...p,product:'SMK-37 ProEVIL_900'}],
 ['missing product version',v,{...p,product:'SMK-37 Pro'}],['invalid URL',v,{...p,pkg:'https://'}]]) {
 const actual=context.check(version,model);if(actual!==false)failures++;
 console.log(JSON.stringify({case:label,expected:false,actual}));
}
console.log(`EXPECTED RED: ${failures}/8 unsafe admission cases reproduce`);
process.exit(failures?1:0);
