import{renderSvg}from'./glyph-render.mjs';
import {drumAccent} from './drum-accent.mjs';
// SPDX-License-Identifier: GPL-3.0-only
// DnBOX adapter for the actual MIT FunkyBeats DOM builder. The upstream methods,
// not a screenshot recreation, construct the tree. Typed captured DnBOX events
// remain authoritative; this viewport is local/offline, never a native bar schema.
import{createSequencerState,createFunkyBeatsUI}from'./vendor/funkybeats-core.mjs';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
class Element{
 constructor(tag){this.tag=tag;this.attrs={};this.style={};this.dataset={};this.children=[];this.textContent='';}
 set className(v){this.attrs.class=v;}get className(){return this.attrs.class??'';}
 get classList(){return{add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/),...names])].filter(Boolean).join(' ');},remove:(...names)=>{this.className=this.className.split(/\s+/).filter(n=>!names.includes(n)).join(' ');}};}
 addEventListener(){} // Typed app-level delegation owns the serialized tree.
 get firstChild(){return this.children[0]??null;}
 appendChild(n){this.children.push(n);return n;}
 removeChild(n){this.children.splice(this.children.indexOf(n),1);}
 setAttribute(k,v){this.attrs[k]=String(v);}
}
const css=k=>k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
function serialize(n){if(typeof n==='string')return esc(n);const attrs={...n.attrs,...Object.fromEntries(Object.entries(n.dataset).map(([k,v])=>['data-'+css(k),v]))};const style=Object.entries(n.style).map(([k,v])=>css(k)+':'+v).join(';');if(style)attrs.style=style;return'<'+n.tag+Object.entries(attrs).map(([k,v])=>' '+k+'="'+esc(v)+'"').join('')+'>'+esc(n.textContent)+n.children.map(serialize).join('')+'</'+n.tag+'>';}
export const DRUM_VOICES=Object.freeze({
 '909':Object.freeze([['BD',36],['SD',38],['LT',41],['MT',45],['HT',50],['RS',37],['CP',39],['CH',42],['OH',46],['CR',49],['RD',51]]),
 '808':Object.freeze([['BD',36],['SD',38],['LT',41],['MT',45],['HT',50],['RS',37],['CP',39],['CB',56],['CY',49],['OH',46],['CH',42]])
});
function appendAccentRow(grid, kit, steps, accents) {
 const row = grid.appendChild(new Element('div'));
 row.className = 'seq-row drum-accent-row';
 row.setAttribute('id','drum'+kit+'-accent');
 row.setAttribute('role', 'group');
 row.setAttribute('aria-label', kit + ' kit accent');
 const label = row.appendChild(new Element('span'));
 label.className = 'seq-channel-info';
 label.textContent = drumAccent.label;
 for (let start = 0; start < steps; start += 4) {
  const group = row.appendChild(new Element('div'));
  group.className = 'seq-step-group';
  for (let step = start; step < Math.min(start + 4, steps); step++) {
   const value = accents?.[step] ?? null;
   const button = group.appendChild(new Element('button'));
   button.className = 'seq-step drum-accent-step';
   button.setAttribute('type', 'button');
   button.dataset.drumAccentStep = step;
   button.dataset.accentTrack = 'drum' + kit;
   button.setAttribute('aria-pressed', value === null ? 'mixed' : String(value));
   const description = kit + ' Accent step ' + (step + 1) + ', ' + drumAccent.text(value);
   button.setAttribute('aria-label', description);
   button.setAttribute('title', description);
   button.textContent = value === null ? '—' : value ? '●' : '○';
  }
 }
}

