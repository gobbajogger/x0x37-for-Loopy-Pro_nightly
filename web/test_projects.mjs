// SPDX-License-Identifier: GPL-3.0-only
// Reused from gobbajogger/X0X37-for-Loopy-Pro 08d3164a265123cb4c84e5104642fd93257d63d7, web/test_projects.mjs.
// Host-only project/container/MIDI safety checks. Run: node web/test_projects.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { crc32, pack78, unpack78, userSlotRaw, parseHeader } from "./x0x_breaks.js";
import { PROJECT_OP as OP, ProjectDevice, ProjectMidiLink, parseProject, validateSlotImage, sameBytes, makeProjectFile,
  readProjectFile, planProjectImport, readProjectSnapshot, prepareProjectImport, applyProjectImport } from "./x0x_projects.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const u21 = (n) => [n & 127, n >> 7 & 127, n >> 14 & 127];
const n21 = (a, p = 0) => a[p] | a[p + 1] << 7 | a[p + 2] << 14;
const frame = (cmd, payload) => [0xF0, 0x7D, 0x46, 0x4C, cmd, ...payload, 0xF7];
const clone = (b) => b === null ? null : b.slice();
function rawProject(seed = 1, length = 1337) {
  const b = new Uint8Array(length), v = new DataView(b.buffer);
  for (let i = 32; i < b.length; i++) b[i] = (seed * 17 + i * 13) & 255;
  [0x50583058, 1, length - 32, crc32(b.subarray(32)), 1, 3, 4, 0].forEach((n, k) => v.setUint32(k * 4, n, true));
  return b;
}
function sample(name = "ORIGINAL", seed = 1, length = 593, rate = 44100) {
  const data = Uint8Array.from({ length }, (_, i) => (i * 67 + seed * 41) & 255);
  const built = userSlotRaw(name, [{ adpcm: data, n: length * 2 - 1, rate }], 8192), img = new Uint8Array(512 + length);
  img.fill(255); img.set(built.hdr); img.set(built.data, 512);
  // These reserved bytes cannot be discarded by a sample-quality preserving transfer.
  for (let i = 480; i < 512; i++) img[i] = (seed * 17 + i) & 255;
  return img;
}
const original = sample(), alternate = sample("OTHER", 2, 777, 22050), third = sample("THIRD", 3, 37, 32000);
function snapshot(images = [original, null, third], sizes = [4096, 8192, 4096]) {
  return { layout: { count: images.length, size: Math.min(...sizes), ext: true,
    slots: images.map((img, k) => ({ size: sizes[k], off: 0x10000 + k * 0x10000, nz: img ? parseHeader(img).nz : 0,
      name: img ? parseHeader(img).name : "", used: img ? Math.ceil((img.length - 512) / 1024) : 0,
      kb: img ? Math.ceil((img.length - 512) / 1024) : 0 })) }, images: images.map(clone) };
}
async function bundle(project = rawProject(), snap = snapshot(), portable = true) {
  return makeProjectFile(project, snap, { name: "Project round trip", portable, created: "2026-10-21T12:30:00.000Z" });
}
function editContainer(b, edit) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), n = v.getUint32(12, true);
  const meta = JSON.parse(new TextDecoder().decode(b.subarray(16, 16 + n)));
  let body = b.slice(16 + n, -4);
  body = edit(meta, body) || body;
  const json = new TextEncoder().encode(JSON.stringify(meta)), out = new Uint8Array(16 + json.length + body.length + 4);
  out.set(b.subarray(0, 16)); new DataView(out.buffer).setUint32(12, json.length, true);
  out.set(json, 16); out.set(body, 16 + json.length); new DataView(out.buffer).setUint32(out.length - 4, crc32(out.subarray(0, -4)), true);
  return out;
}
function editArchive(b, edit) {
  return editContainer(b, (meta, body) => {
    const a = editContainer(body.subarray(meta.archive.offset), edit), out = new Uint8Array(meta.project.length + a.length);
    out.set(body.subarray(0, meta.project.length)); out.set(a, meta.project.length);
    meta.archive.length = a.length; meta.archive.crc32 = crc32(a); return out;
  });
}

