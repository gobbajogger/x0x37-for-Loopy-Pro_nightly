import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const page=readFileSync(new URL('../web/x0x_breaks.html',import.meta.url),'utf8');
test('sample page uses DnBOX and SMK-37 user-facing names',()=>{
 for(const text of ["<title>DnBOX break loops</title>","href=\"../\">DnBOX</a>","with DnBOX running.","says how DnBOX plays a loop.","The SMK-37 stopped answering.","No SMK-37 running DnBOX found.","This firmware can't send its loops back to the page. Update DnBOX, then connect again.","The SMK-37 couldn't clear its memory.","The SMK-37 couldn't erase its memory.","Writing to the SMK-37 failed.","The SMK-37 didn't accept the loops.","Done. On the SMK-37: BREAK, then EDIT, then LOOP A or LOOP B.","DnBOX builds on X0X and Felucca by Hügelton Instruments (GPL-3.0);"]) assert.ok(page.includes(text),text);
 for(const text of ["<title>X0X break loops</title>","href=\"../\">X0X</a>","with X0X running.","says how X0X plays a loop.","The FM-1 stopped answering.","No FM-1 running X0X found.","This X0X can't send its loops back to the page. Update X0X, then connect again.","The FM-1 couldn't clear its memory.","The FM-1 couldn't erase its memory.","Writing to the FM-1 failed.","The FM-1 didn't accept the loops.","Done. On the FM-1: BREAK, then EDIT, then LOOP A or LOOP B.","`x0x-slots-${stamp","X0X is GPL-3.0, built on Felucca by Hügelton Instruments;"]) assert.ok(!page.includes(text),text);
});

test('actual connect discovers DnBOX SMK models and retains legacy aliases',async()=>{
 const {runInNewContext}=await import('node:vm');
 const connectSource=page.match(/async function connect\(\) \{[\s\S]*?\n\}\n\nfunction unpack7/)[0].replace(/\n\nfunction unpack7$/,'');
 async function probe(name,{state='connected',outputName=name,answer=true}={}){
  let requests=0, opens=0;
  const input={name,state,open:async()=>{opens++;}};
  const output={name:outputName,open:async()=>{opens++;}};
  const context={navigator:{requestMIDIAccess:async()=>({inputs:new Map([[1,input]]),outputs:new Map([[1,output]])})},
   Link:class{constructor(i,o){this.input=i;this.output=o;}async retry(cmd,args,ms){requests++;assert.equal(cmd,1);assert.deepEqual(Array.from(args),[]);assert.equal(ms,1000);if(!answer)throw Error('no answer');}},
   link:null,readOk:false,render(){},say(){}};
  const connect=runInNewContext(connectSource+';connect',context);
  try{await connect();return {ok:true,requests,opens};}catch{return {ok:false,requests,opens};}
 }
 for(const name of ['DnBOX 0.0.26 SMK-37 Elite','DnBOX 0.0.26 SMK-37 Pro','DnBOX 0.0.25 37ELITE','DnBOX 0.0.25 37PRO','X0X 0.0.25.1','Felucca']){
  assert.deepEqual(await probe(name),{ok:true,requests:1,opens:2},name);
 }
 for(const name of ['DnBOX FM-1','DnBOX','DnBOX SMK-37 Unknown','DnBOX 0.0.25 37PROTOTYPE','DnBOX 0.0.25 37ELITES','Other MIDI','']){
  assert.deepEqual(await probe(name),{ok:false,requests:0,opens:0},name);
 }
 assert.equal((await probe('DnBOX 0.0.26 SMK-37 Elite',{state:'disconnected'})).ok,false);
 assert.equal((await probe('DnBOX 0.0.26 SMK-37 Elite',{outputName:'Different port'})).ok,false);
 assert.deepEqual(await probe('DnBOX 0.0.26 SMK-37 Pro',{answer:false}),{ok:false,requests:1,opens:2});
});

test('backup basename is DnBOX while archive extension and upstream credit remain',()=>{
 assert.ok(page.includes('`DnBOX-slots-${stamp'));
 assert.ok(page.includes('}.x0xslots`'));
 assert.ok(page.includes('X0X and Felucca by Hügelton Instruments'));
});

