import fs from'node:fs';import assert from'node:assert/strict';import{pathToFileURL,fileURLToPath}from'node:url';import{resolve}from'node:path';
const base=new URL('../../web/product-site/remote/',import.meta.url);let bootId=0;
class Node {
 constructor(id=''){Object.assign(this,{id,handlers:{},dataset:{},style:{setProperty(){}},innerHTML:'',textContent:'',value:'',scrollLeft:0,scrollTop:0,clientHeight:300,disabled:false,captured:new Set(),attributes:{},hidden:false});this.classList={toggle:()=>false};}
 addEventListener(type,fn){(this.handlers[type]??=[]).push(fn)}
 removeEventListener(type,fn){this.handlers[type]=(this.handlers[type]??[]).filter(x=>x!==fn)}
 emit(type,e){for(const fn of this.handlers[type]??[])fn(e)}
 setAttribute(k,v){this.attributes[k]=v} removeAttribute(k){delete this.attributes[k]}
 setPointerCapture(p){this.captured.add(p)} hasPointerCapture(p){return this.captured.has(p)} releasePointerCapture(p){this.captured.delete(p)}
 getBoundingClientRect(){return{left:0,top:0,width:100,height:100}}
 closest(s){if(s==='button')return this;const m=s.match(/^\[data-(note|select|param|edge)\]$/);return m&&this.dataset[m[1]]!==undefined?this:null}
 querySelector(s){if(s==='span')return(this.span??=new Node());const m=s.match(/^\[data-(note|select)="([^"]+)"\]$/);if(m){const n=new Node();n.dataset[m[1]]=m[2];return n}return null}
 focus(){document.activeElement=this} showModal(){this.open=true} close(){this.open=false;this.onclose?.()}
}
async function boot(){
let downloaded=null;globalThis.URL.createObjectURL=b=>{downloaded=b;return'blob:source-event-double'};globalThis.URL.revokeObjectURL=()=>{};globalThis.setTimeout=()=>0;const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Node(id));return nodes.get(id)};
const views=['roll','drums','locks','sound','mix','patterns','song','files'].map(v=>Object.assign(new Node(),{dataset:{view:v}})),modes=['select','move','draw','length','pan'].map(v=>Object.assign(new Node(),{dataset:{mode:v}}));
const documentListeners={};
globalThis.document={createElement:()=>({click(){}}),activeElement:null,getElementById:get,querySelectorAll:s=>s==='[data-view]'?views:s==='[data-mode]'?modes:[],querySelector:()=>new Node(),addEventListener(t,f){(documentListeners[t]??=[]).push(f)}};
const windowListeners={};globalThis.window={addEventListener(t,f){(windowListeners[t]??=[]).push(f)}};
globalThis.fetch=async p=>({ok:true,text:async()=>fs.readFileSync(new URL(p,base),'utf8'),json:async()=>JSON.parse(fs.readFileSync(new URL(p,base),'utf8'))});
get('zoom').value='1';get('lane-kind').value='velocity';get('part').value='chicago';get('part').selectedOptions=[{textContent:'Bass A Chicago'}];
await import(new URL('app.mjs?correctionProbe='+(bootId++),base));
const view=v=>views.find(x=>x.dataset.view===v).onclick();
const changePart=(v,label=v)=>{get('part').value=v;get('part').selectedOptions=[{textContent:label}];get('part').onchange()};
const press=id=>get(id).onclick();
return{get,view,changePart,press,windowListeners,documentListeners,download:async()=>downloaded?.text()};}