// A stateful firmware peer. A transform can drop a reply *after* the operation has
// taken effect, which catches unsafe retries and ambiguous COMMIT handling.
class Keyboard {
  constructor({ project = rawProject(), images = [original, null, third], sizes = [4096, 8192, 4096], identity = "X0X test", transform = null } = {}) {
    this.project = project.slice(); this.saved = project.slice();
    this.supportedSchema = parseProject(project); this.images = images.map(clone); this.sizes = sizes;
    this.flash = images.map((img, k) => { const b = new Uint8Array(sizes[k]).fill(255); if (img) b.set(img); return b; });
    this.identity = identity; this.mode = 0; this.staging = null; this.offset = 0; this.previousWrite = null; this.validated = false; this.sampleBaseline = null;
    this.queue = []; this.calls = []; this.commits = []; this.transform = transform; this.clock = 0; this.disconnected = false;
  }
  drain() { this.queue.length = 0; }
  read() { return Promise.resolve(this.queue.shift() || null); }
  send(f) {
    const cmd = f[4], args = f.slice(5, -1);
    this.calls.push({ cmd, args: args.slice() }); this.clock += 30;
    if (this.disconnected) return false;
    let r = this.handle(cmd, args);
    if (this.transform) r = this.transform(cmd, args, r, this);
    if (r !== null) for (const p of Array.isArray(r[0]) ? r : [r]) this.queue.push(frame(cmd, p));
    return true;
  }
  handle(cmd, a) {
    if (cmd === 1) return [...new TextEncoder().encode(this.identity), 0, 0, 0, 0, 16, 0, 0];
    if (cmd === 9) {
      const op = a[0], args = a.slice(1), reply = (rc = 0, extra = []) => [op, rc, ...extra];
      if (op === OP.QUERY) return reply(0, [1, ...u21(this.project.length), this.mode]);
      if (op === OP.ABORT) {
        if (this.sampleBaseline && this.sampleBaseline.some((img, k) => !sameBytes(img, this.images[k]))) {
          this.mode = 3; this.staging = null; this.validated = false; return reply(2);
        }
        this.mode = 0; this.staging = null; this.sampleBaseline = null; return reply();
      }
      if (op === OP.EXPORT) {
        if (this.mode) return reply(2);
        this.mode = 1; this.staging = this.project.slice(); return reply(0, u21(this.staging.length));
      }
      if (op === OP.IMPORT) {
        if (this.mode && this.mode !== 3) return reply(2);
        if (n21(args) !== this.project.length) return reply(1);
        this.mode = 2; this.offset = 0; this.previousWrite = null; this.validated = false; this.staging = new Uint8Array(n21(args)); return reply();
      }
      if (op === OP.READ) {
        const off = n21(args), count = args[3] | args[4] << 7;
        if (this.mode !== 1) return reply(2);
        return reply(0, [...u21(off), ...pack78(this.staging.subarray(off, off + count))]);
      }
      if (op === OP.WRITE) {
        if (this.mode !== 2) return reply(2);
        this.validated = false;
        const off = n21(args), data = unpack78(args.slice(3));
        if (off !== this.offset) {
          if (this.previousWrite?.off === off && sameBytes(this.previousWrite.data, data)) return reply(0, u21(this.offset));
          return reply(3);
        }
        this.staging.set(data, off); this.offset += data.length; this.previousWrite = { off, data };
        return reply(0, u21(this.offset));
      }
      if (op === OP.VALIDATE || op === OP.COMMIT) {
        if (this.mode !== 2 || this.offset !== this.project.length) return reply(2);
        try {
          const schema = parseProject(this.staging, this.project.length);
          if (schema.patternVersion !== this.supportedSchema.patternVersion || schema.soundRevision !== this.supportedSchema.soundRevision)
            return reply(1); // Firmware, not the browser, owns adoption of a different revision.
        } catch { return reply(4); }
        if (this.staging[32] === 0xEE) return reply(5);
        if (op === OP.VALIDATE) this.validated = true;
        if (op === OP.COMMIT) {
          if (args[0] !== 0x58 || args[1] !== 0x30) return reply(8);
          this.project = this.staging.slice(); this.commits.push(this.project.slice()); this.mode = 0; this.staging = null; this.sampleBaseline = null;
        }
        return reply();
      }
      if (op === OP.SAVE) { this.saved = this.project.slice(); return reply(); }
      if (op === OP.LOAD || op === OP.RESET) {
        if (args[0] !== 0x58 || args[1] !== 0x30) return reply(8);
        this.project = op === OP.LOAD ? this.saved.slice() : rawProject(0, this.project.length); return reply();
      }
      return reply(1);
    }
    if (cmd === 15) {
      const s = snapshot(this.images, this.sizes), r = [this.images.length, Math.min(...this.sizes) / 1024];
      for (const slot of s.layout.slots) r.push(slot.nz, ...new TextEncoder().encode(slot.name), 0, slot.used);
      r.push(0x58, 1);
      for (const slot of s.layout.slots) for (const n of [slot.off / 4096, slot.size / 4096, slot.used]) r.push(n & 127, n >> 7 & 127);
      return r;
    }
    const k = a[0];
    if (cmd >= 11 && cmd <= 14) {
      if (this.mode === 3 || this.mode === 2 && !this.validated) return cmd === 12 ? [k, ...a.slice(1, 4), 1] : [k, 1];
      if (this.mode === 2 && !this.sampleBaseline) this.sampleBaseline = this.images.map(clone);
    }
    if (cmd === 16) {
      const off = n21(a, 1), n = Math.min(224, a[4] * 2, this.sizes[k] - off);
      return [k, ...u21(off), ...pack78(this.flash[k].subarray(off, off + n))];
    }
    if (cmd === 11 || cmd === 14) {
      this.flash[k].fill(255, 0, cmd === 14 ? this.flash[k].length : 4096); this.images[k] = null; return [k, 0];
    }
    if (cmd === 12) {
      const off = n21(a, 1), data = unpack78(a.slice(4));
      if (off % 4096 === 0) this.flash[k].fill(255, off, off + 4096);
      this.flash[k].set(data, off); return [k, ...u21(off), 0];
    }
    if (cmd === 13) {
      const head = unpack78(a.slice(1));
      assert.equal(head.length, 512, "the complete original header area must be sent");
      this.flash[k].set(head); const h = parseHeader(this.flash[k]);
      if (!h) return [k, 1];
      this.images[k] = this.flash[k].slice(0, 512 + h.dataLen);
      validateSlotImage(this.images[k], this.sizes[k]); return [k, 0];
    }
    throw new Error(`Unexpected command ${cmd}`);
  }
  sampleWrites() { return this.calls.filter((c) => c.cmd >= 11 && c.cmd <= 14); }
  projectCalls(op) { return this.calls.filter((c) => c.cmd === 9 && c.args[0] === op); }
}
async function connected(options) {
  const keyboard = new Keyboard(options), device = new ProjectDevice(keyboard, { timeout: 10, now: () => keyboard.clock });
  await device.connect(); return { keyboard, device };
}

