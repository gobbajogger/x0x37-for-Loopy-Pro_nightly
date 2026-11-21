// SPDX-License-Identifier: GPL-3.0-only
import {mountBreakPanel} from '../components/break-panel/panel.mjs';
import {SAMPLE_CONTRACT_SHA256} from '../sample-pin.mjs';
import {createStartingBreakPreview, normalizeStartingBreakSelection} from '../starting-break-preview.mjs';

import {checkedBreakGenerators} from './break-generator.mjs';
import {validBreakChance} from './break-chance.mjs';

const rates = ['1/16', '1/8', '1/4'];
export function emptyBreakSequence() {
  return {loops: [null, null], rate: rates[0], slices: Array(16).fill(0)};
}

export function validateBreakSequence(value) {
  const validLoop = id => id === null || typeof id === 'string' && normalizeStartingBreakSelection([id])?.length === 1;
  if (!value || Object.keys(value).some(key => !['loops','rate','slices','chance','generators'].includes(key)) ||
      (Object.hasOwn(value,'chance') && !validBreakChance(value.chance)) ||
      !Array.isArray(value.loops) || value.loops.length !== 2 || !value.loops.every(validLoop) ||
      !rates.includes(value.rate) || !Array.isArray(value.slices) || value.slices.length !== 16 ||
      !value.slices.every(v => Number.isInteger(v) && v >= 0 && v <= 32)) {
    throw Error('Local draft: invalid BREAK sequence');
  }
  const checked = structuredClone(value);
  if (Object.hasOwn(checked,'generators')) {
    checked.generators = checkedBreakGenerators(checked.generators);
    if (!checked.generators.length) delete checked.generators;
  }
  if (checked.chance && !checked.chance.some(v => v !== null)) delete checked.chance;
  return checked;
}

// Replace optional step locks as well as loops/rate/slices when loading or undoing an older Draft.
export function installBreakSequence(state, next) {
  if (!Object.hasOwn(next, 'generators')) delete state.generators;
  if (!Object.hasOwn(next, 'chance')) delete state.chance;
  Object.assign(state, structuredClone(next));
}

export function mountBreakSequence(root, state, onEdit) {
  let serial = 0, picker = null, selectedIds;
  function stop() {
    serial++;
    picker?.destroy();
    picker = null;
  }
  function paint() {
    for (const select of root.querySelectorAll('[data-break-loop]')) select.value = state.loops[Number(select.dataset.breakLoop)] ?? '';
    for (const select of root.querySelectorAll('[data-break-step]')) select.value = state.slices[Number(select.dataset.breakStep)];
    if (root.querySelector('[data-break-rate]')) root.querySelector('[data-break-rate]').value = state.rate;
  }
  async function show() {
    stop();
    const own = serial;
    root.textContent = 'Loading starting breaks…';
    try {
      const response = await fetch('../sample-contract.json');
      if (!response.ok) throw Error('Starting breaks unavailable.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (own !== serial) return;
      const editor = document.createElement('section'), previews = document.createElement('div');
      const panel = await mountBreakPanel(previews, {contractBytes: bytes, contractSha256: SAMPLE_CONTRACT_SHA256, initialSelectedIds: selectedIds,
        onSelection: summary => { if (own === serial) selectedIds = summary.selectedIds; }, ...createStartingBreakPreview()});
      if (own !== serial) {panel.destroy(); return;}
      picker = panel;
      const assets = JSON.parse(new TextDecoder().decode(bytes)).assets;
      const fields = document.createElement('div'), steps = document.createElement('div');
      fields.className = 'break-assignment'; steps.className = 'break-steps';
      function field(parent, label, key, index, values) {
        const row = document.createElement('label'), select = document.createElement('select');
        row.textContent = label; select.dataset[key] = index;
        for (const [id, name] of values) select.add(new Option(name, id));
        row.append(select); parent.append(row);
      }
      for (const [index, name] of ['Loop A','Loop B'].entries()) {
        field(fields, name, 'breakLoop', index, [['','None'], ...assets.map(a => [a.id,a.name])]);
      }
      field(fields, 'Rate', 'breakRate', '', rates.map(r => [r,r]));
      const slices = Array.from({length:33}, (_,i) => [i,i ? String(i) : 'Auto']);
      for (let i=0;i<16;i++) field(steps, 'Step '+(i+1), 'breakStep', i, slices);
      editor.append(fields, steps);
      root.replaceChildren(editor, previews); paint();
    } catch {
      if (own === serial) root.textContent = 'Starting breaks unavailable. Reopen Sequence to retry.';
    }
  }
  root.addEventListener('change', e => {
    const input = e.target, next = structuredClone(state);
    if (input.hasAttribute('data-break-loop')) next.loops[Number(input.dataset.breakLoop)] = input.value || null;
    else if (input.hasAttribute('data-break-step')) next.slices[Number(input.dataset.breakStep)] = Number(input.value);
    else if (input.hasAttribute('data-break-rate')) next.rate = input.value;
    else return;
    onEdit(validateBreakSequence(next)); paint();
  });
  return {show, stop, paint};
}
