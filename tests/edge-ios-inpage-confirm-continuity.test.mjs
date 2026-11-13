// SPDX-License-Identifier: GPL-3.0-only
// Live iOS in-page confirm and SysEx-identity continuity: function-body
// parity with gh-pages 6a9953de / install blob 15d43a0a, plus behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { Script, createContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderInstaller } from '../scripts/render-qualified-nightly.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_INSTALL_BLOB = '15d43a0a8398a69c70e73aa7b6a6dc6bbe5bace0';
const LIVE_CATALOG_BLOB = '24a8b208aa01d539b5ef4e23af73d9c4aa2ac3d8';
const gitBlob = sha => execSync(`git cat-file -p ${sha}`, { cwd: root, encoding: 'utf8', maxBuffer: 10e6 });

function extractFn(text, sig) {
  const idx = text.indexOf(sig);
  if (idx < 0) return null;
  const start = text.lastIndexOf('\n', idx) + 1;
  let i = text.indexOf('{', idx), depth = 0;
  for (let j = i; j < text.length; j++) {
    if (text[j] === '{') depth++;
    else if (text[j] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, j + 1);
    }
  }
  return null;
}
const norm = s => s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();

const live = gitBlob(LIVE_INSTALL_BLOB);
const catalog = JSON.parse(gitBlob(LIVE_CATALOG_BLOB));
const rendered = renderInstaller(catalog);
const srcOta = readFileSync(join(root, 'web/fm1ota.js'), 'utf8');
const srcHtml = readFileSync(join(root, 'web/x0x_installer.html'), 'utf8');