test("portable and project-only containers preserve raw project, all slots and full header bytes", async () => {
  const raw = rawProject(), snap = snapshot();
  const portable = await readProjectFile(await bundle(raw, snap));
  assert.deepEqual(portable.project, raw);
  assert.deepEqual(portable.images, snap.images);
  assert.equal(portable.meta.slots.length, 3);
  assert.equal(portable.meta.slots[1].empty, true);
  assert.deepEqual(portable.images[0].subarray(480, 512), original.subarray(480, 512));
  const only = await readProjectFile(await bundle(raw, snap, false));
  assert.equal(only.portable, false); assert.equal(only.images, null); assert.equal(only.archive, null);
  assert.deepEqual(only.meta.slots, portable.meta.slots);
});

test("inner project rejects corrupt, truncated, oversized and incompatible schemas", () => {
  for (const offset of [4, 16, 20, 24, 28]) {
    const raw = rawProject(); new DataView(raw.buffer).setUint32(offset, 999, true);
    assert.throws(() => parseProject(raw), /incompatible/);
  }
  const bad = rawProject(); bad[35] ^= 1; assert.throws(() => parseProject(bad), /CRC/);
  assert.throws(() => parseProject(rawProject().subarray(0, 100)), /length/);
  assert.throws(() => parseProject(new Uint8Array(0x200000)), /size/);
  assert.throws(() => parseProject(rawProject(), 100), /firmware/);
});

test("outer CRC, version, flags, metadata size and raw unmanifested files are rejected", async () => {
  const good = await bundle();
  for (const offset of [8, 10, 12, good.length - 4]) {
    const bad = good.slice(); bad[offset] ^= 0x40;
    await assert.rejects(readProjectFile(bad));
  }
  await assert.rejects(readProjectFile(good.subarray(0, 70)));
  await assert.rejects(readProjectFile(rawProject()), /manifest/);
});

test("strict metadata rejects duplicated entries, overlapping ranges and unreferenced bytes", async () => {
  const good = await bundle();
  for (const edit of [
    (m) => { m.slots[1].slot = 1; },
    (m) => { m.slots.reverse(); },
    (m) => { m.archive.offset--; },
    (m) => { m.project.offset = 1; },
    (m) => { m.version = 2; },
    (m) => { m.unused = true; },
    (m) => { m.slots[0].sha256 = "0".repeat(64); },
    (m, body) => { const out = new Uint8Array(body.length + 1); out.set(body); return out; }
  ]) await assert.rejects(readProjectFile(editContainer(good, edit)));
  for (const edit of [
    (m) => { m.slots[1].slot = 1; },
    (m) => { m.slots[2].offset = 0; },
    (m) => { m.slots[1].offset = 0; },
    (m) => { m.count++; },
    (m) => { m.slots[0].data_len++; }
  ]) await assert.rejects(readProjectFile(editArchive(good, edit)));
});

test("sample metadata must match the original header even when both JSON copies and CRCs agree", async () => {
  const good = await bundle();
  const mutations = [
    ["name", (e) => { e.name = "FORGED"; }],
    ["zone count", (e) => { e.zones++; e.samples.push(e.samples[0]); e.rates.push(e.rates[0]); }],
    ["sample counts", (e) => { e.samples[0]--; }],
    ["sample rates", (e) => { e.rates[0] = 22050; }]
  ];
  for (const [label, mutate] of mutations) {
    // Both editors preserve the image body and SHA-256. The nested archive CRC,
    // its component CRC, and the outer file CRC are all recomputed correctly.
    const nested = editArchive(good, (meta) => { mutate(meta.slots[0]); });
    const forged = editContainer(nested, (meta) => { mutate(meta.slots[0]); });
    await assert.rejects(readProjectFile(forged), /metadata does not match its original header/, label);
  }
});

