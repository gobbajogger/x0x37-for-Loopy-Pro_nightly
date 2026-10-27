// SPDX-License-Identifier: GPL-3.0-only
// Reused from gobbajogger/X0X37-for-Loopy-Pro 08d3164a265123cb4c84e5104642fd93257d63d7, web/x0x_projects.js.
// Selective consumer port from firmware 144f4e042bdfb2cc52ed16a1cf2a26a1148a0101.
// NOTE_SOUND stream 7 is intentionally unsupported by this NOTE0 website contract.
// X0X projects: an exact project snapshot and the original sample slot images.
// No audio decoder, encoder, resampler or slot remapping is used by this module.
import { crc32, pack78, unpack78, parseHeader, parseInfo, makeArchive, readArchive, slotSize } from "./x0x_breaks.js";

export const PROJECT_OP = Object.freeze({ QUERY: 64, EXPORT: 65, READ: 66, IMPORT: 67, WRITE: 68,
  COMMIT: 69, ABORT: 70, SAVE: 71, LOAD: 72, RESET: 73, VALIDATE: 74, ADOPT_BASS: 75 });
export const PROJECT_MAX_FILE = 4 * 1024 * 1024;
const PROJECT_MAGIC = "X0XPROJ\0", PROJECT_META_MAX = 16384, PROJECT_HEADER = 32;
const PROJECT_ED = [0xF0, 0x7D, 0x46, 0x4C], PROJECT_CONFIRM = [0x58, 0x30];
const PROJECT_ERRORS = ["", "Unsupported arguments or project version.", "Stop playback, recording and performance mode first.",
  "The project transfer offset is incorrect.", "The project checksum did not match.", "The project contains invalid settings or patterns.",
  "This project does not fit the keyboard.", "The keyboard could not access project storage.", "Confirmation is required.", "Choose and explicitly confirm both legacy bass engine identities before adoption."];
const fail = (message, code = "invalid") => Object.assign(new Error(message), { code });
const bytes = (b) => b instanceof Uint8Array ? b : new Uint8Array(b);
const view = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const integer = (v, lo, hi) => Number.isSafeInteger(v) && v >= lo && v <= hi;
const u21 = (n) => [n & 127, (n >>> 7) & 127, (n >>> 14) & 127];
const get21 = (a, at = 0) => a[at] | a[at + 1] << 7 | a[at + 2] << 14;
const hex256 = (s) => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
const keys = (o, required) => o && typeof o === "object" && !Array.isArray(o) &&
  Object.keys(o).length === required.length && required.every((k) => Object.hasOwn(o, k));

