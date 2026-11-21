// SPDX-License-Identifier: GPL-3.0-only
// Measured fields of one original preset. The upstream waveform/PWM audit is
// experiments/sound-hardware-v1/sj6-amp2/oscillator-prenote.tar.gz at
// gobbajogger/DnBOX 7e68fc39608d88441d2923277b53364f1d5248bf.
// Other fields of the original program and the original engine are not included.
export const SUPERJ6_PROGRAM = Object.freeze({
  bank:'Intro Bank', name:'PWM String Pad',
  bankId:'84B1A8EB-BA34-4B8B-B3BE-6FE8CADB40DA',
  programId:'4DBA5169-1A26-45B7-9A8C-BE968BB2EA36',
  bankArchiveSha256:'ab702e00b4cc425c9406b9b2b44e68ba0f40e1125d591fcaa422cc6a8c6272b8',
});
export const SOUND_BANKS=Object.freeze(['CHICAGO','MIAMI','Synth One','SuperJ6']);
export const sourceOnlyBank=bank=>bank==='SuperJ6'||bank==='Synth One';
export const WAVE_STOPS=Object.freeze([0,Math.fround(1/3),Math.fround(2/3),1]);
const waveNames=['Sine','Triangle','Saw','Square'];

// Durations in quarter-note beats per LFO cycle. Original Conductor build 9
// scales BPM/60 by factor/4. Its two truncated factors .3333 and .1667
// produce approximately 12 and 24 beats. Labels describe those durations.
// DnBOX 74b50bdfe2e1d9ac7f22445cdf5ab3726bb85272,
// experiments/superj6-conductor-source-20261115/lfo_laws.cpp, lfo_rate.
const tempoPeriods = [
  '1/16 beat','1/12 beat','1/8 beat','1/6 beat','1/4 beat','1/3 beat',
  '1/2 beat','2/3 beat','1 beat','4/3 beats','2 beats','8/3 beats',
  '4 beats','8 beats','≈12 beats','16 beats','≈24 beats','32 beats',
];
function tempoIndex(value) {
  // The source subtracts and multiplies separately in binary32, then rounds
  // a positive half upward. For example exactly .5 still selects 4/3 beats.
  return Math.round(Math.fround(Math.fround(1-value)*17));
}
// The Conductor returns a binary32 frequency after evaluating the Hz curve.
const lfoHz = value => Math.fround(16 * Math.pow(value, 3.33));
const sections=[
  ['Layer 1',[[82,'Wave','wave',1],[210,'PWM','enable',1],[78,'Width','width',0.1263203]]],
  ['Layer 2',[[83,'Wave','wave',1],[211,'PWM','enable',1],[79,'Width','width',0.50431365]]],
  ['Sub',[[202,'Level','level',0.10799015]]],
  ['LFO 1',[[195,'Mode','mode',1],[88,'Rate','rate',0.19909006]]],
  ['LFO 2',[[196,'Mode','mode',0],[96,'Rate','rate',0.20779613]]],
  ['LFO 3',[[197,'Mode','mode',1],[100,'Rate','rate',0.27862325]]],
];
const specs=new Map();
export function superJ6Fields(slot,program,values,prefix) {
  const byField=new Map();
  for(const [section,fields] of sections) for(const [field,label,kind,raw] of fields) {
    if(values && !Object.hasOwn(values,field))continue;
    const id=prefix+'|'+field;
    byField.set(field,Object.freeze({id,field,label,kind,section,slot,
      value:values?values[field]:Math.fround(raw),
      context:'Bass '+(slot?'B':'A')+' / SuperJ6 / '+program+' / '+section,
      min:0,max:1,step:kind==='wave'?1/3:kind==='enable'||kind==='mode'?1:2**-149}));
  }
  return byField;
}
const {bankArchiveSha256,bankId,programId}=SUPERJ6_PROGRAM;
const slots=[0,1].map(slot=>superJ6Fields(slot,SUPERJ6_PROGRAM.name,null,
  'superj6/'+bankArchiveSha256+'/'+slot+'/'+bankId+'/'+programId));
