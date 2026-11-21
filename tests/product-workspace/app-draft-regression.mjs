import{createMasterDraft}from'../../web/product-site/remote/master-draft.mjs';
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

const event=(target,pointerId=1,extra={})=>({target,pointerId,button:0,clientX:0,clientY:40,preventDefault(){},...extra});
function review(x){x.press('review');return x.get('changes').textContent}
function drive(x,id=8,dx=14){x.view('mix');const controls=JSON.parse(fs.readFileSync(new URL('components.json',base),'utf8')).screens.find(s=>s.path.endsWith('/mix-master.svg')).controls;const target=Object.assign(new Node(),{dataset:{param:'current-state-and-reference/mix-master.svg|1:4:0:2',paramOccurrence:String(controls.findIndex(c=>c.identity==='1:4:0:2'))}});x.get('other-view').emit('pointerdown',event(target,id));const before=Number(x.get('parameter-value').value);x.get('other-view').emit('pointermove',event(target,id,{clientX:dx}));x.get('other-view').emit('pointerup',event(target,id));return{before,after:Number(x.get('parameter-value').value),target}}
function motion(x,id=9){x.view('locks');const n=x.get('motion-grid'),e=event(n,id,{clientX:10,clientY:50});n.onpointerdown(e);n.onpointerup(e)}
function song(x){x.view('patterns');for(let p=0;p<5;p++){const t=Object.assign(new Node(),{dataset:{launchPart:String(p),pattern:String(p+1)}});x.get('other-view').emit('click',{target:t})}x.view('song');x.get('other-view').emit('click',{target:new Node('song-add')})}

