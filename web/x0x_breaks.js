// SPDX-License-Identifier: GPL-3.0-only
// X0X break loops in the browser: tools/upload_breaks.py and its helpers (tools/sampleio.py,
// Felucca's encoder; tools/import_breaks.py's bar guess) as plain functions, so the page
// (web/x0x_breaks.html) builds the same slot images the command line does, byte for byte
// (web/test_breaks.mjs checks it against upload_breaks.py --dry-run).
//
// The float arithmetic follows sampleio.py's order of operations: keep it when touching these.

export const SLOT_SIZE = 0x14000, SLOT_DATA_OFF = 512, SLOT_ZONES = 16;
export const SLOT_HDR_LEN = 32 + SLOT_ZONES * 28;
export const SLOT_MAX_DATA = SLOT_SIZE - SLOT_DATA_OFF;
export const ROOT_BASE = 36;              // loop i is zone root 36 + i: the slot sorts its zones by root
export const RATE = 44100, RATE_HALF = 22050;   // 44.1 kHz by default; 22.05 kHz only when asked for
export const OLDSCHOOL_FACTOR = 2;              // --oldschool CLI default (medium grit)
export const MIN_LOOP_SAMPLES = 64;           // firmware breaks_set_loop minimum
/** @type {{ key: string, label: string, factor: number }[]} */
export const OLDSCHOOL_GRIT = [
  { key: "", label: "Off (clean)", factor: 1 },
  { key: "light", label: "Light", factor: 1.5 },
  { key: "medium", label: "Medium", factor: 2 },
  { key: "heavy", label: "Heavy", factor: 3 },
  { key: "max", label: "Max", factor: 4 },
];
export const DRY_SLOT_KB = [80, 120, 44]; // upload_breaks.py --dry-run's default layout: the SMK-37's slots (KiB)

const IMA_STEP = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88,
  97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658,
  724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660,
  4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818,
  18500, 20350, 22385, 24623, 27086, 29794, 32767];
const IMA_IDX = [-1, -1, -1, -1, 2, 4, 6, 8];

// import_breaks.bars_of: the bar count (1, 2 or 4) that puts the loop's tempo nearest 120 inside 80-180
export function barsOf(seconds) {
  let best = null;
  for (const b of [1, 2, 4]) {
    const bpm = b * 240.0 / seconds;
    if (bpm >= 80 && bpm <= 180 && (best === null || Math.abs(bpm - 120) < Math.abs(best[1] - 120))) best = [b, bpm];
  }
  return best || [1, 240.0 / seconds];
}

// sampleio.resample: a moving average over the ratio, then linear interpolation
export function resample(x, sr, to) {
  if (sr === to) return x;
  if (sr > to) {
    const k = Math.max(1, Math.round(sr / to));
    if (k === 2) {
      const y = new Array(x.length);
      for (let i = 0; i + 1 < x.length; i++) y[i] = (x[i] + x[i + 1]) / 2;
      if (x.length) y[x.length - 1] = x[x.length - 1] / 2;
      x = y;
    } else if (k > 1) {
      const y = new Array(x.length);
      for (let i = 0; i < x.length; i++) {
        let acc = x[i];                           // reduce(add, x[i:i + k]): left to right
        for (let j = i + 1; j < i + k && j < x.length; j++) acc += x[j];
        y[i] = acc / k;
      }
      x = y;
    }
  }
  const step = sr / to, out = [], last = x.length - 1;
  let p = 0.0;
  while (p < last) {
    const i = Math.trunc(p), f = p - i;
    out.push(x[i] * (1 - f) + x[i + 1] * f);
    p += step;
  }
  return out;
}

function peak(x, floor = 1e-9) {
  let m = floor;
  for (const v of x) { const a = Math.abs(v); if (a > m) m = a; }
  return m;
}

// sampleio.to_int16: peak normalised to 30000
export function toInt16(x) {
  const pk = peak(x), out = new Int16Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.trunc(x[i] / pk * 30000)));
  return out;
}

// sampleio.trim_silence: cut the silence at both ends (floor 0.001 = -60 dBFS), keep 1 ms before the
// sound, keep 5 ms after it and fade that tail to 0
export function trimSilence(x, sr, floor = 0.001, preMs = 1, fadeMs = 5) {
  let first = -1, last = -1;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > floor) { if (first < 0) first = i; last = i; }
  if (first < 0) return x;
  const pre = Math.floor(sr * preMs / 1000), nf = Math.floor(sr * fadeMs / 1000);
  const y = x.slice(Math.max(0, first - pre), Math.min(x.length, last + 1 + nf)), m = Math.min(nf, y.length);
  for (let j = 0; j < m; j++) { const k = y.length - m + j; y[k] = y[k] * ((m - 1 - j) / m); }
  return y;
}

// Shared source selection keeps A/B on the same trim and one-bar cut.
function selectLoopSource(x, sr, bars, trim) {
  if (trim) x = trimSilence(x, sr);
  if (bars) {
    const n = barsOf(x.length / sr)[0];
    x = x.slice(0, Math.round(x.length / n));
  }
  return x;
}

// upload_breaks.cut: mono floats at their rate -> int16 at `rate` (one bar if bars; silence cut if trim)
export function cut(x, sr, bars, rate = RATE, trim = false) {
  const y = resample(selectLoopSource(x, sr, bars, trim), sr, rate);
  const pk = peak(y);
  return toInt16(y.map((v) => v * (0.95 / pk)));
}

// PR362 import method: downsample to fewer stored samples and write the matching lower zone rate.
// n/rate retains the loop duration; lower bandwidth and the IMA encode/decode change its texture.
export function applyOldschool(s, storageRate, factor = OLDSCHOOL_FACTOR) {
  if (!Number.isFinite(factor) || factor < 1 || factor > 8) throw new Error("Invalid oldschool factor.");
  if (factor === 1) return { s, rate: storageRate };
  const x = [];
  for (let i = 0; i < s.length; i++) x.push(s[i] / 32768);
  const y = resample(x, storageRate, storageRate / factor);
  const out = toInt16(y.map((v) => v * 0.95));
  const playbackRate = Math.round(storageRate / factor);
  if (out.length < MIN_LOOP_SAMPLES)
    throw new Error(`too short after oldschool processing (${out.length} samples)`);
  return { s: out, rate: playbackRate };
}

export function cutLoop(x, sr, bars, storageRate = RATE, trim = false, gritFactor = 1) {
  let s = cut(x, sr, bars, storageRate, trim);
  let rate = storageRate;
  if (gritFactor > 1) ({ s, rate } = applyOldschool(s, storageRate, gritFactor));
  return { s, rate };
}

export function gritLabel(factor) {
  const g = OLDSCHOOL_GRIT.find((o) => o.factor === factor);
  return g && g.factor > 1 ? g.label : "";
}

