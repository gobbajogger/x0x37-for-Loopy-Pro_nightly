// SPDX-License-Identifier: GPL-3.0-only
// Actual original app with source-event DOM doubles; no browser/runtime qualification.
import fs from'node:fs';import assert from'node:assert/strict';import{pathToFileURL,fileURLToPath}from'node:url';import{resolve}from'node:path';
import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';
const legacyRoot=resolve(process.argv[2]??''),output=resolve(process.argv[3]??'');assert.ok(process.argv[2]&&process.argv[3],'Usage: node collect-legacy-master-draft.mjs EXACT_CE667_ROOT OUTPUT_DIR');const ref='ce6675f7da84ce9042ebd678d892b329490f0585';assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:legacyRoot,encoding:'utf8'}).trim(),ref);assert.equal(execFileSync('git',['status','--porcelain','--','web/product-site/remote'],{cwd:legacyRoot,encoding:'utf8'}).trim(),'');const base=pathToFileURL(legacyRoot+'/web/product-site/remote/');let bootId=0;const digest=b=>createHash('sha256').update(b).digest('hex');assert.equal(digest(fs.readFileSync(new URL('app.mjs',base))),'9e38e5e077ccec5c08f96c0b0150265bdd74661813c54fdfaed71d9b5ce025f1');
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

fs.mkdirSync(output,{recursive:true});
const sourceFiles=fs.readdirSync(fileURLToPath(base)).filter(n=>/\.(mjs|json)$/.test(n)).sort().map(path=>({path,sha256:digest(fs.readFileSync(new URL(path,base)))}));
for(const [name,parameter,baseline]of[['comp95',12,95],['filter64',13,64]]){
 const x=await boot();x.view('mix');const id='current-state-and-reference/mix-master.svg|1:6:0:'+parameter,target=Object.assign(new Node(),{dataset:{param:id}});x.get('other-view').emit('keydown',{target,key:'ArrowUp',preventDefault(){}});x.press('undo');x.press('review');const review=x.get('changes').textContent;assert.equal(review,'No changes.');assert.equal(x.get('undo').disabled,true);assert.equal(x.get('redo').disabled,false);x.view('files');const projects=x.get('other-view').innerHTML;assert.match(projects,/0 sound edits/);x.view('mix');x.press('draft-save');const bytes=await x.download();assert.ok(bytes);assert.deepEqual(JSON.parse(bytes).parameters,[{id,value:baseline}]);const filename=name+'-after-undo.json';fs.writeFileSync(resolve(output,filename),bytes);const provenance={schema:'dnbox-legacy-master-export-proof/1',sourceRef:ref,sourceAppSha256:'9e38e5e077ccec5c08f96c0b0150265bdd74661813c54fdfaed71d9b5ce025f1',method:'Actual original app source, source-event DOM doubles: ArrowUp macro; Undo; Review No changes; Projects 0 sound edits; original Download draft bytes. Not a browser or native test.',parameter,baseline,review,projectsSoundEdits:0,undoEnabled:false,redoEnabled:true,file:filename,bytes:Buffer.byteLength(bytes),sha256:digest(bytes),sourceFiles};fs.writeFileSync(resolve(output,name+'-provenance.json'),JSON.stringify(provenance,null,2)+'\n');console.log('LEGACY_ORIGINAL_EXPORT',name,provenance.sha256,provenance.bytes,review);
}
