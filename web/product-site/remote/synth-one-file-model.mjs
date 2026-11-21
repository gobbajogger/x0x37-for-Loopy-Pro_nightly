// SPDX-License-Identifier: GPL-3.0-only
import {inspect, synthOneNumericTokens} from '../presets/interchange.mjs';
import {WorkspaceTimeline} from './timeline.mjs';

// Physical file values from DnBOX Sound's s1_control_catalog.json at 084cbec2.
// File keys are not stock MIDI addresses. Unqualified parameters stay in the
// original document and pass through byte-for-byte when a musician edits a copy.
const groups = [
  ['Oscillator 1', [
    ['waveform1','Morph',0,1,'fraction','MIX'],
    ['vco1Volume','Level',0,1,'fraction','LEVEL'],
    ['vco1Semitone','Tune',-12,24,'st','TUNE']
  ]],
  ['Oscillator 2', [
    ['waveform2','Morph',0,1,'fraction','MIX'],
    ['vco2Volume','Level',0,1,'fraction','LEVEL'],
    ['vco2Semitone','Tune',-12,24,'st','TUNE']
  ]],
  ['Mixer', [
    ['vcoBalance','Oscillator mix',0,1,'fraction','MIX'],
    ['subVolume','Sub level',0,1,'fraction','LEVEL'],
    ['fmVolume','FM level',0,1,'fraction','LEVEL'],
    ['noiseVolume','Noise level',0,0.25,'fraction','LEVEL']
  ]],
  ['Filter', [
    ['cutoff','Cutoff',64,22050,'Hz','CUTOFF'],
    ['resonance','Resonance',0,0.98,'fraction','RES'],
    ['filterADSRMix','Envelope depth',0,1.2,'fraction','LEVEL']
  ]],
  ['Amplitude envelope', [
    ['attackDuration','Attack',0.0005,2,'s','ATTACK'],
    ['decayDuration','Decay',0.005,2,'s','DECAY'],
    ['sustainLevel','Sustain',0,1,'fraction','SUSTAIN'],
    ['releaseDuration','Release',0.004,2,'s','RELEASE']
  ]],
  ['Filter envelope', [
    ['filterAttack','Attack',0.0005,2,'s','ATTACK'],
    ['filterDecay','Decay',0.005,2,'s','DECAY'],
    ['filterSustain','Sustain',0,1,'fraction','SUSTAIN'],
    ['filterRelease','Release',0,2,'s','RELEASE']
  ]]
];
export const S1_FILE_FIELDS = Object.freeze(groups.flatMap(([group, fields]) =>
  fields.map(([key,label,min,max,unit,glyph]) => Object.freeze({key,label,group,min,max,unit,glyph}))));
const specs = new Map(S1_FILE_FIELDS.map(field => [field.key,field]));
const bankDirectory = new URL('./synth-one-banks/', import.meta.url);
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal:true, ignoreBOM:true});

export function acceptsSynthOneFileValue(spec, value) {
  return Number.isFinite(value) && Math.fround(value) >= Math.fround(spec.min) &&
    Math.fround(value) <= Math.fround(spec.max);
}

export function openSynthOneFile(bytes) {
  const doc = inspect(bytes,'synthone');
  const original = doc.original();
  const names = doc.names;
  const source = decoder.decode(original);
  const records = doc.names.map((_, i) => synthOneNumericTokens(doc,i,specs.keys()));
  const changes = new Map();
  const history = new WorkspaceTimeline();
  const setToken = (token, value) => {
    if (Object.is(value,token.value)) changes.delete(token);
    else changes.set(token,value);
  };
  function record(index) {
    if (!Number.isInteger(index) || !records[index]) throw new RangeError('Unknown Synth One preset');
    return Object.fromEntries(Object.entries(records[index]).map(([key,token]) =>
      [key, changes.get(token) ?? token.value]));
  }
  function set(index, key, value) {
    const spec = specs.get(key);
    const token = Number.isInteger(index) && Object.hasOwn(records[index] ?? {},key) && records[index][key];
    if (!spec || !token || !acceptsSynthOneFileValue(spec,value)) {
      throw new RangeError('Value outside the Synth One file field');
    }
    const before = changes.get(token) ?? token.value;
    if (Object.is(before,value)) return;
    setToken(token,value);
    history.record({label:spec.label,undo:()=>setToken(token,before),redo:()=>setToken(token,value)});
  }
  function exportBytes() {
    if (!changes.size) return original.slice();
    const chunks = [];
    let offset = 0;
    for (const [token,value] of [...changes].sort(([a],[b])=>a.start-b.start)) {
      chunks.push(source.slice(offset,token.start), Object.is(value,-0) ? '-0' : String(value));
      offset = token.end;
    }
    chunks.push(source.slice(offset));
    return encoder.encode(chunks.join(''));
  }
  return {names,record,set,bytes:exportBytes,undo:()=>history.undo(),redo:()=>history.redo(),
    get canUndo(){return history.canUndo;}, get canRedo(){return history.canRedo;},
    get changed(){return changes.size>0;}};
}

let manifestRequest;
async function bankFiles() {
  if (!manifestRequest) {
    manifestRequest = fetch(new URL('MANIFEST.json',bankDirectory)).then(async res => {
      if (!res.ok) throw Error('Factory bank list unavailable');
      return (await res.json()).files;
    }).catch(error => {manifestRequest = undefined; throw error;});
  }
  return manifestRequest;
}

export async function loadFactoryBanks() {
  return (await bankFiles()).map(file => ({name:file.name.replace(/\.json$/,''),filename:file.name,count:file.count}));
}
export async function loadFactoryBank(filename) {
  const file = (await bankFiles()).find(entry => entry.name === filename);
  if (!file) throw Error('Unknown factory bank');
  const res = await fetch(new URL(encodeURIComponent(file.name),bankDirectory));
  if (!res.ok) throw Error('Factory bank unavailable');
  const bytes = new Uint8Array(await res.arrayBuffer());
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)), byte => byte.toString(16).padStart(2,'0')).join('');
  if (bytes.length !== file.size || digest !== file.sha256) throw Error('Factory bank does not match its source');
  const model = openSynthOneFile(bytes);
  if (model.names.length !== file.count) throw Error('Factory program count differs from source');
  return model;
}
