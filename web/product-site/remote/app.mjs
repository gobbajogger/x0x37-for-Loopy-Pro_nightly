import {patternLockSpecs,lockField,putPatternLock,nudgeLock} from './pattern-locks.mjs';
import {stepField,viewStepFields,stepValueText,stepCanEdit,changeStepRow,replaceStepRows} from './local-step-rows.mjs';
import {StepValueGesture} from './step-value-gesture.mjs';
import {chicagoControlBindings} from './runtime-sound-map.mjs';
import {createRuntimeSoundState} from './runtime-sound-state.mjs';
import {mixControlBindings} from './runtime-mix-map.mjs';
import {createRuntimeMixState} from './runtime-mix-state.mjs';
import {createLocalInstrument} from './local-instrument.mjs';
import {mountEnvelopeObservations} from './envelope-view.mjs';
import {BreakChanceLane,breakChanceText} from './break-chance.mjs';
import {breakGeneratorPanel,breakSoundChance,refreshBreakFields,showBreakGlyph,breakGeneratorChanges,breakPatternName,knownBreakPattern,legacyBreakChanceId,putBreakSetting} from './break-generator.mjs';
import {emptyBreakSequence,mountBreakSequence,installBreakSequence} from './break-sequence.mjs';
import{mixAliases,mixRead,mixChange,normalizeMixEdits}from'./mix-aliases.mjs';
import{createMasterDraft}from'./master-draft.mjs';
import{renderMixWorkspace}from'./mix-workspace.mjs';
import{stepGroups,StepLaneGesture,renderStepSliders}from'./step-lane.mjs';
import{DRUM_VOICES,renderFunkyBeatsDrums,renderFunkyBeatsLauncher,renderTypedFunkyBeatsParameter,renderTypedFunkyBeatsMixer}from'./funkybeats-view.mjs';
import{mixerDisplay,fxDisplay}from'./mixer-format.mjs';
import{waveDisplay,miamiWave,miamiWaveParameter}from'./wave-display.mjs';
import{verticalGrid}from'./grid.mjs';
import{WorkspaceDraftFile,hasDraftChanges,installWorkspaceDraft}from'./draft-file.mjs';
import{bindDraftFiles}from'./draft-ui.mjs';
import {SuperJ6Banks,readSuperJ6Original} from './superj6-banks.mjs';
import {SOUND_BANKS,sourceOnlyBank,superJ6Specs,superJ6Spec,acceptsSuperJ6,superJ6Text,renderSuperJ6,paintSuperJ6} from './superj6.mjs';
import {GUIDE as midiExchangeGuide} from '../projects/exchange/adapter.mjs';
import {renderSynthOneInit} from './synth-one-init.mjs';
import {openSynthOneFiles} from './synth-one-files.mjs';
import{SourceSounds,sourcePercent}from'./sound.mjs';
import{WorkspaceTimeline}from'./timeline.mjs';
import{sourceFrame,sourceControlLabel}from'./frame.mjs';
import {kitAccentAliases,sharedKitAccent} from './drum-accent.mjs';
import{renderDrumStrip,drumValueText,mountDrumReadouts,paintDrumGlyph,paintKickDepth}from'./drum-strip.mjs';
import {mountProjectPreset} from './project-preset.mjs';
import{renderSong}from'./song-view.mjs';
import{MotionDraft}from'./motion.mjs';
import{SequenceDraft,chanceDomain,chanceFromDrag,Arrangement,MAX_SONG_ROWS}from'./sequence.mjs';
import{ParameterGesture}from'./parameter.mjs';
import{PARTS,DESTINATIONS,LaunchSelection,bindRollPointers}from'./workspace.mjs';
import{groupsFromCatalog}from'./model.mjs';import{RollDraft,RollGesture,pointAt}from'./roll.mjs';
import{STEP_LANES,envelopeCurve,formatPan,formatParameterValue,glyphFor,isPanLabel,panCell}from'./glyphs.mjs';
import{mountLiveGlyphs,setGlyphValue}from'./glyph-live.mjs';
import{mountFirmwareLink}from'./firmware-link.mjs';
import{LANE_KINDS,LANE_WORDS,chanceFromLane,panFromLane,velocityFromLane,pitchOffsetFromLane,laneFraction,laneText,laneP,RAIL_OFFSET,CHANCE_SPLIT}from'./lane.mjs';
const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sourceFiles=['trace','catalog','components','source-sounds'],sourceIdentity={};
const[trace,catalog,components,soundSource]=await Promise.all(sourceFiles.map(async p=>{const r=await fetch(p+'.json');if(!r.ok)throw Error('Example unavailable');const text=await r.text();sourceIdentity[p]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),v=>v.toString(16).padStart(2,'0')).join('');return JSON.parse(text);}));
const superJ6Banks=new SuperJ6Banks();
const sourceSounds=new SourceSounds(soundSource,catalog),soundBanks=['CHICAGO','MIAMI'];
const importedJunoOwners=new Set();
let nativeEnvelopeBinding=null,localInstrumentPhase='stopped',nativeMixMode=false,nativeProviderFactory=null,nativeMixGeneration=0,nativeSoundMode=false,nativeSoundFactory=null,nativeSoundGeneration=0,nativeSoundRetry=null;
export function attachEnvelopeObserver(port,pin){
 const old=nativeEnvelopeBinding;
 const targets=()=>{
  if(!['sound','drums'].includes(view))return [];
  const part=$('part').value;
  if(part==='drum909')return [['909',drumVoice,'amp']];
  const slot=part==='chicago'?0:part==='miami'?1:-1;if(slot<0)return [];
  let bank=soundBanks[slot];
  if(view==='sound'&&nativeSoundMode){
   const scalar=nativeSounds[slot].snapshot();
   // The separately pinned envelope port validates the observed owner, role and freshness.
   if(localInstrumentPhase==='running'&&scalar.phase==='unavailable')return [['JUNO',slot,'amp-filter']];
   bank=scalar.engine;
  }
  return bank==='JUNO'?[['JUNO',slot,'amp-filter']]:bank==='CHICAGO'?[['CHICAGO',slot,'amp'],['CHICAGO',slot,'filter']]:[];
 };
 const next=mountEnvelopeObservations(port,pin,{host:()=>$('native-envelopes'),targets});
 old?.close();nativeEnvelopeBinding=next;next.render();
 return next;
}
const timeline=new WorkspaceTimeline();const motion=new MotionDraft();let drumVoice=0,drumEdit=false;let motionSelected=0;const arrangement=new Arrangement();let songSelected=null,songNextSelection;const launch=new LaunchSelection();const model=new SequenceDraft({trace}),groups=groupsFromCatalog(catalog);let multi=false;let focusSelection=false;let selected=null,mode='auto',view='roll',disposed=false,width=1400,row=44,fitted=false;const grid=$('roll-grid'),scroll=$('roll-scroll'),names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const stepLanes = {},patternLocks=[];
const selectedLocks=new Map();
function restoreLockChoice(context){
 selectedLocks.clear();
 if(context.lockTarget!==undefined)selectedLocks.set(context.part,context.lockTarget);
}
function currentLock(){
 const part=$('part').value;
 return lockField(part,soundBanks,view,selectedLocks.get(part)) ?? lockField(part,soundBanks,view);
}
function syncLockPicker(kind) {
 const picker=$('lock-target'),host=$('lock-choice');
 if(!picker||!host)return;
 const field=currentLock();
 host.hidden=field?.bank!=='CHICAGO' || (kind!=='patternLock' && view!=='locks');
 if(host.hidden)return;
 if(picker.dataset.owner!==field.owner){
  picker.innerHTML='<option value="" disabled>Choose target</option>'+patternLockSpecs.filter(f=>f.part===field.part && f.bank===field.bank)
   .map(f=>'<option value="'+f.id+'">'+esc(f.label.replace(/ lock$/,''))+'</option>').join('');
  picker.dataset.owner=field.owner;
 }
 picker.value=kind==='patternLock'?String(field.id):'';
}
if($('lock-target'))$('lock-target').onchange=()=>{
 const part=$('part').value,field=lockField(part,soundBanks,view,Number($('lock-target').value));
 if(!field)return;
 cancelParameters();selectedLocks.set(part,field.id);activeLaneStep=null;
 $('lane-kind').value='patternLock';paintNotes();
};
function laneSpec(kind=laneKind()){return kind==='patternLock'?currentLock():stepField(kind);}
function lockPattern(){return launch.targets[currentLock()?.part];}
function editPatternLock(points){
 const field=currentLock(),pattern=lockPattern();
 if(!field || !Number.isInteger(pattern))return;
 const before=structuredClone(patternLocks);
 if(before.length>=160 && !before.some(r=>r.catalogId===field.id && r.pattern===pattern) && points.some(v=>v!==null)){
  status('All 160 pattern lock lanes are in use.');return;
 }
 const next=putPatternLock(before,field.id,pattern,points);
 if(JSON.stringify(before)===JSON.stringify(next))return;
 const apply=rows=>patternLocks.splice(0,patternLocks.length,...rows);
 apply(next);timeline.record({label:field.label,undo:()=>apply(before),redo:()=>apply(next)});
}
function lockBase(){
 const field=currentLock(),slot=field.part===4?-1:field.part-2;
 const scalar=sourceSounds.controls(field.bank,slot).find(c=>c.enabled&&c.kind===1&&c.parameter===field.parameter);
 return parameterDraft.get(scalar.id)??scalar.raw;
}
function editStepRow(part,kind,points) {
 const before=structuredClone(stepLanes), next=changeStepRow(before,part,kind,points);
 if(JSON.stringify(before)===JSON.stringify(next))return;
 const apply=value=>replaceStepRows(stepLanes,value);
 apply(next);timeline.record({label:stepField(kind).label,undo:()=>apply(before),redo:()=>apply(next)});
}
function stepPart(){return view==='drums'?($('part').value==='drum808'?'drum808':'drum909'):$('part').value;}
function redrawDrumSteps(focus) {
 const selectors=['#other-view','.drum-layout','.funkybeats-sequencer','.sequencer-grid'];
 const scrolls=selectors.map(selector=>{const el=document.querySelector(selector);return el?[el.scrollLeft,el.scrollTop]:null;});
 other();
 if(focus)$('other-view').querySelector(focus)?.focus({preventScroll:true});
 selectors.forEach((selector,i)=>{const el=document.querySelector(selector);if(scrolls[i]&&el){el.scrollLeft=scrolls[i][0];el.scrollTop=scrolls[i][1];}});
}
const stepValueLane = new StepValueGesture({
 read:()=>laneKind()==='patternLock'
  ?patternLocks.find(r=>r.catalogId===currentLock()?.id && r.pattern===lockPattern())?.values
  :stepLanes[stepPart()]?.[laneKind()],
 commit:points=>laneKind()==='patternLock'?editPatternLock(points):editStepRow(stepPart(),laneKind(),points),
 paint:()=>{if(view==='drums')redrawDrumSteps();else paintNotes();},
 enabled:step=>laneKind()==='patternLock'?Number.isInteger(lockPattern()):stepCanEdit(stepLanes,stepPart(),laneKind(),step),
 fromPosition:p=>{
  const domain=laneSpec().domain;
  return domain[Math.round(Math.max(0,Math.min(1,p))*(domain.length-1))];
 },
 nudged:(value,direction)=>{
  if(direction===0)return null;
  if(laneKind()==='patternLock')return nudgeLock(currentLock(),value??lockBase(),direction);
  const domain=laneSpec().domain;
  return domain[Math.max(0,Math.min(domain.length-1,domain.indexOf(value)+direction))];
 }
});
const breakSequence = emptyBreakSequence();
function changeBreakSequence(next, label='BREAK sequence') {
 const before=structuredClone(breakSequence);
 if (JSON.stringify(before)===JSON.stringify(next)) return;
 const apply=value=>{installBreakSequence(breakSequence,value);breakEditor?.paint();paintBreakGenerator();};
 apply(next);timeline.record({label,undo:()=>apply(before),redo:()=>apply(next)});status();
}
const breakEditor = $('break-sequence') && mountBreakSequence($('break-sequence'),breakSequence,changeBreakSequence);
const breakChanceLane = new BreakChanceLane({
 read:()=>breakSequence.chance,
 commit:values=>{
  const next=structuredClone(breakSequence);
  if(values.some(value=>value!==null))next.chance=values;else delete next.chance;
  changeBreakSequence(next,'BREAK Chance');
 },
 paint:()=>paintNotes()
});
function paintBreakGenerator() {
 const host=$('break-generator'),pattern=launch.targets[4];
 if(!host || host.hidden)return;
 const field=host.querySelector('[data-break-pattern]');
 if(field && Number(field.dataset.breakPattern)===pattern)refreshBreakFields(host,breakSequence.generators,pattern);
 else host.innerHTML=breakGeneratorPanel(breakSequence.generators,pattern);
}
function breakSettingHost(input) {
 if(input.dataset?.breakSetting===undefined || $('part').value!=='breaks')return null;
 const id=Number(input.dataset.breakSetting),pattern=Number(input.dataset.breakPattern);
 if(!knownBreakPattern(pattern) || launch.targets[4]!==pattern)return null;
 const host=id===9 && view==='sound' && !nativeSoundMode ? $('other-view') :
   id!==9 && view==='roll' && breakView==='generator' ? $('break-generator') : null;
 return host?.contains(input) ? host : null;
}
function previewBreakSetting(input,host) {
 if(!input.validity.valid || input.value==='')return;
 const id=Number(input.dataset.breakSetting),value=Number(input.value);
 const phrase=Number(host.querySelector('[data-break-setting="8"]')?.value);
 showBreakGlyph(host,id,value,phrase);
 if(id===8)showBreakGlyph(host,3,Number(host.querySelector('[data-break-setting="3"]').value),value);
}
function changeBreakSetting(event) {
 const input=event.target,host=breakSettingHost(input);
 if(!host)return;
 const id=Number(input.dataset.breakSetting),pattern=Number(input.dataset.breakPattern);
 const value=input.value===''?NaN:Number(input.value);
 if(!input.validity.valid || !Number.isInteger(value)){
  input.value=input.defaultValue;previewBreakSetting(input,host);return;
 }
 const next=structuredClone(breakSequence);
 const rows=putBreakSetting(next.generators,pattern,id,value);
 if(rows.length)next.generators=rows;else delete next.generators;
 changeBreakSequence(next,'BREAK '+breakPatternName(pattern)+' '+input.labels[0].firstChild.textContent);
 if(id===9){input.defaultValue=input.value;previewBreakSetting(input,host);}
}
for(const host of [$('break-generator'),$('other-view')]){
 host?.addEventListener('input',event=>{
  if(breakSettingHost(event.target))previewBreakSetting(event.target,host);
 });
 host?.addEventListener('change',changeBreakSetting);
 host?.addEventListener('keydown',event=>{
  const input=event.target;
  if(event.key==='Escape' && input.type==='number' && breakSettingHost(input)){
   event.preventDefault();input.value=input.defaultValue;previewBreakSetting(input,host);
  }
 });
}
let breakView = 'slices', activeLaneStep = null, focusedSliceStep = 0;
$('break-sequence')?.addEventListener('focusin',event=>{
 if(event.target.dataset.breakStep!==undefined)focusedSliceStep=Number(event.target.dataset.breakStep);
});
for(const button of document.querySelectorAll('[data-break-view]'))button.onclick = async () => {
 const sliceStep=activeLaneStep??(breakView==='slices'?focusedSliceStep:0);
 cancelStepLane();activeLaneStep=null;
 if(button.dataset.breakView==='generator' && !knownBreakPattern(launch.targets[4]))return;
 if(button.dataset.breakView==='slices'){
  const sliceField=()=>$('break-sequence').querySelector('[data-break-step="'+sliceStep+'"]');
  if(breakView==='slices' && sliceField()){sliceField().focus();return;}
  breakView='slices';
  button.focus();
  await syncBreakView();
  if(document.activeElement===button && !$('break-sequence').hidden)sliceField()?.focus();
  return;
 }
 breakView = button.dataset.breakView;
 syncBreakView();
 if (breakView === 'notes') {paintNotes(); fitPattern(); paintNotes();}
};
if($('break-locks'))$('break-locks').onclick=()=>{
 if(view!=='roll' || $('part').value!=='breaks' || !knownBreakPattern(launch.targets[4]))return;
 cancelParameters();activeLaneStep=null;
 breakView='notes';
 $('lane-kind').value='patternLock';
 syncBreakView();fitPattern();paintNotes();
 $('velocity').querySelector('[data-lane-step]:enabled')?.focus();
};
if($('break-review'))$('break-review').onclick=openReview;
function syncBreakView() {
 const editingBreak = view === 'roll' && $('part').value === 'breaks';
 const generatorButton=document.querySelector('[data-break-view="generator"]');
 const ownsPattern=knownBreakPattern(launch.targets[4]);
 for(const button of [generatorButton,$('break-locks')]){
  if(!button)continue;
  button.disabled=!ownsPattern;
  button.title=ownsPattern?'':'Select a BREAK pattern in Patterns & Song';
 }
 if(breakView==='generator' && !ownsPattern)breakView='slices';
 const generator=editingBreak && breakView==='generator';
 if($('break-generator')){$('break-generator').hidden=!generator;if(generator)paintBreakGenerator();}
 const active = editingBreak && breakView === 'slices';
 if ($('break-views')) $('break-views').hidden = !editingBreak;
 for (const button of document.querySelectorAll('[data-break-view]')) button.setAttribute('aria-pressed',String(button.dataset.breakView === breakView));
 $('roll-view').hidden = !['roll','locks'].includes(view) || active || generator;
 if (breakEditor) {
  $('break-sequence').hidden = !active;
  if (active) return breakEditor.show();
  breakEditor.stop();
 }
}
const name=n=>names[n%12]+(Math.floor(n/12)-1),notes=()=>model.notes.filter(n=>n.track===$('part').value),current=()=>notes().find(n=>n.id===selected),point=e=>{const r=grid.getBoundingClientRect();return pointAt(e.clientX-r.left,e.clientY-r.top,{width,row,endSample:model.endSample});};
function connectionLabel() {const linked=$('conn-state')?.dataset?.session === 'ready';return localInstrumentPhase==='running'?(linked?'Simulator connected · Emulator running':'Emulator running'):(linked?'Simulator connected':'Not connected');}
function status(message){$('status').className=message?'status-message':'sr-only';const native=nativeEditing();const ns=native?nativeEditState():null;$('status').textContent=message??(native?(ns?.phase==='ready'?(view==='mix'?'Mix':'Sound')+' · Emulator':ns?.phase==='busy'?'Updating emulator':'Emulator controls unavailable'):null)??`${changeLines().length} changes · Draft · ${connectionLabel()}`;for(const id of['undo','parameter-undo','motion-undo','song-undo'])if($(id))$(id).disabled=native?!ns?.canUndo:!timeline.canUndo;for(const id of['redo','motion-redo','song-redo'])if($(id))$(id).disabled=native||!timeline.canRedo;}
function select(id,{preserve=false,replace=false}={}){activeLaneStep=null;selected=id;focusSelection=true;if(preserve)return;if(multi&&!replace){const ids=new Set(model.selection);if(ids.has(id))ids.delete(id);else ids.add(id);model.selectIds([...ids]);}else model.selectIds([id]);}
function availableLanes(){return [...LANE_KINDS,...viewStepFields($('part').value,view),...(currentLock()?['patternLock']:[])];}
function laneKind(){return availableLanes().includes($('lane-kind').value)?$('lane-kind').value:'velocity';}
function cycleLane(){const choices=availableLanes();return choices[(choices.indexOf(laneKind())+1)%choices.length];}
function laneWord(kind){return laneSpec(kind)?.label.toUpperCase()??LANE_WORDS[kind];}
function laneSpan(){const h=$('velocity')?.clientHeight;return h>=24?h:72;}
function breakChanceMode(){return view==='roll' && breakView==='notes' && $('part').value==='breaks' && laneKind()==='chance';}
function selectedLaneText(kind,n){
 if(kind==='patternLock'){
  const pattern=lockPattern();if(!Number.isInteger(pattern))return 'Pick in Patterns';
  const raw=stepValueLane.values[activeLaneStep];
  return 'P'+String(pattern+1).padStart(2,'0')+(activeLaneStep===null?'':' · '+(raw==null?'Unset':currentLock().text(raw)));
 }
 if(breakChanceMode()||stepField(kind)){
  const step=activeLaneStep??(n?stepGroups([n],trace.endSample).find(group=>group.notes.length).step:null);
  return step===null?'':stepField(kind)?stepValueText(kind,stepValueLane.values[step]):breakChanceText(breakChanceLane.values[step]);
 }
 return n?laneText(kind,n,laneBase(n)):'';
}
function laneBar(n){const span=laneSpan(),kind=laneKind();if(kind==='chance')return n.chance?.endsWith('%')?Math.max(8,Number(n.chance.slice(0,-1))/100*span):Math.min(24,span);if(kind==='pitch')return Math.max(8,n.note/127*span);return Math.max(8,n.velocity/127*span);}
function laneSpoken(n){const kind=laneKind();if(kind==='pan')return `${name(n.note)}, pan ${laneText('pan',n)}, local draft`;if(kind==='chance')return `${name(n.note)}, ${n.chance?(n.chance.endsWith('%')?'chance ':'condition ')+n.chance:'chance not set'}, local draft`;if(kind==='pitch')return `${name(n.note)}, pitch ${n.note}, local draft`;return `${name(n.note)}, velocity ${n.velocity}, local draft`;}
function laneFigure(n){if(n.id!==selected)return '';const kind=laneKind();if(kind==='chance')return breakChanceMode()?selectedLaneText(kind,n):n.chance??'—';if(kind==='pitch')return name(n.note);return n.velocity;}
function syncLaneLabel(focusedValue){const kind=laneKind(),btn=$('lane-param');if(!btn)return;const lock=kind==='patternLock',word=btn.querySelector?.('.lane-word');
 btn.dataset.patternLock=String(lock);syncLockPicker(kind);
 const label=lock?currentLock().label.replace(' lock','').toUpperCase():laneWord(kind);
 if(word)word.textContent=label;else btn.textContent=label;
 const value=focusedValue??selectedLaneText(kind,current()),out=btn.querySelector?.('output');
 if(out){
  out.textContent=lock?(Number.isInteger(lockPattern())?value:'Pick pattern'):value;
  if(lock && Number.isInteger(lockPattern()) && activeLaneStep!==null){
   const [pattern,display]=out.textContent.split(' · ');
   const prefix=document.createElement('span'),readout=document.createElement('span');
   prefix.className='lock-pattern';prefix.textContent=pattern+' · ';
   readout.className='lock-display';readout.textContent=display;
   readout.dataset.long=String(display.length>7);
   out.replaceChildren(prefix,readout);
  }
 }
 const dots=btn.querySelector?.('.lane-dots');if(dots)dots.innerHTML=availableLanes().map(k=>`<b class="${k===kind?'on':''}"></b>`).join('');btn.setAttribute('aria-label',laneWord(kind)+(value?' '+value:''));if($('velocity')?.setAttribute)$('velocity').setAttribute('aria-label',laneWord(kind));}
