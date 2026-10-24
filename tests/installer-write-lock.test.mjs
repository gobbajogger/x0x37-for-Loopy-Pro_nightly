// SPDX-License-Identifier: GPL-3.0-only
// Actual browser run/scan bodies; synthetic MIDI permission/device only. No writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';
const source=readFileSync(process.argv[2] || new URL('../web/x0x_installer.html',import.meta.url),'utf8');
function span(first,next){const i=source.indexOf(first),j=source.indexOf(next,i);assert.ok(i>=0&&j>i,'missing '+first);return source.slice(i,j);}
const scan=span('async function scan(', '\n$("connbtn").addEventListener');
const run=span('async function run(img, product, opts = {}) {','\n$("go").addEventListener');
let cases=0;
function runtime(mode='normal'){
 const state={writes:0,scans:0,scanLock:[],suggestions:0,status:null,denials:0,closed:0};
 const ui={};let ctx,grant;
 const permission=new Promise(resolve=>grant=resolve);
 const mock={
  $:id=>ui[id]||={disabled:false,checked:true,textContent:'',value:0},
  midiAccess:async()=>{if(mode==='pending')return permission;if(mode==='denied'&&state.denials++===0)throw Object.assign(Error('denied'),{code:'denied'});return{};},
  Updater:class{async find(predicate){
   if(!state.writes)return null;
   state.scans++;state.scanLock.push(ctx.lock());
   const id={model:'SMK-37 Pro',text:'SMK-37 Pro_900'};
   return predicate(id)?{id,name:'Keyboard',link:{close(){state.closed++;}}}:null;
  }},
  installKeepingSlots:async()=>{
   state.writes++;
   if(mode==='backup-error')throw Object.assign(Error('backup refused'),{code:'slotbackup'});
   const move=mode==='stock'?{newMap:[],skipped:[],name:'before.x0xslots'}:
    {newMap:[{}],skipped:mode==='partial'?['slot 2: no room']:mode==='total'?['slot 1: no room','slot 2: no room']:[],name:'before.x0xslots'};
   return{move};
  },
  updateInstallGate(){ui.go.disabled=false;},
  sameKeyboard:()=>true,confirmNightlyModel:()=>true,
  setConnected(){},suggestModel(){state.suggestions++;state.status='package selection';},
  currentVersion:()=>({models:{pro:{product:'SMK-37 Pro_900'}}}),
  hasVerifiedNightlySelection:()=>true,isCatalogChecked:()=>true,
  sayK:(key,suffix='')=>{state.status=key+suffix;},say:msg=>{state.status=msg;},
  t:key=>key,log(){},led(){},TEXT:{en:{slotbackup:'Backup error'}},lang:'en',
  Blob,URL,setTimeout,window:{confirm:()=>true},
  document:{createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}},
 };
 ctx=createContext(mock);
 new Script('let writing=false,lastId=null,stock=null,ctl=null,ctlLoadSerial=0,stockLoadSerial=0,scanSerial=0,ctlNeedsResolution=false,chosenModel="pro";\n'+scan+'\n'+run+'\nglobalThis.start=run;globalThis.lock=()=>writing;globalThis.ctlSerial=()=>ctlLoadSerial;').runInContext(ctx);
 return{ctx,state,ui,grant};
}
{
 const r=runtime('pending');const a=r.ctx.start(new Uint8Array([1]),'SMK-37 Pro_900');
 assert.equal(r.ctx.lock(),true,'MIDI permission must be covered by single-writer lock');
 assert.equal(r.ui.go.disabled,true);assert.equal(r.ui.stockgo.disabled,true);
 const b=r.ctx.start(new Uint8Array([1]),'SMK-37 Pro_900',{foreign:true});
 r.grant({});await Promise.all([a,b]);
 assert.equal(r.state.writes,1,'two entry paths started concurrent installs');
 assert.ok(r.ctx.ctlSerial()>0,'pending controller load was not invalidated');
 assert.equal(r.ctx.lock(),false);cases++;
}
{
 const r=runtime('denied');await r.ctx.start(new Uint8Array([1]),'SMK-37 Pro_900');
 assert.equal(r.ctx.lock(),false);assert.equal(r.state.writes,0);assert.equal(r.state.status,'denied');
 assert.equal(r.ui.go.disabled,false,'permission denial prevented retry');
 await r.ctx.start(new Uint8Array([1]),'SMK-37 Pro_900');assert.equal(r.state.writes,1);assert.equal(r.ctx.lock(),false);cases++;
}
for(const [mode,wanted] of [['normal','slotsdone'],['partial','slotspartial'],['total','slotspartial'],['stock','slotstock'],['backup-error','slotbackup']]){
 const r=runtime(mode);await r.ctx.start(new Uint8Array([1]),'SMK-37 Pro_900');
 assert.equal(r.state.writes,1);assert.equal(r.ctx.lock(),false);
 assert.ok(r.state.status.startsWith(wanted),mode+': final restoration result was hidden');
 if(mode!=='backup-error'){
  assert.ok(r.state.scans>0,mode+': no postwrite reconnect');
  assert.ok(r.state.scanLock.every(Boolean),mode+': reconnect escaped write lock');
  assert.equal(r.state.suggestions,0,mode+': reconnect reloaded model/package and clobbered outcome');
 }else assert.equal(r.state.scans,0,'failed backup was hidden by reconnect');
 if(['partial','total'].includes(mode))assert.ok(r.state.status.includes('before.x0xslots'),'partial recovery lost backup name');
 cases++;
}
console.log('PASS '+cases+' actual-source permission/write-lock/reconnect/restore scenarios; simulated only');
