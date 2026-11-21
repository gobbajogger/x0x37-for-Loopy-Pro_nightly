// SPDX-License-Identifier: GPL-3.0-only
// Observe the existing stereo worklet output without adding an audible route.
const FRAMES = 2048;
const HISTORY = 3; // AudioContext seconds

export function stereoTap({context, node}) {
  const splitter = context.createChannelSplitter(2);
  const analysers = [context.createAnalyser(), context.createAnalyser()];
  const samples = [new Float32Array(FRAMES), new Float32Array(FRAMES)];
  let connected = false, closed = false, previous = -1, readyAt = 0;
  const reset = () => { previous = -1; readyAt = context.currentTime + FRAMES / context.sampleRate; };
  function close() {
    if (closed) return;
    closed = true;
    context.removeEventListener('statechange', reset);
    try {
      if (connected) node.disconnect(splitter);
    } catch (error) {
      // native-session may already have disconnected all worklet outputs on failure.
      if (error.name !== 'InvalidAccessError') throw error;
    } finally { splitter.disconnect(); }
  }
  try {
    for (const [index, analyser] of analysers.entries()) {
      analyser.fftSize = FRAMES;
      splitter.connect(analyser, index);
    }
    node.connect(splitter);
    connected = true;
    context.addEventListener('statechange', reset);
    reset();
  } catch (error) { close(); throw error; }

  function read() {
    const time = context.currentTime;
    if (closed || context.state !== 'running' || time < readyAt || time <= previous) return null;
    previous = time;
    let peak = 0;
    for (const [index, channel] of samples.entries()) {
      analysers[index].getFloatTimeDomainData(channel);
      for (const value of channel) peak = Math.max(peak, Math.abs(value));
    }
    return Number.isFinite(peak) ? {time, peak, channels: samples} : null;
  }
  return {read, reset, close};
}

const db = peak => peak === 0 ? -Infinity : 20 * Math.log10(peak);

export function createMasterOutput(session) {
  const root = document.createElement('section');
  root.className = 'master-output';
  root.setAttribute('aria-label', 'Emulator master output');
  root.innerHTML = '<div><h4>Peak history</h4><output aria-label="Emulator master sample peak">—</output>'+
    '<svg viewBox="0 0 180 32" preserveAspectRatio="none" aria-label="Recent master peaks" role="img"><path/></svg></div>'+
    '<div><h4>Wave · L / R</h4><span data-wave-scale aria-label="Wave display scale"></span><svg viewBox="0 0 128 32" aria-label="Left and right master waveform" '+
    'preserveAspectRatio="none" role="img"><path data-wave="left"/><path data-wave="right"/></svg></div>';
  const output = root.querySelector('output');
  const scale = root.querySelector('[data-wave-scale]');
  const [peakTrace, left, right] = root.querySelectorAll('path');
  const history = [];
  let tap;
  function clear() {
    history.length = 0;
    output.textContent = '—';
    scale.textContent = '';
    for (const path of [peakTrace, left, right]) path.removeAttribute('d');
  }
  function update() {
    if (document.hidden) { tap.reset(); clear(); return; }
    const sample = tap.read();
    if (!sample) { clear(); return; }
    const {time, peak, channels} = sample;
    if (history.length && time - history.at(-1).time > 0.25) history.length = 0;
    history.push({time, peak});
    while (history.length > 64 || history[0].time < time - HISTORY) history.shift();
    const level = db(peak);
    output.textContent = Number.isFinite(level) ? level.toFixed(1) + ' dBFS' : '−∞ dBFS';
    peakTrace.setAttribute('d', history.map((p, i) => {
      const x = 179 - 178 * (time - p.time) / HISTORY;
      const y = 30 - 28 * Math.min(1, Math.max(0, (db(p.peak) + 60) / 60));
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' '));
    // One visible scale for both channels, leaving their relative amplitude intact.
    const gain = peak > 0 ? Math.max(1, Math.min(16, 2 ** Math.floor(-Math.log2(peak)))) : 1;
    scale.textContent = '×' + gain;
    [left, right].forEach((path, index) => {
      const values = channels[index].subarray(FRAMES - 128);
      path.setAttribute('d', Array.from(values, (value, i) =>
        (i ? 'L' : 'M') + i + ' ' + (8 + index * 16 - 7 * Math.max(-1, Math.min(1, value * gain))).toFixed(2)).join(' '));
    });
  }
  try { tap = stereoTap(session); } catch { /* Leave unavailable if the optional tap cannot open. */ }
  const interval = tap ? setInterval(update, 50) : null;
  if (tap) session.context.addEventListener('statechange', clear);
  return {
    mount(host) { if (root.parentNode !== host) host.querySelector('h3').after(root); },
    close() {
      if (tap) session.context.removeEventListener('statechange', clear);
      clearInterval(interval);
      tap?.close();
      root.remove();
    }
  };
}
