// SPDX-License-Identifier: GPL-3.0-only
// Fixed values from the production Synth One INIT note path, shared by both owners.
import {renderSvg} from './glyph-render.mjs';
import {INIT} from './synth-one-init-data.mjs';

const percent = fraction => Math.round(100 * fraction) + '%';
const milliseconds = seconds => Math.round(1000 * seconds) + ' ms';

function tracePath(points) {
  const path = points.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2)).join(' ');
  return '<path d="'+path+'" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"/>';
}

function valueCell(id, label, value, glyph) {
  return '<div class="encoder init-readout" data-init-field="'+id+'"><span>'+label+'</span>'+
    glyph+'<output aria-label="'+label+'">'+value+'</output></div>';
}

function envelopeRow(id, title, index) {
  // After the voice stops the native envelope fields retain their last levels.
  const lastFrame = INIT.voiceStopSample - 1;
  const x = frame => 1 + frame * 98 / lastFrame;
  const y = level => 22 - level * 20;
  const points = INIT.points.slice(0, Math.ceil(lastFrame / INIT.intervalSamples))
    .map((pair, i) => [x(i * INIT.intervalSamples), y(pair[index])]);
  points.push([x(lastFrame), y(INIT.lastActiveLevels[index])]);
  const noteOffX = x(INIT.gateOffSample).toFixed(2);
  const sampleTime = frame => milliseconds(frame / INIT.sampleRate);
  const timing = title + ', note off at ' + sampleTime(INIT.gateOffSample) +
    ', voice ends at ' + sampleTime(INIT.voiceStopSample);
  const plot = '<svg class="glyph readout" data-init-plot="'+id+'" viewBox="0 0 100 24" '+
    'preserveAspectRatio="none" role="img" aria-label="'+timing+'"><title>'+timing+'</title>'+
    '<line x1="'+noteOffX+'" x2="'+noteOffX+'" y1="2" y2="22" stroke="currentColor" '+
    'stroke-dasharray="2 2" opacity=".5" vector-effect="non-scaling-stroke"/>'+tracePath(points)+'</svg>';
  const [attack, decay, sustain, release] = INIT[id];
  const values = [milliseconds(attack), milliseconds(decay), percent(sustain), milliseconds(release)];
  const labels = ['Attack', 'Decay', 'Sustain', 'Release'];
  return '<section class="init-envelope" aria-label="'+title+'"><h3>'+title+'</h3>'+
    plot+'<dl>'+labels.map((label, i) =>
      '<div data-init-field="'+id+'-'+label.toLowerCase()+'"><dt>'+label+'</dt><dd>'+values[i]+'</dd></div>'
    ).join('')+'</dl></section>';
}

export function renderSynthOneInit(slot) {
  if (slot !== 0 && slot !== 1) throw new RangeError('Expected Bass A or Bass B');
  // The source oscillator is a rising ramp with a one-table-sample return at the seam.
  const wave = '<svg class="glyph readout" data-init-plot="saw" viewBox="0 0 100 24" aria-hidden="true">'+
    tracePath([[1,22],[49.98,2],[50,22],[98.98,2],[99,22]])+'</svg>';
  const rows = [
    valueCell('wave', 'Oscillator 1', 'Saw', wave),
    valueCell('oscillator1Level', 'Oscillator level', percent(INIT.oscillator1Level), renderSvg('LEVEL', INIT.oscillator1Level, 'synth-one')),
    valueCell('balance', 'Oscillator mix', percent(INIT.balance), renderSvg('MIX', INIT.balance, 'synth-one')),
    valueCell('cutoffHz', 'Cutoff', INIT.cutoffHz+' Hz', renderSvg('CUTOFF', Math.log2(INIT.cutoffHz / 64) / Math.log2(22050 / 64), 'synth-one')),
    valueCell('resonance', 'Resonance', percent(INIT.resonance), renderSvg('RES', INIT.resonance, 'synth-one')),
    valueCell('filterDepth', 'Envelope depth', percent(INIT.filterDepth), renderSvg('LEVEL', INIT.filterDepth / 1.2, 'synth-one'))
  ];
  return '<button type="button" data-open-synth-one-files="'+slot+'" aria-haspopup="dialog">Open original</button>'+
    '<section class="synth-one-init" data-synth-one-init="'+slot+'" aria-label="Synth One INIT source values">'+
    '<h3>INIT · source values</h3><div class="encoder-grid">'+rows.join('')+'</div>'+
    '<div class="init-envelopes">'+envelopeRow('amp','Amplitude envelope',0)+envelopeRow('filter','Filter envelope',1)+'</div></section>';
}