// Encoded preview at the saved zone rate; device tempo, pitch and performance controls remain separate.
export function loopPreviewPcm(s, playbackRate, roundTrip = true) {
  const pcm = roundTrip ? imaDecode(imaEncode(s), s.length) : s;
  const samples = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) samples[i] = pcm[i] / 32768;
  return { samples, rate: playbackRate };
}

// Prepare from the retained decoded original, never from an already processed loop.
// The baseline is the same bar/trim at 44.1 kHz; actual ADPCM bytes include odd-sample nibble padding.
export function prepareLoopImport(x, sr, { bars = true, trim = false, storageRate = RATE, gritFactor = 1 } = {}) {
  if (!Number.isFinite(sr) || sr <= 0 || !x.length || !Array.from(x).every(Number.isFinite))
    throw new Error("The source audio has invalid samples or sample rate.");
  if (storageRate !== RATE && storageRate !== RATE_HALF) throw new Error("Invalid import rate.");
  if (!Number.isFinite(gritFactor) || gritFactor < 1 || gritFactor > 8) throw new Error("Invalid oldschool factor.");
  const selected = selectLoopSource(x, sr, bars, trim);
  // A same-cut mono reference at the decoded source rate, before resampling/codec.
  // Match the import peak target, not perceived loudness; encoded playback stays exact.
  const scale = (30000 / 32768) / peak(selected);
  const reference = Float32Array.from(selected, v => v * scale);
  const baseline = cut(x, sr, bars, RATE, trim);
  const { s, rate } = cutLoop(x, sr, bars, storageRate, trim, gritFactor);
  if (s.length < MIN_LOOP_SAMPLES) throw new Error("This loop is too short for BREAK playback (64 samples minimum).");
  const adpcm = imaEncode(s), baselineBytes = Math.ceil(baseline.length / 2);
  return { s, rate, n: s.length, adpcm, baselineSamples: baseline.length, baselineBytes,
    savedBytes: baselineBytes - adpcm.length, gritFactor, storageRate, reference, referenceRate: sr };
}

// sampleio.ima_encode: 4-bit IMA ADPCM, low nibble first, from predictor 0 / index 0
export function imaEncode(s) {
  let pred = 0, idx = 0;
  const out = new Uint8Array((s.length + 1) >> 1);
  for (let n = 0; n < s.length; n++) {
    const step = IMA_STEP[idx];
    let diff = s[n] - pred, code = 0;
    if (diff < 0) { code = 8; diff = -diff; }
    let vd = step >> 3;
    if (diff >= step) { code |= 4; diff -= step; vd += step; }
    if (diff >= step >> 1) { code |= 2; diff -= step >> 1; vd += step >> 1; }
    if (diff >= step >> 2) { code |= 1; vd += step >> 2; }
    pred = code & 8 ? pred - vd : pred + vd;
    if (pred > 32767) pred = 32767; else if (pred < -32768) pred = -32768;
    idx += IMA_IDX[code & 7];
    if (idx < 0) idx = 0; else if (idx > 88) idx = 88;
    out[n >> 1] |= n & 1 ? code << 4 : code;
  }
  return out;
}

// the reverse, for drawing a slot read back from the FM-1: nibbles -> int16, from predictor 0 / index 0
export function imaDecode(b, n) {
  let pred = 0, idx = 0;
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const code = (b[i >> 1] >> (i & 1 ? 4 : 0)) & 15, step = IMA_STEP[idx];
    let vd = step >> 3;
    if (code & 4) vd += step;
    if (code & 2) vd += step >> 1;
    if (code & 1) vd += step >> 2;
    pred = code & 8 ? pred - vd : pred + vd;
    if (pred > 32767) pred = 32767; else if (pred < -32768) pred = -32768;
    idx += IMA_IDX[code & 7];
    if (idx < 0) idx = 0; else if (idx > 88) idx = 88;
    out[i] = pred;
  }
  return out;
}

// a slot header (userSlot's layout) -> {nz, name, dataLen, zones: [{off, n, rate}]}, or null if not a slot
export function parseSlot(hdr) {
  const v = new DataView(hdr.buffer || hdr, hdr.byteOffset || 0, hdr.byteLength);
  if (hdr.byteLength < SLOT_HDR_LEN || v.getUint32(0, true) !== 0x504D5346) return null;
  const nz = hdr[6], zones = [];
  let name = "";
  for (let i = 8; i < 16 && hdr[i]; i++) name += String.fromCharCode(hdr[i]);
  for (let i = 0; i < nz && i < SLOT_ZONES; i++)
    zones.push({ off: v.getUint32(32 + i * 28, true), n: v.getUint32(32 + i * 28 + 4, true),
      rate: Math.round(v.getUint32(32 + i * 28 + 16, true) * 44100 / 65536) });
  return { nz, name, dataLen: v.getUint32(16, true), zones };
}

