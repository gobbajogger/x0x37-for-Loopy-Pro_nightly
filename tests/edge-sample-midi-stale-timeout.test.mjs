// SPDX-License-Identifier: GPL-3.0-only
// Edge-Case Hunt: test-only EXPECTED FAIL until the sample workspace Link.req
// clears an old timeout when output.send throws, or otherwise isolates requests.
// This executes the exact Link class extracted from the shipped browser page.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../web/x0x_breaks.html", import.meta.url), "utf8");
const start = page.indexOf("class Link {");
const suffix = "\n}\n\nasync function connect()";
const end = page.indexOf(suffix, start);
assert.ok(start >= 0 && end > start, "sample workspace Link class must remain present");
const classSource = page.slice(start, end + 2);
const HDR = [0x7D, 0x46, 0x4C];

class Clock {
  now = 0;
  next = 1;
  jobs = new Map();
  setTimeout = (fn, delay) => {
    const id = this.next++;
    this.jobs.set(id, { due: this.now + delay, fn, cancelled: false });
    return id;
  };
  clearTimeout = (id) => {
    const job = this.jobs.get(id);
    if (job) job.cancelled = true;
  };
  advance(delta) {
    const target = this.now + delta;
    while (true) {
      const ready = [...this.jobs.entries()]
        .filter(([, job]) => !job.cancelled && job.due <= target)
        .sort((a, b) => a[1].due - b[1].due);
      if (!ready.length) break;
      const [id, job] = ready[0];
      this.now = job.due;
      this.jobs.delete(id);
      job.fn();
    }
    this.now = target;
  }
}

function setup(send) {
  const clock = new Clock();
  // Inject deterministic fake timers into the actual page's Link class.
  const Link = new Function("HDR", "setTimeout", "clearTimeout",
    classSource + "\nreturn Link;")(HDR, clock.setTimeout, clock.clearTimeout);
  const input = {};
  const link = new Link(input, { send });
  const reply = (cmd = 9) => input.onmidimessage({
    data: Uint8Array.from([0xF0, ...HDR, cmd, 0, 0xF7]),
  });
  return { clock, link, reply };
}

test("baseline: one matching MIDI acknowledgement resolves before timeout", async () => {
  const { link, reply } = setup(() => {});
  const result = link.req(9, [], 1000);
  reply();
  assert.deepEqual(await result, [0]);
});

test("negative: a thrown send's old timer must not erase a newer live request", async () => {
  let attempts = 0;
  const { clock, link, reply } = setup(() => {
    attempts++;
    if (attempts === 1) throw new Error("transient output.send failure");
  });

  // First send fails synchronously at t=0; retry can send at t=100.
  await assert.rejects(link.req(9, [], 1000), /transient output.send failure/);
  clock.advance(100);
  const retry = link.req(9, [], 1000);

  // At t=1001, first timer expired, but retry has until t=1100.
  clock.advance(901);
  assert.equal(attempts, 2, "only two sends are needed to reproduce this");
  assert.equal(link.wait?.cmd, 9,
    "FAIL_BEFORE_FIX: stale timeout from failed send cleared a newer live request");

  // A matching reply inside retry's own deadline must be received.
  reply(9);
  assert.deepEqual(await retry, [0]);
});