export function sameBytes(a, b) {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export async function sha256(b) {
  if (!globalThis.crypto?.subtle) throw fail("Secure file verification is unavailable. Open this page over HTTPS or localhost.", "crypto");
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", b));
  return Array.from(digest, (v) => v.toString(16).padStart(2, "0")).join("");
}

// The inner file is firmware's canonical persistent project schema, not a sample archive.
export function parseProject(b, expectedLength = null) {
  b = bytes(b);
  if (b.length < PROJECT_HEADER || b.length > 0x1FFFFF) throw fail("Invalid project file size.");
  const v = view(b);
  if (v.getUint32(0, true) !== 0x50583058) throw fail("The project header is missing.");
  const patternVersion=v.getUint32(20,true), soundRevision=v.getUint32(24,true);
  const knownSchema=(patternVersion===3 && (soundRevision===4 || soundRevision===10)) ||
    (patternVersion===6 && (soundRevision===10 || soundRevision===11));
  if(v.getUint32(4,true)!==1 || v.getUint32(16,true)!==1 || !knownSchema || v.getUint32(28,true)!==0)
    throw fail("This project uses an incompatible file, project, pattern or sound version.","version");
  if(patternVersion===6 && soundRevision===11 && b.length!==36452)
    throw fail("This tagged project has an unsupported structural layout.","version");
  if (v.getUint32(8, true) !== b.length - PROJECT_HEADER) throw fail("The project payload length is incorrect.");
  if (expectedLength !== null && b.length !== expectedLength) throw fail("The project size does not match this firmware.", "version");
  if (v.getUint32(12, true) !== crc32(b.subarray(PROJECT_HEADER))) throw fail("The project payload is damaged (CRC).");
  return { length: b.length, payloadLength: b.length - PROJECT_HEADER, fileVersion: 1, projectVersion: 1,
    patternVersion, soundRevision };
}

export function validateSlotImage(img, capacity) {
  if (img === null) return null;
  if (!(img instanceof Uint8Array) || !integer(capacity, 512, PROJECT_MAX_FILE) || img.length > capacity)
    throw fail("A sample image exceeds its slot capacity.", "capacity");
  const h = parseHeader(img);
  if (!h || img.length !== 512 + h.dataLen || crc32(img.subarray(512)) !== h.crc)
    throw fail("A sample image has an invalid header, length or data CRC.");
  const v = view(img);
  for (let z = 0; z < h.nz; z++) {
    const o = 32 + 28 * z, off = v.getUint32(o, true), n = v.getUint32(o + 4, true), rate = v.getUint32(o + 16, true);
    if (off > h.dataLen || n > capacity * 2 || off + Math.ceil(n / 2) > h.dataLen || img[o + 24] > 88 || !rate || rate > 4 * 65536)
      throw fail(`Sample zone ${z + 1} is outside its image or has invalid playback settings.`);
  }
  return h;
}

function validateLayout(layout) {
  if (!layout || !integer(layout.count, 1, 16) || !Array.isArray(layout.slots) || layout.slots.length !== layout.count ||
      !integer(layout.size, 512, PROJECT_MAX_FILE)) throw fail("Invalid sample slot layout.");
  let end = 0;
  const regions = [];
  for (let k = 0; k < layout.count; k++) {
    const s = layout.slots[k], size = slotSize(layout, k);
    if (!integer(size, 512, PROJECT_MAX_FILE) || !integer(s.nz, 0, 16)) throw fail("Invalid sample slot capacity or zone count.");
    end += size;
    if (s.off !== null && s.off !== undefined) {
      if (!integer(s.off, 0, 0xFFFFFFFF - size)) throw fail("Invalid sample slot address.");
      if (regions.some(([a, b]) => s.off < b && a < s.off + size)) throw fail("Sample slot ranges overlap.");
      regions.push([s.off, s.off + size]);
    }
  }
  if (end > PROJECT_MAX_FILE) throw fail("The sample slot layout is too large.");
}

async function manifestOf(layout, images) {
  validateLayout(layout);
  if (!Array.isArray(images) || images.length !== layout.count) throw fail("The sample snapshot is incomplete.");
  const out = [];
  for (let k = 0; k < images.length; k++) {
    const img = images[k], h = validateSlotImage(img, slotSize(layout, k));
    const e = { slot: k + 1, size: slotSize(layout, k), empty: img === null };
    if (h) Object.assign(e, { length: img.length, crc32: crc32(img), sha256: await sha256(img), name: h.name,
      zones: h.nz, samples: h.zones.map((z) => z.n), rates: h.zones.map((z) => z.rate) });
    out.push(e);
  }
  return out;
}

function validateManifest(slots) {
  if (!Array.isArray(slots) || !integer(slots.length, 1, 16)) throw fail("The sample reference manifest is missing.");
  let capacity = 0;
  slots.forEach((e, k) => {
    const fields = ["slot", "size", "empty"];
    if (e?.empty === false) fields.push("length", "crc32", "sha256", "name", "zones", "samples", "rates");
    if (!keys(e, fields) || e.slot !== k + 1 || typeof e.empty !== "boolean" || !integer(e.size, 512, PROJECT_MAX_FILE))
      throw fail("The sample manifest has missing, duplicated, reordered or invalid slots.");
    capacity += e.size;
    if (!e.empty && (!integer(e.length, 512, e.size) || !integer(e.crc32, 0, 0xFFFFFFFF) || !hex256(e.sha256) ||
        typeof e.name !== "string" || e.name.length > 8 || !integer(e.zones, 1, 16) ||
        !Array.isArray(e.samples) || !Array.isArray(e.rates) || e.samples.length !== e.zones || e.rates.length !== e.zones ||
        e.samples.some((n) => !integer(n, 0, e.size * 2)) || e.rates.some((n) => !integer(n, 1, 176400))))
      throw fail(`The identity of sample slot ${k + 1} is invalid.`);
  });
  if (capacity > PROJECT_MAX_FILE) throw fail("The sample manifest is too large.");
}

function sameIdentity(a, b) {
  return a.slot === b.slot && a.empty === b.empty && (a.empty || a.length === b.length && a.crc32 === b.crc32 &&
    a.sha256 === b.sha256 && a.name === b.name && a.zones === b.zones &&
    JSON.stringify(a.samples) === JSON.stringify(b.samples) && JSON.stringify(a.rates) === JSON.stringify(b.rates));
}

function strictArchive(b, manifest) {
  if (b.length < 20 || b.length > PROJECT_MAX_FILE || view(b).getUint16(10, true) !== 0) throw fail("Invalid sample archive header.");
  const n = view(b).getUint32(12, true);
  if (n > PROJECT_META_MAX || 16 + n + 4 > b.length) throw fail("Invalid sample archive metadata size.");
  let meta;
  try { meta = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(b.subarray(16, 16 + n))); }
  catch { throw fail("The sample archive metadata is damaged."); }
  if (!meta || meta.format !== "x0xslots" || meta.version !== 1 || meta.count !== manifest.length ||
      !Array.isArray(meta.slots) || meta.slots.length !== manifest.length || !integer(meta.size, 512, PROJECT_MAX_FILE))
    throw fail("The sample archive schema does not match the project manifest.");
  let off = 0;
  meta.slots.forEach((e, k) => {
    const m = manifest[k];
    if (!e || e.slot !== k + 1 || e.empty !== m.empty || e.size !== m.size) throw fail("The archive has duplicated or mismatched sample entries.");
    if (e.empty) {
      if (Object.hasOwn(e, "offset") || Object.hasOwn(e, "length")) throw fail("An empty sample slot has a data range.");
    } else {
      if (e.offset !== off || e.length !== m.length || e.crc32 !== m.crc32 || e.name !== m.name || e.zones !== m.zones ||
          JSON.stringify(e.samples) !== JSON.stringify(m.samples) || JSON.stringify(e.rates) !== JSON.stringify(m.rates))
        throw fail("The archive has overlapping, missing or mismatched sample ranges.");
      off += e.length;
    }
  });
  if (16 + n + off + 4 !== b.length) throw fail("The sample archive has missing or unreferenced bytes.");
  const parsed = readArchive(b);
  parsed.images.forEach((img, k) => {
    const h = validateSlotImage(img, manifest[k].size), e = meta.slots[k];
    if (h && (e.data_len !== h.dataLen || e.data_crc32 !== h.crc || e.name !== h.name || e.zones !== h.nz ||
        JSON.stringify(e.samples) !== JSON.stringify(h.zones.map((z) => z.n)) ||
        JSON.stringify(e.rates) !== JSON.stringify(h.zones.map((z) => z.rate))))
      throw fail("Sample metadata does not match its original header.");
  });
  return parsed;
}