let CRC_T = null;
export function crc32(b) {                    // zlib.crc32
  if (!CRC_T) {
    CRC_T = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      CRC_T[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function keySplit(roots) {
  const n = roots.length;
  return roots.map((r, j) => [j === 0 ? 0 : ((roots[j - 1] + r) >> 1) + 1, j === n - 1 ? 127 : (r + roots[j + 1]) >> 1]);
}

// sampleio.user_slot for loops at `rate` (each its own zone, roots ROOT_BASE + i): -> {hdr, data}
export function userSlot(name, loops, rate = RATE, slotSize = SLOT_SIZE) {
  return userSlotRaw(name, loops.map((s) => ({ adpcm: imaEncode(s), n: s.length, rate })), slotSize);
}

// the same from loops already encoded ({adpcm, n, rate}: the break page keeps a loop read back as it is,
// at its own rate)
export function userSlotRaw(name, parts, slotSize = SLOT_SIZE) {
  const total = parts.reduce((a, p) => a + p.adpcm.length, 0), max = slotSize - SLOT_DATA_OFF;
  if (total > max) throw new Error(`too long: ${total} B of ADPCM, a slot holds ${max} B`);
  if (parts.length < 1 || parts.length > SLOT_ZONES) throw new Error(`1..${SLOT_ZONES} loops per slot`);
  const data = new Uint8Array(total);
  const zs = [];
  let off = 0;
  parts.forEach((p, i) => {
    data.set(p.adpcm, off);
    zs.push({ off, n: p.n, root: ROOT_BASE + i, q16: Math.round(p.rate / 44100 * 65536) });
    off += p.adpcm.length;
  });
  const split = keySplit(zs.map((z) => z.root));
  const hdr = new Uint8Array(SLOT_HDR_LEN), v = new DataView(hdr.buffer);
  v.setUint32(0, 0x504D5346, true);
  v.setUint16(4, 1, true);
  hdr[6] = zs.length;
  const nm = name.toUpperCase().replace(/[^\x20-\x7E]/g, "").slice(0, 8);
  for (let i = 0; i < nm.length; i++) hdr[8 + i] = nm.charCodeAt(i);
  v.setUint32(16, data.length, true);
  v.setUint32(20, crc32(data), true);
  zs.forEach((z, i) => {
    const o = 32 + i * 28;
    v.setUint32(o, z.off, true);
    v.setUint32(o + 4, z.n, true);
    v.setUint32(o + 8, 0, true);               // loop start
    v.setUint32(o + 12, z.n - 1, true);        // loop end
    v.setUint32(o + 16, z.q16, true);
    v.setInt16(o + 20, z.root * 16, true);
    v.setInt16(o + 22, 0, true);               // predictor and index at the loop start: from 0
    hdr[o + 24] = 0;
    hdr[o + 25] = split[i][0];
    hdr[o + 26] = split[i][1];
  });
  return { hdr, data };
}

// upload_breaks.pack: loops [{label, s}] in order into at most nslots slots; cap: ADPCM bytes a slot, one
// number or one per slot -> {slots: one list per slot (empty ones included, none after the last used one),
// skipped}. A loop goes into the current slot if it fits, else into the next slot that can take it.
export function pack(loops, nslots, cap = SLOT_MAX_DATA) {
  const caps = Array.isArray(cap) ? cap : new Array(nslots).fill(cap);
  const slots = Array.from({ length: nslots }, () => []), skipped = [];
  let cur = 0, used = 0;
  for (const l of loops) {
    const need = (l.s.length + 1) >> 1;
    let j = cur;
    while (j < nslots && !((j === cur ? used : 0) + need <= caps[j] && slots[j].length < SLOT_ZONES)) j++;
    if (j >= nslots) { skipped.push(l.label); continue; }
    if (j !== cur) { cur = j; used = 0; }
    slots[cur].push(l);
    used += need;
  }
  while (slots.length && !slots[slots.length - 1].length) slots.pop();
  return { slots, skipped };
}

// fm1_sample_upload.pack7: groups of up to 7 bytes, each preceded by their top bits (7 to 8: the slot
// commands' packing; fm1ota.js's pack7 is the update protocol's bit stream, another thing)
export function pack78(b) {
  const out = [];
  for (let i = 0; i < b.length; i += 7) {
    const g = b.slice(i, i + 7);
    let m = 0;
    g.forEach((x, j) => { m |= ((x >> 7) & 1) << j; });
    out.push(m);
    for (const x of g) out.push(x & 0x7F);
  }
  return out;
}

// a 16-bit / 24-bit / float WAV -> {rate, x: mono floats} (sampleio.read_any_wav; the page decodes
// other formats with the browser's decoder)
export function readWav(buf) {
  const d = new DataView(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength);
  const tag4 = (o) => String.fromCharCode(d.getUint8(o), d.getUint8(o + 1), d.getUint8(o + 2), d.getUint8(o + 3));
  if (d.byteLength < 12 || tag4(0) !== "RIFF" || tag4(8) !== "WAVE") throw new Error("not a WAV file");
  const ch = {};
  for (let i = 12; i + 8 <= d.byteLength;) {
    const id = tag4(i), n = d.getUint32(i + 4, true);
    if (!(id in ch)) ch[id] = [i + 8, n];
    i += 8 + n + (n & 1);
  }
  if (!ch["fmt "]) throw new Error("WAV without a fmt chunk");
  const fo = ch["fmt "][0];
  let tag = d.getUint16(fo, true);
  const nch = d.getUint16(fo + 2, true), sr = d.getUint32(fo + 4, true), bits = d.getUint16(fo + 14, true);
  if (tag === 0xFFFE) tag = d.getUint16(fo + 24, true);
  const bps = bits >> 3;
  if ((tag !== 1 && tag !== 3) || !bps || !nch) throw new Error(`unsupported WAV (tag ${tag}, ${bits} bit)`);
  const [o, n] = ch.data || [0, 0];
  const frame = bps * nch, nfr = Math.floor(Math.min(n, d.byteLength - o) / frame);
  const val = (p) => {
    if (tag === 3) return bps === 4 ? d.getFloat32(p, true) : d.getFloat64(p, true);
    if (bps === 2) return d.getInt16(p, true) / 32768;
    if (bps === 3) return ((d.getUint8(p) << 8 | d.getUint8(p + 1) << 16 | d.getUint8(p + 2) << 24) >> 0) / 2147483648;
    if (bps === 4) return d.getInt32(p, true) / 2147483648;
    return (d.getUint8(p) - 128) / 128;
  };
  const x = new Array(nfr);
  for (let f = 0; f < nfr; f++) {
    const p = o + f * frame;
    if (nch === 1) x[f] = val(p);
    else if (nch === 2) x[f] = (val(p) + val(p + bps)) / 2;
    else { let acc = 0.0; for (let c = 0; c < nch; c++) acc += val(p + c * bps); x[f] = acc / nch; }
  }
  return { rate: sr, x };
}

// ---- slot backup and restore: tools/x0x_slots.py's .x0xslots archive, byte for byte ----------
// "X0XSLOTS", u16 version 1, u16 0, u32 L, L bytes of JSON, the slot images, u32 CRC-32 of all before.
// An image is a slot from its start: the 512-byte header area, then the ADPCM data.

export const SLOT_HDR_AREA = 512;
const ARCH_MAGIC = "X0XSLOTS";

// a slot name as text: printable ASCII kept, anything else "?" (x0x_slots.ascii_name)
export function asciiName(b) {
  let s = "";
  for (const c of b) s += c >= 32 && c < 127 ? String.fromCharCode(c) : "?";
  return s;
}

// SMP_INFO reply (the bytes after the command) -> {count, size, ext, slots: [{nz, name, kb, size, off, used}]}
// (x0x_slots.parse_info). size: the reply's one size (KiB, 7 bits: the smallest slot). Per slot size, flash
// offset (null if unknown) and used KiB come from X0X's extension ('X', 1, then per slot offset and size in
// 4 KiB sectors and used KiB, 14 bits each); without it every slot has the one size.
export function parseInfo(r) {
  if (r.length < 2) throw new Error("short SMP_INFO reply");
  const count = r[0], size = r[1] * 1024, slots = [];
  if (count < 1) throw new Error("invalid SMP_INFO slot count");
  let i = 2;
  for (let k = 0; k < count; k++) {
    const nz = r[i], j = r.indexOf(0, i + 1);
    slots.push({ nz, name: asciiName(r.slice(i + 1, j)), kb: r[j + 1], size, off: null, used: r[j + 1] });
    i = j + 2;
  }
  const ext = r[i] === 0x58;
  // Unknown metadata after the descriptors cannot become a legacy preservation map.
  if (i < r.length && !ext) throw new Error("unknown SMP_INFO trailing metadata");
  if (ext && (r[i + 1] !== 1 || r.length !== i + 2 + 6 * count))
    throw new Error("truncated or unsupported SMP_INFO flash-map extension");
  if (ext) {
    const ranges = [];
    slots.forEach((sl, k) => {
      const v = [0, 1, 2].map((m) => r[i + 2 + 6 * k + 2 * m] | r[i + 3 + 6 * k + 2 * m] << 7);
      const off = v[0] * 0x1000, size = v[1] * 0x1000, end = off + size;
      // Validate every range before preservation decisions: two occupied slots
      // must never alias one kept destination and silently bypass the backup.
      if (!off || size < SLOT_HDR_AREA || v[2] * 1024 > size ||
          ranges.some(([lo, hi]) => off < hi && lo < end))
        throw new Error(`slot ${k + 1}: invalid or overlapping SMP_INFO flash range`);
      // Firmware saturates only the legacy byte; both fields describe the same used KiB.
      if (sl.kb !== Math.min(127, v[2]))
        throw new Error(`slot ${k + 1}: legacy/extended used-size disagreement`);
      ranges.push([off, end]);
      Object.assign(sl, { off, size, used: v[2] });
    });
  }
  return { count, size, ext, slots };
}

// a slot's first 480 bytes -> {nz, name, dataLen, crc, zones: [{off, n, rate}]} or null (x0x_slots.parse_header)
export function parseHeader(b) {
  if (b.length < SLOT_HDR_LEN) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const nz = b[6];
  if (v.getUint32(0, true) !== 0x504D5346 || v.getUint16(4, true) !== 1 || nz < 1 || nz > 16) return null;
  let e = 8;
  while (e < 16 && b[e]) e++;
  const zones = [];
  for (let z = 0; z < nz; z++) {
    const o = 32 + z * 28, q16 = v.getUint32(o + 16, true);
    zones.push({ off: v.getUint32(o, true), n: v.getUint32(o + 4, true), rate: Number((BigInt(q16) * 44100n + 32768n) >> 16n) });
  }
  return { nz, name: asciiName(b.subarray(8, e)), dataLen: v.getUint32(16, true), crc: v.getUint32(20, true), zones };
}

// layout: parseInfo(); images: per slot, Uint8Array or null -> the archive (x0x_slots.make_archive)
export function makeArchive(layout, images, created) {
  const entries = [], blobs = [];
  let off = 0;
  images.forEach((img, k) => {
    const sl = layout.slots[k] || {};
    const e = { slot: k + 1, size: sl.size ?? layout.size, empty: img === null };
    if (sl.off !== null && sl.off !== undefined) e.flash = sl.off;
    if (img !== null) {
      const h = parseHeader(img);
      Object.assign(e, { name: h.name, zones: h.nz, samples: h.zones.map((z) => z.n), rates: h.zones.map((z) => z.rate),
        data_len: h.dataLen, data_crc32: h.crc, offset: off, length: img.length, crc32: crc32(img) });
      blobs.push(img);
      off += img.length;
    }
    entries.push(e);
  });
  const meta = { format: "x0xslots", version: 1, created, count: layout.count, size: layout.size, slots: entries };
  const js = new TextEncoder().encode(JSON.stringify(meta));
  const out = new Uint8Array(16 + js.length + off + 4), v = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) out[i] = ARCH_MAGIC.charCodeAt(i);
  v.setUint16(8, 1, true);
  v.setUint16(10, 0, true);
  v.setUint32(12, js.length, true);
  out.set(js, 16);
  let p = 16 + js.length;
  for (const b of blobs) { out.set(b, p); p += b.length; }
  v.setUint32(p, crc32(out.subarray(0, p)), true);
  return out;
}

// archive bytes -> {meta, images}; throws on any damage (x0x_slots.read_archive)
export function readArchive(b) {
  const bad = (m) => { throw new Error(m); };
  const uint = (x, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(x) && x >= 0 && x <= max;
  if (b.length < 20 || String.fromCharCode(...b.subarray(0, 8)) !== ARCH_MAGIC) bad("This is not an .x0xslots backup.");
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getUint32(b.length - 4, true) !== crc32(b.subarray(0, b.length - 4))) bad("The backup file is damaged (CRC).");
  if (v.getUint16(8, true) !== 1 || v.getUint16(10, true) !== 0) bad("This backup has an unsupported format.");
  const n = v.getUint32(12, true), base = 16 + n;
  if (base > b.length - 4) bad("The backup metadata exceeds the file length.");
  const meta = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(b.subarray(16, base)));
  // Both archive writers serialize one contiguous image per populated slot, in slot order.
  // Require that exact layout: a valid outer CRC alone cannot establish which data a slot owns.
  const slots = meta && meta.slots;
  if (!meta || meta.format !== "x0xslots" || meta.version !== 1 || !Array.isArray(slots) ||
      !uint(meta.count) || meta.count !== slots.length || !uint(meta.size) || meta.size < SLOT_HDR_AREA)
    bad("The backup file has invalid slot metadata.");
  const imageFields = ["name", "zones", "samples", "rates", "data_len", "data_crc32", "offset", "length", "crc32"];
  const images = [];
  let used = 0;
  for (let k = 0; k < slots.length; k++) {
    const e = slots[k];
    if (!e || typeof e !== "object" || Array.isArray(e) || e.slot !== k + 1)
      bad(`The backup file has a bad slot number for entry ${k + 1}.`);
    if (!uint(e.size) || e.size < SLOT_HDR_AREA || ("flash" in e && !uint(e.flash)) || typeof e.empty !== "boolean")
      bad(`Slot ${e.slot} in the backup has invalid metadata.`);
    if (e.empty) {
      if (imageFields.some((f) => f in e)) bad(`Slot ${e.slot} has conflicting empty/image metadata.`);
      images.push(null);
      continue;
    }
    if (!uint(e.offset) || e.offset !== used || !uint(e.length) || e.length < SLOT_HDR_AREA ||
        e.length > b.length - 4 - base - used || e.length > e.size || !uint(e.crc32, 0xFFFFFFFF))
      bad(`Slot ${e.slot} in the backup has invalid image range metadata.`);
    const img = b.slice(base + used, base + used + e.length), h = parseHeader(img);
    if (crc32(img) !== e.crc32) bad(`Slot ${e.slot} in the backup is damaged.`);
    if (!h || img.length !== SLOT_HDR_AREA + h.dataLen || crc32(img.subarray(SLOT_HDR_AREA)) !== h.crc)
      bad(`Slot ${e.slot} in the backup is not a valid slot.`);
    // Match the device scanner before restore is allowed to erase a destination.
    const iv = new DataView(img.buffer, img.byteOffset, img.byteLength);
    for (let z = 0; z < h.nz; z++) {
      const o = 32 + z * 28, zone = h.zones[z], q16 = iv.getUint32(o + 16, true);
      if (zone.off > h.dataLen || Math.ceil(zone.n / 2) > h.dataLen - zone.off ||
          img[o + 24] > 88 || q16 === 0 || q16 > (4 << 16))
        bad(`Slot ${e.slot} in the backup has an invalid sample zone.`);
    }
    const equalArray = (a, expected) => Array.isArray(a) && a.length === expected.length && a.every((x, i) => x === expected[i]);
    if (e.name !== h.name || e.zones !== h.nz || e.data_len !== h.dataLen || e.data_crc32 !== h.crc ||
        !equalArray(e.samples, h.zones.map((z) => z.n)) || !equalArray(e.rates, h.zones.map((z) => z.rate)))
      bad(`Slot ${e.slot} metadata does not match its original header.`);
    images.push(img);
    used += img.length;
  }
  if (base + used !== b.length - 4) bad("The backup contains unreferenced sample data.");
  return { meta, images };
}

// a slot's size on a device with this layout (per slot with X0X's SMP_INFO extension)
export const slotSize = (layout, k) => (layout.slots[k] && layout.slots[k].size) || layout.size;

// which archive slots go where on a device with this layout -> {todo: [{k, img}], skipped: [text]}
export function planRestore(layout, images) {
  const todo = [], skipped = [];
  images.forEach((img, k) => {
    if (k >= layout.count) skipped.push(`slot ${k + 1}: this device has ${layout.count} slots`);
    else if (img !== null && img.length > slotSize(layout, k)) skipped.push(`slot ${k + 1}: too large for this device's slot ${k + 1}`);
    else todo.push({ k, img });
  });
  return { todo, skipped };
}

// ---- an install that changes the slot map (tools/x0x_slots.py and tools/fm1_install.py, the same rules) ----
// A slot keeps its data over an install when the new firmware has a slot at the same flash offset that is
// large enough: no install writes the slots. The others are saved first and written back after.
export const LEGACY_BASE = { smk: 0xC2000, fm1: 0xA0000 };   // X0X before the SMP_INFO extension: equal slots
const SLOTMAP_MAGIC = "X0X-SLOTMAP-1\0\0\0", LOADER_MARK = "FELUCCA-LOADER-1";

function findBytes(b, text) {
  const t = [...text].map((c) => c.charCodeAt(0));
  outer: for (let i = b.indexOf(t[0]); i >= 0 && i + t.length <= b.length; i = b.indexOf(t[0], i + 1)) {
    for (let j = 1; j < t.length; j++) if (b[i + j] !== t[j]) continue outer;
    return i;
  }
  return -1;
}

// [{off, size}] per slot of a parseInfo() layout (x0x_slots.flash_map)
export function flashMap(layout, board = "smk") {
  if (layout.ext) return layout.slots.map((sl) => ({ off: sl.off, size: sl.size }));
  return layout.slots.map((_, k) => ({ off: LEGACY_BASE[board] + k * layout.size, size: layout.size }));
}

// Read only CRC-checked package files, never trust markers in header/padding.
function slotPackageFiles(image) {
  const crc16 = b => {
    let c = 0;
    for (const x of b) {
      c ^= x << 8;
      for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF;
    }
    return c;
  };
  const decode = b => {
    const out = Uint8Array.from(b); let key = 0xFFFF;
    for (let j = 0; j < out.length; j++) {
      out[j] ^= key & 0xFF;
      key = ((key << 1) ^ (key & 0x8000 ? 0x1021 : 0)) & 0xFFFF;
    }
    return out;
  };
  if (image.length < 64) return null;
  const hdr = decode(image.subarray(0, 64)), h = new DataView(hdr.buffer, hdr.byteOffset, hdr.byteLength);
  const count = h.getUint16(8, true), end = 64 + count * 80;
  if (crc16(hdr.subarray(2)) !== h.getUint16(0, true) || h.getUint32(4, true) !== image.length ||
      count < 1 || count > 8 || end > image.length || crc16(image.subarray(64, end)) !== h.getUint16(2, true)) return null;
  const files = {}; let priorEnd = end;
  for (let j = 0; j < count; j++) {
    const entry = decode(image.subarray(64 + j * 80, 144 + j * 80));
    const v = new DataView(entry.buffer, entry.byteOffset, entry.byteLength);
    const off = v.getUint32(8, true), size = v.getUint32(12, true);
    if (!size || off < priorEnd || off + size > image.length) return null;
    const data = image.subarray(off, off + size);
    if (crc16(data) !== v.getUint16(4, true)) return null;
    for (const [name, type] of [["flash.bin", 0], ["ota.bin", 100]]) {
      if (v.getUint16(0, true) === type) {
        if (files[name] || findBytes(entry.subarray(64), name + "\0") !== 0) return null;
        files[name] = data;
      }
    }
    priorEnd = off + size;
  }
  return files["flash.bin"] ? files : null;
}

// the slot map of a package's logical image (fm1pkg_make.slotmap_of): its slot map record; for an older X0X
// (Felucca loader, no record) the equal 80 KiB slots of that time; [] for any other package (stock firmware)
export function packageSlotMap(image, board = "smk") {
  const files = slotPackageFiles(image);
  if (!files) return [];
  const flash = files["flash.bin"], i = board === "fm1" ? 0x92F00 : 0x9CF00;
  if (i + 24 <= flash.length && findBytes(flash.subarray(i, i + 16), SLOTMAP_MAGIC) === 0) {
    const v = new DataView(flash.buffer, flash.byteOffset, flash.byteLength), n = v.getUint32(i + 16, true);
    const end = i + 20 + 8 * n;
    if (n <= 16 && end + 4 <= flash.length && v.getUint32(end, true) === crc32(flash.subarray(i, end))) {
      const m = [];
      for (let k = 0; k < n; k++) m.push({ off: v.getUint32(i + 20 + 8 * k, true), size: v.getUint32(i + 24 + 8 * k, true) });
      return m;
    }
    return []; // A damaged current record cannot claim the legacy layout.
  }
  if (!files["ota.bin"] || findBytes(files["ota.bin"], LOADER_MARK) < 0) return [];
  return Array.from({ length: board === "smk" ? 2 : 3 }, (_, k) => ({ off: LEGACY_BASE[board] + k * 0x14000, size: 0x14000 }));
}

// slot indexes that hold samples and that the new map does not keep (x0x_slots.at_risk)
export function atRisk(layout, oldMap, newMap) {
  const risk = [];
  layout.slots.forEach((sl, k) => {
    if (!sl.nz) return;
    const off = oldMap[k].off, need = SLOT_HDR_AREA + sl.used * 1024;
    if (!newMap.some((m) => m.off === off && m.size >= need)) risk.push(k);
  });
  return risk;
}

// -> {todo: [{k: old slot, j: new slot}], skipped: [text]} (x0x_slots.plan_migration): a slot at risk goes back
// to the slot with its number if it fits there, else to the first other slot that is empty, not kept and large enough
export function planMigration(images, risk, oldMap, newLayout, newMap) {
  const kept = new Set();
  newMap.forEach((m, j) => oldMap.forEach((o, k) => { if (images[k] !== null && !risk.includes(k) && o.off === m.off) kept.add(j); }));
  const taken = new Set(kept), todo = [], skipped = [];
  for (const k of risk) {
    const img = images[k], order = (k < newMap.length ? [k] : []).concat(newMap.map((_, j) => j).filter((j) => j !== k));
    const j = order.find((j) => !taken.has(j) && img.length <= newMap[j].size && !newLayout.slots[j].nz);
    if (j === undefined) skipped.push(`slot ${k + 1} (${img.length} B): no free slot of that size on the new firmware`);
    else { todo.push({ k, j }); taken.add(j); }
  }
  return { todo, skipped };
}

export const X0X_NBREAKS_BUILTIN = 2;
const LOOP_MENU_GUARD = "LOOP menu order or indices would change; saved break pattern A/B indices could point at different loops. "
  + "The backup is retained. Restore samples manually to a compatible layout, then check and re-assign LOOP A/B in every saved pattern before playback.";

function userLoopMenuIds(layout, images, origins = null) {
  // scan_loops lists each zone, not each slot. Preserve original slot identity:
  // identical sample bytes in distinct slots are not interchangeable indices.
  const ids = [];
  layout.slots.forEach((sl, k) => {
    for (let z = 0; z < sl.nz; z++)
      ids.push(origins === null ? `old:${k}:${z}` : origins[k] === null ? `new:${k}:${z}` : `old:${origins[k]}:${z}`);
  });
  return ids;
}

function loopMenuAfterMigration(oldLayout, images, risk, oldMap, newMap, newLayout, todo) {
  const imgs = newMap.map(() => null), origins = newMap.map(() => null);
  const slots = newLayout.slots.map((sl) => ({ ...sl }));
  images.forEach((img, k) => {
    if (risk.includes(k) || !img) return;
    const off = oldMap[k].off;
    const j = newMap.findIndex((m) => m.off === off);
    if (j < 0) return;
    imgs[j] = img; origins[j] = k;
    slots[j] = { ...oldLayout.slots[k] };
  });
  todo.forEach(({ k, j }) => { imgs[j] = images[k]; origins[j] = k; slots[j] = { ...oldLayout.slots[k] }; });
  return userLoopMenuIds({ ...newLayout, slots }, imgs, origins);
}

export function migrationReordersLoopMenu(oldLayout, images, risk, oldMap, newLayout, newMap, todo) {
  if (!todo.length) return false;
  const before = userLoopMenuIds(oldLayout, images);
  const after = loopMenuAfterMigration(oldLayout, images, risk, oldMap, newMap, newLayout, todo);
  // Compare absolute common positions; skipped middle slots can shift indices
  // even when surviving entries retain their relative order. Trailing-only
  // omissions or additions leave all remaining original positions unchanged.
  return before.slice(0, after.length).some((id, i) => id !== after[i]);
}

export function guardMigrationLoopMenu(oldLayout, images, risk, oldMap, newLayout, newMap, todo, skipped) {
  if (!migrationReordersLoopMenu(oldLayout, images, risk, oldMap, newLayout, newMap, todo)) return { todo, skipped };
  const extra = [...skipped];
  for (const { k } of todo) extra.push(`slot ${k + 1}: not restored automatically (${LOOP_MENU_GUARD})`);
  return { todo: [], skipped: extra };
}

// ---- the slot commands over a link with send / read / drain (fm1ota.js's Link): SysEx F0 7D 46 4C cmd .. F7 ----
const ED = [0xF0, 0x7D, 0x46, 0x4C];

export function unpack78(a) {
  const out = [];
  for (let i = 0; i < a.length;) {
    const m = a[i++];
    for (let j = 0; j < 7 && i < a.length; j++) out.push(a[i++] | ((m >> j) & 1) << 7);
  }
  return new Uint8Array(out);
}

// one command -> the reply's bytes after the command; a lost frame is sent again (every slot command is safe to repeat)
export async function slotReq(link, cmd, args, ms = 3000, tries = 3) {
  for (let t = 0; t < tries; t++) {
    link.drain();
    if (!link.send([...ED, cmd, ...args, 0xF7])) throw new Error("The USB connection was lost.");
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const p = await link.read(end - Date.now());
      if (!p) break;
      if (p.length > 5 && p[1] === ED[1] && p[2] === ED[2] && p[3] === ED[3] && p[4] === cmd) return p.slice(5, p.length - 1);
    }
  }
  throw new Error(`The keyboard did not answer (slot command ${cmd}).`);
}

