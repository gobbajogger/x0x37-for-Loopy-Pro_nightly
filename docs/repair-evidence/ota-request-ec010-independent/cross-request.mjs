import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const paths=process.argv.slice(2), input=JSON.parse(readFileSync(0,'utf8'));
const body=path=>readFileSync(path,'utf8').match(/function parseRequest\(pkt\) \{[\s\S]*?\n\}/)[0];
assert.equal(body(paths[0]),body(paths[1]));
for(const path of paths){
 const {pack7,unpack7,Updater}=await import(pathToFileURL(path));
 const parse=new Function('pack7','unpack7',body(path)+';return parseRequest;')(pack7,unpack7);
 for(const c of input.cases)assert.deepEqual(parse(c.frame),c.expected,c.label);
 const finish=input.cases.find(c=>c.expected?.addr===0xf0000000).frame;
 const packets=input.cases.filter(c=>c.expected===null).map(c=>c.frame).concat([finish]),sent=[],progress=[];
 const result=await new Updater({inputs:new Map(),outputs:new Map()}).serve({lost:false,read:async()=>packets.shift()??null,send:p=>{sent.push(p);return true;}},new Uint8Array(16),0xf0000000,1000,(...a)=>progress.push(a));
 assert.equal(result.served,0);assert.equal(result.finished,true);assert.equal(sent.length,1);assert.equal(progress.length,0);
 function request(fl,addr,n){const u=[0,0x59,0x30,8,0,0,fl,addr&255,addr>>>8&255,addr>>>16&255,addr>>>24&255,n&255,n>>>8&255,n>>>16&255];return [0xf0,...pack7([...u,~u.slice(6).reduce((a,b)=>a+b,0)&255]),0xf7];}
 const ps=[request(0x81,1,4),request(0x7f,8,8),finish],replies=[];
 const canonical=await new Updater({inputs:new Map(),outputs:new Map()}).serve({lost:false,read:async()=>ps.shift()??null,send:p=>{replies.push(p);return true;}},Uint8Array.from({length:16},(_,i)=>i),0xf0000000,1000);
 assert.equal(canonical.served,2);assert.equal(canonical.finished,true);assert.deepEqual(replies,input.replies,'real JS/Python serve response parity');
 console.log(`PASS ${path}: ${input.cases.length} parser cases; malformed batch serves no data/progress; real canonical two-chunk replies equal Python`);
}