const x=await boot();
// Actual shipped app code runs against event doubles, not a rendered DOM or touch browser.
drive(x);motion(x);song(x);x.changePart('chicago','Bass A');x.view('sound');
const bank=Object.assign(new Node('sound-bank'),{value:'MIAMI'});x.get('other-view').emit('change',{target:bank});
assert.match(x.get('other-view').innerHTML,/Sound · Bass A \/ MIAMI/);assert.match(x.get('other-view').innerHTML,/<h3>CARRIER<\/h3>/);assert.match(x.get('other-view').innerHTML,/<h3>XMOD<\/h3>/);
const sound=JSON.parse(fs.readFileSync(new URL('source-sounds.json',base))).contexts.find(c=>c.bank==='MIAMI'&&c.bassSlot===0).controls.find(c=>c.kind===1&&c.sourceSection==='XMOD'&&c.name==='WAVE'),id='source-sound/MIAMI/0|'+[sound.kind,sound.target,sound.voice,sound.parameter,sound.sourceBank].join(':');
const t=Object.assign(new Node(),{dataset:{param:id}});x.get('other-view').emit('pointerdown',event(t,71));x.get('other-view').emit('pointerup',event(t,71));x.get('parameter-value').value=String(sound.raw===127?126:sound.raw+1);x.get('parameter-value').onchange();assert.match(review(x),/MIAMI \/ XMOD.*WAVE/);
x.press('draft-save');const text=await x.download();assert.ok(text);const doc=JSON.parse(text);const master=createMasterDraft(JSON.parse(fs.readFileSync(new URL('components.json',base))),JSON.parse(fs.readFileSync(new URL('catalog.json',base))));const expectedMasterIDs=new Set(master.specs.flatMap(c=>c.ids));assert.equal(expectedMasterIDs.size,22);assert.equal(doc.parameters.length,23);assert.deepEqual(new Set(doc.parameters.filter(p=>master.has(p.id)).map(p=>p.id)),expectedMasterIDs);assert.equal(doc.parameters.filter(p=>!master.has(p.id)).length,1);assert.equal(doc.song.length,1);assert.ok(doc.motion.values.some(v=>v!==null));assert.equal(doc.soundBanks[0],'MIAMI');assert.match(x.get('status').textContent,/Download requested/);assert.equal(doc.context.view,'sound');const before=review(x);
x.press('undo');assert.notEqual(review(x),before);x.press('undo');assert.notEqual(review(x),before);
await x.get('draft-file').onchange({target:{files:[{size:Buffer.byteLength(text),text:async()=>text}]}});assert.equal(x.get('draft-dialog').open,true);assert.notEqual(review(x),before);x.press('draft-replace');assert.equal(review(x),before);assert.equal(x.get('undo').disabled,true);assert.equal(x.get('redo').disabled,true);assert.equal(x.get('part').value,'chicago');assert.match(x.get('other-view').innerHTML,/Sound · Bass A \/ MIAMI/);
// New edits after restore participate in a fresh timeline and Undo returns to restored local data.
x.view('mix');const value=drive(x,90).after;x.press('undo');assert.equal(review(x),before);x.press('redo');assert.ok(review(x).includes('Drive'));
// Actual app and draft-file lifecycle listeners both run, so a hidden page cannot revive a pending import.
x.press('draft-save');const lifecycleText=await x.download();let resolveFile;
const pendingRead=x.get('draft-file').onchange({target:{files:[{size:Buffer.byteLength(lifecycleText),text:()=>new Promise(r=>resolveFile=r)}]}});
for(const fn of x.windowListeners.pagehide??[])fn({persisted:true});resolveFile(lifecycleText);await pendingRead;
assert.equal(x.get('draft-dialog').open,false);assert.equal(x.get('draft-replace').disabled,true);
for(const fn of x.windowListeners.pageshow??[])fn({persisted:true});
await x.get('draft-file').onchange({target:{files:[{size:Buffer.byteLength(lifecycleText),text:async()=>lifecycleText}]}});
assert.equal(x.get('draft-dialog').open,true);x.press('draft-cancel');
console.log('PASS actual shipped app deferred-file pagehide cancellation and new selection after pageshow; source event doubles, NOT browser/BFCache proof');
console.log('PASS shipped app multi-domain draft download/open/replace, context, history reset and new Undo/Redo; event doubles only, NOT DOM/browser/touch/download filesystem');
// Projects cards dispatch to the same verified download/import lifecycle.
const projects=await boot();drive(projects);projects.view('files');
const action=name=>projects.get('other-view').emit('click',{target:{closest:s=>s==='button'?{dataset:{projectAction:name}}:null}});
projects.get('draft-save').click=()=>projects.press('draft-save');projects.get('review').click=()=>projects.press('review');
let pickerOpened=0;projects.get('draft-file').click=()=>pickerOpened++;
action('save');const saved=await projects.download();assert.ok(saved);assert.ok(JSON.parse(saved).parameters.length);assert.match(projects.get('status').textContent,/Download requested/);
action('review');const savedChanges=projects.get('changes').textContent;assert.match(savedChanges,/Drive/);
projects.press('undo');action('open');assert.equal(pickerOpened,1);
await projects.get('draft-file').onchange({target:{files:[{size:Buffer.byteLength(saved),text:async()=>saved}]}});assert.equal(projects.get('draft-dialog').open,true);projects.press('draft-replace');action('review');assert.equal(projects.get('changes').textContent,savedChanges);
console.log('PASS Projects card clicks dispatch Save/Open/Review and round-trip edited draft; event doubles, not browser file-picker proof');
const viewportDraft=await boot();viewportDraft.get('roll-scroll').clientWidth=700;viewportDraft.get('zoom').value='2';viewportDraft.get('zoom').oninput();
const viewportWidth=viewportDraft.get('roll-grid').style.width;assert.equal(viewportWidth,'1400px');viewportDraft.press('draft-save');const viewportText=await viewportDraft.download();
viewportDraft.get('zoom').value='1';viewportDraft.get('zoom').oninput();await viewportDraft.get('draft-file').onchange({target:{files:[{size:Buffer.byteLength(viewportText),text:async()=>viewportText}]}});viewportDraft.press('draft-replace');
assert.equal(viewportDraft.get('roll-grid').style.width,viewportWidth,'Restored zoom uses actual viewport basis');
console.log('PASS draft zoom roundtrip retains narrow viewport geometry');
const legacyTool=JSON.parse(viewportText);legacyTool.context.mode='pan';const legacyText=JSON.stringify(legacyTool);
await viewportDraft.get('draft-file').onchange({target:{files:[{size:Buffer.byteLength(legacyText),text:async()=>legacyText}]}});viewportDraft.press('draft-replace');viewportDraft.press('draft-save');
assert.equal(JSON.parse(await viewportDraft.download()).context.mode,'auto','Legacy draft tool modes normalize to modeless interaction');
// Grouped per-step controls exercise the actual app listeners and serialized drafts.
const laneApp=await boot();
const snapshot=async()=>{laneApp.press('draft-save');return JSON.parse(await laneApp.download())};
const laneBefore=await snapshot(),laneTrace=JSON.parse(fs.readFileSync(new URL('trace.json',base))),first=laneBefore.notes.find(n=>n.track==='chicago');
const {stepGroups}=await import(new URL('step-lane.mjs',base));
const stepGroup=stepGroups(laneBefore.notes.filter(n=>n.track==='chicago'),laneTrace.endSample).find(g=>g.notes.some(n=>n.id===first.id));
const stepTarget={dataset:{laneStep:String(stepGroup.step)},closest(s){return s==='[data-lane-step]'?this:null}};
const velocity=laneApp.get('velocity');velocity.emit('pointerdown',event(stepTarget,201,{clientY:10}));velocity.emit('pointerup',event(stepTarget,201));
const laneAfter=await snapshot(),changedIds=new Set(stepGroup.notes.map(n=>n.id));
for(const n of laneAfter.notes){const old=laneBefore.notes.find(o=>o.id===n.id);if(changedIds.has(n.id))assert.equal(n.velocity,127);else assert.deepEqual(n,old)}
laneApp.press('undo');assert.deepEqual((await snapshot()).notes,laneBefore.notes);
velocity.emit('pointerdown',event(stepTarget,202,{clientY:10}));velocity.emit('pointerdown',event(stepTarget,203,{clientY:90}));velocity.emit('pointerup',event(stepTarget,202));velocity.emit('pointerup',event(stepTarget,203));assert.deepEqual((await snapshot()).notes,laneBefore.notes);assert.equal(velocity.captured.size,0);
for(const kit of['drum909','drum808']){laneApp.changePart(kit);laneApp.view('drums');assert.match(laneApp.get('other-view').innerHTML,/id="drum-lane"/);assert.equal((laneApp.get('other-view').innerHTML.match(/data-lane-step=/g)||[]).length,16)}
console.log('PASS actual app grouped step edits, one Undo, multi-touch rollback, capture cleanup and both drum lanes; event doubles, not browser proof');
laneApp.changePart('chicago');laneApp.view('roll');
const crossBefore=(await snapshot()).notes,rollTarget=Object.assign(new Node(),{dataset:{note:first.id}}),rollSurface=laneApp.get('roll-scroll');
for(const rollFirst of[true,false]){
 const rollEvent=event(rollTarget,301,{clientX:20,clientY:30,timeStamp:1000}),laneEvent=event(stepTarget,302,{clientY:10,timeStamp:1001});
 if(rollFirst){rollSurface.emit('pointerdown',rollEvent);velocity.emit('pointerdown',laneEvent)}else{velocity.emit('pointerdown',laneEvent);rollSurface.emit('pointerdown',rollEvent)}
 rollSurface.emit('pointerup',rollEvent);velocity.emit('pointerup',laneEvent);
 assert.deepEqual((await snapshot()).notes,crossBefore);assert.equal(velocity.captured.size,0);assert.equal(rollSurface.captured.size,0);
 velocity.emit('pointerdown',event(stepTarget,303,{clientY:10}));velocity.emit('pointerup',event(stepTarget,303));assert.notDeepEqual((await snapshot()).notes,crossBefore);laneApp.press('undo');assert.deepEqual((await snapshot()).notes,crossBefore);
}
console.log('PASS actual app cross-surface roll/lane touches cancel both ways and next edit/Undo remains available');

