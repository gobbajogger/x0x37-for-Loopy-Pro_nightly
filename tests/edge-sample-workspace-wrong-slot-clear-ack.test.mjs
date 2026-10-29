import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// EC041: the Sample Workspace must correlate destructive CLEAR replies by slot.
const html = fs.readFileSync(process.env.EC041_EXCERPTS || new URL('../web/x0x_breaks.html', import.meta.url), 'utf8');
function block(name) {
  const a = html.indexOf(name);
  assert.ok(a >= 0, `missing production block: ${name}`);
  let level = 0;
  for (let i = html.indexOf('{', a); i < html.length; i++) {
    if (html[i] === '{') level++;
    else if (html[i] === '}' && --level === 0) return html.slice(a, i + 1);
  }
  throw Error(`unterminated block: ${name}`);
}
const linkSource = block('class Link {');
const writeSource = block('async function writeImage(k, img, onPart) {');
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}
if (process.env.EC041_EXCERPTS) {
  assert.equal(fnv(linkSource), '302ed6c3');
  assert.equal(fnv(writeSource), '4396ce7d');
}
function setup(replies) {
  const sandbox = { setTimeout, clearTimeout, Uint8Array, Math };
  vm.createContext(sandbox);
  vm.runInContext(`const HDR=[0x7D,0x46,0x4C]; let link; ${linkSource}\n${writeSource}\nglobalThis.api={Link,writeImage,setLink(v){link=v}}`, sandbox);
  const input = { onmidimessage: null };
  const sent = [];
  const output = { send(data) {
    sent.push([...data]);
    for (const { ms, slot, status } of replies) setTimeout(() => input.onmidimessage?.({
      data: Uint8Array.from([0xF0, 0x7D, 0x46, 0x4C, 14, slot, status, 0xF7]),
    }), ms);
  } };
  sandbox.api.setLink(new sandbox.api.Link(input, output));
  return { write: () => sandbox.api.writeImage(1, null), sent };
}

test('valid own-slot CLEAR success remains supported', async () => {
  const { write, sent } = setup([{ ms: 0, slot: 1, status: 0 }]);
  await write();
  assert.deepEqual(sent, [[0xF0, 0x7D, 0x46, 0x4C, 14, 1, 0xF7]]);
});

test('own-slot CLEAR failure is rejected', async () => {
  const { write } = setup([{ ms: 0, slot: 1, status: 1 }]);
  await assert.rejects(write(), /couldn't clear/);
});

test('foreign slot-0 success cannot mask own slot-1 CLEAR failure', async () => {
  const { write } = setup([
    { ms: 0, slot: 0, status: 0 }, // valid reply from another MIDI client
    { ms: 5, slot: 1, status: 1 }, // the requested CLEAR failed
  ]);
  await assert.rejects(write(), /clear|slot|acknowledg|mismatch|invalid/i);
});
