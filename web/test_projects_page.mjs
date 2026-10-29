// SPDX-License-Identifier: GPL-3.0-only
// Reused from gobbajogger/X0X37-for-Loopy-Pro 08d3164a265123cb4c84e5104642fd93257d63d7, web/test_projects_page.mjs.
// Run the page's actual event handlers with a small DOM and controlled service mocks.
// Protocol and exact-byte transfer checks are in test_projects.mjs.
// Run: node web/test_projects_page.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./x0x_projects.html", import.meta.url), "utf8");
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .+;\s*$/m, "");

function environment() {
  const ids = {}, downloads = [], calls = [], blobs = new Map(), confirmations = [];
  const state = { identity: "X0X browser-test", invalidFile: false, failImport: false, consent: true, recovery: false, unsupported: false, exportWait: null, connectWait: null };
  function element(tag = "div") {
    const e = { tag, textContent: "", className: "", children: [], value: "", disabled: false, hidden: false,
      checked: false, files: [], attributes: {}, classList: { toggle() {} },
      append(...children) { this.children.push(...children); if (tag === "select" && !this.value) this.value = children[0]?.value || ""; },
      replaceChildren(...children) { this.children = []; if (tag === "select") this.value = ""; this.append(...children); },
      setAttribute(k, v) { this.attributes[k] = v; }, removeAttribute(k) { delete this.attributes[k]; }, remove() {},
      click() { if (tag === "a") downloads.push({ name: this.download, blob: blobs.get(this.href) }); }
    };
    return e;
  }
  for (const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const e = ids[match[3]] = element(match[1]), attrs = match[2];
    e.disabled = /\bdisabled\b/.test(attrs); e.checked = /\bchecked\b/.test(attrs); e.hidden = /\bhidden\b/.test(attrs);
    e.value = attrs.match(/\bvalue="([^"]*)"/)?.[1] || "";
  }
  const document = { getElementById: (id) => { assert.ok(ids[id], `page id ${id} exists`); return ids[id]; },
    createElement: element, body: element("body") };
  const input = { id: "i", name: "X0X", state: "connected" }, output = { id: "o", name: "X0X", state: "connected" };
  const midi = { inputs: new Map([["i", input]]), outputs: new Map([["o", output]]) };
  const navigator = { requestMIDIAccess: async (options) => {
    assert.deepEqual(options, { sysex: true }); return midi;
  } };
  const window = { confirm: (message) => { confirmations.push(message); return state.consent; } };
  const URL = { createObjectURL: (blob) => { const url = `blob:${blobs.size}`; blobs.set(url, blob); return url; }, revokeObjectURL() {} };
  const projectBytes = new Uint8Array([1, 2, 3]), backupBytes = new Uint8Array([4, 5, 6]);
  const slot = (name) => ({ slot: 1, empty: false, name, zones: 2 });
  const file = () => ({ bytes: projectBytes, portable: true, meta: { name: "A <literal> project", slots: [slot("NEW"), { slot: 2, empty: true }] } });
  class ProjectMidiLink {
    constructor(i, o) { assert.equal(i, input); assert.equal(o, output); this.input = i; this.output = o; }
    close() { calls.push("close"); }
  }
  class ProjectDevice {
    projectLength = 100;
    mode = 0;
    async connect() { calls.push("connect"); if (state.connectWait) await state.connectWait; if (state.unsupported) throw new Error("This X0X firmware does not provide the supported project protocol."); if (!state.identity.startsWith("X0X ")) throw new Error("This MIDI port is not running X0X."); this.mode = state.recovery ? 3 : 0; return { identity: state.identity, recovery: state.recovery }; }
    async save() { calls.push("save"); }
    async load(c) { assert.equal(c, true); calls.push("load"); }
    async reset(c) { assert.equal(c, true); calls.push("reset"); }
  }
  const api = {
    PROJECT_MAX_FILE: 4 * 1024 * 1024, ProjectMidiLink, ProjectDevice,
    readProjectFile: async () => { if (state.invalidFile) throw new Error("The project file is damaged (CRC)."); return file(); },
    makeProjectFile: async (raw, snap, options) => { calls.push({ export: options }); return projectBytes; },
    readProjectSnapshot: async () => { calls.push("snapshot"); if (state.exportWait) await state.exportWait; return { project: projectBytes }; },
    prepareProjectImport: async () => { calls.push("prepare"); if (state.recovery) return { file: file(), recovery: true, backupBytes: null,
      plan: { changes: [{ k: 0, action: "restore", from: { unknown: true, empty: null }, to: slot("NEW") },
        { k: 1, action: "clear", from: { unknown: true, empty: null }, to: { slot: 2, empty: true } }], collisions: [], unchanged: [] } };
      return { file: file(), backupBytes,
      plan: { changes: [{ k: 0, action: "replace", from: slot("OLD"), to: slot("NEW") }], collisions: [{ k: 0 }], unchanged: [1] } }; },
    applyProjectImport: async (device, prepared, options) => { calls.push({ import: options });
      if (state.failImport) throw new Error("Recovery could not finish: USB disconnected. Reconnect and import the recovery backup.");
      device.mode = 0; return { recovered: !!prepared.recovery, changedSlots: [1], skippedSlots: [2] }; }
  };
  const execute = new Function("document", "navigator", "window", "URL", "Blob", "setTimeout", ...Object.keys(api), script);
  execute(document, navigator, window, URL, Blob, () => 0, ...Object.values(api));
  const settle = async () => {
    for (let i = 0; i < 50; i++) {
      await new Promise((resolve) => setImmediate(resolve));
      if (!ids.find.disabled) return;
    }
    throw new Error(`Page did not finish: ${ids.status.textContent}`);
  };
  const click = async (id) => { assert.equal(ids[id].disabled, false, `${id} should be enabled`); await ids[id].onclick(); await settle(); };
  const choose = async () => { ids.file.files = [{ size: 100, arrayBuffer: async () => projectBytes.buffer }]; await ids.file.onchange(); await settle(); };
  return { ids, state, calls, downloads, confirmations, click, choose, settle, backupBytes, window, midi, input, output };
}