const capacityApp = await boot();
capacityApp.press('draft-save');
const capacityDraft = JSON.parse(await capacityApp.download());
const patterns = [0, 1, 15, 30, 31];
capacityDraft.song = Array.from({length: 1023}, () => ({patterns, repeats: 8, muteMask: 10}));
capacityDraft.launch = patterns;
capacityDraft.context.view = 'song';
const capacityText = JSON.stringify(capacityDraft);
await capacityApp.get('draft-file').onchange({target: {files: [{
 size: Buffer.byteLength(capacityText), text: async () => capacityText,
}]}});
capacityApp.press('draft-replace');
const songPanel = capacityApp.get('other-view');
const addDisabled = () => songPanel.innerHTML.includes('id="song-add" disabled');
const addRow = () => songPanel.emit('click', {target: new Node('song-add')});
async function savedRows() {
 capacityApp.press('draft-save');
 return JSON.parse(await capacityApp.download()).song.length;
}
assert.equal(addDisabled(), false);
addRow();
assert.equal(addDisabled(), true);
assert.equal(await savedRows(), 1024);
addRow(); // Exercise the delegated handler even with a synthetic click on a full Song.
capacityApp.press('undo');
assert.equal(await savedRows(), 1023);
assert.equal(addDisabled(), false);
assert.equal(capacityApp.get('undo').disabled, true);
capacityApp.press('redo');
assert.equal(await savedRows(), 1024);
assert.equal(addDisabled(), true);
console.log('PASS Song row limit, global Undo/Redo and Draft save at capacity');