export async function readSlotLayout(link, ms = 3000, tries = 3) { return parseInfo(await slotReq(link, 15, [], ms, tries)); }

async function readSlotBytes(link, k, off, n, onPart) {
  const out = new Uint8Array(n);
  for (let at = 0; at < n;) {
    const want = Math.min(224, n - at), adr = off + at;
    const b = unpack78((await slotReq(link, 16, [k, adr & 0x7F, (adr >> 7) & 0x7F, (adr >> 14) & 0x7F, (want + 1) >> 1])).slice(4));
    if (!b.length) throw new Error(`slot ${k + 1}: no data`);
    out.set(b.subarray(0, Math.min(b.length, n - at)), at);
    at += Math.min(b.length, n - at);
    if (onPart) onPart(at, n);
  }
  return out;
}

// slot k as an image (the 512-byte header area, then the data), or null if it is empty. Reads only.
// Layout-aware callers pass the actual capacity; standalone legacy reads retain the 80 KiB default.
export async function readSlotImage(link, k, nz, onPart, capacity = SLOT_SIZE) {
  if (!nz) return null;
  if (!Number.isSafeInteger(capacity) || capacity < SLOT_HDR_AREA)
    throw new Error(`slot ${k + 1}: invalid sample slot capacity`);
  const area = await readSlotBytes(link, k, 0, SLOT_HDR_AREA), h = parseHeader(area.subarray(0, SLOT_HDR_LEN));
  if (!h) throw new Error(`slot ${k + 1}: occupied sample slot has an invalid header; backup stopped`);
  if (h.dataLen > capacity - SLOT_HDR_AREA)
    throw new Error(`slot ${k + 1}: sample data exceeds slot capacity`);
  const data = await readSlotBytes(link, k, SLOT_HDR_AREA, h.dataLen, onPart);
  if (crc32(data) !== h.crc) throw new Error(`slot ${k + 1}: the data read back does not match its CRC`);
  const img = new Uint8Array(SLOT_HDR_AREA + data.length);
  img.set(area);
  img.set(data, SLOT_HDR_AREA);
  return img;
}

