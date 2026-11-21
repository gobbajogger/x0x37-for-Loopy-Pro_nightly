import test from'node:test';import assert from'node:assert/strict';import{bindDraftFiles}from'../../web/product-site/remote/draft-ui.mjs';import{WorkspaceDraftFile,hasDraftChanges}from'../../web/product-site/remote/draft-file.mjs';import{SequenceDraft,Arrangement}from'../../web/product-site/remote/sequence.mjs';import{MotionDraft}from'../../web/product-site/remote/motion.mjs';import{LaunchSelection}from'../../web/product-site/remote/workspace.mjs';import{WorkspaceTimeline}from'../../web/product-site/remote/timeline.mjs';
const trace={sampleRate:44100,endSample:100,events:[]},identity=Object.fromEntries(['trace','catalog','components','source-sounds'].map(k=>[k,'1'.repeat(64)]));
function setup(){const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,disabled:false,open:false,showModal(){this.open=true},close(){this.open=false;this.onclose?.()}});return nodes.get(id)},handlers={},window={addEventListener(k,f){handlers[k]=f}},document={getElementById:get};const codec=new WorkspaceDraftFile({trace,identity,parameters:[]}),state={model:new SequenceDraft({trace}),motion:new MotionDraft(),arrangement:new Arrangement(),launch:new LaunchSelection(),parameterDraft:new Map(),parameterIdentity:new Map(),timeline:new WorkspaceTimeline(),soundBanks:['CHICAGO','MIAMI']};let context={part:'chicago',view:'roll',mode:'select',lane:'velocity',zoom:1,selected:null,selection:[],drumVoice:0,motionSelected:0,multi:false,drumEdit:false},message='',downloads=[];bindDraftFiles({document,window,codec,state,getContext:()=>context,restoreContext:c=>{context=c},cancel:()=>{state.model.cancelAll();state.motion.cancel()},render(){},status:s=>message=s,download:text=>downloads.push(text)});return{state,codec,get,handlers,downloads,message:()=>message};}
const choose=async(a,text)=>a.get('draft-file').onchange({target:{files:[{size:new TextEncoder().encode(text).length,text:async()=>text}]}});
test('file preview/cancel never replaces current data; explicit replace restores all data with histories reset',async()=>{const a=setup();a.state.model.add({track:'chicago',note:60,start:1,end:5});a.get('draft-save').onclick();assert.equal(a.downloads.length,1);assert.match(a.message(),/requested/);assert.equal(hasDraftChanges(a.state,a.codec),true);a.state.model.add({track:'miami',note:70,start:2,end:9});await choose(a,a.downloads[0]);assert.equal(a.state.model.notes.length,2);assert.equal(a.get('draft-dialog').open,true);assert.match(a.get('draft-preview').textContent,/1 notes/);a.get('draft-cancel').onclick();assert.equal(a.state.model.notes.length,2);await choose(a,a.downloads[0]);a.get('draft-replace').onclick();assert.equal(a.state.model.notes.length,1);assert.equal(a.state.model.history.length,0);assert.equal(a.get('draft-dialog').open,false);assert.match(a.message(),/local draft/);assert.equal(a.state.model.connected,false);});
test('invalid or stale asynchronous open clears old pending import and never changes state',async()=>{const a=setup();a.get('draft-save').onclick();await choose(a,a.downloads[0]);await choose(a,'{"schema":"wrong"}');assert.equal(a.get('draft-replace').disabled,true);a.get('draft-replace').onclick();assert.equal(a.state.model.notes.length,0);let resolve;const late=new Promise(r=>resolve=r);const opening=a.get('draft-file').onchange({target:{files:[{size:100,text:()=>late}]}});await choose(a,'invalid');resolve(a.downloads[0]);await opening;assert.equal(a.get('draft-replace').disabled,true);assert.equal(a.state.model.notes.length,0);});
test('beforeunload guard follows authored content even after download request, no navigation policy bypass',()=>{const a=setup();let prevented=false,e={preventDefault(){prevented=true}};a.handlers.beforeunload(e);assert.equal(prevented,false);a.state.launch.choose(0,1);a.handlers.beforeunload(e);assert.equal(prevented,true);assert.equal(e.returnValue,'');a.get('draft-save').onclick();prevented=false;a.handlers.beforeunload(e);assert.equal(prevented,true);});
test('pagehide invalidates deferred reads and pending replacement; pageshow permits only a new file choice',async()=>{const a=setup();a.state.model.add({track:'chicago',note:60,start:1,end:5});a.get('draft-save').onclick();const saved=a.downloads[0],before=JSON.stringify(a.state.model.notes);let resolve;const reading=a.get('draft-file').onchange({target:{files:[{size:100,text:()=>new Promise(r=>resolve=r)}]}});assert.equal(typeof a.handlers.pagehide,'function');a.handlers.pagehide({persisted:true});resolve(saved);await reading;assert.equal(a.get('draft-dialog').open,false);assert.equal(a.get('draft-replace').disabled,true);a.get('draft-replace').onclick();assert.equal(JSON.stringify(a.state.model.notes),before);a.handlers.pageshow({persisted:true});await choose(a,saved);assert.equal(a.get('draft-dialog').open,true);a.handlers.pagehide({persisted:true});assert.equal(a.get('draft-dialog').open,false);assert.equal(a.get('draft-replace').disabled,true);a.handlers.pageshow({persisted:true});a.get('draft-replace').onclick();assert.equal(JSON.stringify(a.state.model.notes),before);await choose(a,saved);a.get('draft-replace').onclick();assert.equal(a.state.model.notes.length,1);assert.equal(a.state.model.history.length,0);});
test('invalid first open presents a visible nonreplaceable error without changing authored work',async()=>{const a=setup();a.state.model.add({track:'chicago',note:60,start:1,end:5});const before=JSON.stringify(a.state.model.notes);assert.equal(a.get('draft-dialog').open,false);await choose(a,'invalid');assert.equal(a.get('draft-dialog').open,true,'invalid first file must show its error, not write only to a closed dialog');assert.ok(a.get('draft-preview').textContent);assert.equal(a.get('draft-replace').disabled,true);assert.equal(JSON.stringify(a.state.model.notes),before);});