async function kitAccentDrafts(){
 const app=await boot(),screens=JSON.parse(fs.readFileSync(new URL('components.json',base))).screens;
 const save=async()=>{app.press('draft-save');return JSON.parse(await app.download());};
 const load=async doc=>{
  const text=JSON.stringify(doc);
  await app.get('draft-file').onchange({target:{files:[{size:Buffer.byteLength(text),text:async()=>text}]}});
  app.press('draft-replace');
 };
 const fresh=await save();
 const catalog=JSON.parse(fs.readFileSync(new URL('catalog.json',base))).controls;
 const field=app.get('parameter-value');
 for(const [target,kit] of ['909','808'].entries()){
  const entries=screens.filter(s=>s.successor?.sourceVoice?.kit===target);
  const address='1:'+target+':11:1';
  const keys=entries.map(s=>s.path+'|'+address);
  assert.equal(keys.length,11);
  const descriptor=catalog.find(c=>c.target===target&&c.voice===11&&c.parameter===1&&c.kind==='U32');
  assert.deepEqual([descriptor.id,descriptor.voiceLabel,descriptor.label,descriptor.min,descriptor.max],
   [target===0?354:738,'KIT',target===0?'Veloc':'Accent',0,127]);
  assert.ok(entries.every(screen=>screen.successor.sourceVoice.pages.some(page=>page.title==='KIT'&&page.controls.some(c=>c.kind===1&&c.a===target&&c.b===11&&c.id===1))));
  const open=voice=>{
   app.changePart('drum'+kit,kit);app.view('sound');
   app.get('other-view').emit('change',{target:Object.assign(new Node('sound-voice'),{value:String(voice)})});
   const index=entries[voice].controls.findIndex(c=>c.identity===address);
   const hit=Object.assign(new Node(),{dataset:{param:keys[voice],paramOccurrence:String(index)}});
   app.get('other-view').emit('pointerdown',event(hit));app.get('other-view').emit('pointerup',event(hit));
   return Number(field.value);
  };
  const edit=value=>{field.value=String(value);field.onchange();};
  await load(fresh);
  assert.equal(open(0),127);edit(100);
  assert.deepEqual(keys.map((_,i)=>open(i)),Array(11).fill(100));
  app.view('files');assert.match(app.get('other-view').innerHTML,/1 sound edits/);
  assert.equal(review(app),'Parameter · '+kit+' / KIT · '+(target===0?'Velocity':'Accent')+': 100% → 79%');
  app.press('undo');assert.equal(review(app),'No changes.');app.press('redo');
  const edited=await save();
  assert.deepEqual(edited.parameters.filter(p=>keys.includes(p.id)).map(p=>p.value),Array(11).fill(100));
  assert.deepEqual(edited.stepLanes,fresh.stepLanes);
  const imported=structuredClone(fresh);
  imported.parameters.push({id:keys[1],value:100});
  await load(imported);assert.equal(open(7),100);
  assert.deepEqual((await save()).parameters,imported.parameters);
  imported.parameters.unshift({id:keys[0],value:127});
  await load(imported);
  assert.equal(open(0),127);assert.equal(open(1),100);assert.equal(open(7),127);
  assert.match(review(app),/conflicting saved values · BD 100% \(127\/127\), SD 79% \(100\/127\)/);
  // Editing a third voice resolves the historical ambiguity. Undo restores the
  // original explicit values, their order, and the absence of other entries.
  open(7);
  const index=entries[7].controls.findIndex(c=>c.identity===address);
  const hit=Object.assign(new Node(),{dataset:{param:keys[7],paramOccurrence:String(index)}});
  app.get('other-view').emit('pointerdown',event(hit,92));
  app.get('other-view').emit('pointermove',event(hit,92,{clientX:-32}));
  assert.notEqual(Number(field.value),127);
  app.get('other-view').emit('pointercancel',event(hit,92));
  assert.deepEqual((await save()).parameters,imported.parameters);
  edit(90);assert.equal(open(0),90);assert.equal(open(1),90);
  app.press('undo');assert.deepEqual((await save()).parameters,imported.parameters);
  app.press('redo');assert.deepEqual((await save()).parameters.filter(p=>keys.includes(p.id)).map(p=>p.value),Array(11).fill(90));
  await load(edited);assert.deepEqual(keys.map((_,i)=>open(i)),Array(11).fill(100));
 }
}
await kitAccentDrafts();
console.log('PASS both kit Accent addresses share 11 voice controls, one Review entry, Undo/Redo and legacy Draft round trips');