// every slot -> {layout, images} (x0x_slots.backup): SMP_INFO and SMP_READ only
export async function backupSlots(link, onPart) {
  const layout = await readSlotLayout(link), images = [];
  for (let k = 0; k < layout.count; k++)
    images.push(await readSlotImage(link, k, layout.slots[k].nz, onPart && ((d, n) => onPart(k, d, n)), slotSize(layout, k)));
  return { layout, images };
}

// erase slot k and write the image (null: erase only); throws on a device error (x0x_slots.write_slot)
export async function writeSlotImage(link, k, img, onPart) {
  if (!img) {
    if ((await slotReq(link, 14, [k], 30000))[1]) throw new Error(`slot ${k + 1}: erase failed`);
    return;
  }
  if ((await slotReq(link, 11, [k], 10000))[1]) throw new Error(`slot ${k + 1}: begin (erase) failed`);
  const data = img.subarray(SLOT_HDR_AREA);
  for (let off = 0; off < data.length; off += 256) {
    const adr = SLOT_HDR_AREA + off;
    const r = await slotReq(link, 12, [k, adr & 0x7F, (adr >> 7) & 0x7F, (adr >> 14) & 0x7F, ...pack78(data.subarray(off, off + 256))]);
    if (r[4]) throw new Error(`slot ${k + 1}: write at 0x${adr.toString(16)} failed (${r[4]})`);
    if (onPart) onPart(Math.min(off + 256, data.length), data.length);
  }
  const e = await slotReq(link, 13, [k, ...pack78(img.subarray(0, SLOT_HDR_LEN))], 5000);
  if (e[1]) throw new Error(`slot ${k + 1}: the keyboard refused the header (${e[1]})`);
}