export async function makeProjectFile(project, snapshot, { name = "Untitled project", portable = true, created = new Date().toISOString() } = {}) {
  project = bytes(project);
  parseProject(project);
  if (typeof name !== "string" || !name.trim() || name.length > 80 || typeof created !== "string" || created.length > 40 || !Number.isFinite(Date.parse(created)))
    throw fail("Give this project a name of 1–80 characters and a valid creation date.");
  const slots = await manifestOf(snapshot.layout, snapshot.images);
  const archive = portable ? makeArchive(snapshot.layout, snapshot.images, created) : null;
  const meta = { format: "x0xproject", version: 1, name: name.trim(), created,
    project: { offset: 0, length: project.length, crc32: crc32(project) }, slots,
    archive: archive ? { offset: project.length, length: archive.length, crc32: crc32(archive) } : null };
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const out = new Uint8Array(16 + json.length + project.length + (archive?.length || 0) + 4), v = view(out);
  if (json.length > PROJECT_META_MAX || out.length > PROJECT_MAX_FILE) throw fail("The project bundle is too large.");
  out.set(new TextEncoder().encode(PROJECT_MAGIC));
  v.setUint16(8, 1, true); v.setUint16(10, portable ? 1 : 0, true); v.setUint32(12, json.length, true);
  out.set(json, 16); out.set(project, 16 + json.length);
  if (archive) out.set(archive, 16 + json.length + project.length);
  v.setUint32(out.length - 4, crc32(out.subarray(0, -4)), true);
  return out;
}

export async function readProjectFile(input, expectedLength = null) {
  const b = bytes(input);
  if (b.length < 20 || b.length > PROJECT_MAX_FILE || new TextDecoder().decode(b.subarray(0, 8)) !== PROJECT_MAGIC)
    throw fail("Choose an .x0xproject file exported by the Projects page. Raw project files have no sample reference manifest.");
  const v = view(b), flags = v.getUint16(10, true), n = v.getUint32(12, true);
  if (v.getUint16(8, true) !== 1 || flags > 1) throw fail("This bundle uses an unsupported version or flags.", "version");
  if (n > PROJECT_META_MAX || 16 + n + 4 > b.length) throw fail("Invalid project metadata size.");
  if (v.getUint32(b.length - 4, true) !== crc32(b.subarray(0, -4))) throw fail("The project file is damaged (CRC).");
  let meta;
  try { meta = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(b.subarray(16, 16 + n))); }
  catch { throw fail("The project metadata is damaged."); }
  if (!keys(meta, ["format", "version", "name", "created", "project", "slots", "archive"]) || meta.format !== "x0xproject" || meta.version !== 1 ||
      typeof meta.name !== "string" || !meta.name.trim() || meta.name.length > 80 || typeof meta.created !== "string" ||
      meta.created.length > 40 || !Number.isFinite(Date.parse(meta.created))) throw fail("Invalid project metadata schema.");
  validateManifest(meta.slots);
  const component = (e, offset) => {
    if (!keys(e, ["offset", "length", "crc32"]) || e.offset !== offset || !integer(e.length, 1, PROJECT_MAX_FILE) ||
        !integer(e.crc32, 0, 0xFFFFFFFF) || 16 + n + offset + e.length > b.length - 4)
      throw fail("The project has missing, duplicated or overlapping component ranges.");
    const part = b.slice(16 + n + offset, 16 + n + offset + e.length);
    if (crc32(part) !== e.crc32) throw fail("A project component is damaged (CRC).");
    return part;
  };
  const project = component(meta.project, 0);
  parseProject(project, expectedLength);
  let archive = null, images = null, used = project.length;
  if (flags === 1) {
    archive = component(meta.archive, used); used += archive.length;
    images = strictArchive(archive, meta.slots).images;
    for (let k = 0; k < images.length; k++) if (images[k] && await sha256(images[k]) !== meta.slots[k].sha256)
      throw fail(`Sample slot ${k + 1} does not match its SHA-256 identity.`);
  } else if (meta.archive !== null) throw fail("A project-only file contains a sample archive entry.");
  if (16 + n + used + 4 !== b.length) throw fail("The project file has unreferenced or missing bytes.");
  return { meta, project, archive, images, portable: flags === 1, bytes: b.slice() };
}