test("sample image rejects data CRC, impossible zone boundaries and rate corruption", () => {
  const data = original.slice(); data[512] ^= 1;
  assert.throws(() => validateSlotImage(data, 4096), /CRC/);
  for (const [off, value] of [[32, 10000], [36, 0xFFFFFFFF], [48, 0], [48, 5 << 16]]) {
    const img = original.slice(); new DataView(img.buffer).setUint32(off, value, true);
    assert.throws(() => validateSlotImage(img, 4096), /zone/);
  }
});

test("project-only matching checks every occupied and empty slot and never remaps", async () => {
  const file = await readProjectFile(await bundle(rawProject(), snapshot(), false));
  const plan = await planProjectImport(file, snapshot());
  assert.deepEqual(plan.changes, []); assert.deepEqual(plan.unchanged, [0, 1, 2]);
  await assert.rejects(planProjectImport(file, snapshot([original, alternate, third])), /slot 2 differs/);
  await assert.rejects(planProjectImport(file, snapshot([original, null, null])), /slot 3 differs/);
  await assert.rejects(planProjectImport(file, snapshot([third, null, original])), /slot 1 differs/);
});

test("portable plans fills, identical skips and backed-up clear/replacement collisions", async () => {
  const file = await readProjectFile(await bundle(rawProject(2), snapshot([original, alternate, null])));
  const plan = await planProjectImport(file, snapshot());
  assert.deepEqual(plan.changes.map((e) => [e.k, e.action]), [[1, "fill"], [2, "clear"]]);
  assert.deepEqual(plan.collisions.map((e) => e.k), [2]);
  assert.deepEqual(plan.unchanged, [0]);
  const oversized = sample("BIG", 4, 4500), big = await readProjectFile(await bundle(rawProject(), snapshot([oversized, null, null], [8192, 8192, 4096])));
  await assert.rejects(planProjectImport(big, snapshot()), /does not fit/);
});

test("non-X0X identity is rejected before any project command", async () => {
  const keyboard = new Keyboard({ identity: "Felucca V4" }), device = new ProjectDevice(keyboard);
  await assert.rejects(device.connect(), /not running X0X/);
  assert.equal(keyboard.calls.some((c) => c.cmd === 9), false);
  await assert.rejects(device.save(), /identified X0X/);
});

test("unsupported or malformed query replies are explained clearly", async () => {
  for (const transform of [
    (cmd, a, r) => cmd === 9 ? null : r,
    (cmd, a, r) => cmd === 9 ? r.slice(0, -1) : r,
    (cmd, a, r) => cmd === 9 ? [OP.QUERY, 0, 2, ...u21(1337), 0] : r
  ]) await assert.rejects(connected({ transform }), /supported project protocol/);
});

test("export snapshots project plus every original sample and always aborts; no sample writes", async () => {
  const { device, keyboard } = await connected();
  const snap = await readProjectSnapshot(device);
  assert.deepEqual(snap.project, rawProject()); assert.deepEqual(snap.images, snapshot().images);
  assert.equal(keyboard.sampleWrites().length, 0); assert.equal(keyboard.mode, 0);
  assert.equal(keyboard.projectCalls(OP.ABORT).length, 1);
});

test("export aborts interrupted reads and uncertain BEGIN without blind BEGIN retry", async () => {
  for (const failed of [OP.EXPORT, OP.READ]) {
    const { device, keyboard } = await connected({ transform: (cmd, a, r) => cmd === 9 && a[0] === failed ? null : r });
    await assert.rejects(readProjectSnapshot(device), /acknowledge/);
    assert.equal(keyboard.projectCalls(OP.EXPORT).length, 1); assert.equal(keyboard.mode, 0);
    assert.equal(keyboard.projectCalls(OP.ABORT).length, 1);
  }
});

test("READ/WRITE replies correlate operation and offset and validate exact byte lengths", async () => {
  let injected = false;
  const { device, keyboard } = await connected({ transform: (cmd, a, r) => {
    if (cmd === 9 && a[0] === OP.READ && !injected) {
      injected = true; return [[OP.WRITE, 0, ...u21(224)], [OP.READ, 0, ...u21(99), ...r.slice(5)], r];
    }
    return r;
  } });
  assert.deepEqual((await readProjectSnapshot(device)).project, rawProject());
  keyboard.transform = (cmd, a, r) => cmd === 9 && a[0] === OP.READ ? r.slice(0, -1) : r;
  await assert.rejects(readProjectSnapshot(device), /Malformed project reply/);
  assert.equal(keyboard.mode, 0);
});

