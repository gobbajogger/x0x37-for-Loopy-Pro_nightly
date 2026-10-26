// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { planMigration, migrationReordersLoopMenu, guardMigrationLoopMenu, installKeepingSlots,
  userSlotRaw, readArchive, pack78 } from '../web/x0x_breaks.js';
import { makePackage } from './fixtures/bundled-synthetic.mjs';
import { logicalImage } from '../web/fm1pkg.js';
const legacyPackage=()=>logicalImage(makePackage('pro',{noMap:true}));
const lay = ns => ({count:ns.length, slots:ns.map(nz=>({nz}))});
const om=[{off:0x1000,size:50000},{off:0x20000,size:120000},{off:0x40000,size:50000}];
const nm=[om[0],{off:0x50000,size:80000}];
const images=[new Uint8Array(40000),new Uint8Array(100000),new Uint8Array(30000)];
test('skipped middle multizone image cannot donate its saved LOOP indices to C',()=>{
 const old=lay([1,2,1]), next=lay([1,0]);
 const p=planMigration(images,[1,2],om,next,nm);
 assert.deepEqual(p.todo,[{k:2,j:1}]);assert.equal(p.skipped.length,1);
 const guarded=guardMigrationLoopMenu(old,images,[1,2],om,next,nm,p.todo,p.skipped);
 assert.deepEqual(guarded.todo,[]);assert.equal(guarded.skipped.length,2);
 assert.match(guarded.skipped[1],/compatible layout.*every saved pattern/);
});
test('identical image CRCs do not hide original-slot reorder',()=>{
 const same=[new Uint8Array(800),new Uint8Array(800)], map=om.slice(0,2);
 assert.equal(migrationReordersLoopMenu(lay([2,1]),same,[0,1],map,lay([0,0]),map,[{k:0,j:1},{k:1,j:0}]),true);
 assert.equal(migrationReordersLoopMenu(lay([2,1]),same,[0,1],map,lay([0,0]),map,[{k:0,j:0},{k:1,j:1}]),false);
});
test('safe prefix, trailing omission and append-only occupants retain existing indices',()=>{
 assert.equal(migrationReordersLoopMenu(lay([1,1,1]),images,[1,2],om,lay([1,0]),nm,[{k:1,j:1}]),false);
 assert.equal(migrationReordersLoopMenu(lay([2]),images.slice(0,1),[0],om.slice(0,1),lay([0,1]),nm,[{k:0,j:0}]),false);
 assert.equal(migrationReordersLoopMenu(lay([2]),images.slice(0,1),[0],om.slice(0,1),lay([1,0]),nm,[{k:0,j:1}]),true);
});
function image(name,n){
 const {hdr,data}=userSlotRaw(name,[{adpcm:new Uint8Array(n).fill(17),n:n*2,rate:44100}], 122880);
 const image=new Uint8Array(512+data.length).fill(255);image.set(hdr);image.set(data,512);return image;
}
test('production installer retains verified archive and emits no restoration write for skipped middle slot',async()=>{
 const images=[image('A',40000),image('BIG',100000),image('C',30000)];
 const oldMap=[{off:0xC2000,size:0x14000},{off:0xD6000,size:0x1E000},{off:0xB0000,size:0xB000}];
 const newMap=oldMap.slice(0,2).map(x=>({...x,size:0x14000}));
 let installed=false, response=null;const commands=[],saved=[];
 function info(){
  const map=installed?newMap:oldMap, occupied=installed?[images[0],null]:images;
  const r=[map.length,Math.min(...map.map(x=>x.size))>>10];
  occupied.forEach(img=>{r.push(img?1:0,...(img?[...new TextEncoder().encode('X')]:[]),0,img?Math.ceil((img.length-512)/1024):0);});
  r.push(0x58,1);map.forEach((x,k)=>{for(const n of [x.off>>12,x.size>>12,occupied[k]?Math.ceil((occupied[k].length-512)/1024):0])r.push(n&127,(n>>7)&127);});return r;
 }
 const link={close(){},drain(){},send(frame){const cmd=frame[4],a=frame.slice(5,-1);commands.push([installed,cmd]);
  let body;if(cmd===15)body=info();else if(cmd===16){const off=a[1]|a[2]<<7|a[3]<<14;const bytes=images[a[0]].slice(off,off+a[4]*2);body=[...a.slice(0,4),...pack78(bytes)];}else throw Error('unexpected restoration write '+cmd);
  response=[0xf0,0x7d,0x46,0x4c,cmd,...body,0xf7];return true;},async read(){return response;}};
 const dev={link,id:{text:'SMK-37 Pro_900',model:'SMK-37 Pro',version:900}};
 const up={async find(){return dev;},bind(){},async install(){installed=true;return 'SMK-37 Pro_901';},async waitFor(){return dev;},async reconnectAfter(){return dev;}};
 const raw=legacyPackage();
 const result=await installKeepingSlots(up,raw,'SMK-37 Pro_901','smk',{save(bytes,name){saved.push({bytes,name});return true; /* simulated retained backup */}});
 assert.equal(installed,true,'guard is after firmware installation, not a preflash claim');
 assert.equal(saved.length,1);assert.deepEqual(readArchive(saved[0].bytes).images,images);
 assert.deepEqual(result.move.todo,[]);assert.equal(result.move.skipped.length,2);
 assert.ok(commands.filter(([after])=>after).every(([,cmd])=>cmd===15||cmd===16));
});