// write images[k] into new slot j for each {k, j}, then read each back and compare (x0x_slots.restore_mapped)
export async function restoreMapped(link, todo, images, onPart) {
  for (const { k, j } of todo) await writeSlotImage(link, j, images[k], onPart && ((d, n) => onPart(j, d, n)));
  const after = await readSlotLayout(link);
  for (const { k, j } of todo) {
    const got = await readSlotImage(link, j, after.slots[j].nz, undefined, slotSize(after, j));
    if (!got || got.length !== images[k].length || crc32(got) !== crc32(images[k]))
      throw new Error(`slot ${j + 1}: read back differs from the backup of slot ${k + 1}`);
  }
}

// an archive file name for now: x0x-slots-before-install-YYYYMMDD-HHMMSS.x0xslots, and its "created" text
export function archiveStamp(t = new Date()) {
  const p = (v) => String(v).padStart(2, "0");
  const created = `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`;
  return { created, name: `x0x-slots-before-install-${created.replace(/[-:]/g, "").replace("T", "-")}.x0xslots` };
}

const SNAPSHOT_COMMAND = 48, SNAPSHOT_TOKEN_SIZE = 16;
const snapshotFail = (message) => Object.assign(new Error(message), { code: "slotbackup" });

// Only an exact, read-only INFO capability permits a new command. Old X0X,
// stock and other custom firmware must not receive an unknown write command.
export async function hasInstallSnapshot(link) {
  let info;
  try { info = await slotReq(link, 1, [], 1000, 1); }
  catch (e) {
    if (/did not answer \(slot command 1\)/.test(e.message)) return false;
    throw e;
  }
  const z = info.indexOf(0);
  if (z < 0 || !/^X0X [\x20-\x7e]{1,20}$/.test(String.fromCharCode(...info.slice(0, z)))) return false;
  return info.length === z + 12 && info.slice(z + 7).every((b, k) => b === [0x58, 0x53, 0x47, 1, SNAPSHOT_COMMAND][k]);
}