test('rendered installer and source function bodies match live iOS confirm and SysEx continuity', () => {
  const pairs = [
    ['function confirmWrite(product)', srcHtml, rendered],
    ['singlePort(selected = null)', srcOta, rendered],
    ['assertContinuous(dev)', srcOta, rendered],
    ['  bind(dev)', srcOta, rendered],
  ];
  for (const [sig, source, rend] of pairs) {
    const L = extractFn(live, sig), S = extractFn(source, sig), R = extractFn(rend, sig);
    assert.ok(L && S && R, `missing ${sig}`);
    assert.equal(norm(S), norm(L), `source ${sig} must byte-match live`);
    assert.equal(norm(R), norm(L), `rendered ${sig} must byte-match live`);
  }
  assert.match(rendered, /id="inconfirm"/);
  assert.match(rendered, /id="inconfirmok"/);
  assert.match(rendered, /id="inconfirmno"/);
  assert.match(rendered, /const installBlocked/);
  assert.match(rendered, /id="backup-warning"/);
  assert.match(rendered, /Continuity = same device-reported model/);
  assert.doesNotMatch(extractFn(rendered, 'function confirmWrite(product)'), /window\.confirm\s*\(/);
});

test('in-page confirm dialog gates write: Cancel does not write, OK does', async () => {
  let confirmCalls = 0;
  const ui = {};
  const make = (id) => ({ id, hidden: true, textContent: '', onclick: null, scrollIntoView() {}, disabled: false, checked: true, value: 0 });
  const $ = (id) => ui[id] ||= make(id);
  $('inconfirm'); $('inconfirmtext'); $('inconfirmok'); $('inconfirmno');
  const t = (k) => k;
  const lastId = { text: 'SMK-37 Elite_900' };
  const fn = extractFn(srcHtml, 'function confirmWrite(product)');
  const realm = createContext({ $, t, lastId, Promise });
  new Script(fn + '\nthis.confirmWrite=confirmWrite;').runInContext(realm);

  const windowConfirm = () => { confirmCalls++; return true; };
  const pending = realm.confirmWrite('SMK-37 Elite_901');
  assert.equal($('inconfirm').hidden, false);
  assert.match($('inconfirmtext').textContent, /SMK-37 Elite_901/);
  assert.equal(typeof $('inconfirmno').onclick, 'function');
  $('inconfirmno').onclick();
  assert.equal(await pending, false);
  assert.equal($('inconfirm').hidden, true);
  assert.equal(confirmCalls, 0);

  let wrote = 0;
  const gate = async (product) => { if (!(await realm.confirmWrite(product))) return false; wrote++; return true; };
  const p2 = gate('SMK-37 Elite_901');
  assert.equal(wrote, 0);
  assert.equal($('inconfirm').hidden, false);
  $('inconfirmok').onclick();
  assert.equal(await p2, true);
  assert.equal(wrote, 1);
  assert.equal(confirmCalls, 0);
});

function otaApi() {
  const hostSetTimeout = setTimeout, hostClearTimeout = clearTimeout;
  let clock = 0, timerId = 0;
  const cleared = new Set(), hosts = new Map();
  const context = { TextEncoder, Date: class extends Date { static now() { return clock; } },
    setTimeout(fn, ms) {
      const id = ++timerId;
      if (!ms) { queueMicrotask(() => { if (!cleared.has(id)) fn(); }); return id; }
      hosts.set(id, hostSetTimeout(() => {
        hosts.delete(id);
        if (cleared.has(id)) return;
        clock += ms;
        fn();
      }, 0));
      return id;
    },
    clearTimeout(id) {
      cleared.add(id);
      if (hosts.has(id)) { hostClearTimeout(hosts.get(id)); hosts.delete(id); }
    } };
  new Script(srcOta.replace(/^export\s+/gm, '') + '\nthis.api={Updater,sameKeyboard,pack7,unpack7};').runInNewContext(context);
  return context.api;
}

function identity(pack7, text) {
  const data = [...text].map(c => c.charCodeAt(0));
  while (data.length < 27) data.push(0);
  return [0xf0, ...pack7([0, 0x59, 0x11, 27, 0, 0, ...data,
    ~data.reduce((a, b) => a + b, 0) & 255]), 0xf7];
}
function request(pack7, address, len = 8) {
  const data = [0, 0x59, 0x30, 8, 0, 0, 0, address & 255, address >>> 8 & 255,
    address >>> 16 & 255, address >>> 24 & 255, len & 255, len >>> 8 & 255, 0];
  return [0xf0, ...pack7([...data, ~data.slice(6).reduce((a, b) => a + b, 0) & 255]), 0xf7];
}

test('reconnect with the same SysEx identity on a new port object continues', async () => {
  const { Updater, pack7, unpack7 } = otaApi();
  const image = new Uint8Array(1024);
  const listeners = new Set();
  const access = { inputs: new Map(), outputs: new Map(),
    addEventListener(type, fn) { assert.equal(type, 'statechange'); listeners.add(fn); },
    removeEventListener(type, fn) { listeners.delete(fn); } };
  let stage = 'app', input, output, probes = 0;
  const createPorts = (name, idPrefix) => {
    const pairInput = { id: idPrefix + '-in', name, state: 'connected', onmidimessage: null, async open() {} };
    const pairOutput = { id: idPrefix + '-out', name, state: 'connected', async open() {}, send(bytes) {
      if (bytes.length === 10 && bytes[1] === 0 && bytes[2] === 0x32) {
        probes++;
        const model = stage === 'loader' ? 'ota-SMK-37 Elite' : 'SMK-37 Elite';
        const ver = stage === 'back' ? '901' : '900';
        pairInput.onmidimessage?.({ data: identity(pack7, model + '_' + ver) });
        return;
      }
      if (bytes[1] === 0x22) {
        pairInput.onmidimessage?.({ data: request(pack7, 0) });
        pairInput.onmidimessage?.({ data: request(pack7, stage === 'loader' ? 0xf0000000 : 0xe0000000) });
        return;
      }
      const data = unpack7(bytes.slice(1, -1));
      const addr = (data[7] | data[8] << 8 | data[9] << 16 | data[10] << 24) >>> 0;
      if (addr === 0xe0000000) {
        stage = 'loader';
        // iOS-style: same SysEx identity, brand-new port objects and names.
        createPorts('SMK Returned', 'returned');
      } else if (addr === 0xf0000000) {
        stage = 'back';
      }
    } };
    input = pairInput; output = pairOutput;
    access.inputs = new Map([[pairInput.id, input]]);
    access.outputs = new Map([[pairOutput.id, output]]);
  };
  createPorts('SMK Original', 'orig');
  const up = new Updater(access);
  try {
    const first = { input, output };
    const text = await up.install(image, 'SMK-37 Elite_901');
    assert.equal(text, 'SMK-37 Elite_901');
    assert.equal(up.verified, true);
    assert.notEqual(input, first.input, 'the continuing path used a new port object');
  } finally { up.close(); }
});

test('a different SysEx identity on a new or same port is rejected', async () => {
  const { Updater, pack7, unpack7 } = otaApi();
  const image = new Uint8Array(1024);
  const listeners = new Set();
  const access = { inputs: new Map(), outputs: new Map(),
    addEventListener(type, fn) { listeners.add(fn); },
    removeEventListener(type, fn) { listeners.delete(fn); } };
  let stage = 'app';
  const input = { id: 'in', name: 'SMK selected', state: 'connected', onmidimessage: null, async open() {} };
  const output = { id: 'out', name: 'SMK selected', state: 'connected', async open() {}, send(bytes) {
    if (bytes.length === 10 && bytes[1] === 0 && bytes[2] === 0x32) {
      const model = stage === 'loader' ? 'ota-SMK-37 Pro' : 'SMK-37 Elite';
      input.onmidimessage?.({ data: identity(pack7, model + '_900') });
      return;
    }
    if (bytes[1] === 0x22) {
      input.onmidimessage?.({ data: request(pack7, 0) });
      input.onmidimessage?.({ data: request(pack7, stage === 'loader' ? 0xf0000000 : 0xe0000000) });
      return;
    }
    const data = unpack7(bytes.slice(1, -1));
    const addr = (data[7] | data[8] << 8 | data[9] << 16 | data[10] << 24) >>> 0;
    if (addr === 0xe0000000) stage = 'loader';
  } };
  access.inputs.set('in', input); access.outputs.set('out', output);
  const up = new Updater(access);
  try {
    await assert.rejects(up.install(image, 'SMK-37 Elite_901'), { code: 'model' });
    assert.equal(up.verified, false);
  } finally { up.close(); }
});