const laneBases=new Map();function laneBase(n){return laneBases.get(n.id)??n.note;}
function minRow(){const w=globalThis.innerWidth??1024,h=globalThis.innerHeight??640;if(h<=500&&w>h)return 16;if(w<=600&&h>w)return 28;return 20;}
function applyRow(){
 const height = scroll?.clientHeight || 0;
 const pitches = notes().map(n => n.note);
 const range = pitches.length ? Math.max(...pitches) - Math.min(...pitches) + 2 : 12;
 const minimum = minRow();
 const visibleRows = minimum === 16 ? Math.max(16, range) : range;
 const next = height >= 80 ? Math.max(minimum, Math.min(40, Math.floor(height / visibleRows))) : 24;
 if (next !== row && scroll) {
  const offset = row ? scroll.scrollTop / row : 0;
  row = next;
  scroll.scrollTop = offset * row;
 } else row = next;
 document.documentElement?.style.setProperty('--row',row+'px');
}
function framePitchOffset(top){
 // Align a programmatic fit to pitch boundaries while free panning stays continuous.
 const fullLandscapeRoll = minRow() === 16 && scroll.clientHeight >= 16 * row;
 scroll.scrollTop = Math.max(0, fullLandscapeRoll ? Math.round(top / row) * row : top);
}
function fitPattern(){const ns=notes();if((scroll?.clientHeight||0)<80)return;if(!ns.length){
 // The Slices and Generator panels hide the roll. Recompute its time axis
 // against the visible pane when opening an empty pattern at any zoom.
 width=Math.round(rollBasis()*Number($('zoom').value||1));
 framePitchOffset(scroll.scrollTop);return;
}applyRow();const lo=Math.min(...ns.map(n=>n.note)),hi=Math.max(...ns.map(n=>n.note));grid.style.height=(128*row)+'px';const top=(127-hi)*row,bottom=(127-lo+1)*row,view=scroll.clientHeight,band=bottom-top;framePitchOffset(band<=view?top-(view-band)/2:top-row);if(Number($('zoom').value)<1){width=Math.round(rollBasis()*Number($('zoom').value));return;}const start=Math.min(...ns.map(n=>n.start)),end=Math.max(...ns.map(n=>n.end)),basis=rollBasis(),frac=Math.max(.2,(end-start)/trace.endSample);const zoom=Math.min(4,Math.max(1,Math.round((0.92/frac)*4)/4));if($('zoom')){$('zoom').value=String(zoom);width=Math.round(basis*zoom);if($('zoom-step'))$('zoom-step').textContent='Zoom '+Math.round(zoom*100)+'%';}}
function onsetX(n){return n.start/trace.endSample*width;}
function laneHtml(ns,span=width){return `<div class="lane-track" style="width:${typeof span==='number'?span+'px':span}">${renderStepSliders(stepGroups(ns,trace.endSample),{kind:laneKind(),base:laneBase,selected,breakChance:breakChanceMode()?breakChanceLane.values:null,activeStep:activeLaneStep,stepValue:laneSpec()?{spec:laneSpec(),values:stepValueLane.values,enabled:stepValueLane.enabled}:null})}</div>`;}
function drumLaneNotes(){const kit=$('part').value==='drum808'?'808':'909';return model.notes.filter(n=>n.track==='drum'+kit&&n.note===DRUM_VOICES[kit][drumVoice][1]);}
function drumsWithLane(kit){
 const grid=renderFunkyBeatsDrums({kit,notes:model.notes,endSample:trace.endSample,accents:stepLanes['drum'+kit]?.drumAccent}).replace(/<\/div>$/,drumLaneHtml()+'</div>');
 const navigation='<nav class="drum-grid-navigation" aria-label="'+kit+' step navigation">'+
  '<button type="button" data-drum-navigate aria-controls="drum'+kit+'-voice-1">Voices 1–6</button>'+
  '<button type="button" data-drum-navigate aria-controls="drum'+kit+'-voice-7">Voices 7–11</button>'+
  '<button type="button" data-drum-navigate aria-controls="drum'+kit+'-accent">Accent lane</button>'+
  '<button type="button" data-drum-navigate aria-controls="review-dialog" aria-haspopup="dialog">Review draft</button></nav>';
 return navigation+grid;
}
function navigateDrumGrid(button){
 const id=button.getAttribute('aria-controls');
 if(id==='review-dialog'){
  $('review-dialog').addEventListener('close',()=>{
   if(view==='drums')document.querySelector('.drum-grid-navigation [aria-controls="review-dialog"]')?.focus();
  },{once:true});
  $('review').click();
  return;
 }
 const row=$(id),grid=row?.closest('.sequencer-grid'),target=row?.querySelector('button');
 if(!grid||!target)return;
 grid.scrollTop+=row.getBoundingClientRect().top-grid.getBoundingClientRect().top;
 grid.closest('.drum-scroll').scrollLeft=0;
 target.focus({preventScroll:true});
}
function drumLaneHtml(){return `<div class="lane drum-step-lane"><button data-lane-cycle aria-label="${laneWord(laneKind())}">${laneWord(laneKind())}</button><div id="drum-lane">${laneHtml(drumLaneNotes(),'100%')}</div></div>`;}
// The Remote groups its 16 steps into four beats. The fixture carries tempo, with no meter event.
const captureFitsBar=trace.tempos?.length===1 && trace.tempos[0].sample===0 &&
 (!trace.timeSignatures?.length || (trace.timeSignatures.length===1 && trace.timeSignatures[0].sample===0 &&
 trace.timeSignatures[0].numerator===4 && trace.timeSignatures[0].denominator===4)) &&
 trace.endSample===4*trace.sampleRate*trace.tempos[0].microsecondsPerQuarter/1e6;
function paintRuler(){const r=$('beat-ruler');if(!r)return;
 const scale=Number($('zoom').value),bars=captureFitsBar&&scale<1?Math.round(1/scale):1;
 scroll.dataset.visibleBars=String(bars);
 scroll.setAttribute('aria-label',bars===1?'Piano roll':`Piano roll, ${bars} four-beat bars. Only bar 1 is captured.`);
 if(bars>1){
  r.innerHTML=`<div class="ruler-track" style="width:${width*bars}px">${Array.from({length:bars},(_,i)=>`<span style="left:${i*width}px">Bar ${i+1}</span>`).join('')}</div>`;
  return;
 }
 const steps=16;r.innerHTML=`<div class="ruler-track" style="width:${width}px;transform:translateX(${-(scroll?.scrollLeft||0)}px)">${Array.from({length:steps/4},(_,i)=>`<span style="left:${i*4*width/steps}px">Beat ${i+1}</span>`).join('')}</div>`;}