export function renderFunkyBeatsDrums({kit='909',notes,endSample,steps=16,accents}){
 if(!DRUM_VOICES[kit]||!Array.isArray(notes)||!Number.isInteger(endSample)||endSample<=0||!Number.isInteger(steps)||steps<1||steps>64)throw Error('Invalid local drum viewport');
 const track=kit==='808'?'drum808':'drum909',color=kit==='808'?'#ff4841':'#ff9529',voices=DRUM_VOICES[kit],channels=voices.map(([name])=>({name,type:'drum',color}));
 const state=createSequencerState({channels,patternCount:1,defaultSteps:steps});
 const grid=new Element('div');grid.className='sequencer-grid';
 const document={createElement:tag=>new Element(tag),createTextNode:s=>String(s),querySelector:s=>s==='.sequencer-grid'?grid:null};
 const ui=createFunkyBeatsUI({document,channels,state});ui.buildSequencerGrid();
 for(let ch=0;ch<voices.length;ch++){
  grid.children[ch].setAttribute('id','drum'+kit+'-voice-'+(ch+1));
  const row=grid.children[ch],info=row.children[0];info.children=info.children.filter(n=>!n.className?.includes('seq-channel-btns'));info.setAttribute('aria-label',voices[ch][0]);
  for(let s=0;s<steps;s++){
   const start=Math.round(s*endSample/steps),event=notes.find(n=>n.track===track&&n.note===voices[ch][1]&&Math.abs(n.start-start)<2),step=ui.stepElements[ch][s];
   const modelStep=state.getStep(ch,s);if(event)Object.assign(modelStep,{on:true,velocity:event.velocity/127,note:event.note});
   Object.assign(step.dataset,{drumNote:voices[ch][1],drumStart:event?.start??start,drumTrack:track});
   step.setAttribute('aria-label',`${voices[ch][0]} step ${s+1} ${event?'velocity '+event.velocity:'empty'}, toggle local hit`);
   step.setAttribute('aria-pressed',String(!!event));
   if(event){step.className+=' hit';step.dataset.hit=event.id;step.children[0].style.opacity=String(.3+modelStep.velocity*.7);step.children[1].style.height=(modelStep.velocity*100)+'%';step.textContent=String(event.velocity);}
  }
 }
 appendAccentRow(grid, kit, steps, accents);
 const header='<div class="seq-row seq-numbers"><span>VOICE</span>'+Array.from({length:Math.ceil(steps/4)},(_,g)=>'<div class="seq-step-group">'+Array.from({length:Math.min(4,steps-g*4)},(_,i)=>'<span>'+String(g*4+i+1)+'</span>').join('')+'</div>').join('')+'</div>';
 return'<div class="drum-scroll funkybeats-sequencer" data-upstream="809e1e78" style="--track:'+color+'">'+header+serialize(grid)+'</div>';
}

// Actual upstream performance grid; local selection only, never queued playback.
export function renderFunkyBeatsLauncher({parts,targets,patternCount=32,selectedPart=null}){
 if(!Array.isArray(parts)||parts.length!==5||!Array.isArray(targets)||targets.length!==5||patternCount!==32||targets.some(v=>v!==null&&(!Number.isInteger(v)||v<0||v>=patternCount)))throw Error('Invalid local launch selection');
 if(selectedPart!==null&&(!Number.isInteger(selectedPart)||selectedPart<0||selectedPart>=parts.length))throw Error('Invalid selected part');
 const colors=['#ff9529','#ff4841','#82f05a','#46cdff','#d678ff'];
 const channels=parts.map((name,i)=>({name:String(name),type:i<2?'drum':'synth',color:colors[i]}));
 const container=new Element('div');
 const document={createElement:tag=>new Element(tag),createTextNode:s=>String(s),getElementById:id=>id==='perform-content'?container:null};
 const ui=createFunkyBeatsUI({document,channels,state:null,patternCount,patternColors:Array(patternCount).fill('var(--line)')});
 Object.assign(ui,{performMode:false,playing:false,performChannelPatterns:[...targets],performQueuedChanges:{},autoSave(){}});
 ui.buildPerformGrid();
 const grid=container.children.find(n=>n.className==='perform-grid');
 grid.children=grid.children.filter(n=>n.className!=='perform-header');
 for(let ch=0;ch<parts.length;ch++)for(let p=0;p<patternCount;p++){
  const cell=ui.performCells[ch][p];cell.dataset.launchPart=ch;cell.textContent=String(p+1).padStart(2,'0');cell.setAttribute('type','button');
  cell.setAttribute('aria-pressed',String(targets[ch]===p));cell.setAttribute('aria-label',parts[ch]+' P'+(p+1)+', not loaded');
 }
 if(selectedPart!==null){const label=grid.children.filter(n=>n.className==='perform-row-label')[selectedPart];grid.children=[label,...ui.performCells[selectedPart]];}
 return '<div class="launch-scroll funkybeats-launcher" data-upstream="809e1e78">'+serialize(grid)+'</div>';
}
// Native source domains are supplied explicitly; no upstream percent defaults.
export function renderTypedFunkyBeatsParameter({id,label,value,min,max,step=1,display,enabled=true,engine='chicago',occurrence}){
 if(typeof id!=='string'||typeof label!=='string'||typeof display!=='string'||![value,min,max,step].every(Number.isFinite)||min>max||step<=0||value<min||value>max)throw Error('Typed source parameter required');
 const document={createElement:tag=>new Element(tag),createTextNode:s=>String(s)};
 const ui=createFunkyBeatsUI({document,channels:[],state:null});
 const group=ui.createParamSlider(label,id,value,min,max,step,()=>display);
 group.className+=' funkybeats-typed-param';
 const labelSpan=new Element('span');labelSpan.textContent=group.children[0].textContent;group.children[0].textContent='';group.children[0].appendChild(labelSpan);
 const input=group.children[1];input.dataset.nativeParam=id;if(occurrence!==undefined)input.dataset.paramOccurrence=occurrence;input.setAttribute('aria-label',label);input.setAttribute('aria-valuetext',display);
 if(!enabled)input.setAttribute('disabled','disabled');
 group.children[2].dataset.paramValue=id;
 const glyphValue=(value-min)/(max-min||1);
 const glyph='<span class="glyph" data-glyph-fn="'+esc(label)+'" data-glyph-engine="'+esc(engine)+'" data-glyph-domain="normalized" data-glyph-value="'+glyphValue+'">'+renderSvg(label,glyphValue,engine,{live:false,valueDomain:'normalized'})+'</span>';
 return '<div class="funkybeats-typed-unit encoder">'+glyph+serialize(group)+'</div>';
}

