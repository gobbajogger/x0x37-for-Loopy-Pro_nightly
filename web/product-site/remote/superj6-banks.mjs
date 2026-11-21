// SPDX-License-Identifier: GPL-3.0-only
// Drafts store the measured fields. A bass can retain one original file for lossless copies.
import {inspect,superJ6NumericCopy} from '../presets/interchange.mjs';
import {SUPERJ6_PROGRAM, superJ6Specs, superJ6Fields, acceptsSuperJ6} from './superj6.mjs';

const fieldsByName = new Map([
  ['neonlayer1PWM',78], ['neonlayer2PWM',79], ['neonlayer1Waveform',82], ['neonlayer2Waveform',83],
  ['neonlfo1Rate',88], ['neonlfo2Rate',96], ['neonlfo3Rate',100], ['neonlfo1HzEnable',195],
  ['neonlfo2HzEnable',196], ['neonlfo3HzEnable',197], ['neonsubVolume',202],
  ['neonlayer1PWMEnable',210], ['neonlayer2PWMEnable',211],
]);
const originalIntroDigest = 'b7130d817c26809aed3b10acbda07a2a6d39ed5487355d07a0debd8c666c1c78';
const builtInFields = [0,1].map(slot=>new Map(superJ6Specs.filter(s=>s.slot===slot).map(s=>[s.field,s])));
const fieldSpecs = new Map(superJ6Specs.map(spec => [spec.field, spec]));
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const digestPattern = /^[0-9a-f]{64}$/;
const fieldId = /^superj6-bank\/([0-9a-f]{64})\/([01])\/([0-9A-F-]{36})\/([0-9A-F-]{36})\|(\d{1,3})$/;
const byteLimit = 4 * 1024 * 1024;
const maxPrograms = 1024;
function fail(reason) { throw Error('SuperJ6 bank: '+reason); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value,keys) {
  if(!object(value) || Object.keys(value).length!==keys.length || !keys.every(k=>Object.hasOwn(value,k)))fail('unexpected Draft bank fields');
}
function name(value) {
  if(typeof value!=='string' || !value.trim() || value.length>160 || /[\u0000-\u001f\u007f]/.test(value))fail('invalid name');
  return value;
}
function identity(value) {
  if(typeof value!=='string' || !uuid.test(value))fail('invalid bank or program UUID');
  return value.toUpperCase();
}
function boundedList(value, max) {
  if(!Array.isArray(value) || !value.length || value.length>max)fail('invalid record count');
  return value;
}
function checkedValue(id, value) {
  const spec=fieldSpecs.get(id);
  if(!spec || !acceptsSuperJ6(spec,value))fail('invalid value for field '+id);
  return value;
}
function validateBank(bank) {
  exactKeys(bank,['digest','id','name','programs']);
  if(typeof bank.digest!=='string' || !digestPattern.test(bank.digest))fail('missing bank digest');
  const ids=new Set();
  const programs=boundedList(bank.programs,maxPrograms).map(program=>{
    exactKeys(program,['id','name','values']);
    if(!object(program.values))fail('invalid program');
    const id=identity(program.id);
    if(ids.has(id))fail('duplicate program UUID');
    ids.add(id);
    const values={};
    for(const [key,value] of Object.entries(program.values)) {
      if(!/^[1-9]\d{1,2}$/.test(key))fail('unknown field');
      values[key]=checkedValue(Number(key),value);
    }
    return {id,name:name(program.name),values};
  });
  return {digest:bank.digest,id:identity(bank.id),name:name(bank.name),programs};
}
export async function readSuperJ6Original(file) {
  if(!file || !Number.isSafeInteger(file.size) || file.size<1 || file.size>byteLimit)fail('file exceeds 4 MiB or is empty');
  const bytes=await file.arrayBuffer();
  if(bytes.byteLength!==file.size)fail('file size changed');
  const original=new Uint8Array(bytes);
  const doc=inspect(original,'superj6');
  const raw=JSON.parse(new TextDecoder().decode(original));
  if(!object(raw))fail('expected a .superj6.bank.json file');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  const programs=boundedList(raw.presets,maxPrograms).map(record=>{
    if(!object(record))fail('invalid program');
    const values={},seen=new Set();
    for(const item of boundedList(record.parameterValues,1024)) {
      if(!object(item) || typeof item.identifier!=='string' || !Number.isFinite(item.value))fail('invalid parameter');
      if(seen.has(item.identifier))fail('duplicate parameter');
      seen.add(item.identifier);
      const id=fieldsByName.get(item.identifier);
      if(id!==undefined) {
        if(item.value<0 || item.value>1)fail('value outside control range');
        values[id]=checkedValue(id,Math.fround(item.value));
      }
    }
    return {id:record.uid,name:record.name,values};
  });
  const bank=validateBank({digest,id:raw.uuid,name:raw.name,programs});
  return {bank,doc,filename:file.name || bank.name+'.superj6.bank.json'};
}
export async function readSuperJ6Bank(file) {
  return (await readSuperJ6Original(file)).bank;
}

