// SPDX-License-Identifier: GPL-3.0-only
// Exact candidate source, fake endpoints only; independent emitter-boundary check.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {extract, scenario} from '../fake-midi-harness.mjs';
const root = new URL('../', import.meta.url);
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const original = fs.readFileSync(new URL('original/web/x0x_breaks.html', root), 'utf8');
const candidate = fs.readFileSync(new URL('candidate/web/x0x_breaks.html', root), 'utf8');
assert.equal(sha(candidate), 'c21a286c2b3d3cbee38cb6dc7f7992df143b6ea9081fdb4822b221d5d80eabcc');
const bounds = s => [s.indexOf('async function connect() {'), s.indexOf('\nfunction unpack7(', s.indexOf('async function connect() {'))];
const [oa,ob]=bounds(original),[ca,cb]=bounds(candidate);
assert.equal(original.slice(0,oa),candidate.slice(0,ca));
assert.equal(original.slice(ob),candidate.slice(cb));
const namingLine = s => s.split('\n').find(l=>l.includes('if (input.state === "disconnected"'));
assert.equal(namingLine(original), namingLine(candidate));
const ascii = s => Array.from(s, c=>c.charCodeAt(0));
const version='FELUCCA '+ 'V'.repeat(16); // emitter maximum: 24 bytes before NUL
assert.equal(version.length,24);
const payload=[...ascii(version),0,1,12,8,16,4,...ascii('SYNTH123'),0,4];
// First independent dynamic check: emitter-supported boundary must be accepted.
const supported=await scenario(extract(candidate),'24-byte ID and8-byte engine name retained',[{payload},{}],0,{noLater:true});
const malformed=[...ascii(version),0,1,12,8,16,4,...ascii('SYNTH1234'),0,4];
const rejected=await scenario(extract(candidate),'9-byte engine name must not mask later authentic INFO',[{payload:malformed},{}],1);
const result={status:'PASS',time_utc:new Date().toISOString(),source_sha256:sha(candidate),first_dynamic_check:supported,malformed_boundary_check:rejected,unchanged_scope:'All source outside connect byte-identical to original; exact name-policy line unchanged',scope:'In-memory fake endpoints; no physical/model/serial identity or hardware proof'};
fs.writeFileSync(new URL('independent-boundary-result.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