test("page checks a file before connecting and keeps keyboard actions disabled", async () => {
  const e = environment();
  for (const id of ["save", "load", "reset", "export", "prepare", "import"]) assert.equal(e.ids[id].disabled, true);
  await e.choose();
  assert.match(e.ids.status.textContent, /Connect the keyboard/);
  assert.match(e.ids["file-info"].textContent, /A <literal> project/);
  assert.equal(e.ids.prepare.disabled, true);
  await e.click("find");
  assert.match(e.ids.identity.textContent, /X0X browser-test/);
  assert.equal(e.ids.prepare.disabled, false); assert.equal(e.ids.save.disabled, false);
});

test("wrong identity and damaged file leave mutation controls unavailable", async () => {
  const e = environment(); e.state.identity = "Felucca";
  await e.click("find"); assert.match(e.ids.status.textContent, /not running X0X/); assert.equal(e.ids.save.disabled, true);
  e.state.invalidFile = true; await e.choose();
  assert.match(e.ids.status.textContent, /CRC/); assert.equal(e.ids.prepare.disabled, true);
});

test("export defaults portable and project-only option is explicit", async () => {
  const e = environment(); await e.click("find");
  assert.equal(e.ids.portable.checked, true); assert.equal(e.ids.export.textContent, "Export project + samples");
  await e.click("export"); assert.equal(e.calls.find((c) => c.export).export.portable, true);
  assert.match(e.downloads[0].name, /\.x0xproject$/);
  e.ids.portable.checked = false; e.ids.portable.onchange(); await e.click("export");
  assert.equal(e.calls.filter((c) => c.export).at(-1).export.portable, false);
  assert.match(e.downloads.at(-1).name, /-project-only\.x0xproject$/);
});

test("collision import requires downloaded recovery, saved acknowledgement and explicit import consent", async () => {
  const e = environment(); await e.click("find"); await e.choose(); await e.click("prepare");
  assert.equal(e.ids.preview.hidden, false); assert.equal(e.ids.import.disabled, true);
  assert.equal(e.ids["backup-confirm"].hidden, false); assert.equal(e.ids["backup-saved"].disabled, true);
  assert.equal(e.ids["slot-rows"].children[0].children[3].textContent, "Replace existing samples");
  await e.click("backup"); assert.equal(e.ids.import.disabled, true); assert.equal(e.ids["backup-saved"].disabled, false);
  assert.deepEqual(new Uint8Array(await e.downloads.at(-1).blob.arrayBuffer()), e.backupBytes);
  e.ids["backup-saved"].checked = true; e.ids["backup-saved"].onchange(); assert.equal(e.ids.import.disabled, false);
  e.state.consent = false; await e.click("import"); assert.equal(e.calls.some((c) => c.import), false);
  e.state.consent = true; await e.click("import");
  assert.equal(e.calls.find((c) => c.import).import.confirmed, true);
  assert.equal(e.calls.find((c) => c.import).import.backupSaved, true);
  assert.equal(e.ids.preview.hidden, true); assert.match(e.ids.status.textContent, /Project imported/);
});