test("sample reads correlate slot and offset and reject a short reply", async () => {
  let injected = false;
  const { device, keyboard } = await connected({ transform: (cmd, a, r) => {
    if (cmd === 16 && !injected) { injected = true; return [[2, ...r.slice(1)], [r[0], ...u21(99), ...r.slice(4)], r]; }
    return r;
  } });
  await readProjectSnapshot(device);
  keyboard.transform = (cmd, a, r) => cmd === 16 ? r.slice(0, -1) : r;
  await assert.rejects(readProjectSnapshot(device), /sample read reply/);
});

test("project chunk replay recovers a lost WRITE acknowledgement exactly once", async () => {
  let dropped = false;
  const { device, keyboard } = await connected({ transform: (cmd, a, r) => {
    if (cmd === 9 && a[0] === OP.WRITE && !dropped) { dropped = true; return null; } return r;
  } });
  await device.stage(rawProject(2)); await device.validate(); await device.commit();
  assert.deepEqual(keyboard.project, rawProject(2));
  const writes = keyboard.projectCalls(OP.WRITE);
  assert.deepEqual(writes[0].args, writes[1].args);
  assert.equal(writes.length, Math.ceil(keyboard.project.length / 224) + 1);
});

test("complete project-only import preserves every sample byte with zero sample write commands", async () => {
  const { device, keyboard } = await connected();
  const prepared = await prepareProjectImport(device, await bundle(rawProject(2), snapshot(), false));
  const result = await applyProjectImport(device, prepared, { confirmed: true });
  assert.deepEqual(keyboard.project, rawProject(2)); assert.deepEqual(keyboard.images, snapshot().images);
  assert.equal(keyboard.sampleWrites().length, 0); assert.deepEqual(result.changedSlots, []);
  assert.equal(keyboard.projectCalls(OP.VALIDATE).length, 1);
  assert.equal(keyboard.projectCalls(OP.COMMIT).length, 1);
});

test("confirmation or missing verified recovery acknowledgement refuses all sample mutations", async () => {
  const { device, keyboard } = await connected();
  const prepared = await prepareProjectImport(device, await bundle(rawProject(2), snapshot([alternate, null, third])));
  await assert.rejects(applyProjectImport(device, prepared), /Confirm/);
  await assert.rejects(applyProjectImport(device, prepared, { confirmed: true }), /recovery backup/);
  assert.equal(keyboard.sampleWrites().length, 0); assert.deepEqual(keyboard.project, rawProject());
  prepared.backupBytes[50] ^= 1;
  await assert.rejects(applyProjectImport(device, prepared, { confirmed: true, backupSaved: true }), /CRC/);
  assert.equal(keyboard.sampleWrites().length, 0);
});

test("firmware semantic validation fails before sample writes and keeps the previous live project", async () => {
  const invalid = rawProject(2); invalid[32] = 0xEE; new DataView(invalid.buffer).setUint32(12, crc32(invalid.subarray(32)), true);
  const { device, keyboard } = await connected();
  const prepared = await prepareProjectImport(device, await bundle(invalid, snapshot([alternate, null, third])));
  await assert.rejects(applyProjectImport(device, prepared, { confirmed: true, backupSaved: true }), /invalid settings/);
  assert.equal(keyboard.sampleWrites().length, 0); assert.deepEqual(keyboard.project, rawProject()); assert.equal(keyboard.mode, 0);
});

test("portable import fills and clears exact positions, skips identical images and preserves 512-byte headers", async () => {
  const { device, keyboard } = await connected();
  const wanted = snapshot([original, alternate, null]);
  const prepared = await prepareProjectImport(device, await bundle(rawProject(2), wanted));
  await applyProjectImport(device, prepared, { confirmed: true, backupSaved: true });
  assert.deepEqual(keyboard.images, wanted.images); assert.deepEqual(keyboard.project, rawProject(2));
  assert.deepEqual([...new Set(keyboard.sampleWrites().map((c) => c.args[0]))], [1, 2]);
  assert.equal(keyboard.sampleWrites().filter((c) => c.cmd === 14).length, 1);
  assert.deepEqual(unpack78(keyboard.sampleWrites().find((c) => c.cmd === 13).args.slice(1)), alternate.subarray(0, 512));
  const calls = keyboard.calls, validate = calls.findIndex((c) => c.cmd === 9 && c.args[0] === OP.VALIDATE);
  assert.ok(validate < calls.findIndex((c) => c.cmd >= 11 && c.cmd <= 14));
  assert.equal(calls.at(-1).args[0], OP.COMMIT);
});

test("a changed keyboard invalidates the preview before any sample writes", async () => {
  const { device, keyboard } = await connected();
  const prepared = await prepareProjectImport(device, await bundle(rawProject(2), snapshot()));
  keyboard.project = rawProject(3);
  await assert.rejects(applyProjectImport(device, prepared, { confirmed: true }), /changed since/);
  assert.equal(keyboard.sampleWrites().length, 0); assert.deepEqual(keyboard.project, rawProject(3));
});