// One request, never an authorization retry. Responses from another operation,
// token or ticket cannot authorize this backup. Leave later queued OTA reads
// untouched when returning the matching ACK.
async function snapshotRequest(link, op, token, ticket = null) {
  if (link.lost) throw snapshotFail("The USB connection was lost. Start a new install attempt.");
  const encoded = ticket === null ? [] : Array.from({ length: 4 }, (_, k) => (ticket >>> (7 * k)) & 127);
  link.drain();
  if (!link.send([...ED, SNAPSHOT_COMMAND, op, ...token, ...encoded, 0xF7]))
    throw snapshotFail("The USB connection was lost; no snapshot authorization was retried.");
  const end = Date.now() + 3000;
  while (Date.now() < end) {
    const p = await link.read(end - Date.now());
    if (!p) break;
    if (p.length < 6 || p[0] !== 0xF0 || p.at(-1) !== 0xF7 ||
        p[1] !== ED[1] || p[2] !== ED[2] || p[3] !== ED[3] || p[4] !== SNAPSHOT_COMMAND) continue;
    const r = Array.from(p).slice(5, -1);
    if (r[0] !== op) continue;
    if (r.length !== 22 || r.some(b => !Number.isInteger(b) || b < 0 || b > 127) || r[1] > 5)
      throw snapshotFail("The keyboard returned a malformed sample-snapshot acknowledgement.");
    if (!token.every((b, k) => r[k + 2] === b)) continue;
    const got = r.slice(18).reduce((n, b, k) => n + b * 2 ** (7 * k), 0);
    if (ticket !== null && got !== ticket) continue;
    if (r[1]) throw snapshotFail(r[1] === 4 ?
      "The samples changed after this backup began. No update was started. Make and retain a fresh backup before retrying." :
      "The sample snapshot is unavailable, busy or expired. No update was started. Finish other transfers and start a new install attempt.");
    if (!got) throw snapshotFail("The keyboard returned an invalid sample-snapshot ticket.");
    if (link.lost) throw snapshotFail("The USB connection was lost. The authorization was not retried.");
    return got;
  }
  throw snapshotFail("The keyboard did not acknowledge the sample snapshot. The authorization was not retried.");
}