// The upstream mixer constructs channel/fader nodes. Only source-admitted
// volume strips survive projection: fake meters, EQ, sends and buses do not.
export function renderTypedFunkyBeatsMixer({channels}){
 if(!Array.isArray(channels)||channels.length!==5||channels.some(c=>!c||typeof c.id!=='string'||typeof c.label!=='string'||typeof c.display!=='string'||![c.value,c.min,c.max,c.step].every(Number.isFinite)||c.min>c.max||c.step<=0||c.value<c.min||c.value>c.max))throw Error('Five typed source mixer channels required');
 if(channels.some((c,i)=>c.id.split('|').length!==2||c.id.split('|')[1]!=='1:5:'+i+':0'||c.id.split('|')[0]!==channels[0].id.split('|')[0]||c.min!==0||c.max!==127||c.step!==1||!Number.isInteger(c.value)))throw Error('Mixer source identity or domain mismatch');
 const container=new Element('div');const document={createElement:tag=>new Element(tag),createTextNode:s=>String(s),getElementById:id=>id==='mixer-channels'?container:null};
 const colors=['#ff9529','#ff4841','#82f05a','#46cdff','#d678ff'];
 const ui=createFunkyBeatsUI({document,channels:channels.map((c,i)=>({name:c.label,color:colors[i],type:i<2?'drum':'synth'})),state:null});ui.buildMixer();
 const projected=container.children.slice(0,5).map((strip,i)=>{
  const c=channels[i],name=strip.children.find(n=>n.className==='mixer-channel-name'),box=strip.children.find(n=>n.className==='mixer-fader-container'),readout=strip.children.find(n=>n.className==='mixer-db'),input=box.children[0];
  name.style.color=colors[i];name.tag='button';name.setAttribute('type','button');name.dataset.mixPart=['drum909','drum808','chicago','miami','breaks'][i];name.setAttribute('aria-label','Open '+c.label+' sound controls');const hint=new Element('small');hint.textContent='Sound';name.appendChild(hint);strip.children=[name,box,readout];strip.className+=' funkybeats-typed-unit';
  for(const[k,v]of Object.entries({min:c.min,max:c.max,step:c.step,value:c.value}))input.setAttribute(k,v);
  input.dataset.param=c.id;input.dataset.nativeParam=c.id;input.dataset.paramOccurrence=c.occurrence??i;input.setAttribute('aria-label',c.label);input.setAttribute('aria-valuetext',c.display);
  readout.textContent=c.display;readout.dataset.paramValue=c.id;
  return serialize(strip);
 });
 return '<div class="funkybeats-mixer" data-upstream="809e1e78">'+projected.join('')+'</div>';
}
