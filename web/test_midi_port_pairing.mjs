// Fail-closed Web MIDI input/output pairing regression.
// Adapted from firmware PR398; only the find-method end delimiter differs.
// Execute from this repository root: node web/test_midi_port_pairing.mjs
// Runs the actual Updater._portPairs and Updater.find source methods against
// simulated browser MIDI port maps. Does not prove physical USB device identity.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const src = readFileSync(new URL('./fm1ota.js', import.meta.url), 'utf8');
const methodStart = src.indexOf('  _portPairs() {');
const methodEnd = src.indexOf('\n  // every in/out pair', methodStart);
const findStart = src.indexOf('  async find(filter) {', methodEnd);
const findEnd = src.indexOf('\n  async waitFor(', findStart);
assert.ok(methodStart > 0 && methodEnd > methodStart && findStart > methodEnd && findEnd > findStart,
  'Updater._portPairs and Updater.find must exist in their expected source positions');

let assertions = 0;
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); assertions++; };
const scenarios = [
  {label: 'one correctly named device', inputs: [['A', 'SMK-37 Pro']], outputs: [['A', 'SMK-37 Pro']], expected: ['A>A']},
  {label: 'unique device among unrelated ports', inputs: [['A', 'SMK-37 Pro'], ['X', 'Other Synth']], outputs: [['X', 'Other Synth'], ['A', 'SMK-37 Pro']], expected: ['A>A']},
  {label: 'two uniquely named models', inputs: [['A', 'SMK-37 Pro'], ['F', 'FM-1']], outputs: [['F', 'FM-1'], ['A', 'SMK-37 Pro']], expected: ['A>A', 'F>F']},
  {label: 'two identically named outputs', inputs: [['A', 'SMK-37 Pro']], outputs: [['B', 'SMK-37 Pro'], ['A', 'SMK-37 Pro']], expected: []},
  {label: 'two identically named inputs', inputs: [['A', 'SMK-37 Pro'], ['B', 'SMK-37 Pro']], outputs: [['A', 'SMK-37 Pro']], expected: []},
  {label: 'two identical devices with reversed outputs', inputs: [['A', 'SMK-37 Pro'], ['B', 'SMK-37 Pro']], outputs: [['B', 'SMK-37 Pro'], ['A', 'SMK-37 Pro']], expected: []},
  {label: 'mismatched sole output', inputs: [['A', 'SMK-37 Pro']], outputs: [['Z', 'Other Synth']], expected: []},
  {label: 'disconnected matching output', inputs: [['A', 'SMK-37 Pro']], outputs: [['A', 'SMK-37 Pro', 'disconnected']], expected: []},
  {label: 'disconnected duplicate output ignored', inputs: [['A', 'SMK-37 Pro']], outputs: [['B', 'SMK-37 Pro', 'disconnected'], ['A', 'SMK-37 Pro']], expected: ['A>A']},
  {label: 'disconnected duplicate input ignored', inputs: [['B', 'SMK-37 Pro', 'disconnected'], ['A', 'SMK-37 Pro']], outputs: [['A', 'SMK-37 Pro']], expected: ['A>A']},
  {label: 'non-keyboard input never probed', inputs: [['Z', 'Other Synth']], outputs: [['Z', 'Other Synth']], expected: []},
  {label: 'different names of sole in/out', inputs: [['A', 'SMK-37 Pro In']], outputs: [['A', 'SMK-37 Pro Out']], expected: []},
  {label: 'two identically named OTA devices', inputs: [['A', 'ota-SMK-37 Pro'], ['B', 'ota-SMK-37 Pro']], outputs: [['B', 'ota-SMK-37 Pro'], ['A', 'ota-SMK-37 Pro']], expected: []},
  {label: 'case-only name mismatch', inputs: [['A', 'SMK-37 Pro']], outputs: [['A', 'smk-37 pro']], expected: []},
];
const observed = [];
for (const spec of scenarios) {
  const events = [];
  const make = ([unit, name, state = 'connected']) => ({ unit, name, state,
    async open() { events.push(`OPEN:${unit}`); },
    send() { events.push(`SEND:${unit}`); },
  });
  const inputs = spec.inputs.map(make), outputs = spec.outputs.map(make);
  class MockLink {
    constructor(input, output) { this.input = input; this.output = output; }
    close() { events.push(`CLOSE:${this.input.unit}>${this.output.unit}`); }
  }
  const handshake = async (link) => {
    events.push(`PROBE:${link.input.unit}>${link.output.unit}`);
    link.output.send([0xf0, 0x7f, 0xf7]);
    // A prior/stale identity on an input must not justify sending a request
    // to a different physical output. Simulated positive response only.
    return { model: 'SMK-37 Pro', text: 'SMK-37 Pro_900' };
  };
  const Updater = runInNewContext(`class TestUpdater { constructor(access) { this.access = access; }
    ${src.slice(methodStart, methodEnd)}\n${src.slice(findStart, findEnd)}\n}\nTestUpdater;`,
    { Link: MockLink, handshake });
  const access = { inputs: new Map(inputs.map((p,i) => [i,p])), outputs: new Map(outputs.map((p,i) => [i,p])) };
  const up = new Updater(access);
  const pairs = Array.from(up._portPairs(), ({input, output}) => `${input.unit}>${output.unit}`);
  equal(pairs, spec.expected, `${spec.label}: pair mapping`);
  const selected = await up.find(() => true);
  const probes = events.filter((x) => x.startsWith('PROBE:')).map((x) => x.slice(6));
  const wantedProbes = spec.expected.length ? [spec.expected[0]] : [];
  equal(probes, wantedProbes, `${spec.label}: actual Updater.find routing`);
  equal(selected ? `${selected.link.input.unit}>${selected.link.output.unit}` : null,
    spec.expected[0] || null, `${spec.label}: selected device`);
  if (!spec.expected.length) {
    equal(events.filter((x) => x.startsWith('SEND:')), [], `${spec.label}: unsafe MIDI output must not be touched`);
  }
  observed.push({scenario: spec.label, pairs, probes, writes: events.filter(e=>e.startsWith('SEND:'))});
}
console.log(JSON.stringify({ status:'PASS', assertions, scenarios: scenarios.length,
  scope:'exact Updater method windows / synthetic Web MIDI maps / no physical device', observed }, null, 2));
