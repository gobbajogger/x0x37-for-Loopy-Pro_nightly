// SPDX-License-Identifier: GPL-3.0-only
// EC019 actual production OTA + caller paths; synthetic WebMIDI/DOM, no hardware.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

const source = readFileSync(new URL('../web/fm1ota.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../web/x0x_installer.html', import.meta.url), 'utf8');
const product = 'SMK-37 Elite_900', image = new Uint8Array(128);
function runtime() {
  let clock = 0;
  const context = { TextEncoder, Date: class extends Date { static now() { return clock; } },
    setTimeout(fn, ms) { clock += ms || 0; fn(); return 0; }, clearTimeout() {} };
  new Script(source.replace(/^export\s+/gm, '') + '\nthis.api={Updater,pack7,unpack7};').runInNewContext(context);
  return context.api;
}
function fixture(api, { outcome = 'matching', failAck = false, loaderModel = 'ota-SMK-37 Elite', extraLoader = false, replacePorts = false } = {}) {
  const { pack7, unpack7 } = api;
  const state = { upgrades: 0, dataReplies: 0, finishAcks: 0, appResponses: 0, loaderResponses: 0,
    returnedInputs: [], loader: null };
  const listeners = new Set();
  const access = { inputs: new Map(), outputs: new Map(),
    addEventListener(type, listener) { assert.equal(type, 'statechange'); listeners.add(listener); },
    removeEventListener(type, listener) { assert.equal(type, 'statechange'); listeners.delete(listener); } };
  function frameIdentity(text) {
    const d = new Uint8Array(34); d[1] = 0x59; d[2] = 0x11; d[3] = 27;
    [...text].forEach((c, i) => { d[6 + i] = c.charCodeAt(0); });
    d[33] = ~d.slice(6,33).reduce((a,b) => a+b,0) & 255;
    return [0xf0, ...pack7(d), 0xf7];
  }
  function request(addr, len) {
    const d = [0,0x59,0x30,8,0,0,0,addr&255,(addr>>>8)&255,(addr>>>16)&255,(addr>>>24)&255,len,0,0];
    d.push(~d.slice(6).reduce((a,b)=>a+b,0)&255); return [0xf0,...pack7(d),0xf7];
  }
  function port(name, marker, loader) {
    const input = { name, state: 'connected', async open() {}, onmidimessage: null };
    const emit = data => { assert.equal(typeof input.onmidimessage, 'function'); input.onmidimessage({ data }); };
    const output = { name, state: 'connected', async open() {}, send(pkt) {
      if ([...pkt].join(',') === [0xf0,0,0x32,0x45,0,0,0,0x40,0x7f,0xf7].join(',')) {
        if (loader) state.loaderResponses++; else state.appResponses++;
        emit(frameIdentity(marker));
        // Exercise the post-handshake guard, not only find()'s initial guard.
        if (!loader && outcome === 'late-ambiguity') access.inputs.set('extra', { name: 'SMK other', state: 'connected' });
        return;
      }
      if (pkt[1] === 0x22) {
        assert.equal(loader, true); state.upgrades++;
        emit(request(0, 8)); emit(request(0xf0000000, 8)); return;
      }
      const d = unpack7(pkt.slice(1,-1)), addr = (d[7]|d[8]<<8|d[9]<<16|d[10]<<24)>>>0;
      if (addr !== 0xf0000000) { state.dataReplies++; return; }
      state.finishAcks++;
      if (failAck) throw Error('synthetic lost ACK while ports still report connected');
      const text = outcome === 'loader' ? 'ota-SMK-37 Elite_900' : outcome === 'wrong-marker' ? 'SMK-37 Elite_899' :
        outcome === 'cross-family' ? 'FM-1_900' : product;
      if (outcome === 'absent' || replacePorts) {
        input.state = output.state = 'disconnected'; access.inputs.clear(); access.outputs.clear();
        for (const listener of listeners) listener({ port: input });
        if (outcome === 'absent') return;
        const back = port('SMK Returned application', text, outcome === 'loader');
        state.returnedInputs.push(back.input);
        access.inputs.set('back', back.input); access.outputs.set('back', back.output);
      } else {
        // The positive contract is the same continuously observed port pair.
        marker = text; loader = outcome === 'loader';
      }
      if (outcome === 'ambiguity') access.inputs.set('extra', { name: 'SMK other', state: 'connected' });
    } };
    return { input, output };
  }
  const loader = port('SMK Original loader', loaderModel + '_900', true); state.loader = loader.input;
  access.inputs.set('loader', loader.input); access.outputs.set('loader', loader.output);
  if (extraLoader) access.inputs.set('extra', { name: 'SMK other', state: 'connected' });
  return { state, access, listeners };
}
function span(first, next) {
  const i = html.indexOf(first), j = html.indexOf(next, i);
  assert.ok(i >= 0 && j > i); return html.slice(i, j);
}
const scan = span('async function scan(', '\n$("connbtn").addEventListener');
const run = span('async function run(img, product, opts = {}) {', '\n$("go").addEventListener');
async function caller(options = {}, foreign = false) {
  const api = runtime(), f = fixture(api, options), ui = {}, messages = [], progress = [], instances = [], logs = [];
  const sandbox = {
    $: id => ui[id] ||= id === 'bar' ? {
      _value: 0, get value() { return this._value; },
      set value(value) { this._value = value; progress.push({ value, appResponses: f.state.appResponses }); }
    } : { disabled: false, checked: true, textContent: '', value: 0 },
    midiAccess: async () => f.access,
    Updater: class extends api.Updater { constructor(...args) { super(...args); instances.push(this); } },
    getSampleWorkspace: () => null, getProjectWorkspace: () => null,
    sayK: key => messages.push({ key, appResponses: f.state.appResponses }), t: key => key, log: value => logs.push(value), led() {},
    updateInstallGate() {}, setConnected() {}, suggestModel() { assert.fail('postwrite scan must not select a package'); },
    installKeepingSlots() { assert.fail('not the resume path'); },
    TEXT: { en: { noreturn: true, mismatch: true, ambiguous: true, model: true } }, lang: 'en'
  };
  const realm = createContext(sandbox);
  new Script('let writing=false,workspaceActive=true,workspaceScanning=0,lastId=null,stock=null,ctlLoadSerial=0,stockLoadSerial=0,scanSerial=0;\n' +
    scan + '\n' + run + '\nthis.start=run;this.isWriting=()=>writing;').runInContext(realm);
  await realm.start(image, product, { foreign });
  assert.equal(realm.isWriting(), false);
  return { ...f, ui, messages, progress, instances, logs };
}

