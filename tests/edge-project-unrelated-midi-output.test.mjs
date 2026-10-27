// SPDX-License-Identifier: GPL-3.0-only
// EC-024: Project Workspace must not couple an X0X input to an unrelated MIDI output.
// Test-only, intentionally RED until the assigned Project Workspace owner repairs admission.
// Run from the NIGHTLY site checkout: node --test tests/edge-project-unrelated-midi-output.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ProjectDevice, ProjectMidiLink } from '../web/x0x_projects.js';

const html = readFileSync(new URL('../web/x0x_projects.html', import.meta.url), 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]?.replace(/^import .+;\s*$/m, '');
assert.ok(script, 'actual production Projects page module is present');

function environment(outputName) {
  const ids = {}, sent = [], listeners = new Set();
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
      sent.push(Array.from(frame));
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
  return { ids, input, output, sent, click: async id => ids[id].onclick() };
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
  assert.notMatch(e.ids.status.textContent, /Ready for projects/);
});