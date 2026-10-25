// SPDX-License-Identifier: GPL-3.0-only
// Test-format generator only. No SDK inputs, executable firmware or vendor bytes.
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export const hash=b=>createHash('sha256').update(b).digest('hex');
const u16=(b,o,v)=>b.writeUInt16LE(v&65535,o),u32=(b,o,v)=>b.writeUInt32LE(v>>>0,o);
function crc16(b){let c=0;for(const n of b){c^=n<<8;for(let i=0;i<8;i++)c=c&32768?((c<<1)^0x1021)&65535:(c<<1)&65535;}return c;}
export function crc32(b){let c=0xffffffff;for(const n of b){c^=n;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function enc(b,key=65535){for(let i=0;i<b.length;i++){b[i]^=key&255;key=((key<<1)^((key&32768)?0x1021:0))&65535;}return b;}
function sfc(b){for(let o=0;o<b.length;o+=32)enc(b.subarray(o,Math.min(o+32,b.length)),65535^(o>>>2));return b;}
function entry(dcrc,off,size,name){const b=Buffer.alloc(32,255);u16(b,2,dcrc);u32(b,4,off);u32(b,8,size);b[12]=0x82;b[13]=255;u16(b,14,0);b.fill(255,16);b.write(name+'\0',16,'ascii');u16(b,0,crc16(b.subarray(2)));return b;}
export function makeController(edit){const b=Buffer.alloc(4096);for(let i=68;i<b.length;i++)b[i]=(i*13+7)&255;u32(b,0,0x43423058);u16(b,4,2);u16(b,6,68);u32(b,8,0x20000);u32(b,12,b.length);u32(b,20,2);u32(b,24,0x02087080);u32(b,28,0x02087090);u32(b,32,0x01c06e80);u32(b,36,0x01c07680);u32(b,40,0x01c01800);u32(b,44,0x01c07680);u32(b,48,1<<29);u32(b,52,1<<8);if(edit)edit(b);u32(b,16,0);u32(b,16,crc32(b));return b;}
export function makePackage(model='pro',{controller=makeController(),tail=false,appCrc=false,outerCrc=false,noMap=false}={}){
 const slot=0x97400,blk=0x120+slot,area=Buffer.alloc(blk,255),flash=Buffer.alloc(0x9d000,255);
 area.write('SYNTHETIC NONEXECUTABLE APPLICATION',0x120,'ascii');
 if(controller)controller.copy(area,0x120+0x86ee0);
 if(tail)area[0x120+0x86ee0+controller.length]=0;
 entry(crc16(area.subarray(0x120,0x120+slot)),0x120,slot,'app.bin').copy(area,32);
 entry(crc16(area.subarray(32)),0x02000120,blk,'app_area_head').copy(area,0);
 if(appCrc)area[34]^=1;
 sfc(area).copy(flash,0x4000);
 const isd=entry(0,0x200,32,'isd_config.ini');enc(isd).copy(flash,64);flash.fill(0,0x200,0x220);
 if(!noMap){const map=Buffer.alloc(48);map.write('X0X-SLOTMAP-1\0\0\0',0,'ascii');u32(map,16,3);[[0xc2000,0x14000],[0xd6000,0x1e000],[0xb0000,0xb000]].forEach(([o,n],i)=>{u32(map,20+i*8,o);u32(map,24+i*8,n);});u32(map,44,crc32(map.subarray(0,44)));map.copy(flash,0x9cf00);}
 const ota=Buffer.from('SYNTHETIC NONEXECUTABLE FELUCCA-LOADER-1'),off=0x400,otaOff=(off+flash.length+255)&~255;
 const logical=Buffer.alloc(otaOff+ota.length,255),hdr=Buffer.alloc(64),list=Buffer.alloc(160);
 for(const [i,type,name,data,pos]of[[0,0,'flash.bin',flash,off],[1,100,'ota.bin',ota,otaOff]]){const e=Buffer.alloc(80);u16(e,0,type);u16(e,2,i);u16(e,4,crc16(data));u32(e,8,pos);u32(e,12,data.length);u32(e,16,(data.length+31)&~31);e.write(name,64,'ascii');enc(e).copy(list,i*80);data.copy(logical,pos);}
 u32(hdr,4,logical.length);u16(hdr,8,2);hdr.write('AC791N',16,'ascii');u16(hdr,2,crc16(list));u16(hdr,0,crc16(hdr.subarray(2)));enc(hdr).copy(logical);list.copy(logical,64);
 const product=`SMK-37 ${model==='elite'?'Elite':'Pro'}_900`,raw=Buffer.alloc(logical.length+20);for(let i=0;i<20;i++){logical.copy(raw,i*48,i*47,(i+1)*47);raw[i*48+47]=i<product.length?(product.charCodeAt(i)+i+1)&255:125;}logical.copy(raw,960,940);if(outerCrc)raw[raw.length-1]^=1;return raw;
}
export function packageRecord(model,raw=makePackage(model),extra={}){const digest=hash(raw);return{product:`SMK-37 ${model==='elite'?'Elite':'Pro'}_900`,sha256:digest,size:raw.length,pkg:`https://example.invalid/${digest}/${model}.fwsc`,controller_strategy:'bundled',controller_size:4096,controller_sha256:hash(makeController()),...extra};}
export function catalogFor(models){return{schema:1,latest:'synthetic-bundled',history:[],versions:[{version:'synthetic-bundled',label:'DEV / HARDWARE TEST — DEVICE NOT TESTED',status:'dev-checked',config:'dev',hardware_tested:false,source_commit:'1'.repeat(40),source_tree:'2'.repeat(40),models}]};}
export function writeFixtures(dir){mkdirSync(dir,{recursive:true});const manifest={};for(const model of['elite','pro']){for(const[kind,opts]of Object.entries({bundled:{},blank:{controller:null},'app-crc':{appCrc:true},'outer-crc':{outerCrc:true},tail:{tail:true},abi:{controller:makeController(b=>u32(b,20,1))},'ctl-crc':{controller:Buffer.from(makeController())},'no-map':{noMap:true}})){if(kind==='ctl-crc')opts.controller[100]^=1;const b=makePackage(model,opts),name=`${model}-${kind}.fwsc`;writeFileSync(join(dir,name),b);manifest[name]=packageRecord(model,b);}}writeFileSync(join(dir,'controller.img'),makeController());writeFileSync(join(dir,'manifest.json'),JSON.stringify(manifest));return manifest;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv[2]!=='--dir'||!process.argv[3])throw Error('test fixture generator --dir TEMP_DIRECTORY');writeFixtures(process.argv[3]);}