export async function beginInstallSnapshot(link) {
  if (!globalThis.crypto?.getRandomValues)
    throw snapshotFail("Secure random tokens are unavailable. Use a supported secure browser; no update was started.");
  const token = new Uint8Array(SNAPSHOT_TOKEN_SIZE);
  do { crypto.getRandomValues(token); token.forEach((b, k) => { token[k] = b & 127; }); }
  while (token.every(b => b === 0));
  const ticket = await snapshotRequest(link, 1, token);
  return { token, ticket, consumed: false };
}

export async function commitInstallSnapshot(link, snapshot) {
  if (snapshot.consumed) throw snapshotFail("This sample snapshot has already been consumed. Start a new install attempt.");
  snapshot.consumed = true; // A lost reply may follow device admission. Never replay it.
  if (link.lost) throw snapshotFail("The USB connection was lost. Start a new install attempt.");
  // The Updater reacquires a link after backup. Same keyboard family is not a
  // capability promise: a restart/reconnect may expose older or stock firmware.
  // Recheck read-only INFO here, but never START again with this older archive.
  let capable;
  try { capable = await hasInstallSnapshot(link); }
  catch (e) { throw snapshotFail(`The final sample-snapshot capability check failed (${e.message}). No update was started.`); }
  if (!capable) throw snapshotFail("The reconnected keyboard does not support atomic sample-snapshot admission. No update was started. Start a new install attempt.");
  await snapshotRequest(link, 3, snapshot.token, snapshot.ticket);
}

async function cancelInstallSnapshot(link, snapshot) {
  if (!snapshot || snapshot.consumed) return;
  snapshot.consumed = true;
  try { await snapshotRequest(link, 2, snapshot.token, snapshot.ticket); }
  catch (_) { /* A passive watch holds no audio, UI or storage; preserve the original error. */ }
}

// The install with the slots kept (fm1_install.py's flow, for the installer page). up: fm1ota.js's Updater;
// hooks: {step(k, a) for up.install, say(key, detail), save(bytes, name) -> true / Promise<true> only after the backup is retained, progress(f),
// sameKeyboard(model, packageModel) (fm1ota.js's: the slots are read only when the install can go ahead)}.
// 1. If a slot holds samples the new firmware does not keep: read every slot into an .x0xslots archive and
//    await explicit retained-backup acknowledgement (only boolean true permits OTA).
//    2. Install. 3. Reconnect to the new firmware, write the slots back into its map, read them back.
// Throws the install's errors as they are; a failure in step 3 throws code "slots" (the archive is saved).
// -> {product, move: null or {risk, todo, skipped, name}}
export async function installKeepingSlots(up, image, product, board, hooks) {
  const h = Object.assign({ step() {}, say() {}, save() {}, progress() {}, sameKeyboard: () => true }, hooks);
  const fail = (code, msg, detail = "") => Object.assign(new Error(msg), { code, detail });
  let move = null, snapshot = null;
  const dev = await up.find((id) => !/^ota-/i.test(id.model));
  if (!dev) throw fail("notfound", "No running keyboard was found for sample preflight; no update was started.");
  if (!h.sameKeyboard(dev.id.model, product.split("_")[0])) {
    dev.link.close();
    throw fail("model", "The keyboard does not match this package; no update was started.");
  }
  {
    up.bind(dev);
    try {
      // Arm before FIRST layout/occupancy/risk reads, including empty slots.
      // Otherwise empty-to-occupied and in-progress-import races escape backup.
      try {
        if (await hasInstallSnapshot(dev.link)) snapshot = await beginInstallSnapshot(dev.link);
      } catch (e) { throw fail("slotbackup", `The sample snapshot could not be established (${e.message}). No update was started.`); }
      let layout;
      try { layout = await readSlotLayout(dev.link, 1000, 2); }
      catch (e) {
        const stock = dev.id.text === "FM-1_015" || (dev.id.version === 16 && /^(SMK-37[ +].*|MKE-P37|STARRYKEY-37.*)$/i.test(dev.id.model));
        if (stock && /did not answer \(slot command 15\)/.test(e.message)) layout = null;
        else throw fail("slotbackup", `The sample layout is unknown (${e.message}). Reconnect and retry; no update was started.`);
      }
      if (layout && !snapshot)
        throw fail("slotbackup", "This firmware cannot atomically protect the sample backup through update entry. No update was started. A separately verified preservation path is required for this older firmware.");
      if (layout && layout.slots.some((sl) => sl.nz)) {
        const oldMap = flashMap(layout, board), newMap = packageSlotMap(image, board);
        const risk = atRisk(layout, oldMap, newMap);
        if (risk.length) {
          h.say("slotsave", risk.map((k) => k + 1).join(", "));
          let saved;
          try {
            saved = await backupSlots(dev.link, (k, d, n) => h.progress((k + d / n) / layout.count));
          } catch (e) { throw fail("slotbackup", e.message); }
          const st = archiveStamp(), file = makeArchive(saved.layout, saved.images, st.created);
          readArchive(file);                                  // verify the in-memory archive
          let retained;
          try { retained = await h.save(file, st.name); }
          catch (e) { throw fail("slotbackupconfirm", "The recovery backup was not confirmed; no update was started.", st.name); }
          if (retained !== true)
            throw fail("slotbackupconfirm", "The recovery backup was not confirmed; no update was started.", st.name);
          // SMP_INFO can change while the backup is read. Use the exact verified
          // snapshot for preservation, just as the Python SlotMove.backup does.
          const savedMap = flashMap(saved.layout, board);
          move = { risk: atRisk(saved.layout, savedMap, newMap), oldMap: savedMap, newMap,
            layout: saved.layout, images: saved.images, name: st.name, todo: [], skipped: [] };
        }
      }
    } catch (e) {
      await cancelInstallSnapshot(dev.link, snapshot);
      throw e;
    } finally { dev.link.close(); }
  }
  const ran = await up.install(image, product, h.step,
    snapshot ? (dev) => commitInstallSnapshot(dev.link, snapshot) : null);
  if (!move || !move.newMap.length) return { product: ran, move };
  h.say("slotback");
  const back = await up.waitFor((id) => !/^ota-/i.test(id.model), 20000);
  if (!back) throw fail("slots", "the keyboard did not answer after the install", move.name);
  try {
    up.bind(back);
    const layout = await readSlotLayout(back.link);
    let plan = planMigration(move.images, move.risk, move.oldMap, layout, flashMap(layout, board));
    plan = guardMigrationLoopMenu(move.layout, move.images, move.risk, move.oldMap, layout,
      flashMap(layout, board), plan.todo, plan.skipped);
    move.todo = plan.todo;
    move.skipped = plan.skipped;
    const total = plan.todo.length || 1;
    await restoreMapped(back.link, plan.todo, move.images, (j, d, n) => h.progress(d / n / total));
  } catch (e) {
    throw fail("slots", e.message, move.name);
  } finally { back.link.close(); }
  return { product: ran, move };
}