test('file controls preserve a full SuperJ6 workspace with both owners and existing notes',async()=>{
 const {SuperJ6Banks}=await import('../../web/product-site/remote/superj6-banks.mjs');
 const a=setup(), bankId='48C49B8C-8680-4366-8507-0A7D33E5CBDF', digest='a'.repeat(64);
 const values=Object.fromEntries([78,79,82,83,88,96,100,195,196,197,202,210,211].map(field=>[field,0]));
 const programs=Array.from({length:1024},(_,i)=>({
  id:'99BBC8C7-A074-4848-81DC-'+i.toString(16).toUpperCase().padStart(12,'0'),
  name:'User program '+i,values
 }));
 const library=new SuperJ6Banks({banks:[{id:bankId,digest,name:'User bank',programs}],selected:[null,null]});
 a.state.superJ6Banks=library;
 a.state.model.add({track:'chicago',note:60,start:1,end:5});
 for(const slot of [0,1]){
  for(const program of programs){
   library.choose(slot,[digest,program.id]);
   for(const spec of library.view(slot).fields.values())a.state.parameterDraft.set(spec.id,1);
  }
 }
 a.get('draft-save').onclick();
 assert.equal(a.downloads.length,1,a.message());
 const saved=a.downloads[0];
 assert.ok(Buffer.byteLength(saved)>4*1024*1024);
 a.state.parameterDraft.clear();
 await choose(a,saved);
 assert.equal(a.get('draft-replace').disabled,false,a.get('draft-preview').textContent);
 a.get('draft-replace').onclick();
 assert.equal(a.state.parameterDraft.size,26624);
 assert.equal(a.state.model.notes.length,1);
 a.get('draft-save').onclick();
 assert.equal(a.downloads[1],saved);

 let read=false;
 await a.get('draft-file').onchange({target:{files:[{size:12*1024*1024+1,text(){read=true;}}]}});
 assert.equal(read,false);
 assert.equal(a.get('draft-replace').disabled,true);
 assert.match(a.get('draft-preview').textContent,/12 MiB/);
});

test('a prior dialog close cannot retire a new read, while Escape cancels its pending read', async()=>{
 const a=setup(),dialog=a.get('draft-dialog'),button=a.get('draft-replace');
 a.get('draft-save').onclick();
 const text=a.downloads[0];
 await choose(a,text);
 a.get('draft-cancel').onclick();
 let finish;
 const read=()=>a.get('draft-file').onchange({target:{files:[{size:text.length,text:()=>new Promise(r=>finish=r)}]}});
 const later=read();
 dialog.onclose();
 finish(text);await later;
 assert.equal(button.disabled,false);assert.equal(dialog.open,true);
 const canceled=read();
 dialog.oncancel();dialog.close();
 finish(text);await canceled;
 assert.equal(button.disabled,true);assert.equal(dialog.open,false);
});