test("failed import retains recovery download and requires a new preview before retry", async () => {
  const e = environment(); await e.click("find"); await e.choose(); await e.click("prepare"); await e.click("backup");
  e.ids["backup-saved"].checked = true; e.ids["backup-saved"].onchange(); e.state.failImport = true;
  await e.click("import");
  assert.match(e.ids.status.textContent, /Recovery could not finish/);
  assert.equal(e.ids.preview.hidden, false); assert.equal(e.ids.backup.disabled, false); assert.equal(e.ids.import.disabled, true);
  await e.click("backup"); e.ids["backup-saved"].onchange(); assert.equal(e.ids.import.disabled, true);
  await e.click("cancel"); assert.doesNotMatch(e.ids.status.textContent, /keyboard has not changed/);
  assert.equal(e.ids.recovery.hidden, false); await e.click("recover-backup");
  assert.deepEqual(new Uint8Array(await e.downloads.at(-1).blob.arrayBuffer()), e.backupBytes);
  await e.click("prepare"); assert.equal(e.ids["backup-saved"].checked, false); assert.equal(e.ids.import.disabled, true);
});

test("load/reset decline sends no action; accepted action invalidates the import preview", async () => {
  const e = environment(); await e.click("find"); await e.choose(); await e.click("prepare");
  e.state.consent = false; await e.click("load"); await e.click("reset");
  assert.equal(e.calls.includes("load"), false); assert.equal(e.calls.includes("reset"), false);
  assert.equal(e.ids.preview.hidden, false);
  e.state.consent = true; await e.click("reset"); assert.equal(e.calls.filter((c) => c === "reset").length, 1);
  assert.equal(e.ids.preview.hidden, true); assert.match(e.ids.status.textContent, /Sample slots are unchanged/);
  await e.click("load"); await e.click("save");
  assert.equal(e.calls.filter((c) => c === "load").length, 1); assert.equal(e.calls.filter((c) => c === "save").length, 1);
});

test("mode3 recovery explains the hold, disables normal actions and confirms the portable recovery source", async () => {
  const e = environment(); e.state.recovery = true;
  await e.click("find"); assert.match(e.ids.status.textContent, /holding audio and controls/);
  for (const id of ["save", "load", "reset", "export"]) assert.equal(e.ids[id].disabled, true);
  await e.choose(); await e.click("prepare");
  assert.equal(e.ids.prepare.textContent, "Prepare recovery"); assert.equal(e.ids.import.textContent, "Restore recovery project");
  assert.equal(e.ids.backup.hidden, true); assert.equal(e.ids["backup-confirm"].hidden, true); assert.equal(e.ids.import.disabled, false);
  assert.equal(e.ids["slot-rows"].children[0].children[1].textContent, "Interrupted transfer");
  e.state.consent = false; await e.click("import"); assert.equal(e.calls.some((c) => c.import), false);
  e.state.consent = true; await e.click("import"); assert.match(e.ids.status.textContent, /Recovery complete/);
  assert.equal(e.ids.save.disabled, false); assert.equal(e.ids.preview.hidden, true);
});


test("workspace switch detaches MIDI, retains dirty form and file, and invalidates device preview", async () => {
  const e = environment(); await e.click("find"); await e.choose(); await e.click("prepare");
  e.ids.name.value = "My edited draft"; e.ids.portable.checked = false;
  assert.equal(e.window.projectWorkspace.activate(false), true);
  assert.equal(e.ids.preview.hidden, true); assert.equal(e.ids.find.disabled, true);
  assert.equal(e.ids.reset.disabled, true); assert.equal(e.calls.at(-1), "close");
  assert.equal(e.ids.name.value, "My edited draft"); assert.equal(e.ids.portable.checked, false);
  const n = e.calls.length; await e.ids.find.onclick(); await e.ids.reset.onclick();
  assert.equal(e.calls.length, n); // hidden handlers cannot initiate a device operation
  assert.equal(e.window.projectWorkspace.activate(true), true);
  assert.equal(e.ids.prepare.disabled, true); // no old device or preview can be reused
  await e.click("find"); assert.equal(e.ids.prepare.disabled, false); // selected file retained
});

