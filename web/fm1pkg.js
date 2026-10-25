// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Leo Kuroshita (@kurogedelic), Hügelton Instruments
//
// X0X .fwsc packages in the browser (FM-1 and SMK-37 family): the package identity,
// the image the device reads during an update, and the SMK-37's Bluetooth controller image.

const BLOCKS = 20, BLK = 0x30, KEEP = 0x2F;

// the package identity ("FM-1_904"): one marker byte after each of the first 20 blocks
export function productOf(fwsc) {
  if (fwsc.length < BLOCKS * BLK) throw new Error("not an FM-1 package (too short)");
  let s = "";
  for (let i = 0; i < BLOCKS; i++) {
    const m = fwsc[i * BLK + KEEP];
    if (m !== 0x7D) s += String.fromCharCode((m - i - 1) & 0xFF);
  }
  return s;
}

// the image the device addresses during an update: the .fwsc without the 20 marker bytes
export function logicalImage(fwsc) {
  const out = new Uint8Array(fwsc.length - BLOCKS);
  for (let i = 0; i < BLOCKS; i++) out.set(fwsc.subarray(i * BLK, i * BLK + KEEP), i * KEEP);
  out.set(fwsc.subarray(BLOCKS * BLK), BLOCKS * KEEP);
  return out;
}

// ---- the SMK-37 Bluetooth controller image (ctl.img, built by the user: ble/ctl) ----
// insertCtl puts it into the Bluetooth block of a package's logical image (flash 0x8B000, inside
// the encrypted app area) and writes the checksums again, as tools/add_ctl.py does (the same bytes:
// tests/ble_pkg_test.py). ctl = null writes an empty block.
const CTL_CODE_MAX = 0x86EE0, CTL_SIZE = 0x10000, CTL_SLOT = 0x97400, CTL_XIP = 0x02087000;
const CTL_RAM_LO = 0x01C01800, CTL_RAM_HI = 0x01C07F00;
const CTL_IRQ_TAKEN = [1, 11, 16, 20, 24, 37, 62, 63];

