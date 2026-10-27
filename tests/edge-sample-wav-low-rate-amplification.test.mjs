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

// Negative acceptance must be EARLY, not a late RangeError that happens to
// contain "length" or "memory". Monitor the actual import invocation for
// resampling pushes and oversized typed-array allocations, and fail closed if
// either starts before an intentional slot-capacity decision.
function expectEarlyCapacityRejection(rate) {
  const wav = pcm16Wav(rate, 16);
  const audio = readWav(wav);
  assert.equal(wav.length, 76);
  assert.equal(audio.rate, rate);
  assert.equal(audio.x.length, 16);

  const originalPush = Array.prototype.push;
  const originalArrays = new Map(
    ['Float32Array', 'Int16Array', 'Uint8Array'].map((key) => [key, globalThis[key]])
  );
  let resamplePushes = 0;
  let oversizedArrays = 0;
  let failure;
  try {
    Array.prototype.push = function (...items) {
      if (items.length && items.every((value) => typeof value === 'number')) {
        resamplePushes++;
        throw new Error('EC046_TEST_TRAP_RESAMPLE_STARTED');
      }
      return Reflect.apply(originalPush, this, items);
    };
    for (const [key, NativeArray] of originalArrays) {
      globalThis[key] = new Proxy(NativeArray, {
        construct(target, args) {
          if (typeof args[0] === 'number' && args[0] > 4096) {
            oversizedArrays++;
            throw new Error('EC046_TEST_TRAP_LARGE_ALLOCATION');
          }
          return Reflect.construct(target, args);
        },
      });
    }
    try {
      prepareLoopImport(audio.x, audio.rate, { bars: false, trim: false });
    } catch (error) {
      failure = error;
    }
  } finally {
    Array.prototype.push = originalPush;
    for (const [key, NativeArray] of originalArrays) globalThis[key] = NativeArray;
  }

  assert.ok(failure, rate + ' Hz must be rejected before expanding beyond BREAK slot capacity');
  assert.equal(resamplePushes, 0, 'No resampling work may start before capacity rejection');
  assert.equal(oversizedArrays, 0, 'No oversized typed-array allocation may start before rejection');
  const intentionalCapacityFailure = failure?.code === 'BREAK_SLOT_CAPACITY' ||
    /\b(?:BREAK slot|slot capacity|capacity exceeded|exceeds? (?:the )?(?:slot|capacity)|loop too long)\b/i.test(String(failure?.message));
  assert.ok(intentionalCapacityFailure,
    'Expected deliberate slot-capacity error, not generic/late failure: ' + failure?.message);
}

test('control: legal low positive rate fitting slot stays available', () => {
  // 16 frames at 8 Hz generate 82,688 stored samples, about 41,344 ADPCM
  // bytes, well below SLOT_MAX_DATA. A blanket minimum-rate ban is not a fix.
  const audio = readWav(pcm16Wav(8, 16));
  const output = prepareLoopImport(audio.x, audio.rate, { bars: false, trim: false });
  assert.equal(output.n, 82688);
  assert.ok(output.adpcm.length < SLOT_MAX_DATA);
});

test('EC046: 4 Hz WAV just above slot capacity must reject before resampling', () => {
  // 16 frames at 4 Hz generate ~82,688 ADPCM bytes, exceeding 81,408.
  expectEarlyCapacityRejection(4);
});

test('EC046: 1 Hz WAV must reject before huge allocation or resampling', () => {
  // The 76-byte WAV otherwise expands to 661,501 stored samples.
  expectEarlyCapacityRejection(1);
});