export async function planProjectImport(file, snapshot) {
  validateManifest(file.meta.slots);
  const current = await manifestOf(snapshot.layout, snapshot.images);
  if (current.length !== file.meta.slots.length) throw fail("The source and destination have different sample slot counts. Slot order must stay exact.", "capacity");
  const changes = [], collisions = [], unchanged = [];
  for (let k = 0; k < current.length; k++) {
    const want = file.meta.slots[k], have = current[k];
    if (sameIdentity(want, have)) { unchanged.push(k); continue; }
    if (!file.portable) throw fail(`Sample slot ${k + 1} differs from this project’s reference manifest. Import the portable bundle or restore its exact samples first.`, "samples");
    if (!want.empty && want.length > slotSize(snapshot.layout, k)) throw fail(`Sample slot ${k + 1} does not fit its destination. Sample slots cannot be remapped.`, "capacity");
    if (!want.empty) validateSlotImage(file.images[k], slotSize(snapshot.layout, k));
    const change = { k, from: have, to: want, action: want.empty ? "clear" : have.empty ? "fill" : "replace" };
    changes.push(change);
    if (!have.empty) collisions.push(change);
  }
  return { changes, collisions, unchanged };
}

// A single request is outstanding at a time. Only reads, ABORT and replay-safe project
// WRITE chunks can retry; erase, sample writes, adoption and persistence never retry blindly.
export class ProjectDevice {
  constructor(link, { timeout = 3000, now = () => Date.now() } = {}) {
    this.link = link; this.timeout = timeout; this.now = now; this.identity = null;
    this.projectLength = null; this.active = false; this.mode = 0; this.lastProject = 0;
  }
  async request(cmd, args, { tries = 1, timeout = this.timeout, accept = () => true } = {}) {
    if (cmd !== 1 && !this.identity) throw fail("Connect to an identified X0X keyboard first.", "identity");
    if (cmd !== 9 && this.active && this.now() - this.lastProject > 4000) await this.query();
    for (let attempt = 0; attempt < tries; attempt++) {
      this.link.drain();
      if (!this.link.send([...PROJECT_ED, cmd, ...args, 0xF7])) throw fail("The USB MIDI connection was lost.", "connection");
      const deadline = this.now() + timeout;
      while (this.now() < deadline) {
        const p = await this.link.read(Math.max(1, deadline - this.now()));
        if (!p) break;
        if (p.length < 6 || p[0] !== 0xF0 || p.at(-1) !== 0xF7 || p[1] !== 0x7D || p[2] !== 0x46 || p[3] !== 0x4C || p[4] !== cmd) continue;
        const r = Array.from(p).slice(5, -1);
        if (r.some((n) => !integer(n, 0, 127))) throw fail("The keyboard returned malformed MIDI data.", "protocol");
        if (!accept(r)) continue;
        return r;
      }
    }
    throw fail(`The keyboard did not acknowledge command ${cmd}. Check USB and reconnect.`, "timeout");
  }
  async command(op, args = [], { length = 2, offset = null, tries = 1, timeout = this.timeout } = {}) {
    const r = await this.request(9, [op, ...args], { tries, timeout, accept: (r) => {
      if (r[0] !== op) return false;
      if (r.length < 2 || r[1] > 9 || r[1] && r.length !== 2 || !r[1] && r.length !== length)
        throw fail(`Malformed project reply for operation ${op}.`, "protocol");
      if (!r[1] && offset !== null && get21(r, 2) !== offset) return false;
      return true;
    } });
    this.lastProject = this.now();
    if (r[1]) throw Object.assign(fail(PROJECT_ERRORS[r[1]], `device-${r[1]}`), { rc: r[1] });
    return r;
  }
  async connect() {
    this.identity = null; this.mode = 0; this.active = false; this.projectLength = null;
    const r = await this.request(1, [], { tries: 2 }), z = r.indexOf(0);
    const id = z >= 0 ? String.fromCharCode(...r.slice(0, z)) : "";
    if (!/^X0X [\x20-\x7e]{1,20}$/.test(id)) throw fail("This MIDI port is not running X0X. No project commands were sent.", "identity");
    this.identity = id;
    try { await this.query({ allowRecovery: true }); }
    catch (e) {
      this.identity = null;
      if (e.code === "busy") throw e;
      throw fail(`This X0X firmware does not provide the supported project protocol. ${e.message}`, "unsupported");
    }
    return { identity: id, projectLength: this.projectLength, recovery: this.mode === 3 };
  }
  async query({ acceptModeChange = false, allowRecovery = false } = {}) {
    const r = await this.command(PROJECT_OP.QUERY, [], { length: 7, tries: 2 });
    if (![1,2].includes(r[2]) || r[2]===2 && get21(r,3)!==36452 || !integer(get21(r, 3), PROJECT_HEADER, 0x1FFFFF) || !integer(r[6], 0, 3)) throw fail("Unsupported project protocol version or file size.", "version");
    if (acceptModeChange || allowRecovery && r[6] === 3) { this.mode = r[6]; this.active = this.mode !== 0; }
    if (r[6] !== this.mode) throw fail(this.active ? "The project transfer expired or changed. Sample writes have stopped." :
      "Another project transfer is active. Close the other editor and reconnect after it finishes.", this.active ? "expired" : "busy");
    const size = get21(r, 3);
    if (this.projectLength !== null && this.projectLength !== size) throw fail("The connected firmware changed. Reconnect before continuing.", "version");
    this.projectProtocol=r[2];
    this.projectLength = size;
    return size;
  }
  async abort() {
    try {
      await this.command(PROJECT_OP.ABORT, [], { tries: 2 });
      this.active = false; this.mode = 0;
    } catch (e) {
      if (e.rc === 2) {
        this.active = true; this.mode = 3;
        e.code = "recovery";
        e.message = "The keyboard is holding audio and controls because sample recovery is incomplete. Reconnect and restore the portable recovery backup.";
      }
      throw e;
    }
  }
  async exportStart() {
    await this.query();
    if (this.mode !== 0) throw fail("Finish sample recovery before exporting a project.", "recovery");
    // BEGIN can have succeeded even when its reply is lost, so the caller must ABORT in finally.
    this.active = true; this.mode = 1;
    const r = await this.command(PROJECT_OP.EXPORT, [], { length: 5 });
    if (get21(r, 2) !== this.projectLength) throw fail("The exported project size changed.", "protocol");
    const b = new Uint8Array(this.projectLength);
    for (let off = 0; off < b.length;) {
      const n = Math.min(224, b.length - off), packed = n + Math.ceil(n / 7);
      const r = await this.command(PROJECT_OP.READ, [...u21(off), n & 127, n >> 7], { length: 5 + packed, offset: off, tries: 2 });
      const chunk = unpack78(r.slice(5));
      if (chunk.length !== n || !sameBytes(Uint8Array.from(pack78(chunk)), Uint8Array.from(r.slice(5)))) throw fail("Noncanonical project transfer data.", "protocol");
      b.set(chunk, off); off += n;
    }
    parseProject(b, this.projectLength);
    return b;
  }
  async stage(project, onProgress = () => {}) {
    const size=await this.query(), meta=parseProject(project);
    const legacy=this.projectProtocol===2 && size-project.length===24 && meta.soundRevision===10 && [3,6].includes(meta.patternVersion);
    if(!legacy)parseProject(project,size);
    this.active = true; this.mode = 2;
    await this.command(PROJECT_OP.IMPORT, u21(project.length));
    for (let off = 0; off < project.length;) {
      const n = Math.min(224, project.length - off);
      await this.command(PROJECT_OP.WRITE, [...u21(off), ...pack78(project.subarray(off, off + n))],
        { length: 5, offset: off + n, tries: 2 });
      off += n; onProgress(off / project.length);
    }
  }
  async validate() { await this.command(PROJECT_OP.VALIDATE); }
  async adoptLegacyBass(engines,{confirmed=false}={}) {
    if(confirmed!==true || this.projectProtocol!==2 || !Array.isArray(engines) || engines.length!==2 ||
       !integer(engines[0],0,1) || !integer(engines[1],0,1) || engines[0]===1 && engines[1]===1)
      throw fail("Explicit valid engine choices for both bass slots are required.","identity");
    await this.command(PROJECT_OP.ADOPT_BASS,[...engines,...PROJECT_CONFIRM]);
  }
  async commit() { await this.command(PROJECT_OP.COMMIT, PROJECT_CONFIRM); this.active = false; this.mode = 0; }
  async save() { await this.command(PROJECT_OP.SAVE, [], { timeout: Math.max(10000, this.timeout) }); }
  async load(confirmed) {
    if (confirmed !== true) throw fail("Confirm replacing the live project before loading the saved project.", "confirmation");
    await this.command(PROJECT_OP.LOAD, PROJECT_CONFIRM, { timeout: Math.max(10000, this.timeout) });
  }
  async reset(confirmed) {
    if (confirmed !== true) throw fail("Confirm resetting the live project first.", "confirmation");
    await this.command(PROJECT_OP.RESET, PROJECT_CONFIRM);
  }
  async layout() {
    const r = await this.request(15, [], { tries: 2 });
    if (r.length < 2 || !integer(r[0], 1, 16) || r[1] === 0) throw fail("Invalid SMP_INFO reply.", "protocol");
    let p = 2;
    for (let k = 0; k < r[0]; k++) {
      const end = r.indexOf(0, p + 1);
      if (p >= r.length || r[p] > 16 || end < p + 1 || end > p + 9 || end + 1 >= r.length) throw fail("Malformed sample slot description.", "protocol");
      p = end + 2;
    }
    if (r.length !== p && (r.length !== p + 2 + 6 * r[0] || r[p] !== 0x58 || r[p + 1] !== 1))
      throw fail("Unsupported sample layout extension.", "protocol");
    const layout = parseInfo(r); validateLayout(layout); return layout;
  }
  async readSlotBytes(k, off, count, capacity, progress = () => {}) {
    const out = new Uint8Array(count);
    for (let at = 0; at < count;) {
      const n = Math.min(224, count - at), addr = off + at, wire = Math.min((n + 1) & ~1, capacity - addr);
      const r = await this.request(16, [k, ...u21(addr), (n + 1) >> 1], { tries: 2, accept: (r) => {
        if (r[0] !== k || r.length < 4 || get21(r, 1) !== addr) return false;
        if (r.length !== 4 + wire + Math.ceil(wire / 7)) throw fail("Short or oversized sample read reply.", "protocol");
        return true;
      } });
      const chunk = unpack78(r.slice(4));
      if (chunk.length !== wire || !sameBytes(Uint8Array.from(pack78(chunk)), Uint8Array.from(r.slice(4)))) throw fail("Malformed sample read data.", "protocol");
      out.set(chunk.subarray(0, n), at); at += n; progress(at, count);
    }
    return out;
  }
  async readSlot(k, layout, progress) {
    if (!layout.slots[k].nz) return null;
    const size = slotSize(layout, k), head = await this.readSlotBytes(k, 0, 512, size), h = parseHeader(head);
    if (!h || h.nz !== layout.slots[k].nz || h.dataLen > size - 512) throw fail(`Sample slot ${k + 1} has an invalid or changing header.`);
    const data = await this.readSlotBytes(k, 512, h.dataLen, size, progress), image = new Uint8Array(512 + data.length);
    image.set(head); image.set(data, 512); validateSlotImage(image, size); return image;
  }
  async snapshotSlots(progress = () => {}) {
    const layout = await this.layout(), images = [];
    for (let k = 0; k < layout.count; k++) images.push(await this.readSlot(k, layout, (n, all) => progress(k, n, all)));
    const after = await this.layout();
    if (JSON.stringify(layout) !== JSON.stringify(after)) throw fail("The sample layout changed while being read. Try again.", "changed");
    return { layout, images };
  }
  async writeSlot(k, image, capacity, progress = () => {}) {
    validateSlotImage(image, capacity);
    const slotReply = async (cmd, args, timeout) => {
      const r = await this.request(cmd, [k, ...args], { timeout: Math.max(timeout, this.timeout), accept: (r) => {
        if (r[0] !== k) return false;
        if (r.length !== 2) throw fail("Malformed sample write reply.", "protocol");
        return true;
      } });
      if (r[1]) throw fail(`Sample slot ${k + 1}: command ${cmd} failed (${r[1]}).`, "sample-write");
    };
    if (image === null) { await slotReply(14, [], 30000); return; }
    await slotReply(11, [], 10000);
    const data = image.subarray(512);
    for (let at = 0; at < data.length; at += 256) {
      const addr = 512 + at, r = await this.request(12, [k, ...u21(addr), ...pack78(data.subarray(at, at + 256))], { accept: (r) => {
        if (r[0] !== k || r.length < 4 || get21(r, 1) !== addr) return false;
        if (r.length !== 5) throw fail("Malformed sample data acknowledgement.", "protocol");
        return true;
      } });
      if (r[4]) throw fail(`Sample slot ${k + 1}: write at ${addr} failed (${r[4]}).`, "sample-write");
      progress(Math.min(at + 256, data.length), data.length);
    }
    // Protocol v1 firmware accepts all 512 bytes; legacy uploaders may still send 480.
    await slotReply(13, pack78(image.subarray(0, 512)), 5000);
  }
}

