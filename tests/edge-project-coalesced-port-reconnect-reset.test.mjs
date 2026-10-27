// SPDX-License-Identifier: GPL-3.0-only
// EC045 test-only: delayed WebMIDI statechange must revoke the old Project Workspace session.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../web/x0x_projects.html', import.meta.url), 'utf8');
const found = page.match(/function invalidateDisconnectedLink\([^)]*\)\s*\{[\s\S]*?\n\}/);
assert.ok(found, 'Actual production project-disconnect handler is missing');

function session({ prepared = false } = {}) {
  const state = { frames: [], closed: 0, notice: '', identity: { textContent: 'X0X keyboard' } };
  const input = { state: 'connected' };
  const output = { state: 'connected', send: frame => state.frames.push([...frame]) };
  const oldLink = { input, output, closed: false, close() { this.closed = true; state.closed++; } };
  const oldDevice = { reset(confirmed) {
    assert.equal(confirmed, true);
    if (!oldLink.closed) output.send([0xF0, 0x7D, 0x46, 0x4C, 9, 73, 0x58, 0x30, 0xF7]);
  } };
  const ctx = { link: oldLink, device: oldDevice, prepared: prepared ? { backup: true } : null,
    $: id => id === 'identity' ? state.identity : {},
    say: msg => { state.notice = msg; }, controls() {} };
  const api = new Function('ctx',
    'let link=ctx.link, device=ctx.device, prepared=ctx.prepared, previewStale=false;' +
    'const $=ctx.$,say=ctx.say,controls=ctx.controls;\n' + found[0] +
    '\nreturn {event:e=>invalidateDisconnectedLink(e),' +
    'state:()=>({authorized:!!device,previewStale}),reset:()=>{if(device)device.reset(true);}};')(ctx);
  return { state, input, output, api };
}

test('control: confirmed reset is possible on an unchanged connected session', () => {
  const x = session(); x.api.reset();
  assert.deepEqual(x.state.frames[0], [0xF0, 0x7D, 0x46, 0x4C, 9, 73, 0x58, 0x30, 0xF7]);
});

test('control: promptly observed disconnection revokes device and preview', () => {
  const x = session({ prepared: true });
  x.input.state = 'disconnected';
  x.api.event({ type: 'statechange', port: x.input });
  x.api.reset();
  assert.equal(x.state.closed, 1);
  assert.equal(x.state.frames.length, 0);
  assert.equal(x.api.state().authorized, false);
  assert.equal(x.api.state().previewStale, true);
});

test('negative: queued disconnect/reconnect events may arrive after ports show connected', () => {
  const x = session({ prepared: true });
  x.input.state = 'disconnected'; x.output.state = 'disconnected';
  const queued = [{ type: 'statechange', port: x.input }, { type: 'statechange', port: x.output }];
  x.input.state = 'connected'; x.output.state = 'connected'; // persistent WebMIDI port objects
  for (const event of queued) x.api.event(event);
  x.api.reset();
  assert.equal(x.state.frames.length, 0,
    'FAIL_BEFORE_FIX: a destructive RESET must not be sent to the newly connected device without a fresh handshake');
  assert.equal(x.api.state().authorized, false, 'old device identity must be revoked');
  assert.equal(x.api.state().previewStale, true, 'old sample/project preview must be stale');
});
