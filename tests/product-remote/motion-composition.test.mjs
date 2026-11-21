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
 closest(s){if(s==='button')return this;if(s==='[data-lane-step]'&&this.dataset.laneStep!==undefined)return this;const m=s.match(/^\[data-(note|select|param|edge)\]$/);return m&&this.dataset[m[1]]!==undefined?this:null}
 querySelector(s){if(s==='span')return(this.span??=new Node());const m=s.match(/^\[data-(note|select)="([^"]+)"\]$/);if(m){const n=new Node();n.dataset[m[1]]=m[2];return n}return null}
 focus(){document.activeElement=this} showModal(){this.open=true}
}
async function boot(){
const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Node(id));return nodes.get(id)};
const views=['roll','drums','locks','sound','mix','patterns','song','files'].map(v=>Object.assign(new Node(),{dataset:{view:v}})),modes=['select','move','draw','length','pan'].map(v=>Object.assign(new Node(),{dataset:{mode:v}}));
const documentListeners={};
globalThis.document={activeElement:null,getElementById:get,querySelectorAll:s=>s==='[data-view]'?views:s==='[data-mode]'?modes:[],querySelector:()=>new Node(),addEventListener(t,f){(documentListeners[t]??=[]).push(f)}};
const windowListeners={};globalThis.window={addEventListener(t,f){(windowListeners[t]??=[]).push(f)}};
globalThis.fetch=async p=>({ok:true,text:async()=>fs.readFileSync(new URL(p,base),'utf8'),json:async()=>JSON.parse(fs.readFileSync(new URL(p,base),'utf8'))});
get('zoom').value='1';get('lane-kind').value='velocity';get('part').value='chicago';get('part').selectedOptions=[{textContent:'Bass A Chicago'}];
await import(new URL('app.mjs?correctionProbe='+(bootId++),base));
const view=v=>views.find(x=>x.dataset.view===v).onclick();
const changePart=(v,label=v)=>{get('part').value=v;get('part').selectedOptions=[{textContent:label}];get('part').onchange()};
const press=id=>get(id).onclick();
return{get,view,changePart,press,windowListeners,documentListeners};}


import test from 'node:test';
test('Motion composes existing live selected-part sequence and thin lane without changing fixed target',async()=>{
 const x=await boot();x.view('locks');assert.equal(x.get('roll-view').hidden,false,'Motion must retain the real roll');assert.equal(x.get('other-view').hidden,false);assert.equal(x.get('workspace-main').dataset.layoutView,'locks');assert.match(x.get('motion-sequence-context').textContent,/Sequence.*Bass A.*CHICAGO/);assert.match(x.get('other-view').innerHTML,/Motion · MIAMI Wave/);assert.match(x.get('other-view').innerHTML,/Value <input/);
 x.changePart('miami','Bass B');assert.equal(x.get('roll-view').hidden,false);assert.match(x.get('motion-sequence-context').textContent,/Sequence.*Bass B.*MIAMI/);assert.match(x.get('other-view').innerHTML,/Motion · MIAMI Wave/);assert.ok(x.get('roll-grid').innerHTML.includes('data-note='));assert.ok(x.get('velocity').innerHTML.includes('data-lane-step='));
 x.view('sound');assert.equal(x.get('roll-view').hidden,true);assert.equal(x.get('motion-sequence-context').hidden,true);
});
test('composed Motion preserves nullable points, exact step identity and one shared history command',async()=>{
 const x=await boot();x.view('locks');x.get('motion-step').value='10';x.get('motion-step').onchange();x.get('motion-value').value='77';x.get('motion-value').onchange();x.press('review');assert.match(x.get('changes').textContent,/Motion.*Step 10: unset → 77 raw/);assert.doesNotMatch(x.get('changes').textContent,/Motion.*Step (?:[1-9]|1[1-6]):/);x.press('undo');x.press('review');assert.equal(x.get('changes').textContent,'No changes.');x.press('redo');assert.match(x.get('motion-grid').innerHTML,/Step 10, 77/);assert.equal(x.get('roll-view').hidden,false);
});
test('touch crossing from a Motion draft into the roll cancels instead of committing both',async()=>{
 const x=await boot();x.view('locks');const motion=x.get('motion-grid'),e={button:0,pointerId:70,clientX:10,clientY:50,preventDefault(){}};motion.onpointerdown(e);assert.match(motion.innerHTML,/Step 2, 64/);x.get('roll-scroll').emit('pointerdown',{...e,pointerId:71,target:x.get('roll-grid')});motion.onpointerup(e);x.press('review');assert.equal(x.get('changes').textContent,'No changes.');assert.match(motion.innerHTML,/Step 2, unset/);
});
for(const [first,second] of[['motion','lane'],['roll','motion'],['lane','motion']])test(`co-visible ${first}→${second} cancels previews and keeps only earlier Motion command`,async()=>{
 const x=await boot();x.view('locks');x.get('motion-step').value='10';x.get('motion-step').onchange();x.get('motion-value').value='77';x.get('motion-value').onchange();
 const motion=x.get('motion-grid'),roll=x.get('roll-scroll'),lane=x.get('velocity'),grid=x.get('roll-grid'),note=new Node();note.dataset.note=grid.innerHTML.match(/data-note="([^"]+)"/)[1];const cell=new Node();cell.dataset.laneStep='0';
 const event=(target,pointerId)=>({target,button:0,pointerId,clientX:1,clientY:50,preventDefault(){}}),a=event(first==='motion'?motion:first==='roll'?note:cell,81),b=event(second==='motion'?motion:cell,82);
 const begin=(surface,e)=>{if(surface==='motion')motion.onpointerdown(e);else(first==='roll'?roll:lane).emit('pointerdown',e);};
 begin(first,a);if(first==='roll')roll.emit('pointermove',{...a,clientX:95});if(second==='motion')motion.onpointerdown(b);else lane.emit('pointerdown',b);
 if(first==='motion')motion.onpointermove({...a,clientX:25});else(first==='roll'?roll:lane).emit('pointermove',{...a,clientX:90});
 if(first==='motion'){motion.onpointerup(a);if(motion.hasPointerCapture(a.pointerId))motion.releasePointerCapture(a.pointerId);}else(first==='roll'?roll:lane).emit('pointerup',a);
 if(second==='motion')motion.onpointerup(b);else lane.emit('pointerup',b);
 x.press('review');assert.match(x.get('changes').textContent,/Step 10: unset → 77 raw/);assert.doesNotMatch(x.get('changes').textContent,/Step (?:[1-9]|1[1-6]):|Notes|Velocity/);x.press('undo');x.press('review');assert.equal(x.get('changes').textContent,'No changes.');assert.equal(x.get('undo').disabled,true);x.press('redo');assert.match(motion.innerHTML,/Step 10, 77/);
});
