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
const data=JSON.parse(fs.readFileSync(new URL('source-sounds.json',base),'utf8'));
const idOf=(group,c)=>'source-sound/'+group.bank+'/'+group.bassSlot+'|'+[c.kind,c.target,c.voice,c.parameter,c.sourceBank].join(':');
function nativeInput(id,value,occurrence){return Object.assign(new Node(),{value:String(value),dataset:{nativeParam:id,param:id,...(occurrence===undefined?{}:{paramOccurrence:String(occurrence)})}})}
function input(x,t,type='input'){x.get('other-view').emit(type,{target:t})}
function changes(x){x.press('review');return x.get('changes').textContent}
test('FunkyBeats synth input commits one raw draft and supports shared Undo/Redo',async()=>{
 const x=await boot();x.view('sound');
 const g=data.contexts.find(g=>g.bank==='CHICAGO'&&g.bassSlot===0),c=g.controls.find(c=>c.name.toUpperCase()==='WAVE'),id=idOf(g,c),next=c.raw<c.max?c.raw+1:c.raw-1,t=nativeInput(id,next);
 assert.match(x.get('other-view').innerHTML,/funkybeats-typed-param/);
 input(x,t);input(x,t,'change');assert.notEqual(changes(x),'No changes.');
 x.press('undo');assert.equal(changes(x),'No changes.');x.press('redo');assert.notEqual(changes(x),'No changes.');
});
test('FunkyBeats mixer fader commits its source-domain value without firmware access',async()=>{
 const x=await boot();x.view('mix');assert.equal((x.get('other-view').innerHTML.match(/class="mixer-fader"/g)||[]).length,5);
 const components=JSON.parse(fs.readFileSync(new URL('components.json',base),'utf8')),screen=components.screens.find(s=>s.path.endsWith('/mix-parts-live.svg')),c=screen.controls[0],id=screen.path+'|'+c.identity;
 const m=x.get('other-view').innerHTML.match(/class="mixer-fader"[^>]*value="(\d+)"/);assert.ok(m);const before=Number(m[1]),t=nativeInput(id,before===127?126:before+1,0);
 input(x,t);input(x,t,'change');assert.notEqual(changes(x),'No changes.');x.press('undo');assert.equal(changes(x),'No changes.');
});
test('FunkyBeats native preview is cancelled when navigation interrupts editing',async()=>{
 const x=await boot();x.changePart('chicago');x.view('sound');const g=data.contexts.find(g=>g.bank==='CHICAGO'&&g.bassSlot===0),c=g.controls.find(c=>c.name.toUpperCase()==='WAVE'),t=nativeInput(idOf(g,c),c.raw<c.max?c.raw+1:c.raw-1);
 input(x,t);x.view('patterns');assert.equal(Number(t.value),c.raw);assert.equal(changes(x),'No changes.');assert.equal((x.get('other-view').innerHTML.match(/data-launch-part=/g)||[]).length,32);assert.match(x.get('other-view').innerHTML,/data-launch-part="2"/);
});
test('owner visual corrections: sound uses concise heading and captured units; projects show real local work actions',async()=>{
 const x=await boot();x.view('sound');assert.doesNotMatch(x.get('other-view').innerHTML,/local bank preview/i);assert.match(x.get('other-view').innerHTML,/14 %/);
 x.view('files');assert.match(x.get('other-view').innerHTML,/data-project-action="save"/);assert.match(x.get('other-view').innerHTML,/data-project-action="open"/);assert.match(x.get('other-view').innerHTML,/notes/);
});
test('owner visual corrections: Mix has labeled controls instead of captured CPU telemetry',async()=>{
 const x=await boot();x.view('mix');assert.doesNotMatch(x.get('other-view').innerHTML,/CPU/);assert.match(x.get('other-view').innerHTML,/Master/);assert.equal((x.get('other-view').innerHTML.match(/class="mixer-fader"/g)||[]).length,5);
});
test('Mix family retains all28 captured native controls across reachable modes',async()=>{
 const x=await boot();x.view('mix');let html='';for(const mode of['levels','pan','sends','fx']){const target=Object.assign(new Node(),{dataset:{mixMode:mode}});x.get('other-view').emit('click',{target});html+=x.get('other-view').innerHTML;}
 const screens=JSON.parse(fs.readFileSync(new URL('components.json',base),'utf8')).screens.filter(s=>/\/(mix-parts-live|mix-master|fx-reverb-direct|fx-delay-direct)\.svg$/.test(s.path));
 const expected=new Set(screens.flatMap(s=>s.controls.map(c=>c.identity))),actual=new Set([...html.matchAll(/data-(?:native-param|param)="[^"|]+\|([^"]+)"/g)].map(m=>m[1]));assert.equal(expected.size,28);assert.deepEqual(actual,expected);
 for(let voice=0;voice<5;voice++)for(const param of[1,2])assert.ok(html.includes('fx-reverb-direct.svg|1:5:'+voice+':'+param));
});
test('rendered parameter inspector supplies the span dereferenced by edits',async()=>{
 const x=await boot();let inserted='';x.get('other-view').insertAdjacentHTML=(_,html)=>{inserted=html};x.view('mix');assert.match(inserted,/<label><span><\/span><output id="parameter-readout"/);
 x.get('parameter-inspector').querySelector=s=>s==='span'&&inserted.includes('<span></span>')?new Node():null;
 const id='current-state-and-reference/mix-master.svg|1:4:0:2',target=Object.assign(new Node(),{dataset:{param:id}});
 assert.doesNotThrow(()=>x.get('other-view').emit('keydown',{target,key:'ArrowUp',preventDefault(){}}));
});
test('touch pointerup commits before lost capture; later change is one Undo',async()=>{
 const x=await boot();x.view('mix');const id='current-state-and-reference/mix-parts-live.svg|1:5:0:0',t=nativeInput(id,90,0);
 input(x,t);x.get('other-view').emit('pointerup',{target:t,pointerId:7});x.get('other-view').emit('lostpointercapture',{target:t,pointerId:7});input(x,t,'change');assert.match(changes(x),/90/);x.press('undo');assert.equal(changes(x),'No changes.');
});
test('cancelled native touch keeps baseline and creates no Undo',async()=>{
 const x=await boot();x.view('mix');const id='current-state-and-reference/mix-parts-live.svg|1:5:0:0',t=nativeInput(id,90,0);input(x,t);x.get('other-view').emit('pointercancel',{target:t,pointerId:8});assert.equal(Number(t.value),75);assert.equal(changes(x),'No changes.');assert.equal(x.get('undo').disabled,true);
});
test('generic alias drag after normalized edit stays coherent and Undo restores previous value',async()=>{
 const x=await boot();x.view('mix');const id='current-state-and-reference/mix-parts-live.svg|1:5:0:1',native=nativeInput(id,20,7);input(x,native);input(x,native,'change');const original=changes(x);const target=Object.assign(new Node(),{dataset:{param:id,paramOccurrence:'7'}}),e={target,button:0,pointerId:28,clientX:0,clientY:50,preventDefault(){}};
 x.get('other-view').emit('pointerdown',e);x.get('other-view').emit('pointermove',{...e,clientX:25});x.get('other-view').emit('pointerup',e);assert.notEqual(changes(x),original);x.press('undo');assert.equal(changes(x),original);
 x.get('other-view').emit('pointerdown',{...e,pointerId:29});x.get('other-view').emit('pointermove',{...e,pointerId:29,clientX:25});x.get('other-view').emit('pointercancel',{...e,pointerId:29});assert.equal(changes(x),original);
});

test('edited Chicago and Miami percentage controls keep units and accessible values on both basses', async () => {
 const cases = [
  ['CHICAGO', 1, 18, '14 %', '15 %'],
  ['CHICAGO', 2, 32, '25 %', '26 %'],
  ['MIAMI', 1, 115, '91 %', '91 %'],
  ['MIAMI', 8, 70, '55 %', '56 %'],
 ];
 for (const [slot, part] of ['chicago', 'miami'].entries()) {
  for (const [bank, parameter, raw, initial, edited] of cases) {
   const app = await boot();
   app.changePart(part);
   app.view('sound');
   const picker = app.get('sound-bank');
   picker.value = bank;
   input(app, picker, 'change');
   const group = data.contexts.find(g => g.bank === bank && g.bassSlot === slot);
   const control = group.controls.find(c => c.kind === 1 && c.parameter === parameter);
   assert.equal(control.raw, raw);
   const id = idOf(group, control);
   const prefix = 'BASS '+(slot ? 'B' : 'A')+' / '+bank+' / '+control.sourceSection+' · '+control.name+', ';
   const target = Object.assign(new Node(), {dataset: {param: id}});
   const out = Object.assign(new Node(), {dataset: {paramValue: id}});
   const query = document.querySelectorAll;
   document.querySelectorAll = selector => {
    if (selector === '[data-param]') return [target];
    if (selector === '[data-param-value]') return [out];
    return query(selector);
   };
   const key = key => app.get('other-view').emit('keydown', {target, key, preventDefault() {}});
   const card = value => {
    const markup = app.get('other-view').innerHTML;
    assert.ok(markup.includes('data-param="'+id+'" aria-label="'+prefix+value+', local draft"'), id);
    assert.ok(markup.includes('<output data-param-value="'+id+'">'+value+'</output>'), id);
   };
   const live = (value, pot) => {
    assert.equal(target.attributes['aria-label'], prefix+value+', local draft');
    assert.equal(out.textContent, value);
    assert.equal(app.get('parameter-readout').textContent, value);
    assert.equal(Number(app.get('parameter-value').value), pot);
   };
   card(initial);
   key('ArrowUp');
   live(edited, raw+1);
   app.press('undo');
   card(initial);
   live(initial, raw);
   app.press('redo');
   card(edited);
   live(edited, raw+1);
  }
 }
});
