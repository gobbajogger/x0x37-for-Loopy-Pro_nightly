// SPDX-License-Identifier: GPL-3.0-only
// 76040daa: seq/pattern.h brkpart_t.set[]; dsp/breaks.c BRK_PARAMS; app/ui.c R_BRKSET.
import {FUNCTION_GLYPH} from './glyph-registry.mjs';
import {breakGlyphShapes} from './glyph-render.mjs';
const phrase = ['Off', '2 bars', '4 bars', '8 bars', '16 bars'];
const length = ['1/4×', '1/2×', '1×', '2×', '4×', '8×'];
const fields = [
  ['Complexity', 50], ['Anchor', 0], ['Roll', 0], ['Fill', 0],
  ['Retrigger ×2', 0], ['Retrigger ×3', 0], ['Retrigger ×4', 0], ['Retrigger ×8', 0],
  ['Phrase', 0, phrase], ['B chance', 0], ['A length', 2, length], ['B length', 2, length],
];
const groups = [['Groove', [0,1,2,3]], ['Retrigger', [4,5,6,7]], ['Phrase and length', [8,10,11]]];
const defaults = fields.map(([, value]) => value);
export const legacyBreakChanceId = 'source-sound/BREAK/-1|10:0:0:9:-1';
export const knownBreakPattern = pattern => Number.isInteger(pattern) && pattern >= 0 && pattern < 32;
export const breakPatternName = pattern => 'P' + String(pattern + 1).padStart(2, '0');
const modified = settings => settings.some((v, index) => v !== defaults[index]);
const legal = (id, value) => Number.isInteger(id) && id >= 0 && id < fields.length &&
  Number.isInteger(value) && value >= 0 && value <= (fields[id][2] ? fields[id][2].length - 1 : 100);
const display = (id, value) => fields[id][2]?.[value] ?? value + '%';

export function checkedBreakGenerators(rows) {
  if (!Array.isArray(rows) || rows.length > 32) throw Error('Local draft: invalid BREAK generators');
  const seen = new Set();
  for (const row of rows) {
    if (!row || Object.keys(row).sort().join(',') !== 'pattern,settings' ||
        !knownBreakPattern(row.pattern) || seen.has(row.pattern) ||
        !Array.isArray(row.settings) || row.settings.length !== fields.length ||
        !Array.from(row.settings).every((value, id) => legal(id, value))) {
      throw Error('Local draft: invalid BREAK generator settings');
    }
    seen.add(row.pattern);
  }
  return rows.filter(row => modified(row.settings)).map(row => ({pattern:row.pattern, settings:[...row.settings]}))
    .sort((a, b) => a.pattern - b.pattern);
}

function settingsAt(rows, pattern) {
  return rows?.find(row => row.pattern === pattern)?.settings ?? defaults;
}

export function putBreakSetting(rows, pattern, id, value) {
  if (!knownBreakPattern(pattern) || !legal(id, value)) throw Error('Local draft: invalid BREAK setting');
  const settings = [...settingsAt(rows, pattern)];
  settings[id] = value;
  return checkedBreakGenerators([...(rows ?? []).filter(row => row.pattern !== pattern), {pattern, settings}]);
}

function isChance(id) {
  return id === 2 || (id >= 4 && id <= 7) || id === 9;
}

function glyph(id, value, phraseValue) {
  const attr = isChance(id) ? ' data-r22-glyph="'+FUNCTION_GLYPH.CHANCE+'"' : '';
  const shapes = breakGlyphShapes(id,value,phraseValue).map(({x,y,w,h,ink,radius}) =>
    '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+radius+'" style="--ink:'+ink*100+'%"/>');
  return '<svg class="break-setting-glyph" data-break-glyph="'+id+'"'+attr+
    ' viewBox="0 0 48 19" aria-hidden="true">'+shapes.join('')+'</svg>';
}

export function showBreakGlyph(host, id, value, phraseValue) {
  const svg = host?.querySelector('[data-break-glyph="'+id+'"]');
  if (!svg) return;
  breakGlyphShapes(id,value,phraseValue).forEach(({ink},i) =>
    svg.children[i].style.setProperty('--ink',ink*100+'%'));
}

export function refreshBreakFields(host, rows, pattern) {
  const settings = settingsAt(rows, pattern);
  for (const input of host.querySelectorAll('[data-break-setting]')) {
    const id = Number(input.dataset.breakSetting);
    input.value = String(settings[id]);
    if (input.type === 'number') input.defaultValue = input.value;
    showBreakGlyph(host,id,settings[id],settings[8]);
  }
}

function field(pattern, id, value, phraseValue) {
  const [name, , options] = fields[id];
  const data = 'data-break-setting="'+id+'" data-break-pattern="'+pattern+'"';
  const input = options ? '<select aria-label="'+name+'" '+data+'>'+options.map((s,i) =>
    '<option value="'+i+'"'+(i===value ? ' selected' : '')+'>'+s+'</option>').join('')+'</select>' :
    '<span class="break-percent"><input type="number" aria-label="'+name+', percent" min="0" max="100" step="1" '+data+
      ' value="'+value+'"><span aria-hidden="true">%</span></span>';
  return '<label class="break-setting"><span class="break-setting-name">'+name+'</span>'+
    glyph(id,value,phraseValue)+input+'</label>';
}

export function breakGeneratorPanel(rows, pattern) {
  if (!knownBreakPattern(pattern)) return '';
  const settings = settingsAt(rows, pattern);
  return '<h2>Generator · BREAK / '+breakPatternName(pattern)+' · Draft</h2>' +
    groups.map(([title, ids]) => '<fieldset><legend>'+title+'</legend>'+ids.map(id =>
      field(pattern, id, settings[id],settings[8])).join('')+'</fieldset>').join('');
}

export function breakSoundChance(rows, pattern, legacy) {
  const old = legacy === undefined ? '' : '<small>Unassigned B chance from file · '+legacy+'%</small>';
  const control = knownBreakPattern(pattern) ? field(pattern, 9, settingsAt(rows, pattern)[9],0) :
    '<span>B chance</span><small>Select a BREAK pattern to edit.</small>';
  return '<div class="break-sound-chance">'+control+old+'</div>';
}

export function breakGeneratorChanges(rows) {
  return (rows ?? []).flatMap(({pattern, settings}) => settings.flatMap((value, i) => value === defaults[i] ? [] :
    ['BREAK · '+breakPatternName(pattern)+' · '+fields[i][0]+' · '+display(i,defaults[i])+' → '+display(i,value)]));
}