export async function readProjectSnapshot(device, progress = () => {}) {
  if (device.mode !== 0) throw fail("Finish the active transfer or restore the portable recovery backup before exporting.", "recovery");
  let primary = null;
  try {
    const project = await device.exportStart(), first = await device.snapshotSlots(progress), second = await device.snapshotSlots(progress);
    if (JSON.stringify(first.layout) !== JSON.stringify(second.layout) || first.images.some((img, k) => !sameBytes(img, second.images[k])))
      throw fail("Sample contents changed during export. Stop other sample transfers and try again.", "changed");
    return { project, ...first };
  } catch (e) { primary = e; throw e; }
  finally {
    try { if (device.active) await device.abort(); }
    catch (e) {
      if (!primary) throw e;
      primary.message += ` Transfer cleanup also failed: ${e.message}`;
    }
  }
}

export async function prepareProjectImport(device, input, { progress = () => {} } = {}) {
  const file = await readProjectFile(input, await device.query());
  if (device.mode === 3) {
    if (!file.portable) throw fail("Recovery requires a portable project with its original samples. A project-only file cannot repair partial sample slots.", "recovery");
    const layout = await device.layout();
    validateRecoveryLayout(file, layout);
    const changes = file.meta.slots.map((to, k) => ({ k, to, from: { slot: k + 1, empty: null, unknown: true }, action: to.empty ? "clear" : "restore" }));
    return { file, recovery: true, layout, plan: { changes, collisions: [], unchanged: [] }, backupBytes: null };
  }
  const before = await readProjectSnapshot(device, progress);
  const plan = await planProjectImport(file, before);
  const backupBytes = await makeProjectFile(before.project, before, { name: "Before project import", portable: true });
  const backup = await readProjectFile(backupBytes, device.projectLength);
  if (!sameBytes(backup.project, before.project) || before.images.some((img, k) => !sameBytes(img, backup.images[k])))
    throw fail("The recovery backup did not verify.", "backup");
  return { file, before, plan, backupBytes };
}