function paintNotes(){if(disposed)return;if(!fitted){fitted=true;fitPattern();}applyRow();const focusId=document.activeElement?.closest?.("[data-note]")?.dataset.note,laneFocus=document.activeElement?.closest?.("[data-select]")?.dataset.select,breakFocus=(breakChanceMode()||laneSpec())?document.activeElement?.closest?.("[data-lane-step]")?.dataset.laneStep:undefined;const ns=notes();if(!ns.some(n=>n.id===selected))selected=ns[0]?.id??null;grid.style.width=width+'px';grid.style.height=(128*row)+'px';grid.style.setProperty("--step",`${width/16}px`);grid.style.setProperty("--vertical-grid",verticalGrid(width));paintRuler();const noteH=Math.max(18,row-8);const pitchNames=Array.from({length:128},(_,n)=>`<span class="pitch" style="top:${(127-n)*row}px;height:${row}px;line-height:${row}px">${name(n)}</span>`).join('');const rail=$('pitch-rail');if(rail){rail.innerHTML=`<div class="pitch-names" style="height:${128*row}px">${pitchNames}</div>`;rail.scrollTop=scroll.scrollTop;}const black=Array.from({length:128},(_,k)=>[1,3,6,8,10].includes(k%12)?`<i class="black-key" style="top:${(127-k)*row}px;height:${row-1}px"></i>`:'').join('');grid.innerHTML='<i class="roll-playhead" aria-label="Playhead at start"></i>'+(rail?'':pitchNames)+black+ns.map(n=>`<button class="note ${n.pulse?'pulse':''}" data-note="${n.id}" aria-selected="${model.selection.has(n.id)||n.id===selected}" aria-label="${name(n.note)}, velocity ${n.velocity}, ${n.start} to ${n.end} samples" style="left:${n.start/trace.endSample*width}px;top:${(127-n.note)*row+2}px;height:${noteH}px;width:${Math.max(6,(n.end-n.start)/trace.endSample*width-2)}px" tabindex="${n.id===selected?0:-1}"><span class="note-name" style="max-width:${Math.max(28,width-n.start/trace.endSample*width)}px">${name(n.note)}</span><span class="resize-edge resize-start" data-edge="start" aria-hidden="true"></span><span class="resize-edge" data-edge="end" aria-hidden="true"></span></button>`).join('');$('velocity').innerHTML=laneHtml(ns);syncLaneLabel();$('velocity').scrollLeft=scroll.scrollLeft;inspect();status();if(focusSelection||focusId)grid.querySelector(`[data-note="${focusSelection?selected:focusId}"]`)?.focus({preventScroll:true});if(breakFocus!==undefined)$('velocity').querySelector(`[data-lane-step="${activeLaneStep??breakFocus}"]`)?.focus({preventScroll:true});else if(laneFocus)$('velocity').querySelector(`[data-select="${laneFocus}"]`)?.focus({preventScroll:true});focusSelection=false;paintSoundPanel();}
function inspect(){const n=current();const inspector=$('inspector');if(inspector)inspector.innerHTML=n?`<h2>${name(n.note)} <small>· local draft</small></h2>`+[['Pitch','note',n.note,0,127,1],['Velocity','velocity',n.velocity,1,127,1],['Start (samples)','start',n.start,0,trace.endSample,1],['End (samples)','end',n.end,n.start+(n.pulse?0:1),trace.endSample,1]].map(([label,field,v,min,max,step])=>`<label>${label}<input data-field="${field}" aria-label="${label}" type="number" min="${min}" max="${max}" step="${step}" value="${v}"></label>`).join('')+`<p>${n.pulse?'Pulse':'Move or change length.'}</p>${['chicago','miami','drum909','drum808'].includes(n.track)?`<label>Chance<select id="chance-value"><option value="">Not set</option>${chanceDomain.map(v=>`<option ${n.chance===v?'selected':''}>${v}</option>`).join('')}</select></label>`:''}`:'<h2>Select a note</h2><p>Draw a note.</p>';if($('context-controls')){const part=$('part').value,voice=part==='chicago'?'BASS A':part==='miami'?'BASS B':part==='drum909'?'BD':'BD',bank=part==='chicago'?soundBanks[0]:part==='miami'?soundBanks[1]:'';const g=groups.filter(g=>g.voice===voice&&(!bank||g.bank===bank));$('context-controls').innerHTML='<strong>'+esc($('part').selectedOptions[0].textContent)+'</strong>'+g.flatMap(g=>g.controls).slice(0,20).map(c=>'<span class="context-param">'+esc(c.label)+' <output>—</output></span>').join('');}}
const gesture=new RollGesture(model,{track:()=>$('part').value,select,changed:paintNotes});
const rollBinding=bindRollPointers(scroll,{admit:()=>{if(motion.gesture){motion.cancel();motionPaint();return false;}if(!laneCaptures.size)return true;cancelStepLane();return false;},gesture,mode:()=> 'auto',point,paint:paintNotes,
 barZoom:captureFitsBar,inCapture:e=>{
  const x=e.clientX-grid.getBoundingClientRect().left;
  return Number($('zoom').value)>=1 || (x>=0 && x<width);
 },
 getScale:()=>Number($('zoom').value),setScale:scale=>{$('zoom').value=String(scale);width=Math.round(rollBasis()*scale);paintNotes();},
 remove:id=>{model.selectIds([id]);model.deleteSelected();selected=null;}});
scroll.addEventListener('keydown',e=>{if(e.key==='Escape'){rollBinding.cancel();return;}const hit=e.target.closest('[data-note]');if(!hit)return;activeLaneStep=null;selected=hit.dataset.note;if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();rollBinding.cancel();model.selectIds([selected]);model.deleteSelected();selected=null;paintNotes();return;}const n=current();let patch;if(e.key==='ArrowUp'||e.key==='ArrowDown')patch={note:n.note+(e.key==='ArrowUp'?1:-1)};if(e.key==='ArrowLeft'||e.key==='ArrowRight'){const d=Math.round(trace.endSample/16)*(e.key==='ArrowLeft'?-1:1);patch={start:n.start+d,end:n.end+d};}if(patch){e.preventDefault();if(model.selection.size>1){try{model.moveSelected((patch.start??n.start)-n.start,(patch.note??n.note)-n.note);paintNotes();}catch{status('Keep the whole selection within range.');}}else edit(patch);grid.querySelector(`[data-note="${selected}"]`)?.focus();}});
function edit(patch){try{model.editNote(selected,patch);paintNotes();}catch{status('Keep pitch, velocity and timing within range.');inspect();}}
if($('inspector'))$('inspector').addEventListener('change',e=>{if(e.target.id==='chance-value'){edit({chance:e.target.value||null});return;}if(e.target.dataset.field)edit({[e.target.dataset.field]:Number(e.target.value)});});
for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>{rollBinding.cancel();mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));};
function rollBasis(){const box=$('roll-scroll')?.clientWidth;return box>=80?box:1400;}
$('zoom').oninput=()=>{rollBinding.cancel();const ratio=scroll.scrollLeft/width;width=rollBasis()*Number($('zoom').value);paintNotes();scroll.scrollLeft=ratio*width;if($('zoom-step'))$('zoom-step').textContent='Zoom '+Math.round(Number($('zoom').value)*100)+'%';};
const mixGesturePreviews=new Map();function restoreMixPreview(id){const undo=mixGesturePreviews.get(id);if(undo){undo();mixGesturePreviews.delete(id);}}
const parameterDraft=new Map(),parameterIdentity=new Map(),mixAliasIndex=mixAliases(components,catalog),masterDraft=createMasterDraft(components,catalog);let mixMode='levels';
// The exact captured raw baseline is distinct from explicit preview/cancel Map entries.
const runtimeMixBindings=mixControlBindings(catalog,components);
const nativeMix=createRuntimeMixState(runtimeMixBindings.groups,{onState:()=>{if(view==='mix'&&nativeMixMode)other();}});
const runtimeSoundBindings=chicagoControlBindings(sourceSounds.entries());
const soundSlot=()=>$('part').value==='chicago'?0:$('part').value==='miami'?1:-1;
const nativeSounds=[0,1].map(voice=>createRuntimeSoundState(runtimeSoundBindings.groups,{voice,onState:()=>{if(view==='sound'&&nativeSoundMode&&soundSlot()===voice)other();}}));
const nativeSound=()=>nativeSounds[soundSlot()];
const soundKey=id=>runtimeSoundBindings.byId.get(id)?.key;
const soundNativeId=id=>view==='sound'&&nativeSoundMode&&!!soundKey(id);
const nativeEditing=()=>view==='mix'&&nativeMixMode||view==='sound'&&nativeSoundMode;
const nativeEditState=()=>view==='mix'?nativeMix.snapshot():nativeSound()?.snapshot();
function retireNativeSound(){++nativeSoundGeneration;nativeSoundRetry=null;nativeSoundMode=false;for(const state of nativeSounds)state.close();}
function nativeSoundDisplay(id){const row=nativeSound()?.snapshot().displays.get(soundKey(id));return row?row.display+(row.unit?' '+row.unit:''):'—';}
function soundSourceBar(){return '<nav class="mix-modes" aria-label="Sound source"><button type="button" data-sound-source="draft" aria-pressed="'+!nativeSoundMode+'">Draft</button><button type="button" data-sound-source="emulator" aria-pressed="'+nativeSoundMode+'" '+(localInstrumentPhase==='running'&&soundSlot()>=0&&!sourceOnlyBank(soundBanks[soundSlot()])?'':'disabled')+'>Emulator</button></nav>';}
async function chooseSoundSource(source){cancelParameters();retireNativeSound();if(source==='draft'||sourceOnlyBank(soundBanks[soundSlot()])){other();return;}const endpoint=localInstrument.controlEndpoint(),voice=soundSlot();nativeSoundMode=true;const generation=nativeSoundGeneration;if(!endpoint||voice<0||typeof nativeSoundFactory!=='function'){other();return;}try{await nativeSounds[voice].connect(nativeSoundFactory({...endpoint,voice}));}catch{if(generation===nativeSoundGeneration&&view==='sound'&&nativeSoundMode)status('Emulator Sound controls unavailable');}}
function runSoundAction(operation){const generation=nativeSoundGeneration,state=nativeSound();nativeSoundRetry=null;const action=operation.kind==='undo'?state.undo():state.change(operation.key,operation.value);void action.catch(error=>{if(generation!==nativeSoundGeneration||view!=='sound'||!nativeSoundMode||nativeSound()!==state)return;if(error?.code==='busy'&&error.noWrite===true){nativeSoundRetry=operation;other();status('Emulator busy · Retry '+(operation.kind==='undo'?'Undo':'edit'));}else status('Emulator Sound controls unavailable');});}
function nativeSoundControls(){const state=nativeSound()?.snapshot();if(!state||!['ready','busy'].includes(state.phase))return '<p role="status">Emulator Sound controls unavailable</p>';const slot=soundSlot(),rows=sourceSounds.controls('CHICAGO',slot).filter(c=>soundKey(c.id));let section='';return '<h2>CHICAGO · '+(slot?'B':'A')+' · Emulator</h2>'+(nativeSoundRetry?'<button type="button" data-sound-retry>Retry '+(nativeSoundRetry.kind==='undo'?'Undo':'edit')+'</button>':'')+'<div class="source-sound-list">'+rows.map(c=>{const heading=c.sourceSection!==section?'<h3>'+esc(c.sourceSection)+'</h3>'+(envelopeRows(c)?envelopeGraph('CHICAGO',slot,rows.filter(envelopeRows)):''):'';section=c.sourceSection;const value=state.values.get(soundKey(c.id));return heading+renderTypedFunkyBeatsParameter({id:c.id,label:c.label,value,min:c.min,max:c.max,step:1,display:nativeSoundDisplay(c.id),enabled:state.phase==='ready',engine:'chicago'});}).join('')+'</div>';}
const runtimeMixKey=id=>runtimeMixBindings.byId.get(id)?.key;
function runtimeMixValue(id,fallback){return nativeMixMode&&view==='mix'&&runtimeMixKey(id)?nativeMix.snapshot().values.get(runtimeMixKey(id)):fallback;}
function mixSourceBar(){return '<nav class="mix-modes" aria-label="Mix source"><button type="button" data-mix-source="draft" aria-pressed="'+!nativeMixMode+'">Draft</button><button type="button" data-mix-source="emulator" aria-pressed="'+nativeMixMode+'" '+(localInstrumentPhase==='running'?'':'disabled')+'>Emulator</button></nav>';}
async function chooseMixSource(source){const generation=++nativeMixGeneration;cancelParameters();if(source==='draft'){nativeMixMode=false;nativeMix.close();other();return;}const endpoint=localInstrument.controlEndpoint();if(!endpoint||typeof nativeProviderFactory!=='function'){status('Emulator controls unavailable');return;}nativeMixMode=true;try{await nativeMix.connect(nativeProviderFactory(endpoint));}catch{if(generation===nativeMixGeneration&&view==='mix'&&nativeMixMode)status('Emulator controls unavailable');}}
function nativeMixAction(action,message){const generation=nativeMixGeneration;void action.catch(()=>{if(generation===nativeMixGeneration&&view==='mix'&&nativeMixMode)status(message);});}
function markRuntimeMixControls(){
 if(localInstrumentPhase==='running'){
  const host=view==='mix'&&nativeMixMode&&['levels','master'].includes(mixMode)&&$('other-view').querySelector('.mix-master-panel>.mix-panel');
  localInstrument.showMasterOutput(host || null);
 }
 if(view!=='mix'||!nativeMixMode)return;const state=nativeMix.snapshot();for(const input of $('other-view').querySelectorAll('[data-native-param],[data-param]')){const id=input.dataset.nativeParam??input.dataset.param,key=runtimeMixKey(id);if(key){input.dataset.runtimeKey=key;input.disabled=state.phase!=='ready';}}}