export class SuperJ6Banks {
  constructor(snapshot) {
    this.banks=new Map();
    this.selected=[null,null];
    this.originalFiles=[null,null];
    this.cache=new Map();
    this.records=new Map();
    this.fieldCount=0;
    this.programCount=0;
    if(snapshot===undefined)return;
    exactKeys(snapshot,['banks','selected']);
    if(!Array.isArray(snapshot.selected) || snapshot.selected.length!==2)fail('invalid Draft bank selection');
    for(const raw of boundedList(snapshot.banks,32))this.add(validateBank(raw));
    this.selected=snapshot.selected.map(choice=>{
      if(choice===null)return null;
      if(!Array.isArray(choice) || choice.length!==2 || !this.program(choice[0],choice[1]))fail('unknown selected program');
      return [...choice];
    });
  }
  add(bank) {
    if(this.banks.has(bank.digest))fail('duplicate bank');
    if(this.banks.size>=32 || this.programCount+bank.programs.length>maxPrograms)fail('workspace bank limit');
    this.banks.set(bank.digest,bank);
    this.records.set(bank.digest,new Map(bank.programs.map(program=>[program.id,program])));
    this.programCount+=bank.programs.length;
    this.fieldCount+=bank.programs.reduce((sum,p)=>sum+Object.keys(p.values).length*2,0);
  }
  program(digest,id) { return this.records.get(digest)?.get(id); }
  group(slot,bank,program) {
    // The exact original member and matching baseline use the existing Draft IDs.
    const baseline=builtInFields[slot];
    if(bank.digest===originalIntroDigest && bank.id===SUPERJ6_PROGRAM.bankId && program.id===SUPERJ6_PROGRAM.programId &&
      program.name===SUPERJ6_PROGRAM.name && Object.keys(program.values).length===baseline.size &&
      [...baseline].every(([id,spec])=>program.values[id]===spec.value))return baseline;
    const prefix='superj6-bank/'+bank.digest+'/'+slot+'/'+bank.id+'/'+program.id;
    if(!this.cache.has(prefix))this.cache.set(prefix,superJ6Fields(slot,program.name,program.values,prefix));
    return this.cache.get(prefix);
  }
  copyDigest(slot) {
    if(slot!==0 && slot!==1)fail('unknown bass owner');
    return this.selected[slot]?.[0]??originalIntroDigest;
  }
  retainOriginal(slot,source) {
    if(source.bank.digest!==this.copyDigest(slot))fail('choose the same original bank file for this bass');
    const known=this.banks.get(source.bank.digest);
    if(known && JSON.stringify(known)!==JSON.stringify(source.bank))fail('saved bank differs from the opened file');
    this.originalFiles[slot]=source;
  }
  originalFor(slot) {
    const digest=this.copyDigest(slot);
    return [this.originalFiles[slot],this.originalFiles[1-slot]].find(file=>file?.bank.digest===digest);
  }
  copy(slot,edits) {
    const source=this.originalFor(slot);
    if(!source)fail('reopen the original bank for this bass');
    const {bank,doc,filename}=source,changes=new Map();
    if(edits.size)for(const [index,program] of bank.programs.entries()) {
      const group=this.group(slot,bank,program),record=new Map();
      for(const [key,id] of fieldsByName) {
        const spec=group.get(id);
        if(!spec || !edits.has(spec.id))continue;
        const value=edits.get(spec.id);
        if(!acceptsSuperJ6(spec,value))fail('invalid value for field '+id);
        // Source decimals may differ from their rounded binary32 control baseline.
        if(value!==spec.value)record.set(key,value);
      }
      if(record.size)changes.set(index,record);
    }
    return {filename,bytes:superJ6NumericCopy(doc,changes)};
  }
  fieldsOf(id) {
    if(typeof id!=='string' || !id.startsWith('superj6-bank/'))return;
    const match=fieldId.exec(id);
    if(!match)return;
    const [,digest,slot,bankId,uid]=match,bank=this.banks.get(digest);
    const program=this.program(digest,uid);
    if(bank?.id===bankId && program)return this.group(Number(slot),bank,program);
  }
  spec(id) {
    const fields=this.fieldsOf(id);
    if(!fields)return;
    const spec=fields.get(Number(id.slice(id.lastIndexOf('|')+1)));
    return spec?.id===id?spec:undefined;
  }
  view(slot) {
    const choice=this.selected[slot];
    if(!choice)return;
    const bank=this.banks.get(choice[0]),program=this.program(...choice);
    return {name:program.name,bank:bank.name,fields:this.group(slot,bank,program)};
  }
  snapshot() {
    if(this.banks.size)return {banks:[...this.banks.values()],selected:this.selected.map(row=>row && [...row])};
  }
  choose(slot,choice,newBank) {
    if(slot!==0 && slot!==1)fail('unknown bass owner');
    const prior=this.selected[slot];
    const existing=newBank && this.banks.get(newBank.digest);
    if(existing && JSON.stringify(existing)!==JSON.stringify(newBank))fail('saved bank differs from the opened file');
    const adding=newBank && !this.banks.has(newBank.digest);
    const available=adding?newBank:this.banks.get(choice?.[0]);
    if(choice && (available?.digest!==choice[0] || !available.programs.some(p=>p.id===choice[1])))fail('unknown program');
    if(!adding && (prior===choice || (prior && choice && prior[0]===choice[0] && prior[1]===choice[1])))return;
    const redo=()=>{
      if(adding)this.add(newBank);
      this.selected[slot]=choice;
    };
    const undo=()=>{
      this.selected[slot]=prior;
      if(adding){
        this.banks.delete(newBank.digest);
        this.records.delete(newBank.digest);
        this.programCount-=newBank.programs.length;
        this.fieldCount-=newBank.programs.reduce((sum,p)=>sum+Object.keys(p.values).length*2,0);
        this.cache.clear();
      }
    };
    redo();
    return {label:'SuperJ6 program · Bass '+(slot?'B':'A'),undo,redo};
  }
}