test("sample readback mismatch rolls back exact original bytes before aborting adoption", async () => {
  const { device, keyboard } = await connected();
  const prepared = await prepareProjectImport(device, await bundle(rawProject(2), snapshot([alternate, null, third])));
  let damaged = false;
  keyboard.transform = (cmd, a, r, k) => {
    if (cmd === 13 && !damaged) { damaged = true; k.flash[a[0]][490] ^= 1; k.images[a[0]][490] ^= 1; } return r;
  };
  await assert.rejects(applyProjectImport(device, prepared, { confirmed: true, backupSaved: true }), (e) => {
    assert.equal(e.rollback, "verified"); assert.match(e.message, /readback differs/); return true;
  });
  assert.deepEqual(keyboard.images, snapshot().images); assert.deepEqual(keyboard.project, rawProject());
  assert.equal(keyboard.commits.length, 0); assert.equal(keyboard.mode, 0);
  const transfer = keyboard.calls.slice(keyboard.calls.findIndex((c) => c.cmd === 11));
  assert.ok(transfer.findIndex((c) => c.cmd === 9 && c.args[0] === OP.ABORT) > transfer.findLastIndex((c) => c.cmd === 13),
    "the import hold must stay active until the original sample header is restored and read back");
  assert.equal(keyboard.projectCalls(OP.IMPORT).length, 1, "an ordinary rollback keeps the existing validated staging transaction");
});

test("lost sample-write acknowledgement is not blindly retried and rollback uses its backup", async () => {
  const { device, keyboard } = await connected();
  const prepared = await prepareProjectImport(device, await bundle(rawProject(2), snapshot([alternate, null, third])));
  let dropped = false;
  keyboard.transform = (cmd, a, r) => { if (cmd === 12 && !dropped) { dropped = true; return null; } return r; };
  await assert.rejects(applyProjectImport(device, prepared, { confirmed: true, backupSaved: true }), (e) => e.rollback === "verified");
  const calls = keyboard.sampleWrites(), firstWrite = calls.findIndex((c) => c.cmd === 12);
  assert.equal(calls[firstWrite + 1].cmd, 11, "rollback starts a fresh slot before rewriting original bytes");
  assert.deepEqual(keyboard.images, snapshot().images); assert.deepEqual(keyboard.project, rawProject());
});

test("failed rollback reports recovery failure concretely and does not claim restoration", async () => {
  const { device, keyboard } = await connected();
  const prepared = await prepareProjectImport(device, await bundle(rawProject(2), snapshot([alternate, null, third])));
  keyboard.transform = (cmd, a, r, k) => { if (cmd === 12) { k.disconnected = true; return null; } return r; };
  await assert.rejects(applyProjectImport(device, prepared, { confirmed: true, backupSaved: true }), (e) => {
    assert.equal(e.rollback, "failed"); assert.match(e.message, /Recovery could not finish.*connection was lost/);
    assert.doesNotMatch(e.message, /were restored and verified/); return true;
  });
  assert.deepEqual(keyboard.project, rawProject()); assert.equal(keyboard.commits.length, 0);
});

test("lost COMMIT reply restores the previous project as well as samples without repeating adoption", async () => {
  const { device, keyboard } = await connected();
  const prepared = await prepareProjectImport(device, await bundle(rawProject(2), snapshot([alternate, null, third])));
  let dropped = false;
  keyboard.transform = (cmd, a, r) => { if (cmd === 9 && a[0] === OP.COMMIT && !dropped) { dropped = true; return null; } return r; };
  await assert.rejects(applyProjectImport(device, prepared, { confirmed: true, backupSaved: true }), (e) => e.rollback === "verified");
  assert.equal(keyboard.commits.length, 2);
  assert.deepEqual(keyboard.commits[0], rawProject(2)); assert.deepEqual(keyboard.commits[1], rawProject());
  assert.deepEqual(keyboard.images, snapshot().images); assert.deepEqual(keyboard.project, rawProject());
});

test("QUERY detects retained recovery mode after expiry and rollback restages without releasing its hold", async () => {
  const { device, keyboard } = await connected();
  const prepared = await prepareProjectImport(device, await bundle(rawProject(2), snapshot([alternate, null, third])));
  let expired = false;
  keyboard.transform = (cmd, a, r, k) => {
    if (cmd === 12 && !expired) { expired = true; k.mode = 3; k.staging = null; k.clock += 5000; } return r;
  };
  await assert.rejects(applyProjectImport(device, prepared, { confirmed: true, backupSaved: true }), (e) => {
    assert.equal(e.code, "expired"); assert.equal(e.rollback, "verified"); return true;
  });
  assert.deepEqual(keyboard.images, snapshot().images); assert.deepEqual(keyboard.project, rawProject());
  const transfer = keyboard.calls.slice(keyboard.calls.findIndex((c) => c.cmd === 11));
  assert.ok(transfer.findIndex((c) => c.cmd === 9 && c.args[0] === OP.ABORT) > transfer.findLastIndex((c) => c.cmd === 13));
});

