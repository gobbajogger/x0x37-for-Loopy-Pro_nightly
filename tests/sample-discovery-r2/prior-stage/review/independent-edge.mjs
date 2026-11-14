// SPDX-License-Identifier: GPL-3.0-only
// Independent reviewer probe: only injected in-memory endpoints are used.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {extract, environment} from '../fake-midi-harness.mjs';

const root = new URL('../', import.meta.url);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const original = fs.readFileSync(new URL('original/web/x0x_breaks.html', root), 'utf8');
const candidate = fs.readFileSync(new URL('candidate/web/x0x_breaks.html', root), 'utf8');
assert.equal(sha(candidate), '135907651ba1d8293def1e10e0126ea4a84b3e1d5114d64762c654b45b0fa64f');
const connectRange = html => {
  const start = html.indexOf('async function connect() {');
  const end = html.indexOf('\nfunction unpack7(', start);
  assert.ok(start >= 0 && end > start);
  return [html.slice(0, start), html.slice(start, end), html.slice(end)];
};
const [beforeOriginal,, afterOriginal] = connectRange(original);
const [beforeCandidate,, afterCandidate] = connectRange(candidate);
assert.equal(beforeCandidate, beforeOriginal);
assert.equal(afterCandidate, afterOriginal);

const oldListener = () => {};
const replacementListener = () => {};
async function probe(html) {
  const env = environment(extract(html), [{silent:true, previousHandler:oldListener}, {}]);
  env.ports[0].input.connection = 'open';
  const fakeSend = env.ports[0].output.send.bind(env.ports[0].output);
  env.ports[0].output.send = data => {
    fakeSend(data);
    env.ports[0].input.onmidimessage = replacementListener;
  };
  const link = await env.connect();
  const result = {
    laterCandidateSelected: link.input === env.ports[1].input,
    preopenedInputRetained: env.ports[0].input.connection === 'open',
    replacementListenerRetained: env.ports[0].input.onmidimessage === replacementListener,
    newlyOpenedOutputClosed: env.ports[0].output.connection === 'closed',
    successfulPortsRetained: link.input.connection === 'open' && link.output.connection === 'open',
    inputCloseNotAttempted: !env.events.includes('0:input:close'),
    noTimerLeaked: env.timers.size === 0,
    events: env.events
  };
  return result;
}
// First executed independent dynamic check is the original negative control.
const negativeControl = await probe(original);
assert.equal(negativeControl.newlyOpenedOutputClosed, false);
const positiveControl = await probe(candidate);
for (const [name, value] of Object.entries(positiveControl)) {
  if (name !== 'events') assert.equal(value, true, name);
}
const result = {
  status:'PASS', time_utc:new Date().toISOString(),
  source_sha256:sha(candidate), original_sha256:sha(original),
  original_negative_control:{status:'EXPECTED_CLEANUP_FAILURE', ...negativeControl},
  candidate_edge:positiveControl,
  scope:'Exact extracted Link + connect; fake endpoints only; source outside connect byte-identical; no full matrix rerun.'
};
fs.writeFileSync(new URL('independent-edge-result.json', import.meta.url), JSON.stringify(result, null, 2)+'\n');
console.log(JSON.stringify(result, null, 2));
