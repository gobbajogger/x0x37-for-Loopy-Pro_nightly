import {OriginalPresetWorkingFile, downloadOriginalPreset} from '../presets/working-file.mjs';

export function mountProjectPreset(dialog, notify) {
  const working = new OriginalPresetWorkingFile();
  const find = name => dialog.querySelector('[data-preset-' + name + ']');
  const format = find('format'), file = find('file'), program = find('program');
  const name = find('name'), keep = find('keep'), status = find('status');
  let selected = 0;
  let pending = null;

  function canSave() {
    return working.canSaveCurrent && name.value === (working.document?.names[selected] ?? '');
  }

  function syncSave() {
    const button = dialog.ownerDocument.querySelector('[data-project-preset-save]');
    if (button) button.disabled = !canSave();
    const inspect = dialog.ownerDocument.querySelector('[data-project-preset-inspect]');
    if (inspect) inspect.disabled = !working.document;
  }

  function render(message) {
    const doc = working.document;
    selected = 0;
    program.replaceChildren(...(doc?.names ?? []).map((label, index) => new Option(label, String(index))));
    name.value = doc?.names[0] ?? '';
    program.disabled = name.disabled = !doc?.count;
    keep.disabled = !doc;
    status.textContent = message;
    syncSave();
  }

  function stageName() {
    if (name.disabled) return true;
    try {
      working.rename(selected, name.value);
      program.options[selected].textContent = working.document.names[selected];
      return true;
    } catch {
      status.textContent = 'Invalid preset name';
      name.focus();
      return false;
    }
  }

  file.onclick = () => { file.value = ''; };
  file.onchange = async () => {
    const chosen = file.files[0];
    if (!chosen) return;
    const reading = working.open(chosen, format.value);
    pending = reading;
    render('Reading ' + chosen.name);
    try {
      const doc = await reading;
      if (pending === reading && doc && doc === working.document) {
        render(chosen.name + ' · ' + doc.count + (doc.count === 1 ? ' preset' : ' presets'));
      }
    } catch {
      if (pending === reading) render('Invalid ' + format.selectedOptions[0].textContent + ' file');
    } finally {
      if (pending === reading) pending = null;
    }
  };
  format.onchange = () => {
    pending = null;
    working.clearPreview();
    file.value = '';
    render('');
  };
  program.onchange = () => {
    if (!stageName()) {
      program.value = String(selected);
      return;
    }
    selected = Number(program.value);
    name.value = working.document.names[selected];
    syncSave();
  };
  name.oninput = syncSave;
  keep.onclick = () => {
    if (!stageName()) return;
    working.keep();
    syncSave();
    dialog.close();
  };
  function retireRead() {
    if (!pending) return;
    pending = null;
    working.clearPreview();
    render('');
  }

  find('return').onclick = () => {
    retireRead();
    dialog.close();
  };
  dialog.addEventListener('cancel', retireRead);
  dialog.addEventListener('close', () => { if (!dialog.open) retireRead(); });
  dialog.ownerDocument.defaultView.addEventListener('pagehide', retireRead);
  return {
    canSave,
    canInspect() { return Boolean(working.document); },
    open(inspect = false) {
      if (inspect && !working.document) return;
      dialog.classList.toggle('inspect-preset', inspect);
      dialog.showModal();
      (inspect ? (program.disabled ? keep : program) : file).focus();
    },
    save() {
      if (!canSave()) return;
      working.download('kept', (bytes, kind, filename) => {
        const savedName = downloadOriginalPreset(bytes, kind, filename);
        notify('Saved ' + savedName);
      });
    }
  };
}
