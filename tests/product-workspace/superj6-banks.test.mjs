// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SuperJ6Banks,readSuperJ6Bank,readSuperJ6Original} from '../../web/product-site/remote/superj6-banks.mjs';
import {renderSuperJ6,SUPERJ6_PROGRAM,superJ6Spec} from '../../web/product-site/remote/superj6.mjs';

const bankId='1664F450-5DBE-42BB-9658-C6FFC459E67D', first='0FECC001-DB40-473D-96B7-F91BDE6BDAFE', second='E83DA9F1-4185-4E84-81E9-973CB62A5902';
function program(uid,name,fields) {
  return {uid,name,parameterValues:Object.entries(fields).map(([identifier,value])=>({identifier,value}))};
}
function example() {
  return {uuid:bankId,name:'A & B',midiBankChangeNumber:0,canDelete:true,presets:[
    program(first,'Square <one>',{neonlayer1Waveform:1,neonsubVolume:0,neonlfo1Rate:.5}),
    program(second,'Layer two',{neonlayer2Waveform:0,neonlayer2PWMEnable:0,neonlayer2PWM:0}),
  ]};
}
const asFile = value => new Blob([typeof value==='string'?value:JSON.stringify(value)]);
test('locally opened bank preserves zero, absent fields, escaped names and source-qualified identities',async()=>{
  const file=asFile(example()), bank=await readSuperJ6Bank(file);
  assert.equal(bank.digest,createHash('sha256').update(new Uint8Array(await file.arrayBuffer())).digest('hex'));
  const library=new SuperJ6Banks(), action=library.choose(0,[bank.digest,first],bank);
  const group=library.view(0).fields;
  assert.equal(group.size,3);assert.equal(group.get(202).value,0);assert.equal(group.has(78),false);
  const html=renderSuperJ6(0,new Map(),library);
  assert.match(html,/Square &lt;one&gt;/);
  assert.match(html,/data-sj6-absent="78"/);
  assert.match(html,/data-sj6-glyph="82"><\/span>/);
  assert.match(html,/data-sj6-display="88">50% position/);
  assert.doesNotMatch(html,/data-native-param|data-param=|data-sj6-field="210"/);
  const field=group.get(82);
  assert.equal(library.spec(field.id),field);
  assert.equal(library.spec(field.id.replace('|82','|082')),undefined);
  assert.equal(library.view(1),undefined);
  const select=library.choose(1,[bank.digest,second]);
  assert.equal(library.view(1).fields.get(211).value,0);
  const snapshot=library.snapshot(),restored=new SuperJ6Banks(snapshot);
  assert.equal(restored.spec(field.id).value,1);assert.deepEqual(restored.snapshot(),snapshot);
  select.undo();action.undo();assert.equal(library.snapshot(),undefined);
  action.redo();select.redo();assert.deepEqual(library.snapshot(),snapshot);
});
test('an imported tempo-synced rate uses its own mode and keeps the original float on copy',async()=>{
  const source=example();
  source.presets[0].parameterValues.push({identifier:'neonlfo1HzEnable',value:0});
  const text=JSON.stringify(source),file=new File([text],'Original.superj6.bank.json');
  const original=await readSuperJ6Original(file),library=new SuperJ6Banks();
  library.choose(1,[original.bank.digest,first],original.bank);
  library.retainOriginal(1,original);
  const edits=new Map(),fields=library.view(1).fields;
  assert.match(renderSuperJ6(1,edits,library),/data-sj6-display="88">4\/3 beats</);
  edits.set(fields.get(195).id,1);
  assert.match(renderSuperJ6(1,edits,library),/data-sj6-display="88">1\.591 Hz</);
  edits.clear();
  assert.equal(Buffer.from(library.copy(1,edits).bytes).toString(),text);
});

