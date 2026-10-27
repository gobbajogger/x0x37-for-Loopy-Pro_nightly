// SPDX-License-Identifier: GPL-3.0-only
// EC-024: Project Workspace must not couple an X0X input to an unrelated MIDI output.
// Original PR54 regression; native assert spelling corrected, admission cases extended.
// Run from the NIGHTLY site checkout: node --test tests/edge-project-unrelated-midi-output.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ProjectDevice, ProjectMidiLink } from '../web/x0x_projects.js';

const html = readFileSync(new URL('../web/x0x_projects.html', import.meta.url), 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]?.replace(/^import .+;\s*$/m, '');
assert.ok(script, 'actual production Projects page module is present');

function environment(outputName, options = {}) {
  const ids = {}, sent = [], sentPorts = [], listeners = new Set();
  function element(tag = 'div') {
    return {
      tag, textContent: '', value: '', disabled: false, hidden: false, checked: false,
      style: {}, files: [], children: [], classList: { add() {}, remove() {}, toggle() {} },
      append(...xs) {
        this.children.push(...xs);
        if (tag === 'select' && !this.value) this.value = xs[0]?.value || '';
      },
      replaceChildren(...xs) {
        this.children = [];
        if (tag === 'select') this.value = '';
        this.append(...xs);
      },
      setAttribute() {}, removeAttribute() {}, remove() {}, click() {}, addEventListener() {}
    };
  }
  for (const m of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const e = ids[m[3]] = element(m[1]);
    e.checked = /\bchecked\b/.test(m[2]);
    e.disabled = /\bdisabled\b/.test(m[2]);
    e.value = m[2].match(/\bvalue="([^"]*)"/)?.[1] || '';
  }
  const document = {
    getElementById(id) { assert.ok(ids[id], `Missing page element ${id}`); return ids[id]; },
    createElement: element, body: element('body'), documentElement: element('html')
  };
  const input = {
    id: 'keyboard-input', name: 'X0X Keyboard', state: 'connected',
    addEventListener(type, listener) { if (type === 'midimessage') listeners.add(listener); },
    removeEventListener(type, listener) { if (type === 'midimessage') listeners.delete(listener); },
    emit(bytes) {
      for (const listener of listeners) listener({ data: Uint8Array.from(bytes) });
    }
  };
  const output = {
    id: 'other-output', name: outputName, state: 'connected',
    send(frame) {
      sent.push(Array.from(frame)); sentPorts.push(this.id);
      // Old/unsolicited frames arrive on the X0X INPUT. They do NOT originate at
      // this MIDI output. A valid identity alone is not proof of an in/out pair.
      if (frame[4] === 1) queueMicrotask(() => input.emit([
        0xF0, 0x7D, 0x46, 0x4C, 1, ...[...'X0X keyboard'].map(c => c.charCodeAt(0)), 0, 0xF7
      ]));
      if (frame[4] === 9 && frame[5] === 64) queueMicrotask(() => input.emit([
        0xF0, 0x7D, 0x46, 0x4C, 9, 64, 0, 1, 32, 0, 0, 0, 0xF7
      ]));
    }
  };
  const midi = {
    inputs: new Map([[input.id, input]]), outputs: new Map([[output.id, output]])
  };
  Object.assign(input, options.input); Object.assign(output, options.output);
  for (const p of options.inputs || []) midi.inputs.set(p.id, { ...input, ...p });
  for (const p of options.outputs || []) midi.outputs.set(p.id, { ...output, ...p });
  const navigator = { requestMIDIAccess: async () => midi };
  const window = { confirm: () => true };
  const forbidden = () => { throw new Error('unrelated project modification was attempted'); };
  const execute = new Function(
    'document', 'window', 'navigator', 'location', 'parent', 'ProjectDevice', 'ProjectMidiLink',
    'PROJECT_MAX_FILE', 'readProjectFile', 'makeProjectFile', 'readProjectSnapshot',
    'prepareProjectImport', 'applyProjectImport', script
  );
  execute(document, window, navigator, { search: '' }, window, ProjectDevice, ProjectMidiLink,
    4 * 1024 * 1024, forbidden, forbidden, forbidden, forbidden, forbidden);
  return { ids, input, output, midi, sent, sentPorts, listeners, click: async id => ids[id].onclick() };
}

test('control: matched keyboard ports admit the actual ProjectDevice handshake', async () => {
  const e = environment('X0X Keyboard');
  await e.click('find');
  assert.equal(e.sent.length, 2);
  assert.equal(e.ids.identity.textContent, 'X0X keyboard');
  assert.equal(e.ids.reset.disabled, false);
});