const kitAccentById=kitAccentAliases(components);
const parameterBaseline=new Map(components.screens.flatMap(screen=>screen.controls.map(control=>[
 screen.path+'|'+control.identity,
 {value:Number(control.context.raw),label:sourceControlLabel(control),drumControl:control.markers?.['drum-control']?control:null}
])));
for(const spec of superJ6Specs)parameterBaseline.set(spec.id,spec);
for(const c of sourceSounds.entries())if(c.enabled)parameterBaseline.set(c.id,{value:c.raw,label:c.label,context:c.context});
for(const spec of masterDraft.specs)for(const id of spec.ids)parameterBaseline.set(id,{value:spec.value,label:spec.label,context:spec.context});
// Native FX_DL_WEAR has a stored default of 64 in fxbus.c. This is a local draft of catalog ID 1551.
const wearControl = catalog.controls.find(d => d.id === 1551 && d.target === 4 && d.voice === 0 && d.parameter === 14 && d.kind === 'U32' && d.min === 0 && d.max === 127);
const wearId = 'catalog/1551';
if (wearControl) parameterBaseline.set(wearId, {value:64,label:'Wear',context:'Tape'});
const wearGlyph = value => (16 + value * 111 / 127) / 127;
const wearDisplay = value => Math.round(value * 100 / 127) + '%';
function wearPanel() {
 if (!wearControl) return '';
 const value = runtimeMixValue(wearId,parameterDraft.get(wearId) ?? 64);
 return '<section class="mix-panel"><h3>Tape</h3><div class="encoder-grid"><button type="button" class="parameter encoder" data-param="'+wearId+'" data-mix-param-label="Tape Wear" aria-label="Tape Wear '+wearDisplay(value)+'"><span class="glyph" data-glyph-fn="TAPE" data-glyph-engine="mixer" data-glyph-value="'+wearGlyph(value)+'"></span><output data-param-value="'+wearId+'">'+wearDisplay(value)+'</output><span>Wear</span></button></div></section>';
}
function changeLines(){
 const lines=model.changes().map(({track,before,after})=>{
  const describe=n=>n?`${name(n.note)}, velocity ${n.velocity}, start ${n.start}, end ${n.end}, chance ${n.chance??'not set'}${n.pulse?', pulse':''}`:'deleted';
  const previous=before?describe(before):'new', next=describe(after);
  const changes=[];
  if(previous!==next)changes.push(`${previous} → ${next}`);
  for(const [key,kind,label] of [['pan','pan','Pan'],['pitchOffset','pitch','Pitch offset']]){
   if(before?.[key]!==after?.[key]){
    const from=before?laneText(kind,before):'—',to=after?laneText(kind,after):'—';
    // Imported Drafts may explicitly store the effective center or zero.
    const stored=n=>n?.[key]===undefined?'default':String(n[key]);
    changes.push(from===to?`${label} ${to} (${stored(before)} → ${stored(after)})`:`${label} ${from} → ${to}`);
   }
  }
  const location=previous===next?` · ${name(after.note)} at sample ${after.start}`:'';
  const part=PARTS[launchParts.indexOf(track)]??track;
  return `Notes · ${part}${location}: ${changes.join(' · ')||previous+' → '+next}`;
 });
 const masterSeen=new Set(), kitsSeen=new Set();
 for(const [id,value] of parameterDraft){
  if(id===legacyBreakChanceId){lines.push('BREAK · Unassigned B chance from file · '+value+'%');continue;}
  const kit=kitAccentById.get(id);
  if(kit){
   if(kitsSeen.has(kit))continue;
   kitsSeen.add(kit);
   if(sharedKitAccent(kit,parameterDraft)===undefined){
    const saved=[];
    for(const [key,voice] of kit.voices){
     if(!parameterDraft.has(key))continue;
     const raw=parameterDraft.get(key);
     saved.push(voice+' '+drumValueText(parameterBaseline.get(key).drumControl,raw)+' ('+raw+'/127)');
    }
    lines.push('Parameter · '+kit.label+' · '+kit.name+': conflicting saved values · '+saved.join(', '));
    continue;
   }
  }
  if(masterDraft.has(id)){
   const key=masterDraft.spec(id).id;
   if(masterSeen.has(key))continue;
   masterSeen.add(key);
  }
  const base=parameterBaseline.get(id)??superJ6Banks.spec(id);
  if(!base||value===base.value)continue;
  const identity=kit?{context:kit.label,label:kit.name}:parameterIdentity.get(id)??base;
  const sj6=superJ6Spec(id)??superJ6Banks.spec(id);
  const shown=v=>base.drumControl?drumValueText(base.drumControl,v):sj6?superJ6Text(sj6,v,v===base.value?new Map():parameterDraft,superJ6Banks.fieldsOf(id)):masterDraft.has(id)?masterDraft.display(id,v):isPanLabel(identity.label)?formatPan(v):v;
  const before=shown(base.value),after=shown(value);
  let change=before+' → '+after;
  if(base.drumControl&&before===after){
   const steps=Math.abs(value-base.value);
   change=after+' ('+(value>base.value?'+':'−')+steps+(steps===1?' step)':' steps)');
  }
  lines.push(`Parameter · ${identity.context?identity.context+' · ':''}${identity.label}: ${change}`);
 }
 for(const slot of [0,1]){const program=superJ6Banks.view(slot);if(program)lines.push('SuperJ6 · Bass '+(slot?'B':'A')+' · '+program.bank+' / '+program.name);}
 for(const row of patternLocks){
  const field=patternLockSpecs.find(s=>s.id===row.catalogId),pattern='P'+String(row.pattern+1).padStart(2,'0');
  row.values.forEach((value,step)=>{if(value!==null)lines.push(`${field.owner}${field.part===4?'':' / '+field.bank} · ${pattern} · Step ${step+1} · ${field.label}: ${field.text(value)}`);});
 }
 for(const [part,rows] of Object.entries(stepLanes))for(const [kind,points] of Object.entries(rows)){
  const name={chicago:'Bass A',miami:'Bass B',drum909:'909',drum808:'808'}[part];
  points.forEach((value,i)=>{if(value!==null)lines.push(name+' · Step '+(i+1)+' · '+stepField(kind).label+': '+stepValueText(kind,value));});
 }
 const {chance:breakChance,generators,...sliceSequence}=breakSequence;
 lines.push(...breakGeneratorChanges(generators));
 if(JSON.stringify(sliceSequence)!==JSON.stringify(emptyBreakSequence()))lines.push('BREAK · '+breakSequence.rate+' · '+breakSequence.slices.filter(Boolean).length+' assigned slices · loops '+breakSequence.loops.map(id=>id??'None').join(' / '));
 breakChance?.forEach((value,step)=>{if(value!==null)lines.push(`BREAK · Step ${step+1} · Chance: ${breakChanceText(value)}`);});
 motion.values.forEach((value,i)=>{if(value!==null)lines.push(`Motion · MIAMI Wave · Step ${i+1}: unset → ${value} raw`);});
 arrangement.rows.forEach((r,i)=>lines.push(`Song row ${i+1}: ${r.patterns.map((p,part)=>'P'+(p+1)+((r.muteMask??0)&(1<<part)?' (off)':'')).join(' / ')} · ${r.repeats} repeats`));return lines;
}
// Commands call each existing model's own undo/redo, not an intermediate after snapshot.
const pushNotes=model.push.bind(model);model.push=before=>{const changed=pushNotes(before);if(changed)timeline.record({label:'Notes',undo:()=>model.undo(),redo:()=>model.redo()});return changed;};
const saveRows=arrangement.save.bind(arrangement);arrangement.save=next=>{if(JSON.stringify(next)===JSON.stringify(arrangement.rows))return;const beforeSelection=songSelected;saveRows(next);if(songNextSelection!==undefined)songSelected=songNextSelection;const afterSelection=songSelected;timeline.record({label:'Song',undo:()=>{arrangement.undo();songSelected=beforeSelection;},redo:()=>{arrangement.redo();songSelected=afterSelection;}});};
const endMotion=motion.end.bind(motion),clearMotion=motion.clear.bind(motion),recordMotion=()=>timeline.record({label:'Motion',undo:()=>motion.undo(),redo:()=>motion.redo()});
motion.end=owner=>{const count=motion.history.length;endMotion(owner);if(motion.history.length>count)recordMotion();};
motion.clear=step=>{if(!Number.isInteger(step)||step<0||step>=16)throw Error('Invalid step');motion.cancel();if(motion.values[step]===null)return;clearMotion(step);recordMotion();};
function scalarDraftChange(id, after) {
 const kit=kitAccentById.get(id);
 const ids=kit?Array.from(kit.voices.keys()):[id];
 const before=ids.map(key=>parameterDraft.get(key));
 return {
  redo(){for(const key of ids)parameterDraft.set(key,after);},
  undo(){ids.forEach((key,i)=>before[i]===undefined?parameterDraft.delete(key):parameterDraft.set(key,before[i]));}
 };
}
function recordParameter(c){if(view==='sound'&&nativeSoundMode){const key=soundKey(c.id),state=nativeSound()?.snapshot();if(key&&state?.phase==='ready'&&c.after!==state.values.get(key))runSoundAction({kind:'change',key,value:c.after});return;}if(view==='mix'&&nativeMixMode&&runtimeMixKey(c.id)){if(nativeMix.snapshot().phase==='ready'&&c.after!==nativeMix.snapshot().values.get(runtimeMixKey(c.id)))nativeMixAction(nativeMix.change(runtimeMixKey(c.id),c.after),'Emulator edit not confirmed');return;}if(view==='mix'&&nativeMixMode)return;restoreMixPreview(c.id);if(c.before===c.after)return;if(masterDraft.has(c.id)){const edit=masterDraft.change(c.id,parameterDraft,c.after);edit.redo();timeline.record({label:'Master '+masterDraft.spec(c.id).label,undo:edit.undo,redo:edit.redo});return;}const group=mixAliasIndex.byId.get(c.id);if(group){const edit=mixChange(group,parameterDraft,c.after);edit.redo();timeline.record({label:c.label||'Mix',undo:edit.undo,redo:edit.redo});return;}const source=findSpec(c.id),identity={label:c.label||source.label,context:c.context||source.context};parameterIdentity.set(c.id,identity);const edit=scalarDraftChange(c.id,c.after);edit.redo();timeline.record({label:[identity.context,identity.label].filter(Boolean).join(' · '),undo:edit.undo,redo:edit.redo});}
function performHistory(redo=false){rollBinding.cancel();cancelParameters();if(view==='sound'&&nativeSoundMode){if(!redo&&nativeSound()?.snapshot().canUndo)runSoundAction({kind:'undo'});return;}if(view==='mix'&&nativeMixMode){if(!redo&&nativeMix.snapshot().canUndo)nativeMixAction(nativeMix.undo(),'Emulator Undo not confirmed');return;}const label=redo?timeline.redo():timeline.undo();paintNotes();if(view!=='roll')other();if(['mix','sound','drums'].includes(view)&&activeParameter&&$('other-view').innerHTML.includes('data-param="'+esc(activeParameter)+'"')){const c=findSpec(activeParameter);if(c)showParameter(c.id,c.value);}status(label?`${redo?'Redo':'Undo'} ${label} · Draft · ${connectionLabel()}`:undefined);}
function cards(list){return'<div class="source-controls">'+list.map(c=>`<div class="parameter"><span>${esc(c.voiceLabel?c.voiceLabel+' · '+c.label:c.label)}</span><output aria-label="${esc(c.label)}, not connected">—</output></div>`).join('')+'</div>';}
const drumLandscape=window.matchMedia?.('(orientation:landscape) and (min-width:640px) and (max-width:900px) and (max-height:500px)');
let drumOriginal=false;
const isDrumPart=part=>part==='drum909'||part==='drum808';
function drumSoundScreen(part) {
 const kit=part==='drum808'?'808':'909';
 return components.screens.find(s=>s.path.endsWith('/'+kit+'-voice-'+String(drumVoice).padStart(2,'0')+'.svg'));
}
function editableDrumControl(id) {
 if(view!=='drums' && (view!=='sound'||drumOriginal||nativeSoundMode||!isDrumPart($('part').value)))return null;
 const screen=drumSoundScreen($('part').value);
 const [path,identity]=id.split('|');
 return screen?.path===path?screen.controls.find(c=>c.identity===identity):null;
}
function paintEditableDrumGlyph(screen,control,value,maximum){
 const root=$('other-view');
 paintDrumGlyph(root,control,value,maximum);
 paintKickDepth(root,control.identity,value,id=>findSpec(screen.path+'|'+id)?.value);
}
function compactDrumSound(part) {
 const kit=part==='drum808'?'808':'909',screen=drumSoundScreen(part);
 const toolbar='<div class="drum-sound-toolbar"><h2>Sound · '+kit+'</h2>'+soundSourceBar()+voiceSelector(kit)+'</div>';
 if(drumOriginal)return toolbar+'<button type="button" data-drum-return>Return to Sound</button>'+sourceFrame(screen);
 return toolbar+renderDrumStrip(screen,findSpec)+
  '<div class="drum-sound-actions"><button type="button" data-drum-original>Open original</button>'+
  '<button type="button" data-project-action="save">Save a copy</button>'+
  '<button type="button" data-project-action="review">Review draft</button></div>';
}
function setDrumOriginal(original) {
 cancelParameters();
 drumOriginal=original;
 other();
 $('other-view').querySelector(original?'[data-drum-return]':'[data-drum-original]')?.focus();
}
function nudgeDrum(id,delta) {
 const c=findSpec(id);
 if(!editableDrumControl(id)||!c)return;
 const value=Math.max(c.min,Math.min(c.max,c.value+delta*c.step));
 recordParameter({id,label:c.label,context:c.context,before:c.value,after:value});
 showParameter(id,value,c);
 status();
}
drumLandscape?.addEventListener?.('change',()=>{
 if(view!=='sound'||nativeSoundMode||!isDrumPart($('part').value))return;
 cancelParameters();
 drumOriginal=false;
 other();
 $('sound-voice')?.focus({preventScroll:true});
});
function voiceSelector(kit){const voices=components.screens.filter(s=>s.successor?.recomposedDrum&&s.path.includes('/'+kit+'-voice-'));return'<label>Sound voice <select id="sound-voice">'+voices.map(s=>{const v=s.successor.sourceVoice;return'<option value="'+v.voice+'"'+(v.voice===drumVoice?' selected':'')+'>'+esc(v.nativeName)+'</option>';}).join('')+'</select></label>';}
const nativePreview=new Map(),soundInputIntent=new WeakMap();
function typedSourceDisplay(c,value){const mixed=mixerDisplay(c.id,value);if(mixed!==null)return mixed;if(c.id?.startsWith('source-sound/CHICAGO/')&&c.label.toUpperCase()==='WAVE'){const wave=waveDisplay('CHICAGO',value,c.max);if(wave)return wave;}if(value===c.raw)return c.display;return '—';}
function qualifiedNativeFormat(c){return !!c&&c.id?.startsWith('source-sound/CHICAGO/')&&c.label.toUpperCase()==='WAVE';}
function nativeInputValue(input){if(soundNativeId(input.dataset.nativeParam)){const spec=findSpec(input.dataset.nativeParam),value=Number(input.value);return spec&&Number.isSafeInteger(value)&&value>=spec.min&&value<=spec.max?{spec,value}:null;}const spec=findSpec(input.dataset.nativeParam,input.dataset.paramOccurrence),value=Number(input.value),source=sourceSounds.entries().find(c=>c.id===spec?.id);return (qualifiedNativeFormat(source)||mixerDisplay(spec?.id,value)!==null)&&spec&&Number.isFinite(value)&&value>=spec.min&&value<=spec.max&&Math.abs((value-spec.min)/spec.step-Math.round((value-spec.min)/spec.step))<1e-6?{spec,value}:null;}
function previewNativeInput(input,propagate=true){if(soundNativeId(input.dataset.nativeParam)){const valid=nativeInputValue(input);if(valid){soundInputIntent.set(input,valid.value);input.value=String(valid.spec.value);}return;}const valid=nativeInputValue(input);if(!valid)return;if(view==='mix'&&nativeMixMode&&runtimeMixKey(valid.spec.id)){nativePreview.set(input,valid.spec.value);return;}const {spec,value}=valid;nativePreview.set(input,spec.value);const row=sourceSounds.entries().find(c=>c.id===spec.id)??{id:spec.id,label:spec.label},display=typedSourceDisplay(row,value);input.setAttribute('aria-valuetext',display);const cell=input.closest?.('.funkybeats-typed-unit');const out=cell?.querySelector?.('[data-param-value]');if(out)out.textContent=display;for(const glyph of cell?.querySelectorAll?.('[data-glyph-fn]')??[])setGlyphValue(glyph,(value-spec.min)/(spec.max-spec.min||1));if(propagate)for(const alias of document.querySelectorAll('[data-native-param]'))if(alias!==input&&(alias.dataset.nativeParam===spec.id||mixAliasIndex.byId.get(spec.id)?.ids.includes(alias.dataset.nativeParam))){alias.value=String(value);previewNativeInput(alias,false);}}
function commitNativeInput(input){if(soundNativeId(input.dataset.nativeParam)){const spec=findSpec(input.dataset.nativeParam),value=soundInputIntent.get(input)??Number(input.value);soundInputIntent.delete(input);if(spec){input.value=String(spec.value);recordParameter({id:spec.id,after:value});}return;}const valid=nativeInputValue(input);if(!valid){cancelNativeInputs();return;}if(view==='mix'&&nativeMixMode&&runtimeMixKey(valid.spec.id)){nativePreview.clear();recordParameter({id:valid.spec.id,after:valid.value});return;}const {spec,value}=valid;recordParameter({id:spec.id,label:spec.label,before:spec.value,after:value});previewNativeInput(input);for(const key of nativePreview.keys())if(key.dataset.nativeParam===spec.id||mixAliasIndex.byId.get(spec.id)?.ids.includes(key.dataset.nativeParam))nativePreview.delete(key);status();}
const envelopeRows = row => row?.sourceSection === 'ENVELOPE';
const valueOfSound = row => soundNativeId(row.id)?nativeSound()?.snapshot().values.get(soundKey(row.id)):parameterDraft.get(row.id) ?? row.raw;
const envelopeValue = (row,value) => Math.round(100*(value-row.min)/(row.max-row.min))+'%';
function envelopeGraph(bank,slot,rows) {
 const svg = envelopeCurve(rows,bank.toLowerCase(),valueOfSound);
 return svg ? `<div class="envelope-row" data-envelope-bank="${bank}" data-envelope-slot="${slot}">${svg}</div>` : '';
}
function refreshEnvelope(row) {
 if (!envelopeRows(row)) return;
 for (const host of document.querySelectorAll('[data-envelope-bank]')) {
  const bank=host.dataset.envelopeBank, group=sourceSounds.controls(bank,Number(host.dataset.envelopeSlot)).filter(envelopeRows);
  if (group.some(c=>c.id===row.id)) host.innerHTML=envelopeCurve(group,bank.toLowerCase(),valueOfSound);
 }
}
function soundGlyph(c,bank,value){
 return glyphFor(c.label,bank.toLowerCase(),(value-c.min)/(c.max-c.min||1),{live:false,miamiParameter:miamiWaveParameter(c)});
}
function superJ6Input(input,commit) {
 if(!input?.dataset.sj6Id)return false;
 const slot=soundSlot(),active=superJ6Banks.view(slot);
 const spec=active?active.fields.get(Number(input.dataset.sj6Field)):superJ6Spec(input.dataset.sj6Id);
 if(view!=='sound'||nativeSoundMode||!spec||spec.id!==input.dataset.sj6Id||spec.slot!==slot||soundBanks[slot]!=='SuperJ6'||String(spec.field)!==input.dataset.sj6Field)return true;
 const before=parameterDraft.get(spec.id)??spec.value;
 const raw=Number(input.value),after=Math.fround(raw);
 if(input.value===''||!Number.isFinite(raw)||raw<0||raw>1||!acceptsSuperJ6(spec,after)){input.value=String(before);return true;}
 if(commit){
  if(active && !superJ6Spec(spec.id) && before!==after){
   const existed=parameterDraft.has(spec.id);
   const redo=()=>parameterDraft.set(spec.id,after);
   const undo=()=>existed?parameterDraft.set(spec.id,before):parameterDraft.delete(spec.id);
   redo();timeline.record({label:spec.context+' · '+spec.label,undo,redo});
  }else if(!active || superJ6Spec(spec.id))recordParameter({id:spec.id,label:spec.label,context:spec.context,before,after});
  input.value=String(after);
  paintSuperJ6($('other-view'),slot,parameterDraft,superJ6Banks);
  status();
 }else{
  const preview=new Map(parameterDraft);
  preview.set(spec.id,after);
  paintSuperJ6($('other-view'),slot,preview,superJ6Banks);
 }
 return true;
}
function selectSuperJ6Program(slot,choice,bank,focus,source) {
 const command=superJ6Banks.choose(slot,choice,bank);
 if(command)timeline.record(command);
 if(source)superJ6Banks.retainOriginal(slot,source);
 other();$('other-view').querySelector(focus)?.focus({preventScroll:true});status();
}
let superJ6ReadGeneration=0;
window.addEventListener('pagehide',()=>{superJ6ReadGeneration++;});
function saveSuperJ6Copy(slot){
 const {bytes,filename}=superJ6Banks.copy(slot,parameterDraft);
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download=filename;
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 status('Saved a copy of '+filename+'.');
}
async function openSuperJ6Bank(input,slot) {
 const generation=++superJ6ReadGeneration,file=input.files?.[0];input.value='';
 if(!file)return;
 try{
  const source=await readSuperJ6Original(file),bank=source.bank;
  if(generation!==superJ6ReadGeneration || !input.isConnected || slot!==soundSlot())return;
  if(input.dataset.sj6Reopen!==undefined){
   superJ6Banks.retainOriginal(slot,source);
   other();$('other-view').querySelector('[data-sj6-save]')?.focus();saveSuperJ6Copy(slot);
  }else selectSuperJ6Program(slot,[bank.digest,bank.programs[0].id],bank,'[data-sj6-program]',source);
 }catch(error){if(generation===superJ6ReadGeneration && input.isConnected)status('Could not open SuperJ6 bank. '+error.message);}
}
function superJ6BankChange(input) {
 const slot=soundSlot();
 if(view!=='sound'||nativeSoundMode||slot<0||soundBanks[slot]!=='SuperJ6')return false;
 if(input.dataset.sj6File!==undefined||input.dataset.sj6Reopen!==undefined){void openSuperJ6Bank(input,slot);return true;}
 if(input.dataset.sj6Bank!==undefined){
  const bank=superJ6Banks.banks.get(input.value);
  if(bank || input.value==='')selectSuperJ6Program(slot,bank?[bank.digest,bank.programs[0].id]:null,null,'[data-sj6-bank]');
  return true;
 }
 if(input.dataset.sj6Program!==undefined){
  const digest=superJ6Banks.selected[slot]?.[0];
  if(superJ6Banks.program(digest,input.value))selectSuperJ6Program(slot,[digest,input.value],null,'[data-sj6-program]');
  return true;
 }
 return false;
}
function recoverLegacySoundOwners() {
 importedJunoOwners.clear();
 for(const [slot,bank] of soundBanks.entries()) {
  if(bank==='JUNO'||sourceSounds.controls('JUNO',slot).some(c=>c.kind===1&&parameterDraft.has(c.id)))importedJunoOwners.add(slot);
 }
}
function soundBankSelector(slot,bank) {
 const options=SOUND_BANKS.map(b=>'<option value="'+b+'"'+(b===bank?' selected':'')+'>'+b+'</option>').join('');
 const legacy=bank==='JUNO'?'<option value="JUNO" selected disabled>JUNO (legacy)</option>':'';
 const picker='<label>Engine <select id="sound-bank">'+options+legacy+'</select></label>';
 if(legacy||!importedJunoOwners.has(slot))return picker;
 return '<div class="legacy-bank-choice">'+picker+'<button type="button" data-restore-legacy-juno>Restore JUNO (legacy)</button></div>';
}
function selectDraftBank(bank,restoreLegacy=false) {
 const slot=soundSlot();
 if(slot<0||view!=='sound'||nativeSoundMode)return;
 if(!SOUND_BANKS.includes(bank)&&!(bank==='JUNO'&&restoreLegacy&&importedJunoOwners.has(slot)))return;
 cancelParameters();soundBanks[slot]=bank;activeParameter=null;activePresentation=null;
 other();$('sound-bank')?.focus({preventScroll:true});
}
function soundControls(part){
 const slot=part==='chicago'?0:part==='miami'?1:-1,bank=slot<0?'BREAK':soundBanks[slot];
 const selector=slot<0?'':soundBankSelector(slot,bank);
 if(bank==='SuperJ6')return selector+renderSuperJ6(slot,parameterDraft,superJ6Banks);
 if(bank==='Synth One')return selector+renderSynthOneInit(slot);
 const rows=sourceSounds.controls(bank,slot);
 const chicago=bank==='CHICAGO';
 const sectionClass=chicago?' chicago-draft-sections':bank==='JUNO'?' juno-sections':'';
 const closeGroup=chicago?'</div></section>':'</div>';
 let section=null,section0=0;return selector+'<div class="source-sound-list'+sectionClass+'" aria-label="'+esc(rows[0].context)+' source controls">'+rows.map(c=>{
  const heading=c.sourceSection&&section!==c.sourceSection?'<h3>'+esc(c.sourceSection)+'</h3>':'';section=c.sourceSection;const label=esc(c.label),display=esc(c.display),id=esc(c.id),value=parameterDraft.has(c.id)?parameterDraft.get(c.id):c.raw;
  const open=heading||!section0?(section0++?closeGroup:'')+(chicago?'<section>':'')+heading+
   (envelopeRows(c)?'<div class="encoder-grid envelope-controls">':'<div class="encoder-grid">'):'';
  if(c.id===legacyBreakChanceId)return open+breakSoundChance(breakSequence.generators,launch.targets[4],parameterDraft.get(c.id));
  if(envelopeRows(c) && c.enabled) {
   const graph=heading?envelopeGraph(bank,slot,rows.filter(envelopeRows)):'';
   return open+graph+`<button type="button" class="parameter envelope-stage" data-param="${id}"><span>${label}</span><output data-param-value="${id}">${envelopeValue(c,value)}</output></button>`;
  }
  const waveParam=miamiWaveParameter(c),wave=miamiWave(waveParam,value);
  const shown=wave?.name??sourcePercent(c,value)??(value===c.raw?c.display:formatParameterValue(c.label,value));
  return open+(c.enabled?(qualifiedNativeFormat(c)?renderTypedFunkyBeatsParameter({id:c.id,label:c.label,value,min:c.min,max:c.max,step:c.step,display:typedSourceDisplay(c,value),enabled:qualifiedNativeFormat(c),engine:bank.toLowerCase()}):'<button type="button" class="parameter encoder" data-param="'+id+'" aria-label="'+esc(c.context+' · '+c.label+', '+shown+', local draft')+'"><span class="glyph" data-glyph-fn="'+esc(c.label)+'"'+(wave?' data-miami-parameter="'+waveParam+'"':'')+' data-glyph-engine="'+esc(bank.toLowerCase())+'" data-glyph-domain="normalized" data-glyph-value="'+((value-c.min)/(c.max-c.min||1))+'">'+soundGlyph(c,bank,value)+'</span><output data-param-value="'+id+'">'+esc(shown)+'</output><span>'+label+'</span></button>'):'<div class="encoder unavailable" aria-disabled="true" title="'+esc(c.reason||'')+'" aria-label="'+esc(label+', '+display+(c.reason?', '+c.reason:''))+'"><span>'+label+'</span><output>'+display+'</output></div>');
 }).join('')+(section0?closeGroup:'')+'</div>';
}
function mixerSource(file,identity,label){const screen=components.screens.find(s=>s.path.endsWith('/'+file));if(!screen)return null;const occurrence=screen.controls.findIndex(c=>c.identity===identity);if(occurrence<0)return null;const id=screen.path+'|'+identity,s=findSpec(id,String(occurrence));return s?{...s,id,label:label??s.label,display:mixerDisplay(id,s.value),occurrence}:null;}
function typedMixer(){const labels=['909','808','BASS A','BASS B','BREAK'],rows=labels.map((label,i)=>mixerSource('mix-parts-live.svg','1:5:'+i+':0',label));if(rows.some(c=>!c||c.display===null))return '';return renderTypedFunkyBeatsMixer({channels:rows});}
function typedMixSends(mode){const labels=['909','808','BASS A','BASS B','BREAK'],colors=['#ff9529','#ff4841','#82f05a','#46cdff','#d678ff'];return '<div class="mix-strip-grid">'+labels.map((label,i)=>{const params=mode==='pan'?[3]:[1,2];return '<section class="mix-send-strip" style="--part-color:'+colors[i]+'"><button type="button" class="mix-part-route" data-mix-part="'+['drum909','drum808','chicago','miami','breaks'][i]+'" aria-label="Open '+label+' sound controls">'+label+'<small>Sound</small></button>'+params.map(p=>{const c=mixerSource(p===3?'mix-parts-live.svg':'fx-reverb-direct.svg','1:5:'+i+':'+p,p===3?'PAN':p===1?'REV':'DLY');return c?renderTypedFunkyBeatsParameter({...c,engine:'mixer'}):'<div class="mix-unread" aria-label="'+label+' pan not read">—</div>';}).join('')+'</section>';}).join('')+'</div>';}
function mixControlPanel(file,title){const screen=components.screens.find(s=>s.path.endsWith('/'+file));if(!screen)return '';const rows=screen.controls.filter(c=>!file.startsWith('fx-')||c.identity.split(':')[1]!=='5');return '<section class="mix-panel"><h3>'+esc(title)+'</h3><div class="encoder-grid">'+rows.map(c=>{const id=screen.path+'|'+c.identity,value=runtimeMixValue(id,masterDraft.has(id)?masterDraft.read(id,parameterDraft):parameterDraft.has(id)?parameterDraft.get(id):Number(c.context.raw)),spec=findSpec(id),display=fxDisplay(id,value)??(!nativeMixMode&&masterDraft.has(id)?masterDraft.display(id,value):value===Number(c.context.raw)?c.context.display:formatParameterValue(c.context.name,value)),name=title+' '+c.context.name;return '<button type="button" class="parameter encoder" data-param="'+esc(id)+'" data-mix-param-label="'+esc(name)+'" aria-label="'+esc(name+' '+display)+'"><span class="glyph"'+(spec?' data-glyph-fn="'+esc(c.context.name)+'" data-glyph-engine="mixer" data-glyph-value="'+((value-spec.min)/(spec.max-spec.min||1))+'"':'')+'>'+glyphFor(c.context.name,'mixer',spec?(value-spec.min)/(spec.max-spec.min||1):0,{live:false})+'</span><output data-param-value="'+esc(id)+'">'+esc(display)+'</output><span>'+esc(c.context.name)+'</span></button>';}).join('')+'</div></section>';}
function masterMore(){if(nativeMixMode)return '';return '<section class="mix-panel master-more" aria-label="Master More Draft"><h3>More · Draft</h3><div class="encoder-grid">'+masterDraft.more.map(c=>{const value=masterDraft.read(c.id,parameterDraft),display=masterDraft.display(c.id,value);return '<button type="button" class="parameter encoder" data-param="'+c.id+'" data-master-control="'+c.target+':'+c.parameter+'" aria-label="Master '+esc(c.label)+' '+esc(display)+'"><span class="glyph" data-glyph-fn="'+c.glyph+'" data-glyph-engine="mixer" data-glyph-value="'+value/c.max+'">'+glyphFor(c.glyph,'mixer',value/c.max,{live:false})+'</span><output data-param-value="'+c.id+'">'+esc(display)+'</output><span>'+esc(c.label)+'</span></button>';}).join('')+'</div></section>';}
function paintMasterValues(){if(view!=='mix'||nativeMixMode)return;for(const btn of document.querySelectorAll('[data-param]')){const id=btn.dataset.param;if(!masterDraft.has(id))continue;const c=masterDraft.spec(id),value=masterDraft.read(id,parameterDraft),display=masterDraft.display(id,value);btn.setAttribute('aria-label','Master '+c.label+' '+display);for(const out of btn.querySelectorAll?.('[data-param-value]')??[])out.textContent=display;for(const glyph of btn.querySelectorAll?.('[data-glyph-fn]')??[])setGlyphValue(glyph,value/c.max);}}
let projectPreset;
function projectCards() {
 const soundEdits = new Set();
 for (const [id,value] of parameterDraft) {
  const baseline = parameterBaseline.get(id) ?? superJ6Banks.spec(id);
  if (baseline && value !== baseline.value) soundEdits.add(kitAccentById.get(id) ?? (masterDraft.has(id) ? masterDraft.spec(id).id : id));
 }
 const tools = Object.fromEntries(DESTINATIONS);
 const link = (label, href) => '<a href="'+esc(href)+'" target="_blank" rel="noopener">'+esc(label)+'</a>';
 const guide = esc(midiExchangeGuide.trim().replace(/^DnBOX MIDI exchange\s*/, ''));
 return `<div class="destinations">
  <section><h3>Project backup</h3><div>${link('Export backup',tools.Projects+'#export-title')}${link('Inspect restore',tools.Projects+'#import-title')}</div></section>
  <section><h3>Original presets</h3><div><button type="button" data-project-preset-open>Open original</button><button type="button" data-project-preset-inspect ${projectPreset?.canInspect() ? '' : 'disabled'}>Inspect contents</button><button type="button" data-project-preset-save ${projectPreset?.canSave() ? '' : 'disabled'}>Save a copy</button></div></section>
  <section><h3>MIDI for a DAW</h3><div>${link('Choose range',tools['MIDI exchange'])}${link('Export availability',tools.Projects+'#project-exchange-availability')}</div></section>
 </div>
 <nav class="project-tools" aria-label="Project resources">${link('Samples',tools.Samples)}${link('Manual','../manual/')}</nav>
 <details class="project-guide"><summary>Open DAW guide</summary><p>${guide}</p></details>
 <section class="project-summary"><h3>Current session</h3>
  <p>${model.notes.length} notes · ${soundEdits.size} sound edits · ${arrangement.rows.length} song rows</p>
  <div class="project-actions"><button type="button" data-project-action="save">Save draft</button><button type="button" data-project-action="open">Open draft</button><button type="button" data-project-action="review">Review changes</button></div>
 </section>`;
}
const launchParts=['drum909','drum808','chicago','miami','breaks'];
function patternScope(){const part=launchParts.indexOf($('part').value),index=part<0?2:part,target=launch.targets[index];return{index,name:PARTS[index],target,display:target===null?'Not selected':'P'+String(target+1).padStart(2,'0')};}
let showAllPatternParts = false;
const desktopPatterns = window.matchMedia?.('(min-width:1100px) and (min-height:650px)');
desktopPatterns?.addEventListener?.('change', ({matches}) => {
 const panel = document.querySelector('.patterns-grid-panel[data-scope="selected"]');
 if (!panel) return;
 const controls = panel.querySelector('.pattern-scope');
 const focused = controls.contains(document.activeElement) ? document.activeElement : null;
 panel.insertBefore(controls, matches ? panel.querySelector('.funkybeats-launcher') : null);
 focused?.focus({preventScroll:true});
});
function patternsWorkspace() {
 const scope = patternScope();
 const title = showAllPatternParts ? 'All parts' : scope.name;
 const patternCount = 32;
 const launcher = renderFunkyBeatsLauncher({
  parts: PARTS, targets: launch.targets, patternCount, selectedPart: showAllPatternParts ? null : scope.index
 });
 const target = showAllPatternParts ? '' :
  '<h3>'+esc(scope.name)+'</h3><output id="pattern-target">'+esc(scope.display)+'</output>';
 const controls = '<div class="pattern-scope" role="group" aria-label="Pattern display">'+
  (showAllPatternParts ? '' : '<h3 class="pattern-count">'+patternCount+' patterns</h3>')+
  '<button type="button" data-pattern-scope="selected" aria-pressed="'+(!showAllPatternParts)+'">Selected part</button>'+
  '<button type="button" data-pattern-scope="all" aria-pressed="'+showAllPatternParts+'">All parts</button>'+
  '<button type="button" id="pattern-review" data-pattern-action="review">Review draft</button></div>';
 const content = desktopPatterns?.matches && !showAllPatternParts ? controls+launcher : launcher+controls;
 return '<h2>Patterns · '+esc(title)+' · Draft</h2>'+
  '<div class="patterns-layout"><section class="patterns-grid-panel" data-scope="'+(showAllPatternParts?'all':'selected')+'" aria-label="'+esc(title)+' pattern choices">'+content+
  '</section><aside class="patterns-actions" aria-label="Pattern actions">'+target+
  '<p>Draft · Not loaded</p><button type="button" data-pattern-action="song">Song arrangement</button></aside></div>';
}
function selectPatternScope(button) {
 const showAll = button.dataset.patternScope === 'all';
 if (showAll === showAllPatternParts) return;
 showAllPatternParts = showAll;
 other();
 document.querySelector('[data-pattern-scope="'+button.dataset.patternScope+'"]').focus();
}