function validateRecoveryLayout(file, layout) {
  validateLayout(layout);
  if (!file.portable || file.meta.slots.length !== layout.count) throw fail("The recovery file must include every sample slot in the destination layout.", "capacity");
  file.images.forEach((img, k) => validateSlotImage(img, slotSize(layout, k)));
}

async function verifyImages(device, wanted, progress) {
  const got = await device.snapshotSlots(progress);
  if (got.images.length !== wanted.length || wanted.some((img, k) => !sameBytes(img, got.images[k])))
    throw fail("Sample readback differs from the original bytes. The new project was not adopted.", "readback");
}

// Preparation is read-only. Applying needs an explicit live-project confirmation and,
// for occupied-slot collisions, a user-acknowledged, verified downloadable backup.
export async function applyProjectImport(device, prepared, { confirmed = false, backupSaved = false, progress = () => {} } = {}) {
  if (confirmed !== true) throw fail("Confirm replacing the live project before importing.", "confirmation");
  const file = await readProjectFile(prepared.file.bytes, await device.query());
  if (prepared.recovery) return applyRecoveryImport(device, file, prepared.layout, progress);
  const backup = await readProjectFile(prepared.backupBytes, device.projectLength);
  if (!backup.portable) throw fail("A complete portable recovery backup is required.", "backup");
  const plan = await planProjectImport(file, prepared.before);
  if (plan.collisions.length && backupSaved !== true) throw fail("Download the verified recovery backup and confirm it is saved before replacing existing samples.", "backup");
  if (!sameBytes(backup.project, prepared.before.project) || prepared.before.images.some((img, k) => !sameBytes(img, backup.images[k])))
    throw fail("The recovery backup no longer matches the prepared keyboard snapshot.", "backup");
  const fresh = await readProjectSnapshot(device, progress);
  if (!sameBytes(fresh.project, backup.project) || fresh.images.some((img, k) => !sameBytes(img, backup.images[k])) ||
      JSON.stringify(fresh.layout) !== JSON.stringify(prepared.before.layout))
    throw fail("The keyboard changed since the import preview. Prepare the import again.", "changed");
  const touched = [];
  let commitAttempted = false, succeeded = false, error = null;
  try {
    await device.stage(file.project);
    await device.validate(); // Firmware checks semantic validity and pattern capacity before any sample mutation.
    for (const { k } of plan.changes) {
      touched.push(k); // Include a write whose acknowledgement is lost.
      await device.writeSlot(k, file.images[k], slotSize(fresh.layout, k), (n, all) => progress(k, n, all));
    }
    if (file.portable) await verifyImages(device, file.images, progress);
    else await planProjectImport(file, await device.snapshotSlots(progress));
    commitAttempted = true;
    await device.commit();
    succeeded = true;
    return { changedSlots: plan.changes.map((s) => s.k + 1), skippedSlots: plan.unchanged.map((k) => k + 1) };
  } catch (e) {
    error = e;
    if (touched.length || commitAttempted) {
      try {
        // Keep the current import hold throughout rollback. Recovery mode can restart
        // staging without releasing that hold. Idle after an uncertain COMMIT means
        // the previous live project must also be restored under a new import hold.
        await device.query({ acceptModeChange: true });
        const restoreProject = commitAttempted && device.mode === 0;
        if (device.mode === 0 || device.mode === 3) await device.stage(backup.project);
        else if (device.mode !== 2) throw fail("Another export is active; sample recovery could not acquire its hold.", "busy");
        await device.validate();
        for (const k of touched.slice().reverse()) await device.writeSlot(k, backup.images[k], slotSize(fresh.layout, k));
        await verifyImages(device, backup.images, progress);
        if (restoreProject) await device.commit();
        e.rollback = "verified";
        e.message += " The previous samples and live project were restored and verified.";
      } catch (rollbackError) {
        e.rollback = "failed";
        e.message += ` Recovery could not finish: ${rollbackError.message} Reconnect and import the recovery backup from this preview before playing.`;
      }
    }
    throw e;
  } finally {
    if (!succeeded) {
      try { await device.abort(); }
      catch (cleanup) { if (error) error.message += ` Transfer cleanup failed: ${cleanup.message}`; else throw cleanup; }
    }
  }
}