test("failed recovery retains mode3; reconnect restores a portable backup without reading partial sample images", async () => {
  const { device, keyboard } = await connected();
  const prepared = await prepareProjectImport(device, await bundle(rawProject(2), snapshot([alternate, null, third])));
  keyboard.transform = (cmd, a, r) => cmd === 12 ? [r[0], ...r.slice(1, 4), 1] : r;
  await assert.rejects(applyProjectImport(device, prepared, { confirmed: true, backupSaved: true }), (e) => e.rollback === "failed");
  assert.equal(keyboard.mode, 3); assert.equal(device.mode, 3); assert.deepEqual(keyboard.project, rawProject());
  keyboard.transform = null;
  const reconnected = new ProjectDevice(keyboard, { timeout: 10, now: () => keyboard.clock });
  assert.equal((await reconnected.connect()).recovery, true);
  const at = keyboard.calls.length;
  const recovery = await prepareProjectImport(reconnected, prepared.backupBytes);
  assert.equal(recovery.recovery, true); assert.equal(recovery.backupBytes, null); assert.equal(recovery.plan.changes.length, 3);
  assert.equal(keyboard.calls.slice(at).some((c) => c.cmd === 16), false, "preparation uses only layout capacities, never damaged sample payloads");
  assert.equal(keyboard.calls.slice(at).some((c) => c.cmd === 9 && c.args[0] === OP.EXPORT), false);
  await assert.rejects(applyProjectImport(reconnected, recovery), /Confirm/);
  const result = await applyProjectImport(reconnected, recovery, { confirmed: true });
  assert.equal(result.recovered, true); assert.deepEqual(result.changedSlots, [1, 2, 3]);
  assert.deepEqual(keyboard.images, snapshot().images); assert.deepEqual(keyboard.project, rawProject()); assert.equal(keyboard.mode, 0);
});

test("mode3 refuses project-only recovery and keeps the hold on a failed portable recovery", async () => {
  const keyboard = new Keyboard(); keyboard.sampleBaseline = keyboard.images.map(clone);
  keyboard.mode = 3; keyboard.images[0] = null; keyboard.flash[0].fill(255);
  const device = new ProjectDevice(keyboard, { timeout: 10, now: () => keyboard.clock });
  await device.connect();
  await assert.rejects(prepareProjectImport(device, await bundle(rawProject(), snapshot(), false)), /portable project/);
  assert.equal(keyboard.sampleWrites().length, 0);
  const recovery = await prepareProjectImport(device, await bundle());
  keyboard.transform = (cmd, a, r) => cmd === 12 ? [r[0], ...r.slice(1, 4), 1] : r;
  await assert.rejects(applyProjectImport(device, recovery, { confirmed: true }), (e) => {
    assert.equal(e.recoveryRequired, true); assert.match(e.message, /holding audio and controls/); return true;
  });
  assert.equal(keyboard.mode, 3); assert.equal(device.mode, 3); assert.equal(keyboard.commits.length, 0);
});

test("save/load/reset use confirmation tokens, do not touch samples and never retry SAVE blindly", async () => {
  const { device, keyboard } = await connected();
  await assert.rejects(device.load(false), /Confirm/); await assert.rejects(device.reset(false), /Confirm/);
  await device.reset(true); await device.load(true); assert.deepEqual(keyboard.project, rawProject());
  keyboard.transform = (cmd, a, r) => cmd === 9 && a[0] === OP.SAVE ? null : r;
  await assert.rejects(device.save(), /acknowledge/);
  assert.equal(keyboard.projectCalls(OP.SAVE).length, 1);
  assert.deepEqual(keyboard.projectCalls(OP.LOAD)[0].args.slice(1), [0x58, 0x30]);
  assert.deepEqual(keyboard.projectCalls(OP.RESET)[0].args.slice(1), [0x58, 0x30]);
  assert.equal(keyboard.sampleWrites().length, 0); assert.deepEqual(keyboard.images, snapshot().images);
});

test("MIDI adapter ignores normal playing traffic and bounds idle SysEx buffering", async () => {
  let listener;
  const input = { addEventListener(type, callback) { listener = callback; }, removeEventListener() { listener = null; } };
  const link = new ProjectMidiLink(input, { state: "connected", send() {} });
  for (let i = 0; i < 100; i++) listener({ data: [0x90, 60, 100] });
  assert.equal(link.queue.length, 0);
  for (let i = 0; i < 64; i++) listener({ data: frame(9, [OP.QUERY, 0]) });
  assert.equal(link.queue.length, 64); link.drain();
  const waiting = link.read(100);
  listener({ data: [0xF8] }); assert.notEqual(link.pending, null);
  listener({ data: frame(9, [OP.ABORT, 0]) }); assert.deepEqual(await waiting, frame(9, [OP.ABORT, 0]));
  for (let i = 0; i < 65; i++) listener({ data: frame(9, [OP.QUERY, 0]) });
  assert.equal(link.closed, true); assert.equal(listener, null);
  assert.equal(link.queue.length, 0); assert.equal(link.rxBytes, 0);
  await assert.rejects(link.read(100), e => e.code === "overflow");
  link.close();
});

