// SPDX-License-Identifier: GPL-3.0-only
// Execute actual metadata rendering. Synthetic DOM/data only, no navigation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
const source=readFileSync(process.argv[2]||new URL('../web/x0x_installer.html',import.meta.url),'utf8');
const start=source.indexOf('function renderBuildInfo(v,p) {');
const render=source.slice(start,source.indexOf('\nasync function sha256Hex',start));
const first=source.indexOf('function evidenceUrl(value) {');
const helper=first<0?'':source.slice(first,source.indexOf('\nfunction buildBadge',first));
const element=()=>({children:[],hidden:false,append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},removeAttribute(name){delete this[name];}});
let checked=0;
for(const value of ['javascript:alert(1)','data:text/html,bad','http://example.org/evidence','https://user:password@example.org/evidence','not a URL',null,'https://github.com/gobbajogger/X0X37-for-Loopy-Pro/pull/103#issuecomment-1']){
 const safe=typeof value==='string'&&value.startsWith('https://github.com/');
 const elems={};const ctx={URL,$:id=>elems[id]||=element(),catalogLive:{latest:null},catalog:{history:[{id:'source-only',url:value}]},
 versions:()=>[],availableModels:()=>[],buildBadge:()=>element(),t:k=>k,updateInstallGate(){},document:{createElement:()=>element()}};
 new Script(helper+'\n'+render+'\nglobalThis.info=renderBuildInfo;globalThis.history=renderBuildHistory;').runInNewContext(ctx);
 ctx.$('buildevidence').href='https://stale.example/evidence';
 ctx.info({version:'source-only',evidence_url:value},{sha256:'a'.repeat(64)});
 assert.equal(ctx.$('buildevidence').hidden,!safe,String(value));
 assert.equal(ctx.$('buildevidence').href,safe?value:undefined,'stale/unsafe evidence href');
 ctx.history();const article=ctx.$('buildhistory').children.at(-1);
 const links=article.children.filter(x=>x.target==='_blank');
 assert.equal(links.length,safe?1:0,'unsafe read-only history link');
 if(safe)assert.equal(links[0].href,value);
 checked++;
}
console.log(`PASS: ${checked} actual-source evidence/history navigation cases; HTTPS fragments retained`);
