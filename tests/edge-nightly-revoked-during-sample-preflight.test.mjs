// SPDX-License-Identifier: GPL-3.0-only
// EC040: approved NIGHTLY selection revoked while sample preflight is awaiting SMP_INFO.
// Both browser run() and the entire production installKeepingSlots() body are evaluated.
// Hardware, OTA transfer and actual firmware writes are simulated, NEVER performed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

const source = (name) => readFileSync(new URL('../'+name, import.meta.url),'utf8');
const html = source('web/x0x_installer.html');
const first = html.indexOf('async function run(img, product, opts = {}) {');
const last = html.indexOf('\n$("go").addEventListener', first);
assert.ok(first >= 0 && last > first, 'production run() span missing');
const runCode = html.slice(first,last);
const breaksSrc = source('web/x0x_breaks.js').replace(/^export\s+/gm,'');
const slotsCtx = createContext({ TextEncoder, TextDecoder });
new Script(breaksSrc+'\nglobalThis.installKeepingSlots = installKeepingSlots;').runInContext(slotsCtx);
const actualInstallKeepingSlots = slotsCtx.installKeepingSlots;

async function scenario(revokeAtLayout) {
  const records = { installs:0, revocations:0, responses:0, preflightCommands:[], log:[], status:null };
  let ctx;
  const ui = {};
  const device = {name:'SMK USB-MIDI',id:{model:'SMK-37 Pro',text:'SMK-37 Pro_900',version:900},link:{
    drain(){},send(frame){records.preflightCommands.push(frame[4]);return true;},close(){},
    async read(){
      records.responses++;
      // SMP_INFO: 1 x 80 KiB empty slot, standard legacy descriptor.
      if (revokeAtLayout && records.revocations===0){records.revocations++;ctx.revoke();}
      return [0xF0,0x7D,0x46,0x4C,15,1,80,0,0,0,0xF7];
    },
  }};
  const product='SMK-37 Pro_900';
  class FakeUpdater {
    constructor() {this.verified=false;}
    async find(predicate) {return predicate({model:'ota-SMK-37 Pro'})?null:device;}
    bind(d){assert.equal(d,device);}
    async install(img,productArg){assert.equal(productArg,product);records.installs++;return productArg;}
  }
  const mock = {
    $:id=>ui[id] ||= {disabled:false,value:0,checked:true},
    getSampleWorkspace:()=>null,getProjectWorkspace:()=>null,
    midiAccess:async()=>({}),Updater:FakeUpdater,installKeepingSlots:actualInstallKeepingSlots,
    sameKeyboard:(a,b)=>a===b,scan:async()=>{}, updateInstallGate:()=>{},
    sayK:(k)=>{records.status=k;},say:()=>{},log:(s)=>records.log.push(s),led:()=>{},
    TEXT:{en:{}},lang:'en',t:k=>k,
  };
  ctx=createContext(mock);
  new Script('let writing=false,workspaceActive=true,scanSerial=0,ctlLoadSerial=0,stockLoadSerial=0,stock=null,lastId=null,loadSerial=41;\n'+runCode+'\nglobalThis.start=run;globalThis.revoke=()=>loadSerial++;globalThis.admitted=(ticket)=>loadSerial===ticket;').runInContext(ctx);
  await ctx.start(new Uint8Array([1,2,3]), product, {admitted:()=>ctx.admitted(41)});
  assert.ok(records.preflightCommands.includes(15),'real SMP_INFO preflight path not exercised');
  return records;
}

const control=await scenario(false);
assert.equal(control.installs,1,'legitimately approved release did not reach installation');
console.log('PASS control: unchanged approved selection reaches OTA entry (simulated)');
const revoked=await scenario(true);
assert.equal(revoked.revocations,1,'selection revocation was not injected during SMP_INFO');
assert.equal(revoked.installs,0,'FAIL_BEFORE_FIX: revoked NIGHTLY selection still enters Updater.install() after SMP_INFO');
console.log('PASS revoked selection blocks OTA before any install start');
