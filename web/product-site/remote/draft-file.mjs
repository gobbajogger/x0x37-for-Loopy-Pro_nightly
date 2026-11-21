import {checkedPatternLocks,lockField} from './pattern-locks.mjs';
import {checkedStepRows,replaceStepRows,viewStepFields} from './local-step-rows.mjs';
import {SuperJ6Banks} from './superj6-banks.mjs';
import {legacyBreakChanceId} from './break-generator.mjs';
import {emptyBreakSequence,validateBreakSequence,installBreakSequence} from './break-sequence.mjs';
import {SOUND_BANKS,superJ6Spec,acceptsSuperJ6} from './superj6.mjs';
import{MAX_DRAFT_ID}from'./draft-identity.mjs';
// Explicit LOCAL example-draft file, not an instrument project, preset, engine or MIDI format.
import{notesFromTrace}from'./model.mjs';
import{chanceDomain,MAX_SONG_ROWS}from'./sequence.mjs';
const clone=x=>structuredClone(x),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),int=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const TRACKS=['chicago','miami','drum909','drum808','breaks'],VIEWS=['roll','drums','locks','sound','mix','patterns','song','files'];
const SCHEMA='dnbox-local-workspace-draft/1',KIND='local-preview-only',MOTION='Bass B / MIAMI / CARRIER / WAVE';
const MAX_DRAFT_BYTES=12*1024*1024;
function fail(message){throw Error('Local draft: '+message);}
export function checkDraftFileSize(bytes){if(bytes>MAX_DRAFT_BYTES)fail('file exceeds 12 MiB');}
function keys(value,required,optional=[]){if(!value||typeof value!=='object'||Array.isArray(value)||required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>!required.includes(k)&&!optional.includes(k)))fail('unknown or missing fields');}
function array(value,max,min=0){if(!Array.isArray(value)||value.length<min||value.length>max)fail('array bound');}
// JSON.parse alone silently accepts repeated object keys. Reject those and excessive nesting first.
function parse(text){
 if(typeof text!=='string')fail('expected JSON text');
 checkDraftFileSize(text.length);
 checkDraftFileSize(new TextEncoder().encode(text).length);let p=0;
 const ws=()=>{while(/[ \t\r\n]/.test(text[p]??'!'))p++;};
 const string=()=>{const begin=p++;for(;p<text.length;p++){if(text[p]==='\\'){p++;continue;}if(text[p]==='"'){p++;return JSON.parse(text.slice(begin,p));}}fail('unterminated string');};
 const value=depth=>{if(depth>32)fail('nesting bound');ws();const c=text[p];if(c==='"'){string();return;}if(c==='{'){p++;ws();const seen=new Set();if(text[p]==='}'){p++;return;}for(;;){ws();if(text[p]!=='"')fail('object key');const k=string();if(seen.has(k))fail('duplicate object key');seen.add(k);ws();if(text[p++]!==':')fail('object separator');value(depth+1);ws();if(text[p]==='}'){p++;return;}if(text[p++]!==',')fail('object delimiter');}}
  else if(c==='['){p++;ws();if(text[p]===']'){p++;return;}for(;;){value(depth+1);ws();if(text[p]===']'){p++;return;}if(text[p++]!==',')fail('array delimiter');}}
  else{const match=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(p));if(!match)fail('JSON value');p+=match[0].length;}
 };value(0);ws();if(p!==text.length)fail('trailing JSON');try{return JSON.parse(text);}catch{fail('invalid JSON');}
}
// Local viewport only. Existing files store quarter-step zooms from 1 to 4.
function validRollZoom(scale){
 return [1/8,1/4,1/2].includes(scale) ||
        (Number.isFinite(scale) && scale>=1 && scale<=4 && Number.isInteger(scale*4));
}