for (const outcome of ['absent','loader','wrong-marker','cross-family','ambiguity','late-ambiguity']) {
  test(`actual resumed caller refuses Done/100 after successful ACK but ${outcome}`, async () => {
    const r = await caller({ outcome });
    assert.equal(r.state.finishAcks, 1, JSON.stringify(r.logs)); assert.equal(r.state.dataReplies, 1);
    assert.equal(r.instances[0].verified, false);
    assert.ok(!r.messages.some(m => ['done','stockdone'].includes(m.key)));
    assert.ok(r.progress.every(p => p.value < 100));
    assert.equal(r.state.loader.onmidimessage, null);
    assert.ok(r.state.returnedInputs.every(p => p.onmidimessage === null));
  });
}
test('actual resumed caller accepts the matching app on the uninterrupted Elite port pair', async () => {
  const r = await caller();
  assert.equal(r.instances[0].verified, true);
  assert.equal(r.instances[0].targetName, 'SMK Original loader');
  assert.equal(r.state.finishAcks, 1);
  assert.ok(r.messages.some(m => m.key === 'done' && m.appResponses > 0));
  assert.ok(r.progress.filter(p => p.value === 100).every(p => p.appResponses > 0));
  assert.equal(r.ui.bar.value, 100);
  assert.equal(r.state.loader.onmidimessage, null);
  assert.ok(r.state.returnedInputs.every(p => p.onmidimessage === null));
  assert.equal(r.listeners.size, 0);
});
test('actual resumed caller refuses completion after replacement by a matching renamed pair', async () => {
  const r = await caller({ replacePorts: true });
  assert.equal(r.state.finishAcks, 1); assert.equal(r.state.dataReplies, 1);
  assert.equal(r.instances[0].verified, false);
  assert.ok(!r.messages.some(m => ['done','stockdone'].includes(m.key)));
  assert.ok(r.progress.every(p => p.value < 100));
  assert.equal(r.listeners.size, 0);
});
test('foreign policy cannot turn an observed marker mismatch into Done/100', async () => {
  const r = await caller({ outcome: 'wrong-marker' }, true);
  assert.ok(r.state.appResponses > 0);
  assert.ok(!r.messages.some(m => ['done','stockdone'].includes(m.key)));
  assert.equal(r.instances[0].verified, false); assert.ok(r.progress.every(p => p.value < 100));
  for (const outcome of ['absent','loader','cross-family','ambiguity','late-ambiguity']) {
    const bad = await caller({ outcome }, true);
    assert.ok(!bad.messages.some(m => ['done','stockdone'].includes(m.key)));
    assert.ok(bad.progress.every(p => p.value < 100));
  }
});
test('lost final ACK never attempts application readback or completion', async () => {
  const r = await caller({ failAck: true });
  assert.equal(r.state.finishAcks, 1); assert.equal(r.state.appResponses, 0);
  assert.ok(r.messages.some(m => m.key === 'stopped'));
  assert.ok(!r.messages.some(m => ['done','stockdone','reboot'].includes(m.key)));
  assert.ok(r.progress.every(p => p.value < 100));
});
test('wrong-family or Pro loader and multiple compatible inputs still receive no UPGRADE', async () => {
  for (const [options, code] of [[{loaderModel:'ota-FM-1'},'model'],[{loaderModel:'ota-SMK-37 Pro'},'model'],[{extraLoader:true},'ambiguous']]) {
    const api = runtime(), f = fixture(api, options), up = new api.Updater(f.access);
    await assert.rejects(up.resume(image,()=>{},product), e => e.code === code);
    assert.equal(f.state.upgrades,0); assert.equal(f.state.loader.onmidimessage,null);
  }
});

