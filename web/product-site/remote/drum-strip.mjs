// SPDX-License-Identifier: GPL-3.0-only
// A responsive Draft projection of the captured 909/808 voice, in source bank order.
import {drumDisplay} from './drum-format.mjs';
import {decayCurves,decayMilliseconds} from './drum-decay-times.mjs';
import {GlyphAnimator} from './glyph-live.mjs';
import {sourceControlLabel} from './frame.mjs';

const escape = value => String(value).replace(/[&<>"']/g,
  c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const cache = new WeakMap();

// Each retained R17 function schematic occupies a 32 × 18 unit source cell.
// The viewport translates that cell into place. The captured paths and their
// original transform, stroke, colour and line joins stay intact.
function glyphsFor(screen) {
  if (cache.has(screen)) return cache.get(screen);
  const svg = new DOMParser().parseFromString(screen.body_svg, 'image/svg+xml');
  const xml = new XMLSerializer();
  const glyphs = new Map();
  for (const control of svg.querySelectorAll('[data-drum-control]')) {
    const glyph = control.querySelector('[data-glyph-semantic]');
    if (!glyph) throw Error('Missing source drum glyph');
    const matrix = glyph.cloneNode(true).transform.baseVal.consolidate()?.matrix;
    if (!matrix || matrix.b || matrix.c || matrix.a <= 0 || matrix.d <= 0)
      throw Error('Invalid source drum transform');
    const viewBox = [matrix.e - matrix.a, matrix.f - matrix.d, 34 * matrix.a, 20 * matrix.d].join(' ');
    glyphs.set(control.getAttribute('data-source-control'),
      '<svg class="drum-source-glyph" aria-hidden="true" viewBox="'+viewBox+'">'+xml.serializeToString(glyph)+'</svg>');
  }
  cache.set(screen, glyphs);
  return glyphs;
}

// DnBOX firmware #975 at 9dd6f2df, ui_drum_voice.inc, dv_glyph.
// These are the idle control curves in its 32 x 18 slot coordinates.
const coordinate = n => Number(n.toFixed(4));
const attackEdge = q => 'M1 12L'+coordinate(1+30*q)+' 0L31 0';
// dv_glyph draws these four ticks for kit summaries. A selected 808 KIT
// slot can use a separate two-peak drawing.
function kitSummaryTicks(q) {
  const height = 4+8*q;
  let path='';
  for (let i=0; i<4; i++)
    path += 'M'+(2+8*i)+' 12V'+coordinate(12-height*(i+1)/4);
  return path;
}

// dv_tune_fork samples eight segments per quadratic at the current value.
function tuneFork(q) {
  const half = 7 * (0.62 + 0.76*q);
  const left = 16-half, right = 16+half;
  const drop = 11+2*(q-0.27), tip = 17+1.5*(q-0.27);
  const point = (x,y) => coordinate(x)+' '+coordinate(y);
  let path = 'M'+point(left,0)+'L'+point(left,6);
  for (let i=1; i<=8; i++) {
    const t=i/8, u=1-t;
    path += 'L'+point(left+half*t*t,drop+(6-drop)*u*u);
  }
  for (let i=1; i<=8; i++) {
    const t=i/8, u=1-t;
    path += 'L'+point(right-half*u*u,drop+(6-drop)*t*t);
  }
  return path+'L'+point(right,0)+'M'+point(16,drop)+'L'+point(16,tip);
}

// The 909 uses a fixed two-second axis. The 808 uses the native duration
// when calibrated, or the eased pot position for the seven raw fallback controls.
function decayTail(q, curve, kit909) {
  const ms=curve===null ? 4000*q : Math.fround(decayMilliseconds[curve][Math.round(127*q)]);
  const reach=8+23*Math.sqrt(ms/4000);
  const points=[];
  for(let i=0;i<=16;i++){
    const t=i/16;
    const x=1+t*(kit909?30:reach);
    const y=kit909 ? 12*(1-2**(-16.60964047*2000*t/(ms||1)))
      : i===16 ? 12 : 12*(1-2**(-t*(2.2+3*(1-q))));
    points.push((i?'L':'M')+coordinate(x)+' '+coordinate(y));
  }
  return points.join('');
}

function kickTone(q) {
  const cutoff = 300 * 20 ** q;
  const pole = Math.exp(-2 * Math.PI * cutoff / 44100);
  const points = [];
  for (let i=0; i<=24; i++) {
    const t = i / 24;
    const frequency = 100 * 2 ** (t * 7.78463485);
    const denominator = 1 + pole*pole - 2*pole*Math.cos(2*Math.PI*frequency/44100);
    const gain = Math.min(1,(1-pole)/Math.sqrt(denominator));
    points.push((i?'L':'M')+coordinate(31*t)+' '+coordinate(1+11*(1-gain)));
  }
  return points.join('');
}

// 9dd6f2df drum909_bd_hz and dv_glyph's P.Dpth branch. Tune and Pitch
// have different original drawings; their Draft knobs only feed this trace.
const kickTune='1:0:0:0', kickDepth='1:0:0:4', kickPitch='1:0:0:5';
const sweeps=new WeakMap();
function kickDepthPath(tune,depth,pitch) {
  const pot=raw=>Math.fround(raw/127);
  const tau=6+26*pot(tune), amount=pot(depth);
  const lo=Math.fround(.43),ratio=Math.fround(Math.fround(4.7)/lo);
  const multiplier=Math.fround(lo*Math.fround(ratio**pot(pitch)));
  const base=49*(1+amount*(multiplier-1)),drop=4.6*tau*(1+1.2*amount);
  const points=[];
  for(let i=0;i<=24;i++){
    const t=100*i/24;
    const hz=base+drop*Math.exp(-Math.max(0,t-16)/tau);
    const level=Math.max(0,Math.min(1,Math.log2(hz/40)/3.32));
    points.push((i?'L':'M')+coordinate(31*i/24)+' '+coordinate(12*(1-level)));
  }
  return points.join('');
}

// The native renderer eases Depth alone and reads the other two knobs at their
// current editable values. Either dependency must repaint the existing Depth path.
export function paintKickDepth(root, changed, preview, read) {
  if(!root?.querySelectorAll || ![kickTune,kickDepth,kickPitch].includes(changed))return;
  const value=id=>id===changed?preview:read(id);
  const tune=value(kickTune),depth=value(kickDepth),pitch=value(kickPitch);
  if(![tune,depth,pitch].every(v=>Number.isInteger(v)&&v>=0&&v<=127))return;
  const selector='[data-source-control="'+kickDepth+'"] [data-glyph-semantic="P.DPTH"]';
  for(const glyph of root.querySelectorAll('[data-drum-editor] '+selector+', [data-drum-sound-strip] '+selector)){
    let state=sweeps.get(glyph);
    if(!state){
      const path=glyph.querySelector('path');
      if(!path)continue;
      state={tune,pitch};
      state.draw=q=>{
        // dv_glyph rounds its eased binary32 pot position before engine_param_si.
        const rawDepth=Math.trunc(Math.fround(Math.fround(127*q)+.5));
        path.setAttribute('d',kickDepthPath(state.tune,rawDepth,state.pitch));
      };
      state.animator=new GlyphAnimator({value:depth/127,draw:state.draw});
      glyph.setAttribute('data-glyph-origin','firmware dv_glyph');
      sweeps.set(glyph,state);
    }else{
      if(state.tune!==tune || state.pitch!==pitch){
        state.tune=tune;state.pitch=pitch;
        state.draw(state.animator.value);
      }
      state.animator.set(depth/127);
    }
  }
}

const animators = new WeakMap();
function drumShape(control) {
  const curve=decayCurves[control.identity];
  if (curve!==undefined && control.markers?.['visual-role']==='active glyph/value control' &&
      (control.context.name==='Decay' || control.context.name==='Tail'))
    return q=>decayTail(q,curve,control.identity.startsWith('1:0:'));
  if (control.context.name==='Attack') return attackEdge;
  if (control.identity==='1:1:0:1') return kickTone;
  if ((control.identity==='1:0:11:1' || control.identity==='1:1:11:1') &&
      control.markers?.['visual-role']==='inactive bank parameter summary') return kitSummaryTicks;
  // The 909 kick uses DG_BDSWEEP, whose curve also depends on Pitch and Depth.
  if (control.context.name==='Tune' && control.identity!=='1:0:0:0') return tuneFork;
  return null;
}

export function paintDrumGlyph(root,control,raw,max) {
  const shape = drumShape(control);
  if (!shape || !root?.querySelectorAll || !Number.isFinite(raw) || !(max>0)) return;
  const q = Math.max(0,Math.min(1,raw/max));
  const selector = '[data-source-control="'+control.identity+'"] [data-glyph-semantic]';
  for (const glyph of root.querySelectorAll('[data-drum-editor] '+selector+', [data-drum-sound-strip] '+selector)) {
    let animator = animators.get(glyph);
    if (!animator) {
      const path = glyph.querySelector('path');
      if (!path) continue;
      glyph.setAttribute('data-glyph-origin','firmware dv_glyph');
      animator = new GlyphAnimator({value:q,draw:v=>path.setAttribute('d',shape(v))});
      animators.set(glyph,animator);
    } else {
      animator.set(q);
    }
  }
}

export function drumValueText(control, value) {
  return drumDisplay(control.identity, value) ?? 'Raw '+value;
}

// Keep the source frame intact. Its active column centres, summary right edges
// and outlined text baselines also locate the editable readouts.
export function mountDrumReadouts(scene, screen, getSpec) {
  const source = scene.querySelector('svg');
  const outputs = document.createElement('div');
  outputs.className = 'drum-frame-values';
  outputs.setAttribute('aria-hidden', 'true');
  const view = source.viewBox.baseVal;
  for (const button of scene.querySelectorAll('.source-hit')) {
    const index = Number(button.dataset.paramOccurrence);
    const control = screen.controls[index];
    const entry = source.querySelector(`[data-source-control="${control.identity}"]`);
    const glyph = entry.querySelector('[data-glyph-semantic]');
    // Read cloned transforms. consolidate() mutates the original transform list.
    const glyphMatrix = glyph.cloneNode(false).transform.baseVal.consolidate().matrix;
    const digit = entry.lastElementChild.firstElementChild;
    const digitMatrix = digit.cloneNode(false).transform.baseVal.consolidate().matrix;
    // Single-control banks also place their active value to the right of the glyph.
    const inline = digitMatrix.e >= glyphMatrix.e + 32 * glyphMatrix.a;
    const x = inline ? control.bounds[2] : glyphMatrix.e + 16 * glyphMatrix.a;
    const output = document.createElement('span');
    output.dataset.paramValue = button.dataset.param;
    output.className = inline ? 'inline-value' : 'stacked-value';
    output.style.left = (x - view.x) / view.width * 100 + '%';
    output.style.top = (digitMatrix.f - view.y) / view.height * 100 + '%';
    output.textContent = drumValueText(control, getSpec(button.dataset.param,index).value);
    outputs.append(output);
    const label = sourceControlLabel(control);
    if (control.identity === '1:0:11:1') {
      const firstLetter = entry.querySelector('[role="text"] > g');
      const baseline = firstLetter.cloneNode(false).transform.baseVal.consolidate().matrix;
      const caption = document.createElement('span');
      caption.className = 'drum-velocity-label';
      caption.style.left = (baseline.e - view.x) / view.width * 100 + '%';
      caption.style.top = (baseline.f - view.y) / view.height * 100 + '%';
      caption.textContent = label;
      outputs.append(caption);
    }
    button.dataset.drumLabel = label;
    button.setAttribute('aria-label', label + ', ' + output.textContent + ', local draft');
  }
  scene.append(outputs);
}

export function renderDrumStrip(screen, getSpec, glyphs = glyphsFor(screen)) {
  const units = screen.controls.map((control, index) => {
    const id = screen.path+'|'+control.identity;
    const spec = getSpec(id, String(index));
    const glyph = glyphs.get(control.identity);
    if (!glyph) throw Error('Unknown source drum control '+control.identity);
    const label = sourceControlLabel(control);
    const display = drumValueText(control, spec?.value ?? Number(control.context.raw));
    const role = control.markers['visual-role'] === 'active glyph/value control' ? 'active' : 'summary';
    const disabled = spec ? '' : ' disabled';
    const target = escape(id);
    return '<section data-drum-sound-unit data-drum-role="'+role+'">'+
      '<button type="button" class="drum-strip-control" data-source-control="'+escape(control.identity)+'" data-param="'+target+'" data-param-occurrence="'+index+'"'+disabled+'>'+
      '<span data-drum-label>'+escape(label)+'</span><span class="drum-strip-readout">'+glyph+
      '<output data-drum-value data-param-value="'+target+'">'+escape(display)+'</output></span></button>'+
      '<div class="drum-step-buttons"><button type="button" data-drum-decrement="'+target+'" aria-label="Decrease '+escape(label)+'"'+disabled+'>−</button>'+
      '<button type="button" data-drum-increment="'+target+'" aria-label="Increase '+escape(label)+'"'+disabled+'>+</button></div></section>';
  });
  return '<div role="group" data-drum-sound-strip aria-label="Drum sound controls" style="--drum-columns:'+units.length+'">'+units.join('')+'</div>';
}
