// SPDX-License-Identifier: GPL-3.0-only
import {synthOneWave} from './synth-one-wave.mjs';
import {renderSvg} from './glyph-render.mjs';
import {S1_FILE_FIELDS, acceptsSynthOneFileValue, openSynthOneFile, loadFactoryBanks, loadFactoryBank} from './synth-one-file-model.mjs';

const parts = [0, 1].map(() => ({files: new Map(), current: null, nextUpload: 1}));
let active = null;

function fieldDisplay(spec, value) {
  if (spec.unit === 'fraction') return {scale: 100, unit: '%'};
  if (spec.unit === 's' && value > 0 && value < 1) return {scale: 1000, unit: 'ms'};
  return {scale: 1, unit: spec.unit};
}

function buildField(spec, value, commit) {
  const row = document.createElement('label');
  row.className = 's1-file-field';
  const name = document.createElement('span');
  name.textContent = spec.label;
  const drawing = document.createElement('span');
  drawing.className = 's1-file-glyph';
  drawing.setAttribute('aria-hidden', 'true');
  const paint = raw => {
    if (spec.key === 'waveform1' || spec.key === 'waveform2') {
      if (!acceptsSynthOneFileValue(spec, raw)) {
        name.textContent = 'Wave · Outside range';
        drawing.replaceChildren();
        return;
      }
      const wave = synthOneWave(raw);
      name.textContent = 'Wave · ' + wave.label;
      drawing.innerHTML = '<svg viewBox="0 0 64 20" aria-hidden="true"><path d="'+wave.path+'" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
      return;
    }
    const fraction = (raw - spec.min) / (spec.max - spec.min);
    drawing.innerHTML = renderSvg(spec.glyph, fraction, 'synth-one');
  };
  paint(value);

  const {scale, unit} = fieldDisplay(spec, value);
  const editor = document.createElement('span');
  editor.className = 's1-file-value';
  const input = document.createElement('input');
  input.type = 'number';
  input.dataset.s1Field = spec.key;
  input.step = 'any';
  input.required = true;
  const readable = n => String(Number((n * scale).toFixed(unit === 's' || unit === 'st' ? 3 : 2)));
  // Browser number constraints compare decimals. An original float endpoint
  // can display a few digits beyond its nominal limit after unit conversion.
  const syncBounds = () => {
    const shown = input.valueAsNumber;
    const admitted = acceptsSynthOneFileValue(spec, shown / scale);
    input.min = String(admitted ? Math.min(spec.min * scale, shown) : spec.min * scale);
    input.max = String(admitted ? Math.max(spec.max * scale, shown) : spec.max * scale);
  };
  const show = text => { input.value = text; syncBounds(); };
  show(readable(value));
  input.addEventListener('focus', () => {
    show(String(value * scale));
    input.select();
  });
  input.addEventListener('blur', () => { show(readable(value)); });
  const unitLabel = document.createElement('span');
  unitLabel.textContent = unit;
  input.addEventListener('input', () => {
    syncBounds();
    if (input.validity.valid) paint(input.valueAsNumber / scale);
  });
  input.addEventListener('change', () => {
    syncBounds();
    if (input.valueAsNumber !== value * scale && commit(input.valueAsNumber / scale, input.validity.valid)) {
      value = input.valueAsNumber / scale;
    }
    show(document.activeElement === input ? String(value * scale) : readable(value));
    paint(value);
  });
  editor.append(input, unitLabel);
  row.append(name, drawing, editor);
  return row;
}