export class WorkspaceDraftFile{
 constructor({trace,identity,parameters}){
  keys(identity,['trace','catalog','components','source-sounds']);if(Object.values(identity).some(v=>typeof v!=='string'||! /^[0-9a-f]{64}$/.test(v)))fail('exact source SHA256 identity required');
  this.identity=clone(identity);this.original=notesFromTrace(trace);this.endSample=trace.endSample;this.sources=new Map(this.original.map(n=>[n.id,n]));this.parameters=new Map();
  array(parameters,10000);for(const s of parameters){if(typeof s?.id!=='string'||!s.id||s.id.length>1024||this.parameters.has(s.id)||![s.value,s.min,s.max,s.step].every(Number.isFinite)||s.max<=s.min||s.step<=0||s.value<s.min||s.value>s.max)fail('finite unique parameter spec');this.parameters.set(s.id,clone(s));}
 }
 validate(document){
  keys(document,['schema','kind','identity','notes','parameters','motion','launch','song','soundBanks','context'],['breakSequence','superJ6Banks','stepLanes','patternLocks']);if(document.schema!==SCHEMA||document.kind!==KIND)fail('unsupported version or non-local format');
  keys(document.identity,Object.keys(this.identity));if(Object.keys(this.identity).some(k=>document.identity[k]!==this.identity[k]))fail('source identity mismatch; no automatic migration');
  const ids=new Set();array(document.notes,20000);for(const n of document.notes){
   keys(n,['id','track','note','velocity','channel','start','end','sourceOrder','pulse'],['chance','pan','pitchOffset']);
   if(typeof n.id!=='string'||n.id.length>64||ids.has(n.id)||!TRACKS.includes(n.track)||!int(n.note,0,127)||!int(n.velocity,1,127)||!int(n.channel,0,15)||!int(n.start,0,this.endSample)||!int(n.end,n.start,this.endSample)||typeof n.pulse!=='boolean'||n.pulse!==(n.start===n.end))fail('invalid note');ids.add(n.id);
   const source=this.sources.get(n.id);if(source){if(n.sourceOrder!==source.sourceOrder||n.track!==source.track||n.channel!==source.channel||n.pulse!==source.pulse)fail('source note identity changed');}else if(!/^draft(?:0|[1-9]\d*)$/.test(n.id)||!int(Number(n.id.slice(5)),0,MAX_DRAFT_ID)||n.sourceOrder!==null)fail('unknown note identity');
   if(Object.hasOwn(n,'pan')&&!int(n.pan,0,127))fail('invalid per-step pan');
   if(Object.hasOwn(n,'pitchOffset')&&(!['drum909','drum808'].includes(n.track)||!int(n.pitchOffset,-24,24)))fail('invalid drum pitch offset');
   if(Object.hasOwn(n,'chance')&&(!['chicago','miami','drum909','drum808'].includes(n.track)||!chanceDomain.includes(n.chance)))fail('unsupported chance');
  }
  const stepLanes=checkedStepRows(document.stepLanes);
  const patternLocks=Object.hasOwn(document,'patternLocks')?checkedPatternLocks(document.patternLocks):[];
  const imported=new SuperJ6Banks(document.superJ6Banks);
  const refs=new Set();array(document.parameters,this.parameters.size+imported.fieldCount);
  for(const entry of document.parameters){
   keys(entry,['id','value']);
   const {id,value}=entry,spec=this.parameters.get(id)??imported.spec(id);
   if(!spec||refs.has(id)||!Number.isFinite(value)||value<spec.min||value>spec.max)fail('unqualified parameter ref/raw value');
   const sj6=superJ6Spec(id)??imported.spec(id);
   const valid=sj6?acceptsSuperJ6(sj6,value):
    value===spec.value||Math.abs((value-spec.min)/spec.step-Math.round((value-spec.min)/spec.step))<=1e-6;
   if(!valid)fail('unqualified parameter ref/raw value');
   refs.add(id);
  }
  keys(document.motion,['target','values']);if(document.motion.target!==MOTION)fail('unsupported Motion target');array(document.motion.values,16,16);if(document.motion.values.some(v=>v!==null&&!int(v,0,127)))fail('Motion point');
  array(document.launch,5,5);if(document.launch.some(v=>v!==null&&!int(v,0,31)))fail('Launch target');
  array(document.song,MAX_SONG_ROWS);for(const row of document.song){keys(row,['patterns','repeats'],['muteMask']);array(row.patterns,5,5);if(row.patterns.some(v=>!int(v,0,31))||!int(row.repeats,1,8)||(Object.hasOwn(row,'muteMask')&&!int(row.muteMask,0,31)))fail('Song row');}
  array(document.soundBanks,2,2);if(document.soundBanks.some(b=>b!=='JUNO'&&!SOUND_BANKS.includes(b)))fail('unsupported local bank');
  const c=document.context;keys(c,['part','view','mode','lane','zoom','selected','selection','drumVoice','motionSelected','multi','drumEdit'],['lockTarget','breakView']);
  if(Object.hasOwn(c,'breakView') && (c.view!=='roll' || c.part!=='breaks' ||
     (c.breakView!=='notes' && !(c.breakView==='generator' && int(document.launch[4],0,31)))))fail('invalid BREAK editor context');
  if(Object.hasOwn(c,'lockTarget')&&(c.lane!=='patternLock'||!Number.isInteger(c.lockTarget)||!lockField(c.part,document.soundBanks,c.view,c.lockTarget)))fail('invalid lock target context');
  array(c.selection,document.notes.length);if(new Set(c.selection).size!==c.selection.length||c.selection.some(id=>!ids.has(id))||c.selected!==null&&!ids.has(c.selected)||!TRACKS.includes(c.part)||!VIEWS.includes(c.view)||!['auto','select','move','draw','length','pan'].includes(c.mode)||(!['velocity','chance','pitch','pan'].includes(c.lane)&&!viewStepFields(c.part,c.view).includes(c.lane)&&!(c.lane==='patternLock'&&lockField(c.part,document.soundBanks,c.view)))||!validRollZoom(c.zoom)||!int(c.drumVoice,0,10)||!int(c.motionSelected,0,15)||typeof c.multi!=='boolean'||typeof c.drumEdit!=='boolean')fail('unsupported editor context');
  // Normalize property order so an equivalent reordered file has the same snapshot semantics.
  return{schema:SCHEMA,kind:KIND,identity:clone(this.identity),notes:document.notes.map(n=>{const a={};for(const k of['id','track','note','velocity','channel','start','end','sourceOrder','pulse','chance','pan','pitchOffset'])if(Object.hasOwn(n,k))a[k]=n[k];return a;}),parameters:clone(document.parameters),...(Object.keys(stepLanes).length?{stepLanes}:{}),...(patternLocks.length?{patternLocks}:{}),...(imported.banks.size?{superJ6Banks:imported.snapshot()}:{}),...(Object.hasOwn(document,'breakSequence')?{breakSequence:validateBreakSequence(document.breakSequence)}:{}),motion:{target:MOTION,values:[...document.motion.values]},launch:[...document.launch],song:document.song.map(r=>({patterns:[...r.patterns],repeats:r.repeats,...(r.muteMask?{muteMask:r.muteMask}:{})})),soundBanks:[...document.soundBanks],context:clone(c)};
 }
 capture(state,context){if(state.model.gesture||state.motion.gesture||state.breakChanceLane?.gesture||state.stepValueLane?.gesture)fail('finish or cancel active gesture before saving');return this.validate({schema:SCHEMA,kind:KIND,identity:this.identity,...(state.stepLanes?{stepLanes:state.stepLanes}:{}),...(state.patternLocks?.length?{patternLocks:state.patternLocks}:{}),...(state.superJ6Banks?.banks.size?{superJ6Banks:state.superJ6Banks.snapshot()}:{}),...(state.breakSequence&&!same(state.breakSequence,emptyBreakSequence())?{breakSequence:state.breakSequence}:{}),notes:state.model.notes,parameters:[...state.parameterDraft].map(([id,value])=>({id,value})),motion:{target:MOTION,values:state.motion.values},launch:state.launch.targets,song:state.arrangement.rows,soundBanks:state.soundBanks,context});}
 encode(document){const text=JSON.stringify(this.validate(document),null,2)+'\n';checkDraftFileSize(new TextEncoder().encode(text).length);return text;}
 decode(text){return this.validate(parse(text));}
}
export function installWorkspaceDraft(state,codec,document,{keepSession=false}={}){
 // Complete validation/allocation precedes every write. Never infer a native transaction.
 const d=codec.validate(document),imported=new SuperJ6Banks(d.superJ6Banks),notes=clone(d.notes),next=(1+Math.max(-1,...notes.filter(n=>n.id.startsWith('draft')).map(n=>Number(n.id.slice(5)))))%(MAX_DRAFT_ID+1),selection=new Set(d.context.selection),parameters=new Map(d.parameters.map(p=>[p.id,p.value])),identities=new Map(d.parameters.map(p=>{const s=codec.parameters.get(p.id)??imported.spec(p.id);return[p.id,{label:s.label,context:s.context}];}));
 if(state.superJ6Banks) {
  if(keepSession)imported.originalFiles=state.superJ6Banks.originalFiles;
  Object.assign(state.superJ6Banks,imported);
 }
 state.breakChanceLane?.cancel();
 state.stepValueLane?.cancel();
 if(state.patternLocks || d.patternLocks){const rows=state.patternLocks??=[];rows.splice(0,rows.length,...(d.patternLocks??[]));}
 if(state.stepLanes || d.stepLanes)replaceStepRows(state.stepLanes??={},d.stepLanes??{});
 if(state.breakSequence)installBreakSequence(state.breakSequence,d.breakSequence??emptyBreakSequence());
 state.model.cancelAll();state.motion.cancel();state.model._notes=notes;state.model.next=next;state.model.selection=selection;
 if(!keepSession)state.model.clipboard=null;
 // A discard is a command in the current session; opening a file starts a new one.
 if(!keepSession)for(const m of[state.model,state.motion,state.arrangement]){m.history=[];m.future=[];}
 state.motion.values=d.motion.values;state.arrangement.rows=d.song;state.launch.targets=d.launch;state.soundBanks.splice(0,2,...d.soundBanks);
 state.parameterDraft.clear();for(const[k,v]of parameters)state.parameterDraft.set(k,v);state.parameterIdentity.clear();for(const[k,v]of identities)state.parameterIdentity.set(k,v);
 if(!keepSession){state.timeline.past=[];state.timeline.future=[];}
 return d.context;
}
export function hasDraftChanges(state,codec){
 if(state.model.gesture||state.motion.gesture||state.breakChanceLane?.gesture||state.stepValueLane?.gesture||state.patternLocks?.length||Object.keys(state.stepLanes??{}).length||state.superJ6Banks?.banks.size)return true;
 return state.parameterDraft.has(legacyBreakChanceId)||!!state.breakSequence&&!same(state.breakSequence,emptyBreakSequence())||!same(state.model.notes,codec.original)||[...state.parameterDraft].some(([id,value])=>value!==codec.parameters.get(id)?.value)||state.motion.values.some(v=>v!==null)||state.arrangement.rows.length>0||state.launch.targets.some(v=>v!==null)||!same(state.soundBanks,['CHICAGO','MIAMI']);
}
