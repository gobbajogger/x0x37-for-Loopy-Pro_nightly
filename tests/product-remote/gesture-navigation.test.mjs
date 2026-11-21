import test from 'node:test';
import assert from 'node:assert/strict';
import {SequenceDraft} from '../../web/product-site/remote/sequence.mjs';
import {RollGesture} from '../../web/product-site/remote/roll.mjs';
import {bindRollPointers} from '../../web/product-site/remote/workspace.mjs';
function setup(initialScale=1){
 const model=new SequenceDraft({trace:{sampleRate:44100,endSample:16000,events:[]}});
 const id=model.add({track:'chicago',note:60,start:1000,end:3000});
 const listeners={},captured=new Set();let scale=initialScale;
 const viewport={scrollLeft:100,scrollTop:100,addEventListener:(n,f)=>listeners[n]=f,removeEventListener:n=>delete listeners[n],setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id),getBoundingClientRect:()=>({left:0,top:0})};
 const gesture=new RollGesture(model,{select:id=>model.selectIds([id])});
 const binding=bindRollPointers(viewport,{gesture,mode:()=> 'auto',point:e=>({sample:e.clientX*10,note:60}),paint:()=>{},getScale:()=>scale,setScale:v=>{scale=v;},remove:id=>{model.selectIds([id]);model.deleteSelected();}});
 const event=(name,x,y=40,pointerId=1,note=null,time=100)=>listeners[name]({button:0,pointerId,clientX:x,clientY:y,timeStamp:time,preventDefault(){},target:{closest:s=>s==='[data-note]'&&note?{dataset:{note}}:null}});
 return {model,id,viewport,event,scale:()=>scale,listeners,binding};
}
test('two-finger pan cancels pending draw and never creates a note',()=>{
 const s=setup(),before=s.model.notes;
 s.event('pointerdown',100);s.event('pointerdown',200,40,2);s.event('pointermove',80);s.event('pointermove',180,40,2);s.event('pointerup',80);s.event('pointerup',180,40,2);
 assert.equal(s.viewport.scrollLeft,120);assert.deepEqual(s.model.notes,before);
});
test('pinch from two bars to one preserves the starting centroid and all notes',()=>{
 const s=setup(.5),before=s.model.notes;
 s.event('pointerdown',100);s.event('pointerdown',200,40,2);s.event('pointermove',50);s.event('pointermove',250,40,2);
 assert.equal(s.scale(),1);assert.equal(s.viewport.scrollLeft,350);assert.deepEqual(s.model.notes,before);
});
test('double tap deletes exactly touched note and undo restores it',()=>{
 const s=setup();s.event('pointerdown',150,40,1,s.id,100);s.event('pointerup',150,40,1,s.id,110);s.event('pointerdown',150,40,1,s.id,200);s.event('pointerup',150,40,1,s.id,210);
 assert.equal(s.model.notes.length,0);s.model.undo();assert.equal(s.model.notes[0].id,s.id);
});
test('cancel after second finger never commits draw on remaining release',()=>{
 const s=setup(),before=s.model.notes;s.event('pointerdown',100);s.event('pointerdown',200,40,2);s.event('pointercancel',200,40,2);s.event('pointerup',100);assert.deepEqual(s.model.notes,before);
});
test('pinch selects only 1, 2, 4 or 8 bars and saturates at the endpoints',()=>{
 const s=setup(),notes=s.model.notes;
 s.event('pointerdown',100);s.event('pointerdown',300,40,2);
 for(const [x,scale] of [[374,1],[235,.5],[175,.5],[150,.25],[125,.125],[110,.125],[300,1],[500,1]]){
  s.event('pointermove',x,40,2);assert.equal(s.scale(),scale);
 }
 s.event('pointerup',100);s.event('pointerup',500,40,2);assert.deepEqual(s.model.notes,notes);
});
test('panning from an imported quarter-step zoom retains its original scale',()=>{
 const s=setup(1.25);
 s.event('pointerdown',100);s.event('pointerdown',200,40,2);
 s.event('pointermove',90);s.event('pointermove',190,40,2);
 assert.equal(s.scale(),1.25);assert.equal(s.viewport.scrollLeft,110);
});

