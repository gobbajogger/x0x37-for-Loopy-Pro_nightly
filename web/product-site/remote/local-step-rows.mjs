// SPDX-License-Identifier: GPL-3.0-only
import {drumAccent} from './drum-accent.mjs';

// Original 76040daa, firmware/src/seq/pattern.h and sequencer.c. These are
// independent local step settings. A traced note does not reveal any of the four.
const onOff = value => value ? 'On' : 'Off';
const fields = {
  gate: {label:'Gate', domain:[0,1,2], text:value=>['Rest','Note','Tie'][value]},
  slide: {label:'Slide', domain:[0,1], text:onOff},
  accent: {label:'Accent', domain:[0,1], text:onOff},
  release: {label:'Release', domain:Array.from({length:16},(_,i)=>i), text:value=>value ? value+'/15' : 'Legacy'},
  drumAccent,
};
const bassFields = Object.freeze(['gate','slide','accent','release']);
const drumFields = Object.freeze(['drumAccent']);
const noFields = Object.freeze([]);
export function stepFields(part) {
  if (part==='chicago' || part==='miami') return bassFields;
  if (part==='drum909' || part==='drum808') return drumFields;
  return noFields;
}
export function stepField(kind) { return Object.hasOwn(fields,kind) ? fields[kind] : undefined; }
export function stepValueText(kind,value) { return value == null ? 'Unset' : fields[kind].text(value); }
export function stepCanEdit(rows,part,kind,step) {
  return kind !== 'release' || [1,2].includes(rows[part]?.gate?.[step]);
}
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const empty = () => Array(16).fill(null);
function fail() { throw Error('Local draft: invalid step lanes'); }
export function checkedStepRows(value = {}) {
  if (!plain(value)) fail();
  const result = {};
  for (const [part, rows] of Object.entries(value)) {
    if (!stepFields(part).length || !plain(rows)) fail();
    for (const [kind,row] of Object.entries(rows)) {
      if (!stepFields(part).includes(kind) || !Array.isArray(row) || row.length!==16 ||
          !Array.from(row).every(v=>v===null || fields[kind].domain.includes(v))) fail();
      if (row.some(v=>v!==null)) (result[part] ??= {})[kind] = [...row];
    }
    if (rows.release?.some((v,i)=>v>0 && !stepCanEdit(result,part,'release',i))) fail();
  }
  return result;
}
export function changeStepRow(values,part,kind,points) {
  const next = structuredClone(values);
  const rows = next[part] ??= {};
  if (kind==='gate') {
    const old = rows.gate ?? empty();
    // The stock held-step gate edit clears its captured release endpoint. Clearing
    // an authored gate removes that endpoint as well, restoring the unknown slot.
    const release = rows.release ?? empty();
    for (let step=0;step<16;step++) {
      if (old[step]!==points[step]) release[step] = points[step]===null ? null : 0;
    }
    rows.release = release;
  }
  rows[kind] = points;
  return checkedStepRows(next);
}
export function replaceStepRows(target, next) {
  for (const part of Object.keys(target)) delete target[part];
  Object.assign(target,structuredClone(next));
}
export function viewStepFields(part,view) {
  if(view==='drums')return drumFields;
  return view==='roll' && (part==='chicago'||part==='miami') ? bassFields : noFields;
}