function saveCopy(file) {
  const extension = file.filename.match(/\.(?:synth1|json)$/i)?.[0] ?? '.json';
  const name = file.filename.replace(/\.(?:synth1|json)$/i, '');
  const blob = new Blob([file.model.bytes()], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name + ' - copy' + extension;
  document.body.append(link);
  try { link.click(); }
  finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function openSynthOneFiles(button, slot) {
  const part = parts[slot];
  if (!Number.isInteger(slot) || !part) throw new RangeError('Expected Bass A or Bass B');
  if (active?.open) active.close();

  const dialog = document.createElement('dialog');
  dialog.className = 's1-file-dialog';
  dialog.setAttribute('aria-labelledby', 's1-file-title');
  dialog.dataset.s1FileSlot = String(slot);
  dialog.innerHTML = `
    <header><h2 id="s1-file-title">Synth One preset files · Bass ${slot ? 'B' : 'A'}</h2>
      <button type="button" data-close>Close</button></header>
    <div class="s1-file-toolbar">
      <label>Bank or file<select data-bank aria-label="Bank or file"></select></label>
      <label>Preset<select data-preset aria-label="Preset"></select></label>
      <button type="button" data-open>Open original</button>
      <input data-upload type="file" accept=".synth1,.json,application/json" hidden>
    </div>
    <div data-fields class="s1-file-fields"></div>
    <footer><span role="status" aria-live="polite"></span>
      <button type="button" data-undo>Undo</button><button type="button" data-redo>Redo</button>
      <button type="button" data-save>Save a copy</button></footer>`;
  const get = selector => dialog.querySelector(selector);
  const bank = get('[data-bank]'), preset = get('[data-preset]'), fields = get('[data-fields]');
  const status = get('[role="status"]'), upload = get('[data-upload]');
  let banks = [], generation = 0, loading = false;

  const current = () => part.files.get(part.current);
  const alive = () => active === dialog && dialog.open;
  function updateActions() {
    const model = current()?.model;
    get('[data-undo]').disabled = loading || !model?.canUndo;
    get('[data-redo]').disabled = loading || !model?.canRedo;
    get('[data-save]').disabled = loading || !model;
    preset.disabled = loading || !model;
    fields.inert = loading;
  }

  function renderBankList(selection = part.current) {
    const factory = document.createElement('optgroup');
    factory.label = 'Factory banks';
    for (const item of banks) factory.append(new Option(item.name + ' (' + item.count + ')', item.filename));
    const uploads = document.createElement('optgroup');
    uploads.label = 'Opened files';
    for (const [key, file] of part.files) {
      if (file.uploaded) uploads.append(new Option(file.filename, key));
    }
    bank.replaceChildren(factory, uploads);
    bank.value = selection ?? '';
    bank.disabled = !bank.options.length;
  }

  function renderPreset() {
    fields.replaceChildren();
    const file = current();
    if (!file) { updateActions(); return; }
    const record = file.model.record(file.index);
    const groups = new Map();
    for (const spec of S1_FILE_FIELDS) {
      if (!Object.hasOwn(record, spec.key)) continue;
      if (!groups.has(spec.group)) {
        const group = document.createElement('fieldset'), legend = document.createElement('legend');
        legend.textContent = spec.group;
        group.append(legend);
        groups.set(spec.group, group);
        fields.append(group);
      }
      const index = file.index;
      groups.get(spec.group).append(buildField(spec, record[spec.key], (value, valid) => {
        if (!alive() || loading || file !== current() || file.index !== index) return false;
        try {
          if (!valid) throw Error(spec.label + ' is outside its source range.');
          file.model.set(index, spec.key, value);
          status.textContent = file.model.changed ? 'Edited copy' : '';
          updateActions();
          return true;
        } catch (error) {
          status.textContent = error.message;
          return false;
        }
      }));
    }
    updateActions();
  }

  function showFile() {
    renderBankList();
    const file = current();
    preset.replaceChildren();
    if (file) {
      file.model.names.forEach((name, index) => preset.add(new Option(name, String(index))));
      preset.value = String(file.index);
    }
    renderPreset();
  }

  async function selectFile(key, filename, load, uploaded = false) {
    const token = ++generation;
    loading = true;
    status.textContent = 'Opening ' + filename + '…';
    updateActions();
    try {
      const previous = part.files.get(key);
      const file = previous ?? {filename, model: await load(), index: 0, uploaded};
      if (!alive() || token !== generation) return;
      part.files.set(key, file);
      part.current = key;
      status.textContent = '';
    } catch (error) {
      if (!alive() || token !== generation) return;
      status.textContent = 'Could not open ' + filename + '. ' + error.message;
    } finally {
      if (alive() && token === generation) {
        loading = false;
        showFile();
      }
    }
  }

  async function loadBanks() {
    const initial = generation;
    try {
      banks = await loadFactoryBanks();
      if (!alive()) return;
      if (!part.current && initial === generation && banks.length) {
        renderBankList(banks[0].filename);
        await selectFile(banks[0].filename, banks[0].filename, () => loadFactoryBank(banks[0].filename));
      } else {
        renderBankList(loading ? bank.value : part.current);
      }
    } catch (error) {
      if (alive() && initial === generation) status.textContent = 'Factory banks unavailable. ' + error.message;
    }
  }

  bank.onchange = () => {
    const key = bank.value;
    const filename = part.files.get(key)?.filename ?? key;
    void selectFile(key, filename, () => loadFactoryBank(key));
  };
  preset.onchange = () => {
    const file = current();
    file.index = Number(preset.value);
    status.textContent = '';
    renderPreset();
  };
  get('[data-open]').onclick = () => upload.click();
  upload.onchange = () => {
    const source = upload.files[0];
    upload.value = '';
    if (!source) return;
    const key = 'upload:' + part.nextUpload++;
    void selectFile(key, source.name, async () => {
      if (source.size > 8 * 1024 * 1024) throw Error('The maximum file size is 8 MiB.');
      return openSynthOneFile(new Uint8Array(await source.arrayBuffer()));
    }, true);
  };
  function history(redo) {
    const model = current()?.model;
    if (loading || !model || !(redo ? model.canRedo : model.canUndo)) return;
    if (redo) model.redo(); else model.undo();
    status.textContent = model.changed ? 'Edited copy' : '';
    renderPreset();
  }
  get('[data-undo]').onclick = () => history(false);
  get('[data-redo]').onclick = () => history(true);
  get('[data-save]').onclick = () => {
    try {
      saveCopy(current());
      status.textContent = 'Copy prepared.';
    } catch (error) { status.textContent = error.message; }
  };
  get('[data-close]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    ++generation;
    dialog.remove();
    if (active === dialog) {
      active = null;
      if (button.isConnected) button.focus({preventScroll: true});
    }
  }, {once: true});
  document.body.append(dialog);
  active = dialog;
  showFile();
  dialog.showModal();
  if (!part.current) status.textContent = 'Loading factory banks…';
  void loadBanks();
}

window.addEventListener('pagehide', () => { if (active?.open) active.close(); });
