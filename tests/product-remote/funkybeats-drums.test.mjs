import test from 'node:test';
import assert from 'node:assert/strict';
test('ported upstream sequencer renders all typed drum cells with safe, stable identities',async()=>{
 const {renderFunkyBeatsDrums,DRUM_VOICES}=await import('../../web/product-site/remote/funkybeats-view.mjs');
 for(const kit of ['909','808']){
  const track=kit==='909'?'drum909':'drum808';
  const notes=[{id:'first',track,note:36,start:0,velocity:88},{id:'fifth',track,note:36,start:22050,velocity:104},{id:'foreign',track:'other',note:36,start:0,velocity:20}];
  const html=renderFunkyBeatsDrums({kit,notes,endSample:88200});
  assert.equal((html.match(/data-drum-note=/g)||[]).length,176);
  assert.equal((html.match(/class="seq-step-group"/g)||[]).length,52);
  assert.match(html,/BD step 1 velocity 88/);assert.match(html,/BD step 5 velocity 104/);assert.doesNotMatch(html,/data-hit="foreign"/);
  assert.equal(DRUM_VOICES[kit].length,11);assert.doesNotMatch(html,/seq-mute|seq-solo|seq-eucl|AudioContext|Not loaded/);
  const escaped=renderFunkyBeatsDrums({kit,notes:[{...notes[0],id:'"<script>'}],endSample:88200});assert.doesNotMatch(escaped,/<script>/);assert.match(escaped,/&quot;&lt;script&gt;/);
 }
});
import{readFileSync}from'node:fs';
import{SequenceDraft}from'../../web/product-site/remote/sequence.mjs';
test('shipped app binds every typed step without a tool mode and edits remain undoable',()=>{
 const app=readFileSync(new URL('../../web/product-site/remote/app.mjs',import.meta.url),'utf8');
 assert.match(app,/import\{[^}]*renderFunkyBeatsDrums[^}]*\}from'\.\/funkybeats-view\.mjs'/);
 assert.match(app,/if\(b.dataset.drumNote!==undefined\)\{model.toggleHit\(b.dataset.drumTrack,Number\(b.dataset.drumNote\),Number\(b.dataset.drumStart\)\)/);
 assert.doesNotMatch(app,/drumEdit&&b.dataset.drumNote/);
 const model=new SequenceDraft({trace:{sampleRate:44100,endSample:88200,events:[]}});
 for(const track of['drum909','drum808'])for(let step=0;step<16;step++){
  const start=Math.round(step*88200/16);model.toggleHit(track,36,start);
  assert.ok(model.notes.some(n=>n.track===track&&n.note===36&&n.start===start));
  model.undo();assert.equal(model.notes.length,0);model.redo();assert.equal(model.notes.length,1);
  model.toggleHit(track,36,start);assert.equal(model.notes.length,0);
 }
});
test('near-grid hit toggles the displayed event rather than adding a duplicate',async()=>{
 const {renderFunkyBeatsDrums}=await import('../../web/product-site/remote/funkybeats-view.mjs');
 for(const kit of ['909','808']){
  const track=kit==='909'?'drum909':'drum808';
  const model=new SequenceDraft({trace:{sampleRate:44100,endSample:88200,events:[]}});
  model.toggleHit(track,36,1);
  const html=renderFunkyBeatsDrums({kit,notes:model.notes,endSample:88200});
  const tag=html.match(/<button[^>]*aria-label="BD step 1 velocity 100[^>]*>/)?.[0];
  assert.ok(tag);
  const start=Number(tag.match(/data-drum-start="(\d+)"/)[1]);
  model.toggleHit(track,36,start);
  assert.equal(model.notes.length,0);
  model.undo();assert.equal(model.notes[0].start,1);
 }
});

test('the final drum row carries kit-wide accents independent of velocity and hits', async () => {
 const {renderFunkyBeatsDrums} = await import('../../web/product-site/remote/funkybeats-view.mjs');
 for (const kit of ['909', '808']) {
  const notes = [{id:'hit', track:'drum'+kit, note:36, start:0, velocity:127}];
  const render = accents => renderFunkyBeatsDrums({kit, notes, accents, endSample:88200});
  const counts = html => [...html.matchAll(/data-drum-accent-step="(\d+)"/g)].map(m => Number(m[1]));
  const original = render();
  assert.deepEqual(counts(original), Array.from({length:16}, (_, i) => i));
  assert.equal((original.match(/aria-pressed="mixed"/g) || []).length, 16);
  assert.ok(original.indexOf('class="seq-row drum-accent-row"') > original.lastIndexOf('data-drum-note='));
  const authored = render([false, true, ...Array(14).fill(null)]);
  assert.match(authored, new RegExp(kit + ' Accent step 1, Off'));
  assert.match(authored, new RegExp(kit + ' Accent step 2, On'));
  assert.match(authored, /BD step 1 velocity 127/);
  assert.match(authored, /BD step 2 empty/);
 }
});