function other(){const sj6Focus=document.activeElement?.dataset?.sj6Id;const laneFocus=document.activeElement?.closest?.('[data-lane-step]')?.dataset.laneStep;const part=$('part').value;let html='';if(view==='drums'){const kit=part==='drum808'?'808':'909';html='<h2>'+kit+' · Draft</h2><div class="drum-layout"><section class="drum-grid-panel" aria-label="'+kit+' step grid">'+drumsWithLane(kit)+'</section><aside class="drum-sound-panel" aria-label="Selected voice sound"><h3>Sound · '+esc(DRUM_VOICES[kit][drumVoice][0])+'</h3>'+voiceSelector(kit)+sourceFrame(drumSoundScreen(part),true)+'</aside></div>';}
 if(view==='locks')html='<section class="motion-editor" aria-label="MIAMI Wave Motion draft"><h2>Motion · MIAMI Wave</h2><div id="motion-grid" tabindex="0" aria-label="MIAMI Wave"></div><div class="motion-fields"><label>Step <input id="motion-step" type="number" min="1" max="16" value="'+(motionSelected+1)+'"></label><label>Value <input id="motion-value" aria-label="Value" type="number" min="0" max="127" value="'+(motion.values[motionSelected]??'')+'"></label></div><div class="motion-actions"><button id="motion-clear">Clear point</button><button id="motion-undo">Undo</button><button id="motion-redo">Redo</button></div></section>';
 if(view==='sound'&&nativeSoundMode){html=soundSourceBar()+nativeSoundControls();}
 if(view==='sound'&&!nativeSoundMode){html=isDrumPart(part)&&drumLandscape?.matches?compactDrumSound(part):soundSourceBar()+`<h2>Sound · ${esc($('part').selectedOptions[0].textContent)}${part==='chicago'||part==='miami'?' / '+soundBanks[part==='chicago'?0:1]:''}</h2>`+(['drum909','drum808'].includes(part)?voiceSelector(part==='drum909'?'909':'808')+sourceFrame(drumSoundScreen(part),true):soundControls(part));}
 if(view==='mix'){html=mixSourceBar()+(nativeMixMode&&!['ready','busy'].includes(nativeMix.snapshot().phase)?'<p role="status">Emulator controls unavailable</p>':renderMixWorkspace({mode:mixMode,parts:mixMode==='levels'?typedMixer():typedMixSends(mixMode),master:mixControlPanel('mix-master.svg','Master')+masterMore(),fx:mixControlPanel('fx-reverb-direct.svg','Reverb')+mixControlPanel('fx-delay-direct.svg','Delay'),tape:wearPanel()}));}
 if(view==='patterns')html=patternsWorkspace();
 if(view==='song'){songSelected=arrangement.rows.length?Math.min(songSelected??0,arrangement.rows.length-1):null;html=renderSong(arrangement.rows,songSelected);}
 if(view==='files')html='<h2>Projects</h2>'+projectCards();
 if(['sound','drums'].includes(view))html='<div id="native-envelopes" hidden></div>'+html;
 $('other-view').innerHTML=html;
 const drumScene=$('other-view').querySelector('[data-drum-editor]');
 if(drumScene || $('other-view').querySelector('[data-drum-sound-strip]')) {
  const screen=drumSoundScreen(part);
  if(drumScene)mountDrumReadouts(drumScene,screen,findSpec);
  for(const control of screen.controls){
   const spec=findSpec(screen.path+'|'+control.identity);
   if(spec)paintEditableDrumGlyph(screen,control,spec.value,spec.max);
  }
 }
 if(sj6Focus)$('other-view').querySelector('[data-sj6-id="'+sj6Focus+'"]')?.focus({preventScroll:true});if(laneFocus!==undefined)$('other-view').querySelector(`[data-lane-step="${laneFocus}"]`)?.focus({preventScroll:true});if(['sound','mix','drums'].includes(view)){(view==='drums'?$('other-view').querySelector('.drum-sound-panel')??$('other-view'):$('other-view')).insertAdjacentHTML?.('beforeend','<div id="parameter-inspector"><label><span></span><output id="parameter-readout"></output><input id="parameter-value" type="number" disabled></label><button id="parameter-undo" disabled>Undo</button></div>');paintLivePan();}mountLiveGlyphs($('other-view'));bindParameterFields();if(view==='locks')bindMotion();paintSoundPanel();nativeEnvelopeBinding?.render();markRuntimeMixControls();status();}