test('fresh backup population recomputes risk before any restore writes',async()=>{
const images=[image('NEW_A',100000),image('B',30000)];
const oldMap=[{off:0xC2000,size:0x1E000},{off:0xB0000,size:0xB000}],newMap=[{off:0xC2000,size:0x14000},{off:0xD6000,size:0x14000}];
let installed=false,response=null,infos=0;const commands=[],saved=[];
function info(){infos++;const map=installed?newMap:oldMap,occupied=installed?[null,null]:infos===1?[null,images[1]]:images;const r=[map.length,Math.min(...map.map(x=>x.size))>>10];occupied.forEach(img=>r.push(img?1:0,...(img?[88]:[]),0,img?Math.ceil((img.length-512)/1024):0));r.push(0x58,1);map.forEach((x,k)=>{for(const n of [x.off>>12,x.size>>12,occupied[k]?Math.ceil((occupied[k].length-512)/1024):0])r.push(n&127,(n>>7)&127);});return r;}
const link={close(){},drain(){},send(frame){const cmd=frame[4],a=frame.slice(5,-1);commands.push([installed,cmd]);let body;if(cmd===15)body=info();else if(cmd===16){const off=a[1]|a[2]<<7|a[3]<<14;body=[...a.slice(0,4),...pack78(images[a[0]].slice(off,off+a[4]*2))];}else throw Error('RESTORE_WRITE '+cmd);response=[0xf0,0x7d,0x46,0x4c,cmd,...body,0xf7];return true;},async read(){return response;}};
const dev={link,id:{text:'SMK-37 Pro_900',model:'SMK-37 Pro',version:900}};
const up={async find(){return dev;},bind(){},async install(){installed=true;return 'SMK-37 Pro_901';},async waitFor(){return dev;},async reconnectAfter(){return dev;}};
let error,result;try{result=await installKeepingSlots(up,legacyPackage(),'SMK-37 Pro_901','smk',{save(bytes,name){saved.push({bytes,name});return true; /* simulated retained backup */}});}catch(e){error=e;}
assert.equal(saved.length,1);assert.deepEqual(readArchive(saved[0].bytes).images,images);
assert.equal(error,undefined);assert.equal(installed,true);assert.deepEqual(result.move.risk,[0,1]);assert.deepEqual(result.move.todo,[]);assert.equal(result.move.skipped.length,2);
assert.ok(!commands.some(([after,cmd])=>after && ![15,16].includes(cmd)),'UNSAFE: fresh backup populated oversized A, stale risk list treats A as kept and begins restoring B at A\'s logical index');

});