for(const fields of slots)for(const spec of fields.values())specs.set(spec.id,spec);
export const superJ6Specs=Object.freeze([...specs.values()]);
export const superJ6Spec=id=>specs.get(id);
export function acceptsSuperJ6(spec,value) {
  if(!spec||!Number.isFinite(value)||value<0||value>1||Math.fround(value)!==value)return false;
  if(spec.kind==='wave')return WAVE_STOPS.includes(value);
  if(spec.kind==='enable'||spec.kind==='mode')return value===0||value===1;
  return true;
}
const current=(spec,edits)=>edits.get(spec.id)??spec.value;
const read=(fields,field,edits)=>fields.has(field)?current(fields.get(field),edits):undefined;
const decimal=(v,places)=>Number(v.toFixed(places)).toString();
function duty(fields,layer,edits) {
  const enabled=read(fields,layer?211:210,edits),width=read(fields,layer?79:78,edits);
  if(enabled===0)return .5;
  if(enabled===1 && width!==undefined)return .5-.47*width;
  return undefined;
}
export function superJ6Text(spec,value,edits,fields=slots[spec.slot]) {
  switch(spec.kind) {
    case 'wave':return waveNames[WAVE_STOPS.indexOf(value)];
    case 'enable':return value?'On':'Off';
    case 'mode':return value?'Hz':'Tempo';
    case 'level':return decimal(100*value,2)+'%';
    case 'width':return decimal(50-47*value,2)+'% duty';
    case 'rate':{
      const mode=read(fields,{88:195,96:196,100:197}[spec.field],edits);
      if(mode===undefined)return decimal(100*value,2)+'% position';
      return mode ? decimal(lfoHz(value),3)+' Hz' : tempoPeriods[tempoIndex(value)];
    }
  }
}
function glyph(spec,value,edits,fields) {
  const line=(points)=>'<svg aria-hidden="true" viewBox="0 0 64 24"><polyline points="'+points+'"/></svg>';
  const position=(u=value)=>line('2,19 '+decimal(2+60*u,2)+',19');
  if(spec.kind==='enable'||spec.kind==='mode')return line(value?'5,19 29,19 32,5 59,5':'5,19 59,19');
  if(spec.kind==='level')return position();
  if(spec.kind==='rate') {
    const mode=read(fields,{88:195,96:196,100:197}[spec.field],edits);
    if(mode===0)return position(1-tempoIndex(value)/17);
    if(mode===undefined)return position();
    const hz=lfoHz(value);
    return line(Array.from({length:61},(_,x)=>(2+x)+','+decimal(12-8*Math.sin(2*Math.PI*x/60*hz*.25),2)).join(' '));
  }
  const layer=spec.section==='Layer 2';
  const shape=spec.kind==='width'?3:WAVE_STOPS.indexOf(value);
  if(shape===0)return line(Array.from({length:61},(_,x)=>(2+x)+','+decimal(12-8*Math.sin(x*Math.PI/30),2)).join(' '));
  if(shape===1)return line('2,12 17,3 47,21 62,12');
  if(shape===2)return line('2,21 31,3 31,21 62,3');
  const width=spec.kind==='width'?.5-.47*value:duty(fields,layer,edits);
  if(width===undefined)return ''; // Original file has no pulse-width setting.
  const edge=decimal(2+60*width,2);
  return line('2,20 2,4 '+edge+',4 '+edge+',20 62,20');
}
function editor(spec,value,edits,fields) {
  const attributes='data-sj6-field="'+spec.field+'" data-sj6-id="'+spec.id+'" aria-label="'+spec.section+' '+spec.label+'"';
  let options;
  if(spec.kind==='wave')options=WAVE_STOPS.map((stop,i)=>[stop,waveNames[i]]);
  if(spec.kind==='enable')options=[[0,'Off'],[1,'On']];
  if(spec.kind==='mode')options=[[0,'Tempo'],[1,'Hz']];
  if(options)return '<select '+attributes+'>'+options.map(([v,name])=>'<option value="'+v+'"'+(value===v?' selected':'')+'>'+name+'</option>').join('')+'</select>';
  return '<input type="range" '+attributes+' aria-valuetext="'+superJ6Text(spec,value,edits,fields)+'" min="0" max="1" step="any" value="'+value+'">';
}
const escapeText=value=>value.replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
function bankPicker(library,slot) {
  if(!library)return '';
  const selected=library.selected[slot],bank=selected&&library.banks.get(selected[0]);
  const option=(id,name,selected)=>'<option value="'+id+'"'+(selected?' selected':'')+'>'+escapeText(name)+'</option>';
  const banks=library.banks.size?'<label>Bank <select data-sj6-bank>'+
    option('',SUPERJ6_PROGRAM.bank+' · built-in',!selected)+
    [...library.banks.values()].map(b=>option(b.digest,b.name,b===bank)).join('')+'</select></label>':'';
  const programs=bank?'<label>Program <select data-sj6-program>'+
    bank.programs.map(p=>option(p.id,p.name,p.id===selected[1])).join('')+'</select></label>':'';
  return '<div class="sj6-bank-picker">'+banks+programs+
    '<button type="button" data-sj6-open>Open original</button><input type="file" data-sj6-file hidden accept=".json,application/json">'+
    '<button type="button" data-sj6-save'+(library.originalFor(slot)?'':' title="Choose the matching original bank file to save a copy"')+'>Save a copy</button>'+
    '<input type="file" data-sj6-reopen hidden accept=".json,application/json"></div>';
}
export function renderSuperJ6(slot,edits,library) {
  const active=library?.view(slot),byField=active?.fields??slots[slot];
  return '<section data-superj6 aria-label="SuperJ6 Draft"><header><h3>'+escapeText(active?.name??SUPERJ6_PROGRAM.name)+'</h3><span>'+
    escapeText(active?.bank??SUPERJ6_PROGRAM.bank)+' · Draft</span></header>'+
    '<div class="sj6-groups">'+sections.map(([section,fields])=>'<fieldset><legend>'+section+'</legend>'+
      fields.map(([field,label])=>{
        const spec=byField.get(field);
        if(!spec)return '<div class="sj6-unit" data-sj6-absent="'+field+'"><span>'+label+'</span><output>Not stored</output></div>';
        const value=current(spec,edits);
        return '<label class="sj6-unit"><span>'+spec.label+'</span><span data-sj6-glyph="'+field+'">'+glyph(spec,value,edits,byField)+'</span>'+
          '<output data-sj6-display="'+field+'">'+superJ6Text(spec,value,edits,byField)+'</output>'+editor(spec,value,edits,byField)+'</label>';
      }).join('')+'</fieldset>').join('')+'</div>'+bankPicker(library,slot)+'</section>';
}
export function paintSuperJ6(root,slot,edits,library) {
  const byField=library?.view(slot)?.fields??slots[slot];
  for(const spec of byField.values()){
    const value=current(spec,edits),out=root.querySelector('[data-sj6-display="'+spec.field+'"]'),art=root.querySelector('[data-sj6-glyph="'+spec.field+'"]');
    const text=superJ6Text(spec,value,edits,byField);
    if(out)out.textContent=text;
    const input=root.querySelector('input[data-sj6-field="'+spec.field+'"]');
    if(input)input.setAttribute('aria-valuetext',text);
    if(art)art.innerHTML=glyph(spec,value,edits,byField);
  }
}
