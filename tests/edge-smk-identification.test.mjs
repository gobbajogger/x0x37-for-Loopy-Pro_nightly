// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {renderInstaller} from '../scripts/render-qualified-nightly.mjs';
import {sameKeyboard,Updater} from '../web/fm1ota.js';
import {productOf} from '../web/fm1pkg.js';
const template=readFileSync(new URL('../web/x0x_installer.html',import.meta.url),'utf8');
const generated=renderInstaller({schema:1,versions:[],history:[]});
const variants=[['source',template],['rendered',generated]];
if(process.env.SMK_LIVE_HTML) variants.push(['deployed candidate',readFileSync(process.env.SMK_LIVE_HTML,'utf8')]);
for(const [name,html] of variants){
 test(`${name}: supported models only; unknown identities do not become Pro`,()=>{
  const modelDefs=html.match(/const MODELS = .*;\nconst MODEL_KEYS = .*;/)[0];
  const suggestion=html.slice(html.indexOf('function suggestModel('),html.indexOf('function refreshModelUi('));
  const ctx={sameKeyboard,currentVersion:()=>({}),availableModels:()=>['pro','elite','mke'],document:{querySelector:()=>null},loadSelectedPackage:()=>{},chosenModel:'unchanged'};
  vm.createContext(ctx);vm.runInContext(modelDefs+'\n'+suggestion,ctx);
  for(const id of ['FM-1','ota-FM-1','unknown','',null,'SMK-37 Unknown']){ctx.chosenModel='unchanged';ctx.suggestModel(id);assert.equal(ctx.chosenModel,'unchanged');}
  for(const [id,want] of [['SMK-37 Pro','pro'],['SMK-37 Elite','elite'],['ota-SMK-37 Elite','elite'],['MKE-P37','mke']]){ctx.suggestModel(id);assert.equal(ctx.chosenModel,want);}
  assert.equal(vm.runInContext('MODEL_KEYS.includes("fm1")',ctx),false);
 });
 test(`${name}: text and recovery guidance do not describe SMK as FM-1`,()=>{
  for(const old of ['Firmware for SMK-37 and FM-1.','SMK-37 と FM-1','If the FM-1','万一 FM-1','recovering an FM-1','recovering-an-fm-1'])assert.ok(!html.includes(old),old);
  assert.ok(html.includes('Firmware for SMK-37 Pro and Elite.'));
  assert.ok(html.includes('https://github.com/gobbajogger/X0X37-for-Loopy-Pro/issues" style="color:inherit" data-t="bricklink"')); 
 });
}
test('real updater rejects the other board, including same-board FM1 pairing',()=>{
 for(const [a,b] of [['FM-1','FM-1'],['ota-FM-1','FM-1'],['SMK-37 Pro','SMK-37 Elite'],['','']])assert.equal(sameKeyboard(a,b),false);
 assert.equal(sameKeyboard('ota-SMK-37 Pro','SMK-37 Pro'),true);
});
test('real missing-device and short-package errors name no other board',async()=>{
 const u=new Updater({inputs:new Map(),outputs:new Map()});u.find=async()=>null;
 await assert.rejects(u.install(new Uint8Array(),'SMK-37 Pro_900'),e=>e.code==='notfound'&&e.message.startsWith('SMK-37 not found'));
 assert.throws(()=>productOf(new Uint8Array()),/firmware package is too short/);
});
