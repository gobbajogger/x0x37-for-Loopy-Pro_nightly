// SPDX-License-Identifier: GPL-3.0-only
// EC-023: a disconnection while ProjectDevice.connect() is unresolved must not
// revive a stale project session and re-enable mutation buttons afterward.
// Executes the actual HTML module handlers with mocked DOM/WebMIDI, no hardware.
// Test only; intentionally RED against current NIGHTLY project page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../web/x0x_projects.html', import.meta.url), 'utf8');
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(m, 'actual production page module must exist');
const script = m[1].replace(/^import .+;\s*$/m, '');

function setup({ deferred = false } = {}) {
  const ids = {}, events = [], state = { resolveConnect: null };
  function element(tag = 'div') {
    return {
      tag, textContent: '', className: '', children: [], value: '', disabled: false,
      hidden: false, checked: false, files: [], attributes: {},
      classList: { toggle() {} },
      append(...children) {
        this.children.push(...children);
        if (tag === 'select' && !this.value) this.value = children[0]?.value || '';
      },
      replaceChildren(...children) {
        this.children = [];
        if (tag === 'select') this.value = '';
        this.append(...children);
      },
      setAttribute(key, value) { this.attributes[key] = value; },
      removeAttribute(key) { delete this.attributes[key]; }, remove() {}, click() {},
    };
  }
  for (const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const elementForId = ids[match[3]] = element(match[1]);
    elementForId.disabled = /\bdisabled\b/.test(match[2]);
    elementForId.checked = /\bchecked\b/.test(match[2]);
    elementForId.hidden = /\bhidden\b/.test(match[2]);
    elementForId.value = match[2].match(/\bvalue="([^"]*)"/)?.[1] || '';
  }
  const document = {
    getElementById(id) { assert.ok(ids[id], 'missing production element ' + id); return ids[id]; },
    createElement: element, body: element('body'),
  };
  const input = { id: 'in', name: 'X0X keyboard', state: 'connected' };
  const output = { id: 'out', name: 'X0X keyboard', state: 'connected' };
  const midi = {
    inputs: new Map([['in', input]]), outputs: new Map([['out', output]]),
    onstatechange: null,
  };
  const navigator = { requestMIDIAccess: async () => midi };
  class ProjectMidiLink {
    constructor(i, o) { this.input = i; this.output = o; }
    close() { events.push('link.close'); }
  }
  class ProjectDevice {
    constructor(link) { this.link = link; this.mode = 0; this.projectLength = 100; }
    connect() {
      events.push('connect.begin');
      if (!deferred) return Promise.resolve({ identity: 'X0X keyboard', recovery: false });
      return new Promise((resolve) => { state.resolveConnect = resolve; });
    }
  }
  const api = {
    PROJECT_MAX_FILE: 4 * 1024 * 1024, ProjectDevice, ProjectMidiLink,
    readProjectFile: async () => ({}), makeProjectFile: async () => new Uint8Array(),
    readProjectSnapshot: async () => ({}), prepareProjectImport: async () => ({}),
    applyProjectImport: async () => ({}),
  };
  const window = { confirm: () => true };
  const URL = { createObjectURL: () => 'blob:mock', revokeObjectURL() {} };
  const execute = new Function('document', 'navigator', 'window', 'URL', 'Blob',
    'setTimeout', ...Object.keys(api), script);
  execute(document, navigator, window, URL, Blob, () => 0, ...Object.values(api));
  return { ids, state, input, output, midi, events };
}

async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }

test('baseline: completed live connection enables project actions', async () => {
  const env = setup();
  await env.ids.find.onclick();
  assert.equal(env.ids.identity.textContent, 'X0X keyboard');
  assert.equal(env.ids.save.disabled, false);
  assert.equal(env.ids.reset.disabled, false);
});

test('negative: disconnect during pending identity query must not revive a stale session', async () => {
  const env = setup({ deferred: true });
  const finding = env.ids.find.onclick();
  await flush();
  assert.equal(typeof env.state.resolveConnect, 'function', 'connect handshake is pending');
  env.input.state = 'disconnected';
  env.midi.onstatechange();
  assert.equal(env.ids.identity.textContent, 'Disconnected');
  assert.equal(env.ids.save.disabled, true);
  env.state.resolveConnect({ identity: 'X0X keyboard', recovery: false });
  await finding;
  assert.equal(env.ids.save.disabled, true,
    'FAIL_BEFORE_FIX: stale connect completion enabled Save after unplug');
  assert.equal(env.ids.reset.disabled, true,
    'FAIL_BEFORE_FIX: stale connect completion enabled Reset after unplug');
  assert.equal(env.ids.identity.textContent, 'Disconnected',
    'FAIL_BEFORE_FIX: stale handshake overwrote the disconnected identity');
});

test('control: disconnect after a completed connection disables project actions', async () => {
  const env = setup();
  await env.ids.find.onclick();
  env.input.state = 'disconnected';
  env.midi.onstatechange();
  assert.equal(env.ids.save.disabled, true);
  assert.equal(env.ids.reset.disabled, true);
  assert.equal(env.ids.identity.textContent, 'Disconnected');
});
