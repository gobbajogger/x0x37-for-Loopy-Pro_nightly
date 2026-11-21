// SPDX-License-Identifier: GPL-3.0-only
// AudioKitSynthOne 6466a371, BandlimitedWavetables: the four original _0000
// shapes used for the static selector. Each original period is 4,096 samples.
const size = 4096;
const names = ['Triangle', 'Square', 'Narrow pulse', 'Saw'];
const phases = [...new Set([
  ...Array.from({length:33}, (_,i) => i * 128), 511, 2047, 4095
])].sort((a,b) => a-b);

function tableSample(shape, phase) {
  const index = phase % size;
  switch (shape) {
    case 0: return 1 - Math.abs(index - 2048) / 1024;
    case 1: return index < 2048 ? -1 : 1;
    case 2: return index < 512 ? -1 : 1;
    case 3: return index / 2048 - 1;
  }
}

export function synthOneWave(value) {
  const stored = Math.fround(value);
  if (!Number.isFinite(stored) || stored < 0 || stored > 1) throw new RangeError('Invalid Synth One waveform');
  const position = Math.fround(stored * 3);
  const left = Math.floor(position), right = Math.min(3, left + 1);
  const mix = position - left;
  const label = mix ? names[left] + ' ↔ ' + names[right] : names[left];
  const sample = phase => tableSample(left, phase) * (1 - mix) + tableSample(right, phase) * mix;
  const path = phases.map((p,i) => (i ? 'L' : 'M') + (1 + 62*p/size).toFixed(2)
    + ' ' + (10 - 8*sample(p)).toFixed(2)).join(' ');
  return {label, path, sample};
}