function partTitle(){if(view==='patterns'){if(showAllPatternParts)return 'All parts · Draft';const scope=patternScope();return scope.name+' · '+scope.display+' · Draft';}if(view==='locks')return 'MIAMI Wave';const part=$('part')?.value;if(view==='sound'&&nativeSoundMode)return (nativeSound()?.snapshot().engine??'Sound')+' / Emulator';if(part==='chicago')return soundBanks[0]+' / P01';if(part==='miami')return soundBanks[1]+' / P01';if(part==='drum909')return '909 / P01';if(part==='drum808')return '808 / P01';if(part==='breaks')return knownBreakPattern(launch.targets[4])?'BREAK / '+breakPatternName(launch.targets[4]):'BREAK';return 'P01';}
function syncPartTitle(){const el=$('part-title');if(el)el.textContent=partTitle();}
function syncEngines(){const part=$('part')?.value;document.querySelectorAll('[data-engine]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.engine===part)));syncPartTitle();}
function paintSoundPanel(){const root=$('glyph-card');if(!root)return;syncPartTitle();const part=$('part').value,slot=part==='chicago'?0:part==='miami'?1:-1,bank=slot<0?'':view==='sound'&&nativeSoundMode?'CHICAGO':soundBanks[slot];if(view==='sound'&&nativeSoundMode&&!['ready','busy'].includes(nativeSound()?.snapshot().phase)){root.innerHTML='<strong>Sound · Emulator</strong><output>—</output>';return;}const n=current(),lane=STEP_LANES.find(l=>l.id===laneKind())||STEP_LANES[0],readout=n?String(laneFigure(n)||'—'):'—';const titles={OSCILLATOR:'OSC',ENVELOPE:'ENV'};let sections='';if(slot>=0&&!sourceOnlyBank(bank)){const rows=sourceSounds.controls(bank,slot).filter(c=>c.enabled);const order=bank==='CHICAGO'?['OSCILLATOR','FILTER 1','FILTER 2','ENVELOPE']:[...new Set(rows.map(c=>c.sourceSection))].filter(Boolean).slice(0,4);for(const section of order){const group=rows.filter(c=>c.sourceSection===section);if(!group.length)continue;const curve=section==='ENVELOPE'?envelopeGraph(bank,slot,group):'';sections+=`<div class="panel-section"><h3>${esc(titles[section]||section)}</h3><div class="panel-cells">${group.map(c=>`<div class="panel-cell">${curve?'':`<span class="glyph">${soundGlyph(c,bank,valueOfSound(c))}</span>`}<output>${esc(soundNativeId(c.id)?nativeSoundDisplay(c.id):curve?envelopeValue(c,valueOfSound(c)):miamiWave(miamiWaveParameter(c),valueOfSound(c))?.name??c.display)}</output><span>${esc(c.label)}</span></div>`).join('')}</div>${curve}</div>`;}}root.innerHTML=`<strong>${esc(slot<0?partTitle():bank+' '+(slot?'B':'A'))}</strong>${sections}<output class="panel-readout"><small>${esc(lane.label)}</small>${esc(readout)}</output>`;}
function syncMotionSequence(){const heading=$('motion-sequence-context');heading.hidden=view!=='locks';if(view==='locks'){const part=$('part').value,slot=part==='chicago'?0:part==='miami'?1:-1;heading.textContent='Sequence · '+$('part').selectedOptions[0].textContent+(slot>=0?' / '+soundBanks[slot]:'')+' · Draft';}}
// Keep a musician's view when briefly leaving the roll, and reveal the new
// part if they change instruments while the roll is hidden.
let parkedRollViewport = null;
function parkRollViewport() {
 if (!scroll.clientHeight) return;
 parkedRollViewport = {
  part: $('part').value,
  rowsFromTop: scroll.scrollTop / row,
  timeOffset: scroll.scrollLeft / width
 };
}
function resumeRollViewport() {
 if (!parkedRollViewport || !scroll.clientHeight) return;
 const saved = parkedRollViewport;
 parkedRollViewport = null;
 if ($('part').value === saved.part) {
  scroll.scrollTop = saved.rowsFromTop * row;
  scroll.scrollLeft = saved.timeOffset * width;
  return;
 }
 const first = notes()[0];
 framePitchOffset((127 - (first?.note ?? 60)) * row - scroll.clientHeight / 2);
 if (!first) return;
 const start = first.start / trace.endSample * width;
 const end = first.end / trace.endSample * width;
 if (end <= scroll.scrollLeft || start >= scroll.scrollLeft + scroll.clientWidth) {
  scroll.scrollLeft = start - scroll.clientWidth / 2;
 }
}
function setView(v){
 if(v==='roll'&&localInstrumentPhase==='running')localInstrument.showMasterOutput(null);
 if(v!==view)activeLaneStep=null;if(!['roll','locks'].includes(v))parkRollViewport();rollBinding.cancel();cancelParameters();if(v!==view){retireNativeSound();drumOriginal=false;}view=v;$('lane-kind').value=laneKind();$('workspace-main').dataset.layoutView=v;syncMotionSequence();$('roll-view').hidden=!['roll','locks'].includes(v);$('other-view').hidden=v==='roll';const modes=$('mode-tools');if(modes)modes.hidden=v!=='roll';const tab=v==='song'?'patterns':v;document.querySelectorAll('[data-view]').forEach(b=>{const on=b.dataset.view===v||(b.dataset.tab&&b.dataset.view===tab);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});if($('context-title'))$('context-title').textContent='';syncBreakView();if(v!=='roll')other();if(['roll','locks'].includes(v)){width=Math.round(rollBasis()*Number($('zoom').value||1));paintNotes();resumeRollViewport();}paintSoundPanel();}
// Native Tab may leave a partly visible select clipped in the horizontal row scroller.
$('other-view').addEventListener('focusin',e=>{if(view==='song'&&e.target.closest('.song-scroll')||view==='drums'&&e.target.closest('.drum-layout'))e.target.scrollIntoView({block:'nearest',inline:'nearest'});});
function saveSong(selection,change){songNextSelection=selection;try{change();}finally{songNextSelection=undefined;}}
function songFocus(selector){other();$('other-view').querySelector(selector)?.focus();}
function songAction(id){
 if(id==='song-review'){$('review-dialog').addEventListener('close',()=>{if(view==='song')$('song-review')?.focus();},{once:true});$('review').click();return;}
 if(id==='song-undo'||id==='song-redo'){performHistory(id==='song-redo');$('other-view').querySelector(songSelected===null?'#song-add':`[data-song-select="${songSelected}"]`)?.focus();return;}
 if(id==='song-add'){if(arrangement.rows.length>=MAX_SONG_ROWS)return;if(launch.targets.some(n=>n===null)){status('Select a pattern for all five parts first.');return;}saveSong(arrangement.rows.length,()=>arrangement.add(launch.targets));songFocus(`[data-song-select="${songSelected}"]`);return;}
 if(songSelected===null)return;
 const row=songSelected;
 if(id==='song-up'||id==='song-down'){const direction=id==='song-up'?-1:1;if(row+direction<0||row+direction>=arrangement.rows.length)return;saveSong(row+direction,()=>arrangement.move(row,direction));}
 else if(id==='song-remove')saveSong(arrangement.rows.length>1?Math.min(row,arrangement.rows.length-2):null,()=>arrangement.remove(row));
 songFocus(songSelected===null?'#song-add':`[data-song-select="${songSelected}"]`);
}
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>setView(b.dataset.view);$('other-view').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.drumNavigate!==undefined){navigateDrumGrid(b);return;}
 if(b.dataset.songOn!==undefined){
  const row=Number(b.dataset.songOn),part=Number(b.dataset.songPart);
  try{
   const wasOff=Boolean((arrangement.row(row).muteMask??0)&(1<<part));
   saveSong(row,()=>arrangement.setPartOn(row,part,wasOff));
   songFocus(`[data-song-on="${row}"][data-song-part="${part}"]`);
  }catch{status('Choose an available song row and part.');}
  return;
 }
 if(b.dataset.openSynthOneFiles!==undefined && view==='sound' && !nativeSoundMode){
   const slot=soundSlot();
   if(slot>=0 && soundBanks[slot]==='Synth One' && b.dataset.openSynthOneFiles===String(slot)) openSynthOneFiles(b,slot);
   return;
 }
 if(b.dataset.sj6Save!==undefined){
  const slot=soundSlot();
  if(superJ6Banks.originalFor(slot))saveSuperJ6Copy(slot);
  else{
   const expected=superJ6Banks.view(slot)?.bank??'Intro Bank';
   status('Choose the original '+expected+' file to save this bass’s copy.');
   b.parentElement.querySelector('[data-sj6-reopen]').click();
  }
  return;
 }
 if(b.dataset.sj6Open!==undefined){b.parentElement.querySelector('[data-sj6-file]').click();return;}
 if(b.dataset.drumAccentStep!==undefined && view==='drums' && b.dataset.accentTrack===stepPart()){
   const part=b.dataset.accentTrack, step=Number(b.dataset.drumAccentStep);
   if(!Number.isInteger(step)||step<0||step>=16||!viewStepFields(part,view).includes('drumAccent'))return;
   if(laneCaptures.size)cancelStepLane();
   const points=[...(stepLanes[part]?.drumAccent??Array(16).fill(null))];
   points[step]=!points[step];editStepRow(part,'drumAccent',points);
   redrawDrumSteps('[data-drum-accent-step="'+step+'"]');return;
 }
 if(b.dataset.drumOriginal!==undefined){setDrumOriginal(true);return;}
 if(b.dataset.drumReturn!==undefined){setDrumOriginal(false);return;}
 if(b.dataset.drumDecrement){nudgeDrum(b.dataset.drumDecrement,-1);return;}
 if(b.dataset.drumIncrement){nudgeDrum(b.dataset.drumIncrement,1);return;}
 if(b.dataset.projectPresetOpen!==undefined){projectPreset??=mountProjectPreset($('project-preset-dialog'),status);projectPreset.open();return;}
 if(b.dataset.projectPresetInspect!==undefined){projectPreset?.open(true);return;}
 if(b.dataset.projectPresetSave!==undefined){projectPreset?.save();return;}
 if(b.dataset.restoreLegacyJuno!==undefined){selectDraftBank('JUNO',true);return;}if(b.dataset.patternScope){selectPatternScope(b);return;}if(b.dataset.patternAction){if(b.dataset.patternAction==='song')setView('song');else if(b.dataset.patternAction==='review'){$('review-dialog').addEventListener('close',()=>{if(view==='patterns')$('pattern-review')?.focus();},{once:true});$('review').click();}return;}if(b.dataset.soundSource){void chooseSoundSource(b.dataset.soundSource);return;}if(b.dataset.soundRetry!==undefined){if(nativeSoundRetry)runSoundAction(nativeSoundRetry);return;}if(b.dataset.mixSource){void chooseMixSource(b.dataset.mixSource);return;}if(b.dataset.mixMode){if(!['levels','pan','sends','fx','master'].includes(b.dataset.mixMode))return;cancelParameters();mixMode=b.dataset.mixMode;other();document.querySelector('[data-mix-mode="'+mixMode+'"]')?.focus();return;}if(b.dataset.mixPart){if(!['drum909','drum808','chicago','miami','breaks'].includes(b.dataset.mixPart))return;cancelParameters();$('part').value=b.dataset.mixPart;$('part').onchange();setView('sound');return;}if(b.dataset.projectAction){const id={save:'draft-save',open:'draft-file',review:'review'}[b.dataset.projectAction];if(id)$(id)?.click?.();return;}if(b.id==='drum-edit'){drumEdit=!drumEdit;other();return;}if(b.dataset.drumNote!==undefined){model.toggleHit(b.dataset.drumTrack,Number(b.dataset.drumNote),Number(b.dataset.drumStart));other();status();return;}if(['song-add','song-up','song-down','song-remove','song-review','song-undo','song-redo'].includes(b.id)){songAction(b.id);return;}if(b.dataset.step){$('step-detail').textContent='Step '+(Number(b.dataset.step)+1)+' · Not loaded';}if(b.dataset.pattern!==undefined){const state=launch.choose(Number(b.dataset.launchPart),Number(b.dataset.pattern));other();document.querySelector(`[data-launch-part="${b.dataset.launchPart}"][data-pattern="${b.dataset.pattern}"]`)?.focus();status(`${state.part} · P${state.selected+1} selected · Not loaded`);}if(b.dataset.hit){const n=model.notes.find(n=>n.id===b.dataset.hit);$('part').value=n.track;selected=n.id;setView('roll');scroll.scrollTop=(127-n.note)*row-scroll.clientHeight/2;}});
