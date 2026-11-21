import test from 'node:test';
import assert from 'node:assert/strict';
import {mountProjectPreset} from '../../web/product-site/remote/project-preset.mjs';

function setup() {
  const controls = Object.fromEntries(['format','file','program','name','keep','status','return'].map(key =>
    [key, {value:'', files:[], options:[], focus() {}, replaceChildren(...options) { this.options=options; }}]));
  controls.format.value='synthone';
  controls.format.selectedOptions=[{textContent:'Synth One'}];
  const dialog = new EventTarget(), window = new EventTarget(), save = {disabled:true};
  dialog.classList = {toggle() {}};
  dialog.querySelector = selector => controls[selector.slice('[data-preset-'.length,-1)];
  dialog.ownerDocument = {querySelector:q=>q==='[data-project-preset-save]'?save:null,defaultView:window};
  dialog.showModal = () => { dialog.open=true; };
  dialog.close = () => { dialog.open=false; };
  return {controls,dialog,window,api:mountProjectPreset(dialog,()=>{})};
}

test('Return, Escape and pagehide retire pending reads without losing an already inspected file', async () => {
  const {controls,dialog,window,api}=setup();
  const encoded=new TextEncoder().encode('[{"uid":"id","name":"Keep","bank":"B","cutoff":0.5,"waveform1":0}]');
  const originalOption=globalThis.Option;
  globalThis.Option=class { constructor(text,value) { this.textContent=text;this.value=value; } };
  try {
    for(const dismiss of [()=>controls.return.onclick(),()=>dialog.dispatchEvent(new Event('cancel')),()=>window.dispatchEvent(new Event('pagehide'))]) {
      for(const rejects of [false,true]) {
        api.open();
        let done;
        controls.file.files=[{name:'late.json',arrayBuffer:()=>new Promise((ok,bad)=>{done=()=>rejects?bad(Error('late')):ok(encoded);})}];
        const pending=controls.file.onchange();
        dismiss();dialog.close();
        api.open();
        dialog.dispatchEvent(new Event('close')); // deferred close from the earlier showing
        controls.file.files=[new File([encoded],'new.json')];
        await controls.file.onchange();
        done();await pending;
        assert.equal(controls.name.value,'Keep');
        assert.match(controls.status.textContent,/new.json/);
        controls.keep.onclick();assert.equal(api.canSave(),true);
        api.open();dismiss();dialog.close();assert.equal(api.canSave(),true);
      }
    }
  } finally {
    if(originalOption===undefined) delete globalThis.Option;
    else globalThis.Option=originalOption;
  }
});
