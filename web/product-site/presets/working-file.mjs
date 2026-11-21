import {edit, inspect} from './interchange.mjs';

function exportName(name, doc) {
  const suffix = doc.profile === 'superj6' ? '.superj6.bank.json' : doc.container === 'bank' ? '.json' : '.synth1';
  const clean = String(name ?? 'presets').replace(/[\x00/\\]/g, '_');
  return clean.toLowerCase().endsWith(suffix) ? clean : clean.replace(/\.[^.]*$/, '') + suffix;
}

export class OriginalPresetWorkingFile {
  #revision = 0;
  #doc = null;
  #original = null;
  #kept = null;
  #keptCurrent = false;

  get document() { return this.#doc; }
  get canSaveCurrent() { return this.#keptCurrent; }

  clearPreview() {
    this.#revision++;
    this.#doc = null;
    this.#original = null;
    this.#keptCurrent = false;
  }

  async open(file, profile, read = f => f.arrayBuffer()) {
    this.clearPreview();
    if (!file) return;
    const own = this.#revision;
    try {
      if (file.size !== undefined && (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > 8 * 1024 * 1024)) {
        throw Error('File too large');
      }
      const bytes = new Uint8Array(await read(file));
      if (own !== this.#revision) return;
      const doc = inspect(bytes, profile);
      this.#doc = doc;
      this.#original = {name: file.name, bytes: doc.original()};
      return doc;
    } catch (error) {
      if (own === this.#revision) throw error;
    }
  }

  rename(index, name) {
    const doc = this.#doc;
    if (!doc) throw Error('Open a preset first');
    if (doc.names[index] === name) return;
    this.#doc = inspect(edit(doc, index, 'name', name), doc.profile);
    this.#keptCurrent = false;
  }

  keep() {
    if (!this.#doc) return;
    this.#kept = {name: exportName(this.#original.name, this.#doc), bytes: this.#doc.original()};
    this.#keptCurrent = true;
  }

  download(kind, write) {
    const source = kind === 'original' ? this.#original : this.#kept;
    if (source) write?.(Uint8Array.from(source.bytes), kind, source.name);
  }

  clear() {
    this.clearPreview();
    this.#kept = null;
  }

  get keptName() { return this.#kept?.name; }

  get hasKept() { return this.#kept !== null; }
}

export function downloadOriginalPreset(bytes, kind, name) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([bytes], {type: 'application/octet-stream'}));
  link.href = url;
  link.download = kind + '-' + name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return link.download;
}