import test from 'node:test';
import{createMasterDraft}from'../../web/product-site/remote/master-draft.mjs';
const components=JSON.parse(fs.readFileSync(new URL('components.json',base))),catalog=JSON.parse(fs.readFileSync(new URL('catalog.json',base))),master=createMasterDraft(components,catalog);
const target=id=>Object.assign(new Node(),{dataset:{param:id}});
const key=(x,id,key='ArrowUp')=>x.get('other-view').emit('keydown',{target:target(id),key,preventDefault(){}});
const review=x=>{x.press('review');return x.get('changes').textContent};
const save=async x=>{x.press('draft-save');return await x.download()};
const open=async(x,text)=>{await x.get('draft-file').onchange({target:{files:[{size:Buffer.byteLength(text),text:async()=>text}]}})};
test('actual app shows12 source-qualified More units, keeps COMP distinct from GLUE and commits coherent macro group in one history command',async()=>{
 const x=await boot();x.view('mix');let html=x.get('other-view').innerHTML;assert.equal((html.match(/data-master-control=/g)||[]).length,12);assert.match(html,/>Glue<\/span>/);assert.match(html,/>COMP<\/span>/);
 const before=JSON.parse(await save(x));key(x,master.id(6,12));const changed=JSON.parse(await save(x));const values=new Map(changed.parameters.map(p=>[p.id,p.value])),map=master.macros[96];for(const[p,v]of[[0,map[0]],[1,map[1]],[4,map[2]],[12,96]])assert.equal(master.read(master.id(6,p),values),v);assert.match(review(x),/Master · Threshold/);
 x.press('undo');assert.deepEqual(JSON.parse(await save(x)),before);x.press('redo');assert.deepEqual(JSON.parse(await save(x)),changed);
 key(x,master.id(6,0));const override=JSON.parse(await save(x));assert.equal(master.read(master.id(6,12),new Map(override.parameters.map(p=>[p.id,p.value]))),96);
 const y=await boot();await open(y,JSON.stringify(override));assert.equal(y.get('draft-replace').disabled,false);y.press('draft-replace');assert.deepEqual(JSON.parse(await save(y)),override);
});
test('actual app macro drag cancel restores exact Draft bytes and no history, direct detail formatter follows pinned source',async()=>{
 const x=await boot();x.view('mix');const before=await save(x),t=target(master.id(6,12)),e={target:t,button:0,pointerId:42,clientX:0,clientY:80,preventDefault(){}};
 x.get('other-view').emit('pointerdown',e);x.get('other-view').emit('pointermove',{...e,clientX:30});assert.ok(Number(x.get('parameter-value').value)>95);x.get('other-view').emit('pointercancel',e);assert.equal(await save(x),before);assert.equal(x.get('undo').disabled,true);
 key(x,master.id(6,1));assert.equal(x.get('parameter-readout').textContent,'6:1');assert.match(review(x),/4:1 → 6:1/);x.press('undo');assert.equal(review(x),'No changes.');
});
test('legacy exact-identity Draft imports derive macro mirrors; unknown/alias-conflicting/partial pinned snapshots reject before replacement',async()=>{
 const x=await boot();x.view('mix');const legacy=JSON.parse(await save(x)),alias=master.aliases(master.id(6,12)).find(id=>id.includes('|'));legacy.parameters=[{id:alias,value:0}];await open(x,JSON.stringify(legacy));assert.equal(x.get('draft-replace').disabled,false);x.press('draft-replace');const accepted=JSON.parse(await save(x)),snapshot=await save(x);assert.equal(master.read(master.id(6,1),new Map(accepted.parameters.map(p=>[p.id,p.value]))),0);
 for(const parameters of[[...accepted.parameters,{id:alias,value:127}],[{id:'source-master/unknown/6/0/1',value:0}],[{id:master.id(6,1),value:3}]]){await open(x,JSON.stringify({...accepted,parameters}));assert.equal(x.get('draft-replace').disabled,true);assert.match(x.get('draft-preview').textContent,/Local draft|Master|Duplicate/);x.press('draft-cancel');assert.equal(await save(x),snapshot);}
});
test('keyboard edit during a Master drag cancels the preview before committing a separate scalar',async()=>{const x=await boot();x.view('mix');const e={target:target(master.id(6,12)),button:0,pointerId:91,clientX:0,clientY:80,preventDefault(){}};x.get('other-view').emit('pointerdown',e);x.get('other-view').emit('pointermove',{...e,clientX:30});key(x,master.id(4,3));x.get('other-view').emit('pointercancel',e);const saved=JSON.parse(await save(x)),values=new Map(saved.parameters.map(p=>[p.id,p.value]));assert.equal(master.read(master.id(4,3),values),1);assert.equal(master.read(master.id(6,12),values),95);x.press('undo');assert.equal(review(x),'No changes.');});
import{createHash}from'node:crypto';
test('actual original ce667 edit Undo exports import without fabricated Master changes or history',async()=>{for(const kind of['comp95','filter64']){const fixtures=new URL('./fixtures/legacy-ce667-master/',import.meta.url),bytes=fs.readFileSync(new URL(kind+'-after-undo.json',fixtures)),provenance=JSON.parse(fs.readFileSync(new URL(kind+'-provenance.json',fixtures)));assert.equal(createHash('sha256').update(bytes).digest('hex'),provenance.sha256);assert.equal(provenance.sourceRef,'ce6675f7da84ce9042ebd678d892b329490f0585');assert.equal(provenance.review,'No changes.');assert.equal(provenance.projectsSoundEdits,0);const x=await boot();await open(x,bytes.toString());assert.equal(x.get('draft-replace').disabled,false);x.press('draft-replace');assert.equal(review(x),'No changes.');assert.equal(x.get('undo').disabled,true);assert.equal(x.get('redo').disabled,true);const decoded=JSON.parse(await save(x)),legacy=JSON.parse(bytes);for(const spec of master.specs)assert.equal(master.read(spec.id,new Map(decoded.parameters.map(p=>[p.id,p.value]))),spec.value);assert.deepEqual({...decoded,parameters:[]},{...legacy,parameters:[]});x.view('files');assert.match(x.get('other-view').innerHTML,/0 sound edits/);}});
