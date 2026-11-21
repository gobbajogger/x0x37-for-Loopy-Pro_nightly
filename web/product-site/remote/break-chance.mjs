// SPDX-License-Identifier: GPL-3.0-only
// A probability point belongs to a step of this local BREAK sequence, independently of its MIDI notes.
import {StepValueGesture} from './step-value-gesture.mjs';
import {chanceDomain, encodeChance} from './sequence.mjs';
import {chanceFromLane} from './lane.mjs';

const labels = new Map(chanceDomain.map(label => [encodeChance(label), label]));
const stored = label => label === '100%' ? null : encodeChance(label);
export const breakChanceText = value => value == null ? '100%' : labels.get(value);
export function validBreakChance(values) {
  return Array.isArray(values) && values.length === 16 && Array.from(values).every(value =>
    value === null || (value !== 100 && labels.has(value)));
}

export class BreakChanceLane extends StepValueGesture {
  constructor(options) {
    super({...options, fromPosition:p => stored(chanceFromLane(p)),
      nudged(value, direction) {
        const i = chanceDomain.indexOf(breakChanceText(value));
        return stored(chanceDomain[Math.min(chanceDomain.length - 1, Math.max(0, i - direction))]);
      }});
  }
}