test('lifecycle cancel clears viewport owners before next draw',()=>{
 const s=setup(),before=s.model.notes.length;s.event('pointerdown',100);s.event('pointerdown',200,40,2);s.binding.cancel();s.event('pointerdown',300,40,3);s.event('pointerup',300,40,3);assert.equal(s.model.notes.length,before+1);
});
test('modeless note body moves rather than resizing end',()=>{
 const s=setup(),before=s.model.notes[0];s.event('pointerdown',150,40,1,s.id);s.event('pointermove',200,40,1,s.id);s.event('pointerup',200,40,1,s.id);
 const after=s.model.notes[0];assert.equal(after.start,before.start+500);assert.equal(after.end-before.end,500);
});
test('wheel pan and bounded ctrl-wheel zoom alter viewport only',()=>{
 const s=setup(),before=s.model.notes;
 const wheel=extra=>s.listeners.wheel({ctrlKey:true,clientX:100,deltaY:-100,preventDefault(){},...extra});
 wheel();assert.equal(s.scale(),1.25);assert.equal(s.viewport.scrollLeft,150);
 wheel({ctrlKey:false,deltaX:40,deltaY:20});assert.equal(s.viewport.scrollLeft,190);assert.equal(s.viewport.scrollTop,120);
 for(let i=0;i<20;i++)wheel();assert.equal(s.scale(),4);
 for(let i=0;i<30;i++)wheel({deltaY:100});assert.equal(s.scale(),1);
 assert.deepEqual(s.model.notes,before);
});
test('double tap never deletes a moved note, and a third pointer cannot commit a draw',()=>{
 const s=setup();s.event('pointerdown',150,40,1,s.id,100);s.event('pointermove',180,40,1,s.id,110);s.event('pointerup',180,40,1,s.id,120);s.event('pointerdown',180,40,1,s.id,200);s.event('pointerup',180,40,1,s.id,210);assert.equal(s.model.notes.length,1);
 const before=s.model.notes;s.event('pointerdown',100);s.event('pointerdown',200,40,2);s.event('pointerdown',300,40,3);s.event('pointerup',100);s.event('pointerup',200,40,2);s.event('pointerup',300,40,3);assert.deepEqual(s.model.notes,before);
});
test('double tap can delete narrow notes whose resize handles cover the body',()=>{
 const s=setup();
 const fire=(type,time)=>s.listeners[type]({button:0,pointerId:1,clientX:150,clientY:40,timeStamp:time,preventDefault(){},target:{closest:selector=>({dataset:selector==='[data-edge]'?{edge:'end'}:{note:s.id}})}});
 fire('pointerdown',100);fire('pointerup',110);fire('pointerdown',200);fire('pointerup',210);assert.equal(s.model.notes.length,0);
});

test('Command-wheel anchors zoom and Shift-wheel pans time without changing pitch', () => {
 const s = setup(), original = s.model.notes;
 const wheel = (deltaX, deltaY, modifiers) => s.listeners.wheel({
  clientX: 100, deltaX, deltaY, ...modifiers, preventDefault() {}
 });
 wheel(0, -80, {metaKey: true});
 assert.equal(s.scale(), 1.25);
 assert.equal(s.viewport.scrollLeft, 150);
 wheel(0, 40, {shiftKey: true});
 assert.equal(s.viewport.scrollLeft, 190);
 wheel(-30, 0, {shiftKey: true});
 assert.equal(s.viewport.scrollLeft, 160);
 assert.equal(s.viewport.scrollTop, 100);
 assert.deepEqual(s.model.notes, original);
});
