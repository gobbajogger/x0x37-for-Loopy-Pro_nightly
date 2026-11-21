// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {stereoTap} from '../../web/product-site/remote/master-output.mjs';

test('independent PCM channels retain antiphase peaks and detach only the analysis branch', () => {
  const context = new EventTarget();
  const connections = [], removed = [];
  const worklet = {connect: dest => connections.push([worklet, dest]),
    disconnect: dest => removed.push([worklet, dest])};
  const split = {connect: (dest, channel) => connections.push([split, dest, channel]),
    disconnect: () => removed.push([split])};
  const analysers = [-0.75, 0.75].map(value => ({getFloatTimeDomainData: array => array.fill(value)}));
  let index = 0;
  Object.assign(context, {sampleRate:44100, currentTime:0, state:'running',
    createChannelSplitter: n => { assert.equal(n, 2); return split; },
    createAnalyser: () => analysers[index++]});
  const tap = stereoTap({context, node:worklet});
  assert.deepEqual(connections, [[split,analysers[0],0],[split,analysers[1],1],[worklet,split]]);
  assert.equal(tap.read(), null);
  context.currentTime = .05;
  const {peak, channels} = tap.read();
  assert.equal(peak, .75);
  assert.deepEqual(channels.map(channel => channel[0]), [-.75,.75]);
  assert.equal(tap.read(), null, 'same audio clock supplies no fresh window');
  context.state = 'suspended';context.dispatchEvent(new Event('statechange'));
  assert.equal(tap.read(),null);
  context.state = 'running';context.dispatchEvent(new Event('statechange'));
  context.currentTime = .075;assert.equal(tap.read(),null, 'old samples excluded on resume');
  context.currentTime = .11;assert.equal(tap.read().peak,.75);
  tap.close();tap.close();context.currentTime=1;assert.equal(tap.read(),null);
  assert.deepEqual(removed, [[worklet,split],[split]]);
});