test("disconnect disables mutation and invalidates preview while preserving recovery download", async () => {
  const e = environment(); await e.click("find"); await e.choose(); await e.click("prepare");
  await e.click("backup"); e.ids["backup-saved"].checked = true; e.ids["backup-saved"].onchange();
  e.input.state = "disconnected"; e.midi.onstatechange();
  assert.equal(e.ids.reset.disabled, true); assert.equal(e.ids.import.disabled, true);
  assert.match(e.ids.status.textContent, /USB disconnected/);
  await e.click("backup"); // backup of the interrupted connection is still downloadable
  assert.deepEqual(new Uint8Array(await e.downloads.at(-1).blob.arrayBuffer()), e.backupBytes);
});

test("queued bound-port reconnect revokes preview and requires an explicit fresh identity handshake", async () => {
  const e = environment(); await e.click("find"); await e.choose(); await e.click("prepare"); await e.click("backup");
  e.input.state = "disconnected";
  const event = { type: "statechange", port: e.input };
  e.input.state = "connected";
  e.midi.onstatechange(event);
  assert.equal(e.ids.reset.disabled, true); assert.equal(e.ids.import.disabled, true);
  assert.equal(e.ids.backup.disabled, false, "the prepared backup download survives revocation");
  assert.equal(e.calls.filter(c => c === "connect").length, 1);
  await e.click("connect");
  assert.equal(e.calls.filter(c => c === "connect").length, 2, "fresh protocol and identity handshake is required");
  assert.equal(e.ids.reset.disabled, false); assert.equal(e.ids.import.disabled, true, "old import preview stays invalid");
});

test("unrelated port lifecycle event preserves the current verified session", async () => {
  const e = environment(); await e.click("find"); await e.choose(); await e.click("prepare");
  const prior = e.ids.identity.textContent;
  e.midi.onstatechange({ type: "statechange", port: { id: "unrelated", type: "input", state: "disconnected" } });
  assert.equal(e.ids.reset.disabled, false); assert.equal(e.ids.identity.textContent, prior);
  assert.equal(e.ids.preview.hidden, false);
});

test("initial explicit open events are consumed before the new session is bound", async () => {
  const e = environment(), observed = [];
  for (const port of [e.input, e.output]) {
    const listeners = new Set();
    port.connection = "closed";
    port.addEventListener = (name, listener) => { assert.equal(name, "statechange"); listeners.add(listener); };
    port.removeEventListener = (name, listener) => { assert.equal(name, "statechange"); listeners.delete(listener); };
    port.open = async () => {
      port.connection = "open";
      setImmediate(() => {
        assert.equal(e.calls.includes("connect"), false, "the identity request waits for both port-open events");
        const event = { type: "statechange", port };
        e.midi.onstatechange(event); for (const listener of listeners) listener(event);
        observed.push(port.id);
      });
      return port;
    };
  }
  await e.click("find");
  assert.deepEqual(observed.sort(), ["i", "o"]);
  assert.equal(e.ids.reset.disabled, false); assert.match(e.ids.identity.textContent, /X0X browser-test/);
  assert.equal(e.calls.filter(c => c === "connect").length, 1);
  assert.equal(e.calls.filter(c => c === "close").length, 0);
});