function pkCrc16(d, lo = 0, hi = d.length) {
  let c = 0;
  for (let i = lo; i < hi; i++) {
    c ^= d[i] << 8;
    for (let b = 0; b < 8; b++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF;
  }
  return c;
}
function pkEnc(d, off, n, key = 0xFFFF) {
  for (let i = 0; i < n; i++) {
    d[off + i] ^= key & 0xFF;
    key = ((key << 1) ^ (key & 0x8000 ? 0x1021 : 0)) & 0xFFFF;
  }
}
function pkSfc(d, off, n, key) {
  for (let i = 0; i < n; i += 32) pkEnc(d, off + i, Math.min(n - i, 32), (key ^ (i >> 2)) & 0xFFFF);
}
function pkChipKey(d) {
  let s = 0;
  for (let i = 0; i < 16; i++) s += d[i];
  s &= 0xFF;
  s = s >= 0xE0 ? 0xAA : s <= 0x10 ? 0x55 : s;
  let k = 0;
  for (let i = 0; i < 16; i++) if ((d[16 + i] ^ d[15 - i]) < s) k |= 1 << i;
  return k;
}
function pkCrc32(d, lo, hi, crc = 0) {
  crc = ~crc >>> 0;
  for (let i = lo; i < hi; i++) {
    crc ^= d[i];
    for (let b = 0; b < 8; b++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}
const pkU16 = (d, o) => d[o] | (d[o + 1] << 8);
const pkU32 = (d, o) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
const pkPut16 = (d, o, v) => { d[o] = v & 0xFF; d[o + 1] = (v >> 8) & 0xFF; };
const pkStarts = (d, o, s) => [...s].every((c, i) => d[o + i] === c.charCodeAt(0));

// what is wrong with a controller image (src/ble/ble_glue.h ble_img_check), or null
export function ctlProblem(img) {
  if (img.length < 68) return "too short for a controller image";
  if (img.length > CTL_SIZE) return `${img.length} B: larger than the 64 KiB Bluetooth block`;
  if (pkU32(img, 0) !== 0x43423058) return "not a controller image (no X0BC header)";
  if (pkU16(img, 4) !== 2 || pkU16(img, 6) !== 68 || pkU32(img, 20) !== 2) return "another header version or ABI";
  const size = pkU32(img, 12);
  if (size < 68 || size > img.length) return "image size does not fit the file";
  for (let i = size; i < img.length; i++) if (img[i] !== 0xFF) return "non-erased bytes after the controller image declared size";
  let c = pkCrc32(img, 0, 16);
  c = pkCrc32(new Uint8Array(4), 0, 4, c);
  c = pkCrc32(img, 20, size, c);
  if (c !== pkU32(img, 16)) return "CRC mismatch (a damaged file)";
  for (const o of [24, 28]) { const a = pkU32(img, o); if (a < CTL_XIP + 68 || a >= CTL_XIP + size) return "an entry outside the image"; }
  const slo = pkU32(img, 32), shi = pkU32(img, 36), rlo = pkU32(img, 40), rhi = pkU32(img, 44);
  if (!(CTL_RAM_LO <= rlo && rlo < rhi && rhi <= CTL_RAM_HI)) return "RAM outside the controller window";
  if (!(rlo <= slo && slo < shi && shi <= rhi) || shi & 7) return "interrupt stack outside its RAM";
  const ilo = pkU32(img, 48), ihi = pkU32(img, 52);
  for (const n of CTL_IRQ_TAKEN) if (((n < 32 ? ilo : ihi) >>> (n & 31)) & 1) return `it routes interrupt ${n}, which X0X uses`;
  return null;
}

// the slot map record (fm1pkg_make.slotmap_of): magic, u32 count, count x (u32 offset, u32 size), CRC-32
const CTL_SLOTMAP = [..."X0X-SLOTMAP-1\0\0\0"].map((c) => c.charCodeAt(0));
function pkHasSlotMap(d) {
  outer: for (let i = d.indexOf(CTL_SLOTMAP[0]); i >= 0 && i + 24 <= d.length; i = d.indexOf(CTL_SLOTMAP[0], i + 1)) {
    for (let j = 1; j < CTL_SLOTMAP.length; j++) if (d[i + j] !== CTL_SLOTMAP[j]) continue outer;
    const n = pkU32(d, i + 16), end = i + 20 + 8 * n;
    return n <= 16 && end + 4 <= d.length && pkU32(d, end) === pkCrc32(d, i, end);
  }
  return false;
}
export const CTL_NO_BLOCK = "the app code of this package goes into the Bluetooth block (flash 0x8B000-0x9AFFF). "
  + "It is an X0X from before the block. It takes no controller image (install it without one)";

// Shared decoder for insertion and read-only bundled-controller admission.
// Strict admission checks the complete installed files and nested app CRCs.
function pkOpenController(logical, strict = false) {
  const lg = new Uint8Array(logical);
  if (strict && lg.length < 0x40) throw new Error("package too short");
  const hdr = lg.slice(0, 0x40);
  pkEnc(hdr, 0, 0x40);
  if (pkCrc16(hdr, 2, 0x40) !== pkU16(hdr, 0)) throw new Error("package header CRC");
  const count = pkU16(hdr, 8);
  if (strict && (count !== 2 || pkU32(hdr, 4) !== lg.length)) throw new Error("NIGHTLY package length/file layout");
  if (strict && (count < 1 || count > 8 || 0x40 + 0x50 * count > lg.length)) throw new Error("package file list bounds");
  const lst = lg.slice(0x40, 0x40 + 0x50 * count);
  if (pkCrc16(lst) !== pkU16(hdr, 2)) throw new Error("package file list CRC");
  let priorEnd = 0x40 + 0x50 * count;
  if (strict) for (let j = 0; j < count; j++) {
    const entry = lst.slice(j * 0x50, (j + 1) * 0x50);
    pkEnc(entry, 0, 0x50);
    const off = pkU32(entry, 8), size = pkU32(entry, 12), type = pkU16(entry, 0);
    if (type !== (j === 0 ? 0 : 100) || !pkStarts(entry, 0x40, j === 0 ? "flash.bin\0" : "ota.bin\0"))
      throw new Error("NIGHTLY package file identity");
    if (type === 100 && !new TextDecoder().decode(lg.subarray(off, off + size)).includes("FELUCCA-LOADER-1"))
      throw new Error("NIGHTLY package has no Felucca update loader");
    if (size === 0 || off < priorEnd || off + size > lg.length) throw new Error("package file bounds");
    if ((type === 0 || type === 100) && pkCrc16(lg, off, off + size) !== pkU16(entry, 4))
      throw new Error("package file CRC");
    priorEnd = off + size;
  }
  let i = 0, e = null;
  for (; i < count; i++) {
    e = lst.slice(i * 0x50, (i + 1) * 0x50);
    pkEnc(e, 0, 0x50);
    if (pkU16(e, 0) === 0) break;
  }
  if (i === count) throw new Error("no flash.bin in the package");
  const off = pkU32(e, 8), size = pkU32(e, 12);
  const flash = lg.subarray(off, off + size);
  if (pkCrc16(flash) !== pkU16(e, 4)) throw new Error("flash.bin CRC");
  if (strict && flash.length !== 0x9D000) throw new Error("flash head bounds");
  const isd = flash.slice(64, 96);
  pkEnc(isd, 0, 32);
  if (!pkStarts(isd, 16, "isd_config.ini")) throw new Error("no isd_config.ini in the flash head");
  if (strict && (pkU32(isd, 8) < 32 || pkU32(isd, 4) < 0xA0 ||
      pkU32(isd, 4) + pkU32(isd, 8) > 0x4000)) throw new Error("chip key bounds");
  const key = pkChipKey(flash.subarray(pkU32(isd, 4), pkU32(isd, 4) + 32));
  const head = flash.slice(0x4000, 0x4020);
  pkSfc(head, 0, 32, key);
  const blk = pkU32(head, 8);
  if (pkU32(head, 4) !== 0x02000120 || !pkStarts(head, 16, "app_area_head")) throw new Error("no app area head");
  const n = (blk + 31) & ~31;
  if (strict && (blk < 0x120 + CTL_SLOT || blk > 0x9CF00 - 0x4000 || 0x4000 + n > 0x9CF00)) throw new Error("app area bounds");
  const area = flash.slice(0x4000, 0x4000 + n);
  pkSfc(area, 0, n, key);
  if (!pkStarts(area, 48, "app.bin") || pkU32(area, 36) !== 0x120) throw new Error("no app.bin in the app area");
  const slot = pkU32(area, 40);
  if (slot !== CTL_SLOT) throw new Error("not an SMK-37 package (the Bluetooth block is on the SMK-37 only)");
  if (strict && (pkCrc16(area, 2, 32) !== pkU16(area, 0) ||
      pkCrc16(area, 32, blk) !== pkU16(area, 2) ||
      pkCrc16(area, 34, 64) !== pkU16(area, 32) ||
      pkCrc16(area, 0x120, 0x120 + slot) !== pkU16(area, 34))) throw new Error("app area CRC");
  const lo = 0x120 + CTL_CODE_MAX;
  // the block must be free: empty, a controller image, or a package with the slot map record (the build
  // limits the app code since then). An older X0X has app code there: writing it would stop the unit.
  const blockFree = area.subarray(lo, lo + CTL_SIZE).every((b) => b === 0xFF) || pkU32(area, lo) === 0x43423058
    || pkHasSlotMap(lg);
  if (!blockFree) throw new Error(CTL_NO_BLOCK);
  return {lg, hdr, count, lst, i, e, off, size, flash, key, blk, n, area, slot, lo};
}

// Return exactly the declared image bytes, excluding erased slot padding.
// Empty, legacy code-owned, corrupt and unknown controller blocks fail closed.
export function controllerOf(logical) {
  const {area, lo, flash} = pkOpenController(logical, true);
  const map = 0x9CF00; // Current SMK flash layout, independent of arbitrary matching payloads.
  if (!CTL_SLOTMAP.every((b,j) => flash[map+j] === b) || pkU32(flash,map+16) !== 3 ||
      ![[0xC2000,0x14000],[0xD6000,0x1E000],[0xB0000,0xB000]].every(([off,size],j) =>
        pkU32(flash,map+20+j*8) === off && pkU32(flash,map+24+j*8) === size) ||
      pkU32(flash,map+44) !== pkCrc32(flash,map,map+44))
    throw new Error("bundled controller requires current SMK slot map");
  const block = area.slice(lo, lo + CTL_SIZE);
  if (block.length !== CTL_SIZE || block.every(b => b === 0xFF)) throw new Error("Bluetooth controller is missing from this package");
  const problem = ctlProblem(block);
  if (problem) throw new Error("embedded controller: " + problem);
  return block.slice(0, pkU32(block, 12));
}

// the logical image (logicalImage) with ctl in the Bluetooth block; throws on anything unexpected
export function insertCtl(logical, ctl) {
  if (ctl && ctlProblem(ctl)) throw new Error("ctl.img: " + ctlProblem(ctl));
  const {lg, hdr, lst, i, e, flash, key, blk, n, area, slot, lo} = pkOpenController(logical);
  area.fill(0xFF, lo, lo + CTL_SIZE);
  if (ctl) area.set(ctl, lo);
  pkPut16(area, 34, pkCrc16(area, 0x120, 0x120 + slot));
  pkPut16(area, 32, pkCrc16(area, 34, 64));
  pkPut16(area, 2, pkCrc16(area, 32, blk));
  pkPut16(area, 0, pkCrc16(area, 2, 32));
  pkSfc(area, 0, n, key);
  flash.set(area, 0x4000);
  pkPut16(e, 4, pkCrc16(flash));
  pkEnc(e, 0, 0x50);
  lst.set(e, i * 0x50);
  pkPut16(hdr, 2, pkCrc16(lst));
  pkPut16(hdr, 0, pkCrc16(hdr, 2, 0x40));
  pkEnc(hdr, 0, 0x40);
  lg.set(hdr, 0);
  lg.set(lst, 0x40);
  return lg;
}