test('malformed and ambiguous banks fail before the active bank or owner changes',async()=>{
  const file=asFile(example()),bank=await readSuperJ6Bank(file),library=new SuperJ6Banks();
  library.choose(0,[bank.digest,first],bank);
  const before=JSON.stringify(library.snapshot());
  const mutations=[
    b=>b.presets.push(b.presets[0]), b=>b.presets[0].parameterValues.push(b.presets[0].parameterValues[0]),
    b=>b.presets[0].parameterValues[0].value=.25,b=>b.presets[0].parameterValues[0].value=-1e-9,
    b=>b.presets[0].uid='invalid',b=>delete b.canDelete,
  ];
  for(const mutate of mutations){const b=example();mutate(b);await assert.rejects(readSuperJ6Bank(asFile(b)));}
  await assert.rejects(readSuperJ6Bank(asFile(JSON.stringify(example()).replace('"uuid":','"uuid":"x","uuid":'))));
  await assert.rejects(readSuperJ6Bank(new Blob([new Uint8Array([255])])));
  assert.throws(()=>library.choose(1,[bank.digest,'unknown']));
  for(const mutate of [
    s=>s.selected[0][1]=second+'wrong',s=>s.banks[0].programs[0].values[82]=.2,
    s=>s.banks[0].programs[1].id=first,s=>s.banks[0].programs[0].values['__invalid__']=1,
  ]){const s=structuredClone(library.snapshot());mutate(s);assert.throws(()=>new SuperJ6Banks(s));}
  assert.equal(JSON.stringify(library.snapshot()),before);
});
test('copies edit only the selected bass and bank’s existing value tokens across programs',async()=>{
  const template=JSON.stringify(example(),null,2)
    .replace('"midiBankChangeNumber": 0','"unknown": {"text":"雪💿", "large":987654321012345678901, "v":-0.000E+03},\r\n  "midiBankChangeNumber": 0')
    .replace('"neonlfo1Rate",\n          "value": 0.5','"neonlfo1Rate",\n          "value": 5.00000e-1')
    .replace('"neonlayer2PWM",\n          "value": 0','"neonlayer2PWM",\n          "value": -0.0');
  const filename='音.superj6.bank.json';
  const read=async text=>readSuperJ6Original(new File([text],filename));
  const source=await read(template),other=await read(template+'\n'),library=new SuperJ6Banks(),bank=source.bank;
  const originals=slot=>Buffer.from(library.copy(slot,edits).bytes).toString(),edits=new Map();
  for(const slot of [0,1]){
    library.choose(slot,[bank.digest,first],slot?null:bank);library.retainOriginal(slot,source);
    assert.equal(originals(slot),template);assert.equal(library.copy(slot,edits).filename,filename);
  }
  const rate=library.view(0).fields.get(88),otherOwner=library.view(1).fields.get(88);
  edits.set(rate.id,.25);edits.set(otherOwner.id,.75);
  library.choose(0,[bank.digest,second]);edits.set(library.view(0).fields.get(79).id,.5);
  const expected=template.replace('5.00000e-1','0.25').replace('"neonlayer2PWM",\n          "value": -0.0','"neonlayer2PWM",\n          "value": 0.5');
  assert.notEqual(template,expected);assert.equal(originals(0),expected);
  assert.equal(originals(1),template.replace('5.00000e-1','0.75'));
  const updated=await read(originals(0));assert.deepEqual(updated.bank.programs.map(p=>p.values),[{82:1,88:.25,202:0},{79:.5,83:0,211:0}]);
  assert.throws(()=>library.retainOriginal(0,other),/same original/);assert.equal(originals(0),expected);
  const oldChoice=library.selected[0];library.choose(0,[other.bank.digest,first],other.bank);
  assert.equal(library.originalFor(0),undefined);library.retainOriginal(0,other);assert.equal(originals(0),template+'\n');
  library.choose(0,oldChoice);assert.equal(originals(0),expected); // Bass B retains these identical source bytes.
  library.choose(1,[other.bank.digest,first]);library.retainOriginal(1,other);
  assert.equal(library.originalFor(0),undefined);assert.throws(()=>originals(0),/reopen/);
  library.retainOriginal(0,source);edits.set(rate.id,rate.value);edits.delete(library.view(0).fields.get(79).id);assert.equal(originals(0),template);
  const snapshot=library.snapshot();assert.ok(!JSON.stringify(snapshot).includes('987654321012345678901'));
  const restored=new SuperJ6Banks(snapshot);assert.equal(restored.originalFor(0),undefined);
  restored.retainOriginal(0,source);assert.equal(Buffer.from(restored.copy(0,edits).bytes).toString(),template);
  const tampered=structuredClone(snapshot);tampered.banks[0].programs[0].name='different';
  assert.throws(()=>new SuperJ6Banks(tampered).retainOriginal(0,source),/differs/);
});
if(process.env.DNBOX_SUPERJ6_ARCHIVE){
  test('12 original bank files open and all 640 programs retain the recorded field presence and binary32 words',async()=>{
    const archive=process.env.DNBOX_SUPERJ6_ARCHIVE;
    assert.equal(createHash('sha256').update(readFileSync(archive)).digest('hex'),'ab702e00b4cc425c9406b9b2b44e68ba0f40e1125d591fcaa422cc6a8c6272b8');
    const entries=execFileSync('unzip',['-Z1',archive],{encoding:'utf8'}).split('\n').filter(n=>/^J6presets\/[^/]+\.superj6\.bank\.json$/.test(n));
    const identifiers={78:'layer1PWM',79:'layer2PWM',82:'layer1Waveform',83:'layer2Waveform',88:'lfo1Rate',96:'lfo2Rate',
      100:'lfo3Rate',195:'lfo1HzEnable',196:'lfo2HzEnable',197:'lfo3HzEnable',202:'subVolume',210:'layer1PWMEnable',211:'layer2PWMEnable'};
    const library=new SuperJ6Banks();let count=0,present=0,complete=0;
    for(const path of entries){
      const bytes=execFileSync('unzip',['-p',archive,path],{maxBuffer:4*1024*1024});
      const source=await readSuperJ6Original(new File([bytes],path.split('/').at(-1))),bank=source.bank,original=JSON.parse(bytes);
      library.choose(0,[bank.digest,bank.programs[0].id],bank);
      library.retainOriginal(0,source);
      assert.deepEqual(Buffer.from(library.copy(0,new Map()).bytes),bytes);
      if(bank.id===SUPERJ6_PROGRAM.bankId){
        const builtin=new SuperJ6Banks();builtin.retainOriginal(1,source);
        library.choose(0,[bank.digest,SUPERJ6_PROGRAM.programId]);
        const a=library.view(0).fields.get(78),aValue=a.value===.25?.5:.25;
        const bId=a.id.replace('/0/','/1/'),bValue=.75;
        const edits=new Map([[a.id,aValue],[bId,bValue]]);
        const authored=(slot,lib)=>JSON.parse(Buffer.from(lib.copy(slot,edits).bytes));
        for(const [slot,lib,want] of [[0,library,aValue],[1,builtin,bValue]]){
          const expected=structuredClone(original);
          expected.presets.find(p=>p.uid===SUPERJ6_PROGRAM.programId).parameterValues.find(v=>v.identifier==='neonlayer1PWM').value=want;
          assert.deepEqual(authored(slot,lib),expected);
        }
      }
      for(const [i,row] of original.presets.entries()){
        const values=new Map(row.parameterValues.map(p=>[p.identifier,p.value]));
        const program=bank.programs[i];assert.equal(program.id,row.uid);assert.equal(program.name,row.name);
        library.choose(0,[bank.digest,program.id]);
        const fields=library.view(0).fields;
        for(const [id,key] of Object.entries(identifiers)){
          const originalName='neon'+key;assert.equal(fields.has(+id),values.has(originalName));
          if(values.has(originalName)){assert.equal(fields.get(+id).value,Math.fround(values.get(originalName)));present++;}
        }
        if(program.id===SUPERJ6_PROGRAM.programId){for(const spec of fields.values())assert.equal(superJ6Spec(spec.id),spec);}
        if(fields.size===13)complete++;count++;
      }
    }
    assert.deepEqual([entries.length,count,present,complete],[12,640,5860,25]);
    const restored=new SuperJ6Banks(library.snapshot());assert.deepEqual(restored.snapshot(),library.snapshot());
  });
}