test("busy export refuses repeat clicks and task switching without discarding draft state", async () => {
  const e = environment(); await e.click("find");
  let finish; e.state.exportWait = new Promise(resolve => { finish = resolve; });
  const first = e.ids.export.onclick(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(e.window.projectWorkspace.busy(), true);
  assert.equal(e.window.projectWorkspace.activate(false), false);
  assert.equal(e.window.projectWorkspace.invalidate(), false);
  await e.ids.export.onclick(); await e.ids.reset.onclick();
  assert.equal(e.calls.filter(c => c === "snapshot").length, 1);
  assert.equal(e.calls.includes("reset"), false); assert.equal(e.confirmations.length, 0);
  finish(); await first; await e.settle(); assert.equal(e.downloads.length, 1);
});

test("unsupported firmware has an honest unavailable state and no reset fallback", async () => {
  const e = environment(); e.state.unsupported = true; await e.click("find");
  assert.match(e.ids.identity.textContent, /Projects unavailable/);
  assert.match(e.ids.status.textContent, /does not provide the supported project protocol/);
  for (const id of ["save", "load", "reset", "export", "prepare", "import"]) assert.equal(e.ids[id].disabled, true);
  await e.ids.reset.onclick(); assert.equal(e.calls.includes("reset"), false);
});

test("reset wording distinguishes whole project, samples and autosave from arrangement clear", () => {
  assert.match(html, /Reset project · keep samples/);
  assert.match(html, /SONG → CLEAR SONG/);
  assert.match(html, /Arrangement-only clear is unavailable in this browser/);
  assert.match(html, /Autosave turns ON and may overwrite the saved project/);
});


test("empty chooser cancellation keeps checked file, preview and saved-backup consent", async () => {
  const e = environment(); await e.click("find"); await e.choose(); await e.click("prepare");
  await e.click("backup"); e.ids["backup-saved"].checked = true; e.ids["backup-saved"].onchange();
  const info = e.ids["file-info"].textContent;
  e.ids.file.files = []; await e.ids.file.onchange();
  assert.equal(e.ids["file-info"].textContent, info);
  assert.equal(e.ids.preview.hidden, false); assert.equal(e.ids.import.disabled, false);
  assert.equal(e.ids["backup-saved"].checked, true);
});


for (const port of ["input", "output"]) for (const result of ["resolve", "reject"]) {
  test(`pending connect ${result} after ${port} disconnect cannot revive actions or overwrite disconnect status`, async () => {
    const e = environment(); let resolve, reject;
    e.state.connectWait = new Promise((a, b) => { resolve = a; reject = b; });
    const finding = e.ids.find.onclick(); await new Promise(setImmediate);
    assert.equal(e.calls.filter(c => c === "connect").length, 1);
    e[port].state = "disconnected"; e.midi.onstatechange();
    const status = e.ids.status.textContent;
    if (result === "resolve") resolve(); else reject(new Error("late identity timeout"));
    await finding;
    for (const id of ["save", "load", "reset", "export", "prepare", "import"]) assert.equal(e.ids[id].disabled, true);
    assert.equal(e.ids.identity.textContent, "Disconnected"); assert.equal(e.ids.status.textContent, status);
    assert.equal(e.calls.filter(c => c === "close").length, 1);
    assert.equal(e.calls.some(c => ["save", "load", "reset", "snapshot", "prepare"].includes(c) || c.import), false);
  });
}

test("final port-state check refuses connect when disconnect event has not arrived", async () => {
  const e = environment(); let finish;
  e.state.connectWait = new Promise(resolve => { finish = resolve; });
  const finding = e.ids.find.onclick(); await new Promise(setImmediate);
  e.output.state = "disconnected"; finish(); await finding;
  assert.equal(e.ids.identity.textContent, "Disconnected"); assert.equal(e.ids.save.disabled, true);
  assert.equal(e.calls.filter(c => c === "close").length, 1);
});

test("replug does not revive old pending connect; an explicit fresh retry remains usable", async () => {
  const e = environment(); let finish;
  e.state.connectWait = new Promise(resolve => { finish = resolve; });
  const finding = e.ids.find.onclick(); await new Promise(setImmediate);
  e.input.state = "disconnected"; e.midi.onstatechange();
  e.input.state = "connected"; e.midi.onstatechange(); finish(); await finding;
  assert.equal(e.ids.identity.textContent, "Disconnected"); assert.equal(e.ids.reset.disabled, true);
  e.state.connectWait = null; await e.click("find");
  assert.equal(e.ids.identity.textContent, "X0X browser-test"); assert.equal(e.ids.save.disabled, false);
  assert.equal(e.calls.filter(c => c === "connect").length, 2);
  assert.equal(e.calls.filter(c => c === "close").length, 1);
});

test("live delayed recovery connection preserves busy exclusion and recovery mutation hold", async () => {
  const e = environment(); let finish; e.state.recovery = true;
  e.state.connectWait = new Promise(resolve => { finish = resolve; });
  const finding = e.ids.find.onclick(); await new Promise(setImmediate);
  await e.ids.connect.onclick();
  assert.equal(e.window.projectWorkspace.activate(false), false);
  assert.equal(e.window.projectWorkspace.invalidate(), false);
  finish(); await finding;
  assert.equal(e.calls.filter(c => c === "connect").length, 1);
  assert.equal(e.ids.identity.textContent, "X0X browser-test"); assert.match(e.ids.status.textContent, /holding audio and controls/);
  for (const id of ["save", "load", "reset", "export"]) assert.equal(e.ids[id].disabled, true);
  assert.equal(e.calls.includes("close"), false);
});
