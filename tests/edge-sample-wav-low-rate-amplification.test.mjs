// SPDX-License-Identifier: GPL-3.0-only
// EC046: adversarial but structurally valid low-sample-rate WAV must fail before
// unbounded 44.1 kHz upsampling/ADPCM preparation. Test-only, no production fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readWav, prepareLoopImport, SLOT_MAX_DATA } from '../web/x0x_breaks.js';

function pcm16Wav(rate, frameCount) {
  const b = new Uint8Array(44 + frameCount * 2);
  const v = new DataView(b.buffer);
  function tag(at, name) {
    for (let i = 0; i < name.length; i++) b[at + i] = name.charCodeAt(i);
  }
  tag(0, 'RIFF');
  v.setUint32(4, b.length - 8, true);
  tag(8, 'WAVE'); tag(12, 'fmt ');
  v.setUint32(16, 16, true); // PCM fmt size
  v.setUint16(20, 1, true);  // PCM
  v.setUint16(22, 1, true);  // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);  // block alignment
  v.setUint16(34, 16, true); // bits per sample
  tag(36, 'data');
  v.setUint32(40, frameCount * 2, true);
  for (let i = 0; i < frameCount; i++) {
    v.setInt16(44 + 2 * i, Math.round(14000 * Math.sin(i * Math.PI / 8)), true);
  }
  return b;
}

test('control: valid 44.1 kHz mono WAV stays bounded and prepares normally', () => {
  const wav = pcm16Wav(44100, 128);
  const audio = readWav(wav);
  assert.equal(audio.rate, 44100);
  assert.equal(audio.x.length, 128);
  const output = prepareLoopImport(audio.x, audio.rate, { bars: false, trim: false });
  assert.equal(output.n, 128);
  assert.equal(output.adpcm.length, 64);
});

test('EC046: 1 Hz WAV must not expand far beyond a physical BREAK slot', () => {
  // 76-byte mono WAV, accepted by readWav. A 1-Hz 16-frame clip expands to
  // 661,501 samples (~330,751 ADPCM bytes) without an up-front output cap,
  // although SLOT_MAX_DATA is much smaller. Current production FAILS this test.
  const wav = pcm16Wav(1, 16);
  const audio = readWav(wav);
  assert.equal(wav.length, 76);
  assert.equal(audio.rate, 1);
  assert.equal(audio.x.length, 16);
  assert.ok(SLOT_MAX_DATA < 330751);
  assert.throws(
    () => prepareLoopImport(audio.x, audio.rate, { bars: false, trim: false }),
    /sample rate|capacity|size|too large|memory|length|limit|unsupported|too long/i,
    'Reject an impossible per-loop output size before allocating the upsampled float and ADPCM arrays'
  );
});