test('negative: sole unrelated output must not receive project SysEx or enable reset', async () => {
  const e = environment('Unrelated Synth');
  await e.click('find');
  assert.equal(e.sent.length, 0, 'never probe or write to unrelated MIDI output');
  assert.equal(e.ids.reset.disabled, true, 'no destructive project action without a paired link');
  assert.doesNotMatch(e.ids.status.textContent, /Ready for projects/);
});

for (const [label, outputName, options] of [
  ['case-only mismatch', 'x0x keyboard', {}],
  ['missing names', '', { input: { name: '' } }],
  ['disconnected input', 'X0X Keyboard', { input: { state: 'disconnected' } }],
  ['disconnected output', 'X0X Keyboard', { output: { state: 'disconnected' } }],
  ['duplicate inputs', 'X0X Keyboard', { inputs: [{ id: 'duplicate-input' }] }],
  ['duplicate outputs', 'X0X Keyboard', { outputs: [{ id: 'duplicate-output' }] }],
  ['two unmatched outputs', 'Unrelated Synth', { outputs: [{ id: 'other', name: 'Another Synth' }] }],
]) test(`refuse automatic and explicit selection: ${label}`, async () => {
  const e = environment(outputName, options);
  await e.click('find');
  e.ids['midi-input'].value = e.input.id; e.ids['midi-output'].value = e.output.id;
  await e.click('connect');
  assert.equal(e.sent.length, 0, 'refuse before all project SysEx');
  assert.equal(e.listeners.size, 0, 'refuse before subscribing to unsolicited input');
  for (const id of ['save', 'load', 'reset', 'export', 'prepare', 'import']) assert.equal(e.ids[id].disabled, true);
});

test('manual Connect cannot bypass the unrelated-output refusal', async () => {
  const e = environment('Unrelated Synth');
  await e.click('find'); await e.click('connect');
  assert.equal(e.sent.length, 0); assert.equal(e.ids.reset.disabled, true);
});

test('legacy sole matching nonstandard label still requires and passes the actual X0X handshake', async () => {
  const e = environment('Custom MIDI', { input: { name: 'Custom MIDI' } });
  await e.click('find');
  assert.equal(e.sent.length, 2); assert.equal(e.ids.identity.textContent, 'X0X keyboard');
  assert.equal(e.ids.reset.disabled, false);
});

test('one known unique pair is selected among unrelated ports without sending to them', async () => {
  const e = environment('X0X Keyboard', {
    inputs: [{ id: 'unrelated-in', name: 'Other Synth' }],
    outputs: [{ id: 'unrelated-out', name: 'Other Synth' }]
  });
  await e.click('find');
  assert.deepEqual(e.sentPorts, ['other-output', 'other-output']);
  assert.equal(e.ids.reset.disabled, false);
});

test('distinct known pairs require explicit selection, which cannot cross their outputs', async () => {
  const e = environment('X0X Keyboard', {
    inputs: [{ id: 'second-in', name: 'SMK-37 Pro' }],
    outputs: [{ id: 'second-out', name: 'SMK-37 Pro' }]
  });
  await e.click('find'); assert.equal(e.sent.length, 0);
  e.ids['midi-output'].value = 'second-out';
  await e.click('connect'); assert.equal(e.sent.length, 0);
  e.ids['midi-output'].value = e.output.id;
  await e.click('connect');
  assert.equal(e.sent.length, 2); assert.equal(e.ids.reset.disabled, false);
});

test('explicit selection rechecks live ambiguity added after discovery', async () => {
  const e = environment('X0X Keyboard', {
    inputs: [{ id: 'second-in', name: 'SMK-37 Pro' }],
    outputs: [{ id: 'second-out', name: 'SMK-37 Pro' }]
  });
  await e.click('find'); assert.equal(e.sent.length, 0);
  e.midi.outputs.set('late-duplicate', { ...e.output, id: 'late-duplicate' });
  await e.click('connect');
  assert.equal(e.sent.length, 0); assert.equal(e.ids.reset.disabled, true);
});

test('disconnected duplicate labels do not invalidate the sole live matching pair', async () => {
  const e = environment('X0X Keyboard', {
    inputs: [{ id: 'old-in', state: 'disconnected' }],
    outputs: [{ id: 'old-out', state: 'disconnected' }]
  });
  await e.click('find');
  assert.equal(e.sent.length, 2); assert.equal(e.ids.reset.disabled, false);
});

test('rediscovery clears the old device when no safe pair remains', async () => {
  const e = environment('X0X Keyboard');
  await e.click('find'); assert.equal(e.ids.reset.disabled, false);
  e.output.name = 'Unrelated Synth';
  await e.click('find');
  assert.equal(e.sent.length, 2, 'no new messages sent');
  assert.equal(e.listeners.size, 0);
  assert.equal(e.ids.reset.disabled, true);
  assert.equal(e.ids.identity.textContent, 'Not connected');
});