// Mode 3 can outlive the original browser connection. The supplied portable file is
// the recovery source; partial destination images are never read or backed up first.
async function applyRecoveryImport(device, file, originalLayout, progress) {
  if (device.mode !== 3) throw fail("The recovery state changed. Reconnect and prepare the file again.", "changed");
  const layout = await device.layout();
  const capacities = (x) => x.slots.map((s, k) => [s.off, slotSize(x, k)]);
  if (JSON.stringify(capacities(layout)) !== JSON.stringify(capacities(originalLayout))) throw fail("The recovery slot layout changed. Prepare recovery again.", "changed");
  validateRecoveryLayout(file, layout);
  try {
    await device.stage(file.project);
    await device.validate();
    for (let k = 0; k < file.images.length; k++)
      await device.writeSlot(k, file.images[k], slotSize(layout, k), (n, all) => progress(k, n, all));
    await verifyImages(device, file.images, progress);
    await device.commit();
    return { recovered: true, changedSlots: file.images.map((_, k) => k + 1), skippedSlots: [] };
  } catch (e) {
    e.recoveryRequired = true;
    e.message += " Recovery did not finish. Keep the portable recovery file and reconnect to resume.";
    try { await device.abort(); }
    catch (cleanup) { e.message += ` ${cleanup.message}`; }
    throw e;
  }
}