$('part').onchange=()=>{rollBinding.cancel();cancelParameters();retireNativeSound();model.selectIds([]);drumVoice=0;drumOriginal=false;selected=null;activeLaneStep=null;$('lane-kind').value=laneKind();syncEngines();syncBreakView();syncMotionSequence();if(['roll','locks'].includes(view)){paintNotes();framePitchOffset((127-(notes()[0]?.note??60))*row-scroll.clientHeight/2);if(view==='locks')other();}else other();};document.querySelectorAll('[data-engine]').forEach(b=>b.onclick=()=>{$('part').value=b.dataset.engine;$('part').onchange();});syncEngines();if($('play')){$('play').onclick=()=>{$('play').setAttribute('aria-pressed','true');$('rec').setAttribute('aria-pressed','false');status('Local transport · '+connectionLabel());};$('stop').onclick=()=>{$('play').setAttribute('aria-pressed','false');$('rec').setAttribute('aria-pressed','false');status('Local transport · '+connectionLabel());};$('rec').onclick=()=>{const on=$('rec').getAttribute('aria-pressed')!=='true';$('rec').setAttribute('aria-pressed',String(on));if(on)$('play').setAttribute('aria-pressed','true');status('Local transport · '+connectionLabel());};}$('undo').onclick=()=>performHistory();$('redo').onclick=()=>performHistory(true);if($('inspector-toggle'))$('inspector-toggle').onclick=()=>{const closed=document.querySelector('.editor').classList.toggle('closed');$('inspector-toggle').setAttribute('aria-expanded',String(!closed));};$('review').onclick=openReview;