test('actual caller cannot turn transfer boolean or pre-app progress into Done/100', async () => {
  for (const resume of [true, false]) {
    const ui = {}, statuses = [], progress = [], sandbox = {
      $: id => ui[id] ||= id === 'bar' ? { _value:0, get value(){return this._value;},set value(v){this._value=v;progress.push(v);} } : {checked:true},
      getSampleWorkspace:()=>null,getProjectWorkspace:()=>null,midiAccess:async()=>({}),
      Updater:class {
        verified=false;
        async find(){return resume ? {link:{close(){}}} : null;}
        async resume(_,step){step('write',100000);return true;}
      },
      installKeepingSlots:async(_up,_img,_product,_board,hooks)=>{hooks.progress(1);return {};},
      sayK:k=>statuses.push(k),log(){},led(){},t:k=>k,updateInstallGate(){},scan:async()=>{},TEXT:{en:{}},lang:'en'
    };
    const realm=createContext(sandbox);
    new Script('let writing=false,workspaceActive=true,scanSerial=0,ctlLoadSerial=0,stockLoadSerial=0,stock=null;\n'+run+'\nthis.start=run;').runInContext(realm);
    await realm.start(image,product);
    assert.ok(progress.every(p=>p<100));
    assert.ok(!statuses.some(k=>['done','stockdone'].includes(k)));
  }
});