// Actual C project_capture_stage/project_file_header export, not a forged JS header.
function firmwareProjectFixture(pattern = 3) {
  const f = JSON.parse(readFileSync(new URL(`../tests/fixtures/project-v${pattern}-sound10.json`, import.meta.url), "utf8"));
  const raw = new Uint8Array(inflateSync(Buffer.from(f.zlib_base64, "base64")));
  assert.equal(f.synthetic, true); assert.equal(f.contains_user_data, false);
  assert.equal(f.project_validate_stage, 0); assert.equal(f.project_file_validate, 0);
  assert.ok(f.defines.includes("X0X_WOBBLE=1"), "fixture must use the product Miami backend");
  const producers = { 3: "d633833ac369f8466bc2563791614206070e87d1", 6: "6ddea31d6040d6735989e64adbe11630fc1ee7ec" };
  assert.equal(f.source_commit, producers[pattern]);
  assert.deepEqual(f.dirty_production_files, []);
  assert.equal(f.producer_readback.same_previous_fixture_bytes, true);
  assert.equal(raw.length, f.length);
  assert.equal(createHash("sha256").update(raw).digest("hex"), f.sha256);
  return raw;
}

test("only explicit pattern/sound revision pairs are accepted", () => {
  for (const [patternVersion, soundRevision] of [[3, 4], [3, 10], [6, 10]]) {
    const raw = rawProject(), v = new DataView(raw.buffer); v.setUint32(20, patternVersion, true); v.setUint32(24, soundRevision, true);
    assert.equal(parseProject(raw).patternVersion, patternVersion); assert.equal(parseProject(raw).soundRevision, soundRevision);
  }
  for (const [pattern, sound] of [[2, 10], [3, 5], [3, 9], [3, 11], [4, 10], [5, 10], [6, 4], [6, 9], [7, 10], [999, 999]]) {
    const raw = rawProject(), v = new DataView(raw.buffer); v.setUint32(20, pattern, true); v.setUint32(24, sound, true);
    assert.throws(() => parseProject(raw), /incompatible/);
  }
});

test("actual current firmware export retains its 3/10 header and every payload byte", async () => {
  const raw = firmwareProjectFixture(), info = parseProject(raw);
  assert.equal(info.patternVersion, 3); assert.equal(info.soundRevision, 10);
  for (const portable of [false, true]) {
    const file = await readProjectFile(await bundle(raw, snapshot(), portable));
    assert.deepEqual(file.project, raw); assert.equal(file.portable, portable);
  }
  const corrupt = raw.slice(); corrupt[corrupt.length - 1] ^= 1;
  assert.throws(() => parseProject(corrupt), /CRC/);
  assert.throws(() => parseProject(raw, raw.length + 1), /firmware/);
});

test("current and endpoint-revision exports pass the real frontend transaction without sample changes", async () => {
  for (const pattern of [3, 6]) {
    const raw = firmwareProjectFixture(pattern), { keyboard, device } = await connected({ project: raw });
    const exported = await readProjectSnapshot(device);
    assert.deepEqual(exported.project, raw);
    const prepared = await prepareProjectImport(device, await bundle(raw, snapshot(), false));
    await applyProjectImport(device, prepared, { confirmed: true });
    assert.deepEqual(keyboard.project, raw); assert.equal(keyboard.sampleWrites().length, 0);
    assert.equal(keyboard.projectCalls(OP.VALIDATE).length, 1);
    assert.equal(keyboard.projectCalls(OP.COMMIT).length, 1);
  }
});

test("current stream-3 firmware refuses endpoint stream-6 data before any sample replacement or adoption", async () => {
  const raw = firmwareProjectFixture(6), old = firmwareProjectFixture(3);
  const { keyboard, device } = await connected({ project: old });
  const prepared = await prepareProjectImport(device, await bundle(raw, snapshot([alternate, null, third])));
  assert.ok(prepared.plan.collisions.length, "the rejected import would otherwise replace an occupied sample");
  await assert.rejects(applyProjectImport(device, prepared, { confirmed: true, backupSaved: true }), /project version/);
  assert.equal(keyboard.projectCalls(OP.VALIDATE).length, 1);
  assert.equal(keyboard.projectCalls(OP.COMMIT).length, 0); assert.equal(keyboard.sampleWrites().length, 0);
  assert.deepEqual(keyboard.project, old); assert.equal(keyboard.mode, 0);
});