let chanceDrag=null,paramOwner=null,activeParameter=null,activePresentation=null;
function lanePoint(e){return{x:e.clientX,y:e.clientY,fine:e.shiftKey};}
const laneCaptures=new Map();
const laneGesture=new StepLaneGesture(model,{base:laneBase,changed:()=>{paintNotes();if(view==='drums')other();}});
function cancelStepLane(){stepValueLane.cancel();breakChanceLane.cancel();laneGesture.cancel();for(const[id,root]of laneCaptures){laneCaptures.delete(id);if(root.hasPointerCapture?.(id))root.releasePointerCapture(id);}}
function bindStepLane(root,container,getNotes){
 const editor=()=>root===$('velocity')&&breakChanceMode()?breakChanceLane:laneSpec()?stepValueLane:laneGesture;
 function revealEditedLock(step){
  if(root!==$('velocity')||laneKind()!=='patternLock')return;
  root.querySelector(`[data-lane-step="${step}"]`)?.scrollIntoView({block:'nearest',inline:'nearest'});
  scroll.scrollLeft=root.scrollLeft;
 }
 root.addEventListener('focusin',e=>{
  const button=e.target.closest?.('[data-lane-step]');
  if(!button)return;
  if(editor()===laneGesture){
   if(root===$('velocity'))syncLaneLabel(button.getAttribute('aria-valuetext'));
   return;
  }
  const step=button.dataset.laneStep;
  activeLaneStep=Number(step);syncLaneLabel();
  for(const button of root.querySelectorAll('[data-lane-step]'))button.setAttribute('aria-pressed',String(button.dataset.laneStep===step));
 });
 const apply=e=>{const host=container(),box=host?.getBoundingClientRect();if(!box)return;const span=root===$('velocity')?width:box.width;
  const x=e.clientX-box.left+(host.scrollLeft||0);
  if(root===$('velocity') && Number($('zoom').value)<1 && (x<0||x>=span))return;
  const step=Math.max(0,Math.min(15,Math.floor(x/span*16)));if(editor()!==laneGesture)activeLaneStep=step;editor().preview(e.pointerId,laneP(e.clientY,box.top,box.height),step);};
 root.addEventListener('pointerdown',e=>{
  const target=e.target.closest?.('[data-lane-step]');if(e.button!==0||(!target&&!laneCaptures.size))return;
  if(!target&&!laneCaptures.has(e.pointerId)&&root!==$('velocity')&&view!=='drums')return;
  const groups=stepGroups(getNotes(),trace.endSample),group=target?groups[Number(target.dataset.laneStep)]:null;
  if((!group || (!group.notes.length && editor()===laneGesture))&&!laneCaptures.size)return;
  if(motion.gesture){motion.cancel();motionPaint();cancelStepLane();e.preventDefault();return;}if(rollBinding.active()){rollBinding.cancel();cancelStepLane();e.preventDefault();return;}
  const ongoing=laneCaptures.size>0;
  if(group)for(const n of groups.flatMap(g=>g.notes))laneBases.set(n.id,laneBases.get(n.id)??n.note);
  const begun=editor().begin(e.pointerId,group,laneKind(),{groups});
  if(!begun&&!ongoing)return;
  laneCaptures.set(e.pointerId,root);root.setPointerCapture(e.pointerId);e.preventDefault();
  if(begun){if(group.notes.length&&laneKind()!=='patternLock')selected=group.notes[0].id;apply(e);}
 });
 root.addEventListener('pointermove',e=>{if(laneCaptures.get(e.pointerId)===root){e.preventDefault();apply(e);}});
 root.addEventListener('pointerup',e=>{if(laneCaptures.get(e.pointerId)!==root)return;laneCaptures.delete(e.pointerId);editor().end(e.pointerId);if(root.hasPointerCapture?.(e.pointerId))root.releasePointerCapture(e.pointerId);});
 for(const type of['pointercancel','lostpointercapture'])root.addEventListener(type,e=>{if(laneCaptures.get(e.pointerId)!==root)return;laneCaptures.delete(e.pointerId);editor().cancelPointer(e.pointerId);});
 root.addEventListener('keydown',e=>{
  if(e.key==='Escape'){cancelStepLane();return;}
  const target=e.target.closest?.('[data-lane-step]');if(!target)return;
  const group=stepGroups(getNotes(),trace.endSample)[Number(target.dataset.laneStep)];if(!group || (!group.notes.length && editor()===laneGesture))return;
  if(editor()===stepValueLane && ['Backspace','Delete'].includes(e.key)){
   e.preventDefault();cancelStepLane();activeLaneStep=group.step;editor().nudge(group,laneKind(),0);revealEditedLock(group.step);return;
  }
  if(['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(e.key)){e.preventDefault();cancelStepLane();if(editor()!==laneGesture)activeLaneStep=group.step;if(group.notes.length&&laneKind()!=='patternLock')selected=group.notes[0].id;editor().nudge(group,laneKind(),['ArrowUp','ArrowRight'].includes(e.key)?1:-1);revealEditedLock(group.step);}
 });
}
bindStepLane($('velocity'),()=>$('velocity'),notes);
bindStepLane($('other-view'),()=>$('drum-lane'),drumLaneNotes);
$('other-view').addEventListener('click',e=>{if(e.target.closest?.('[data-lane-cycle]')){$('lane-kind').value=cycleLane();cancelParameters();other();}});
scroll.addEventListener('scroll',()=>{$('velocity').scrollLeft=scroll.scrollLeft;const rt=document.querySelector('.ruler-track');if(rt)rt.style.transform=`translateX(${-scroll.scrollLeft}px)`;const rail=$('pitch-rail');if(rail)rail.scrollTop=scroll.scrollTop;});$('velocity').addEventListener('scroll',()=>{if(Math.abs(scroll.scrollLeft-$('velocity').scrollLeft)>1)scroll.scrollLeft=$('velocity').scrollLeft;});
const findSpec=(id,occurrence)=>{if(typeof id!=='string')return null;const sj6=superJ6Spec(id)??superJ6Banks.spec(id);if(sj6)return{...sj6,value:parameterDraft.get(id)??sj6.value};if(masterDraft.has(id)&&!(view==='mix'&&nativeMixMode)){const c=masterDraft.spec(id);return{...c,id,value:masterDraft.read(id,parameterDraft)};}if(id.startsWith('source-master/'))return null;if(id===wearId&&wearControl)return {id,label:'Wear',context:'Tape',value:runtimeMixValue(id,parameterDraft.get(id)??64),min:wearControl.min,max:wearControl.max,step:1};if(id.startsWith('source-sound/')){const c=sourceSounds.spec(id);if(soundNativeId(id)){const value=nativeSound()?.snapshot().values.get(soundKey(id));return c&&Number.isFinite(value)?{...c,value}:null;}return c?{...c,value:parameterDraft.has(id)?parameterDraft.get(id):c.value}:null;}const[path,identity]=id.split('|'),screen=components.screens.find(s=>s.path===path),ordinal=Number(occurrence);if(occurrence!==undefined&&(!Number.isInteger(ordinal)||ordinal<0))return null;const c=occurrence===undefined?screen?.controls.find(c=>c.identity===identity):screen?.controls[ordinal];if(!c||c.identity!==identity)return null;const[k,target,voice,param]=identity.split(':').map(Number),d=catalog.controls.find(d=>d.target===target&&d.voice===voice&&d.parameter===param&&d.kind!=='HELD');const group=mixAliasIndex.byId.get(id),kit=kitAccentById.get(id),value=runtimeMixValue(id,group?mixRead(group,parameterDraft):parameterDraft.get(id)??(kit?sharedKitAccent(kit,parameterDraft):undefined)??Number(c.context.raw));if(k!==1||!d||!Number.isFinite(value)||value<d.min||value>d.max)return null;return{id,label:sourceControlLabel(c),context:[d.targetLabel,d.voiceLabel,d.bankLabel].filter(Boolean).join(' / '),value,min:d.min,max:d.max,step:d.kind==='U32'?1:.001};};
function showParameter(id,value,presentation){activeParameter=id;const descriptor=findSpec(id);if(!descriptor)return;if(soundNativeId(id)||view==='mix'&&nativeMixMode&&runtimeMixKey(id))value=descriptor.value;if(presentation?.label&&presentation?.context)activePresentation={id,label:presentation.label,context:presentation.context};else if(activePresentation?.id!==id)activePresentation={id,label:descriptor.label,context:descriptor.context};const row=id.startsWith('source-sound/')?sourceSounds.controlForId(id):null;const wave=miamiWave(miamiWaveParameter(row),value);const drum=editableDrumControl(id),sourceDisplay=wave?.name??(soundNativeId(id)?null:sourcePercent(row,value));const shown=drum?drumValueText(drum,value):soundNativeId(id)?nativeSoundDisplay(id):!nativeMixMode&&masterDraft.has(id)?masterDraft.display(id,value):id===wearId?wearDisplay(value):envelopeRows(row)?envelopeValue(row,value):sourceDisplay??fxDisplay(id,value)??formatParameterValue(activePresentation.label,value);if(drum)paintEditableDrumGlyph(drumSoundScreen($('part').value),drum,value,descriptor.max);refreshEnvelope(row);if(wave)paintSoundPanel();for(const out of document.querySelectorAll('[data-param-value]'))if(out.dataset.paramValue===id)out.textContent=shown;for(const btn of document.querySelectorAll('[data-param]'))if(btn.dataset.param===id){if(drum&&btn.dataset.drumLabel)btn.setAttribute('aria-label',btn.dataset.drumLabel+', '+shown+', local draft');if(sourceDisplay!==null)btn.setAttribute('aria-label',row.context+' · '+row.label+', '+shown+', local draft');if(btn.dataset.mixParamLabel)btn.setAttribute('aria-label',btn.dataset.mixParamLabel+' '+shown);for(const g of btn.querySelectorAll?.('[data-glyph-fn]')??[])setGlyphValue(g,id===wearId?wearGlyph(value):(value-descriptor.min)/(descriptor.max-descriptor.min||1));}const field=$('parameter-value');if(field){const s=findSpec(id);field.disabled=nativeEditing()&&nativeEditState()?.phase!=='ready';field.min=s.min;field.max=s.max;field.step=s.step;field.value=value;$('parameter-inspector').querySelector('span').textContent=activePresentation.context+' · '+activePresentation.label;const readout=$('parameter-readout');if(readout)readout.textContent=shown;}$('parameter-undo')&&($('parameter-undo').disabled=nativeEditing()?!nativeEditState()?.canUndo:!timeline.canUndo);paintLivePan();paintMasterValues();}
function paintLivePan(){for(const btn of document.querySelectorAll('[data-param]')){const s=findSpec(btn.dataset.param,btn.dataset.paramOccurrence);if(!s||!isPanLabel(s.label))continue;btn.dataset.live='pan';btn.textContent=formatPan(s.value);}}
const parameterGesture=new ParameterGesture({onPreview:s=>{if(soundNativeId(s.id)||view==='mix'&&nativeMixMode&&runtimeMixKey(s.id)){showParameter(s.id,s.value);return;}if(view==='mix'&&nativeMixMode)return;if(masterDraft.has(s.id)){const change=masterDraft.change(s.id,parameterDraft,s.value);if(!mixGesturePreviews.has(s.id))mixGesturePreviews.set(s.id,change.undo);change.redo();showParameter(s.id,s.value);status();return;}const group=mixAliasIndex.byId.get(s.id);const change=group?mixChange(group,parameterDraft,s.value):scalarDraftChange(s.id,s.value);if(!mixGesturePreviews.has(s.id))mixGesturePreviews.set(s.id,change.undo);change.redo();showParameter(s.id,s.value);const row=sourceSounds.controlForId(s.id),drum=editableDrumControl(s.id);status(`${s.label} · ${drum?drumValueText(drum,s.value):miamiWave(miamiWaveParameter(row),s.value)?.name??sourcePercent(row,s.value)??fxDisplay(s.id,s.value)??formatParameterValue(s.label,s.value)} · Draft`);},onCommit:c=>{recordParameter(c);showParameter(c.id,c.after);status();},onCancel:c=>{if(soundNativeId(c.id)||view==='mix'&&nativeMixMode&&runtimeMixKey(c.id)){showParameter(c.id,c.restore);return;}restoreMixPreview(c.id);if(c.restore!==null)showParameter(c.id,c.restore);}});
function cancelNativeInputs(){for(const input of document.querySelectorAll('[data-native-param]'))soundInputIntent.delete(input);const entries=[...nativePreview];nativePreview.clear();for(const [input,value]of entries){input.value=String(value);previewNativeInput(input,false);}nativePreview.clear();}
function cancelParameters(){cancelNativeInputs();motion.cancel();cancelStepLane();if(chanceDrag){model.cancelAll();chanceDrag=null;}parameterGesture.cancel();paramOwner=null;if(view==='locks')motionPaint();status();}
function bindParameterFields(){const f=$('parameter-value'),u=$('parameter-undo');if(f)f.onchange=()=>{const s=findSpec(activeParameter),v=Number(f.value);if(!s||!Number.isFinite(v)||v<s.min||v>s.max||Math.abs((v-s.min)/s.step-Math.round((v-s.min)/s.step))>1e-6){if(s)showParameter(s.id,s.value);return;}recordParameter({id:s.id,label:s.label,before:s.value,after:v});showParameter(s.id,v);status();};if(u)u.onclick=()=>performHistory();}
$('other-view').addEventListener('pointerdown',e=>{const t=e.target.closest('[data-param]');if(!t||t.dataset.nativeParam||e.button!==0)return;const s=findSpec(t.dataset.param,t.dataset.paramOccurrence);if(!s)return;if(t.dataset.drumLabel)t.focus({preventScroll:true});paramOwner=e.pointerId;$('other-view').setPointerCapture(e.pointerId);parameterGesture.begin(e.pointerId,s,lanePoint(e));showParameter(s.id,s.value,s);e.preventDefault();});$('other-view').addEventListener('pointermove',e=>parameterGesture.move(e.pointerId,lanePoint(e)));$('other-view').addEventListener('pointerup',e=>{if(e.target.dataset.nativeParam&&(nativePreview.has(e.target)||soundInputIntent.has(e.target)))commitNativeInput(e.target);parameterGesture.end(e.pointerId);if(!parameterGesture.current)for(const id of [...mixGesturePreviews.keys()])restoreMixPreview(id);});for(const event of['pointercancel','lostpointercapture'])$('other-view').addEventListener(event,()=>{cancelNativeInputs();parameterGesture.cancel();});$('other-view').addEventListener('keydown',e=>{const input=e.target.closest('[data-native-param]');if(input&&soundNativeId(input.dataset.nativeParam)&&['ArrowUp','ArrowRight','ArrowDown','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();const spec=findSpec(input.dataset.nativeParam);if(spec&&nativeSound().snapshot().phase==='ready'){const value=e.key==='Home'?spec.min:e.key==='End'?spec.max:Math.max(spec.min,Math.min(spec.max,spec.value+(['ArrowUp','ArrowRight'].includes(e.key)?1:-1)));recordParameter({id:spec.id,after:value});}return;}if(parameterGesture.current&&masterDraft.has(parameterGesture.current.target.id)&&e.key!=='Escape')parameterGesture.cancel('keyboard-interrupt');const t=e.target.closest('[data-param]');if(e.key==='Escape'){cancelNativeInputs();parameterGesture.cancel();return;}if(!t||t.dataset.nativeParam)return;const s=findSpec(t.dataset.param,t.dataset.paramOccurrence);if(!s)return;if(['Enter',' '].includes(e.key)){showParameter(s.id,s.value,s);$('parameter-value')?.focus();e.preventDefault();}if(['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(e.key)){e.preventDefault();const v=Math.max(s.min,Math.min(s.max,s.value+(['ArrowUp','ArrowRight'].includes(e.key)?s.step:-s.step)));recordParameter({id:s.id,label:s.label,before:s.value,after:v});showParameter(s.id,v,s);status();}});
function motionPaint(){const el=$('motion-grid');if(!el)return;el.innerHTML=motion.values.map((v,i)=>`<button data-motion-step="${i}" style="left:${i/16*100}%;height:${v===null?6:Math.max(6,v/127*100)}%" aria-label="Step ${i+1}, ${v===null?'unset':v}" aria-pressed="${motionSelected===i}">${v??'—'}</button>`).join('');$('motion-step').value=motionSelected+1;$('motion-value').value=motion.values[motionSelected]??'';status();}
function bindMotion(){motionPaint();const el=$('motion-grid'),point=e=>{const r=el.getBoundingClientRect();return{step:Math.max(0,Math.min(15,Math.floor((e.clientX-r.left)/r.width*16))),value:Math.max(0,Math.min(127,Math.round((1-(e.clientY-r.top)/r.height)*127)))}};el.onpointerdown=e=>{if(e.button!==0)return;if(rollBinding.active()||laneCaptures.size){rollBinding.cancel();cancelStepLane();motion.cancel();motionPaint();e.preventDefault();return;}el.setPointerCapture(e.pointerId);motion.begin(e.pointerId);const p=point(e);motionSelected=p.step;motion.draw(e.pointerId,p.step,p.value);motionPaint();e.preventDefault();};el.onpointermove=e=>{if(!motion.gesture)return;const p=point(e);motionSelected=p.step;motion.draw(e.pointerId,p.step,p.value);motionPaint();};el.onpointerup=e=>{motion.end(e.pointerId);motionPaint();};el.onpointercancel=el.onlostpointercapture=()=>{motion.cancel();motionPaint();};el.onclick=e=>{if(e.detail!==0)return;const button=e.target.closest('[data-motion-step]');if(!button)return;motionSelected=Number(button.dataset.motionStep);motionPaint();el.querySelector('[data-motion-step="'+motionSelected+'"]')?.focus({preventScroll:true});};$('motion-step').onchange=()=>{motionSelected=Math.max(0,Math.min(15,Number($('motion-step').value)-1));motionPaint();};$('motion-value').onchange=()=>{const v=Number($('motion-value').value);try{motion.begin(-1);motion.draw(-1,motionSelected,v);motion.end(-1);}catch{motion.cancel();}motionPaint();};$('motion-clear').onclick=()=>{motion.clear(motionSelected);motionPaint();};$('motion-undo').onclick=()=>performHistory();$('motion-redo').onclick=()=>performHistory(true);}
$('multi').onclick=()=>{multi=!multi;$('multi').setAttribute('aria-pressed',String(multi));if(!multi&&selected)model.selectIds([selected]);paintNotes();};$('copy').onclick=()=>{try{if(!model.selection.size&&selected)model.selectIds([selected]);status(model.copy()+' notes copied');}catch{status('Select notes first.');}};$('paste').onclick=()=>{try{const n=current();const ids=model.paste({track:$('part').value,start:n?.start??0,note:n?.note??60});selected=ids[0];paintNotes();}catch{status('The whole pasted group must fit.');}};$('delete').onclick=()=>{rollBinding.cancel();if(!model.selection.size&&selected)model.selectIds([selected]);model.deleteSelected();selected=null;paintNotes();};$('lane-kind').onchange=()=>{cancelParameters();paintNotes();syncLaneLabel();};if($('lane-param'))$('lane-param').onclick=()=>{$('lane-kind').value=cycleLane();$('lane-kind').onchange();};if($('open-sound'))$('open-sound').onclick=()=>document.querySelector('[data-view="sound"]')?.click();if($('zoom-step'))$('zoom-step').onclick=()=>{const steps=[1,1.5,2,3,4],cur=Number($('zoom').value)||1,next=steps.find(s=>s>cur+0.01)||steps[0];$('zoom').value=String(next);$('zoom').oninput?.();if($('zoom-step'))$('zoom-step').textContent='Zoom '+Math.round(next*100)+'%';};if($('snap'))$('snap').onclick=()=>$('snap').setAttribute('aria-pressed',$('snap').getAttribute('aria-pressed')==='true'?'false':'true');$('other-view').addEventListener('input',e=>{if(superJ6Input(e.target,false))return;if(e.target.dataset.nativeParam)previewNativeInput(e.target);});$('other-view').addEventListener('change',e=>{if(superJ6Input(e.target,true)||superJ6BankChange(e.target))return;if(e.target.dataset.nativeParam){commitNativeInput(e.target);return;}if(e.target.id==='sound-bank'){selectDraftBank(e.target.value);return;}if(e.target.id==='sound-voice'){const value=Number(e.target.value);if(Number.isInteger(value)&&value>=0&&value<11){cancelParameters();drumVoice=value;drumOriginal=false;other();if(view==='drums'||drumLandscape?.matches)$('sound-voice')?.focus();}return;}if(e.target.dataset.songSelect!==undefined){songSelected=Number(e.target.dataset.songSelect);songFocus(`[data-song-select="${songSelected}"]`);return;}
if(e.target.dataset.songPattern!==undefined){const row=Number(e.target.dataset.songPattern),part=Number(e.target.dataset.songPart);let error;try{saveSong(row,()=>arrangement.setPattern(row,part,Number(e.target.value)));}catch{error='Pattern must be P01–P32.';}songFocus(`[data-song-pattern="${row}"][data-song-part="${part}"]`);if(error)status(error);return;}
if(e.target.dataset.songRow!==undefined){const row=Number(e.target.dataset.songRow);let error;try{saveSong(row,()=>arrangement.update(row,{repeats:Number(e.target.value)}));}catch{error='Repeats must be 1–8.';}songFocus(`[data-song-row="${row}"]`);if(error)status(error);}});
window.addEventListener('blur',()=>{rollBinding.cancel();cancelParameters();});document.addEventListener('visibilitychange',()=>{if(document.hidden){rollBinding.cancel();cancelParameters();}});window.addEventListener('pagehide',()=>{rollBinding.cancel();cancelParameters();breakEditor?.stop();void localInstrument.stop();nativeEnvelopeBinding?.close();nativeEnvelopeBinding=null;disposed=true;});window.addEventListener('pageshow',e=>{if(e.persisted){disposed=false;syncBreakView();paintNotes();}});window.addEventListener('resize',()=>{if(!['roll','locks'].includes(view)||disposed)return;const next=Math.round(rollBasis()*Number($('zoom').value||1));if(Math.abs(next-width)<2)return;width=next;paintNotes();});paintNotes();{const next=Math.round(rollBasis()*Number($('zoom').value||1));if(Math.abs(next-width)>=2){width=next;paintNotes();}}framePitchOffset((127-(notes()[0]?.note??60))*row-scroll.clientHeight/2);

// Explicit local draft recovery. Every source hash and typed ref is validated before replacement.
const draftState={patternLocks,stepLanes,stepValueLane,superJ6Banks,breakSequence,breakChanceLane,model,motion,arrangement,launch,parameterDraft,parameterIdentity,timeline,soundBanks};
class MixWorkspaceDraftFile extends WorkspaceDraftFile{validate(document){const checked=super.validate(document);return super.validate({...checked,parameters:masterDraft.normalize(normalizeMixEdits(checked.parameters,mixAliasIndex))});}}
const draftCodec=new MixWorkspaceDraftFile({trace,identity:sourceIdentity,parameters:[...parameterBaseline.keys()].map(id=>findSpec(id)).filter(Boolean)});
const draftContext=()=>({part:$('part').value,view,...(view==='roll'&&$('part').value==='breaks'&&breakView!=='slices'?{breakView}:{}),mode,lane:laneKind(),...(laneKind()==='patternLock'&&currentLock()?.id!==lockField($('part').value,soundBanks,view)?.id?{lockTarget:currentLock().id}:{}),zoom:Number($('zoom').value),selected:model.notes.some(n=>n.id===selected)?selected:null,selection:[...model.selection].filter(id=>model.notes.some(n=>n.id===id)),drumVoice,motionSelected,multi,drumEdit});
const startingDraft=draftCodec.capture(draftState,draftContext());

function showReviewConfirmation(confirm) {
 $('review-summary').hidden=confirm;
 $('review-confirm').hidden=!confirm;
 $('review-title').textContent=confirm?'Discard local draft?':'Local changes';
}
function openReview() {
 rollBinding.cancel();cancelParameters();
 const lines=changeLines(), choices=[];
 for(const [i,target] of launch.targets.entries())if(target!==null)choices.push(PARTS[i]+' pattern P'+String(target+1).padStart(2,'0'));
 for(const [i,bank] of soundBanks.entries())if(bank!==startingDraft.soundBanks[i])choices.push(PARTS[i+2]+' engine '+bank);
 for(const bank of superJ6Banks.banks.values())choices.push('SuperJ6 bank '+bank.name);
 $('changes').textContent=lines.join('\n')||'No changes.';
 $('changes').hidden=!lines.length && !!choices.length;
 $('review-selections').textContent=choices.join(' · ');
 $('review-selections').hidden=!choices.length;
 $('review-discard').disabled=!hasDraftChanges(draftState,draftCodec);
 showReviewConfirmation(false);
 $('review-dialog').showModal();
}
$('review-discard').onclick=()=>{showReviewConfirmation(true);$('review-keep').focus();};
function keepReview() {
 showReviewConfirmation(false);$('review-discard').focus();
}
$('review-keep').onclick=keepReview;
$('review-dialog').addEventListener('cancel',event=>{
 if(!$('review-confirm').hidden){event.preventDefault();keepReview();}
});
$('review-reset').onclick=()=>{
 if($('review-confirm').hidden || !hasDraftChanges(draftState,draftCodec))return;
 const before=draftCodec.capture(draftState,draftContext()), previousSong=songSelected;
 const nextId=model.next, priorLegacy=[...importedJunoOwners];
 function apply(snapshot, song, legacy) {
  const context=installWorkspaceDraft(draftState,draftCodec,snapshot,{keepSession:true});
  restoreLockChoice(context);selected=context.selected;songSelected=song;activeLaneStep=null;laneBases.clear();
  if(context.breakView && view==='roll' && $('part').value==='breaks')breakView=context.breakView;
  importedJunoOwners.clear();for(const owner of legacy)importedJunoOwners.add(owner);
  activeParameter=null;activePresentation=null;
  breakEditor?.paint();syncBreakView();
 }
 const redo=()=>apply(startingDraft,null,[]);
 const undo=()=>{apply(before,previousSong,priorLegacy);model.next=nextId;};
 redo();timeline.record({label:'Discard draft',undo,redo});
 $('review-dialog').close();
 paintNotes();if(view!=='roll')other();status('Local draft discarded. Undo in Draft to restore it.');
};
bindDraftFiles({document,window,codec:draftCodec,state:draftState,getContext:draftContext,cancel:()=>{rollBinding.cancel();cancelParameters();},restoreContext:c=>{retireNativeSound();recoverLegacySoundOwners();restoreLockChoice(c);activeLaneStep=null;laneBases.clear();$('part').value=c.part;breakView=c.breakView??'slices';selected=c.selected;mode='auto';multi=c.multi;drumVoice=c.drumVoice;drumOriginal=false;drumEdit=c.drumEdit;motionSelected=c.motionSelected;$('lane-kind').value=c.lane;$('zoom').value=c.zoom;width=rollBasis()*c.zoom;activeParameter=null;activePresentation=null;for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));$('multi').setAttribute('aria-pressed',String(multi));view=c.view;},render:()=>setView(view),status});
// Explicit simulator admission only. Native endpoint/catalog admission is not yet qualified.
const simulatorBundle=globalThis.__DNBOX_FIRMWARE_BUNDLE?.admission?.testOnly===true?globalThis.__DNBOX_FIRMWARE_BUNDLE:null;
if(simulatorBundle){for(const id of['firmware-safety','firmware-controls'])if($(id))$(id).hidden=false;}
mountFirmwareLink({bundle:simulatorBundle});
// Fit the pattern once layout has settled, and again when the screen turns.
if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>{fitted=false;if(['roll','locks'].includes(view))paintNotes();});
if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('resize',()=>{fitted=false;if(['roll','locks'].includes(view))paintNotes();});

// The Web lane stages the qualified shared runtime under /emu/. No fallback
// simulator is substituted when that deployment is unavailable.
const localInstrument=createLocalInstrument({
 load:async options=>{const baseURL=new URL('../emu/',import.meta.url);const {loadNativeSession,createNativeControlProvider,createNativeSoundProvider}=await import(new URL('native-session.mjs',baseURL).href);nativeProviderFactory=createNativeControlProvider;nativeSoundFactory=createNativeSoundProvider;return loadNativeSession({...options,baseURL});},
 attach:attachEnvelopeObserver,status,onPlaying:state=>{const output=$('native-playing');if(output){output.textContent='Emulator play: '+({playing:'on',stopped:'off',unavailable:'—'}[state]);output.setAttribute('aria-label','Emulator sequencer '+state);}},onState:phase=>{localInstrumentPhase=phase;if(phase!=='running'){retireNativeSound();++nativeMixGeneration;nativeMixMode=false;nativeMix.close();}if(['mix','sound'].includes(view))other();}
});
$('emulator-start')?.addEventListener('click',()=>{void localInstrument.start();});
$('emulator-stop')?.addEventListener('click',()=>{void localInstrument.stop();});

// Recheck receipt age after background timer throttling; never infer stopped.
document.addEventListener('visibilitychange',()=>{if(!document.hidden)localInstrument.playingState();});