// Minimal Web MIDI adapter. Device methods above also run against the host-test mock.
export class ProjectMidiLink {
  constructor(input, output) {
    this.input = input; this.output = output; this.queue = []; this.pending = null; this.closed = false;
    this.listener = (event) => {
      if (!this.connected()) return;
      const d = event.data;
      if (d.length < 6 || d[0] !== 0xF0 || d.at(-1) !== 0xF7 || d[1] !== 0x7D || d[2] !== 0x46 || d[3] !== 0x4C) return;
      if (this.pending) { const p = this.pending; this.pending = null; clearTimeout(p.timer); p.resolve(Array.from(event.data)); }
      else { if (this.queue.length === 64) this.queue.shift(); this.queue.push(Array.from(event.data)); }
    };
    input.addEventListener("midimessage", this.listener);
  }
  connected() { return !this.closed && this.input.state !== "disconnected" && this.output.state !== "disconnected"; }
  drain() { this.queue.length = 0; }
  send(frame) { try { if (!this.connected()) return false; this.output.send(frame); return true; } catch { return false; } }
  read(ms) {
    if (!this.connected()) return Promise.resolve(null);
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.pending = null; resolve(null); }, ms);
      this.pending = { resolve, timer };
    });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.input.removeEventListener("midimessage", this.listener);
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.resolve(null); this.pending = null; }
    this.queue.length = 0;
  }
}
