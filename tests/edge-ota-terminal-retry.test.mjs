// SPDX-License-Identifier: GPL-3.0-only
import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import {otaRuntimes} from './ota-runtime-fixtures.mjs';
for (const [variant, code] of otaRuntimes) {
const test=(name,fn)=>nodeTest(variant+': '+name,fn);
const {Updater,pack7,Link,openMidiPort}=await import('data:text/javascript;base64,'+Buffer.from(code+'\nexport {Updater,pack7,Link,openMidiPort};').toString('base64'));
function req(addr,len=8){const b=[0,89,48,8,0,0,0,addr&255,addr>>>8&255,addr>>>16&255,addr>>>24,len,0,0];b.push(~b.slice(6).reduce((a,b)=>a+b,0)&255);return [240,...pack7(b),247]}
function setup(){const input={name:'SMK-37 Pro',state:'connected'};let sent=[];const output={name:input.name,state:'connected',send(b){sent.push(b)}};const u=new Updater({inputs:new Map([['i',input]]),outputs:new Map([['o',output]]),addEventListener(){},removeEventListener(){}});const l=new Link(input,output);u.bind({link:l,name:input.name,id:{model:'SMK-37 Pro',text:'SMK-37 Pro_900'}});return{u,l,sent};}
async function completed(marker=0xf0000000){const x=setup();x.l.q.push(req(0),req(marker));assert.equal((await x.u.serve(x.l,new Uint8Array(32),marker,100)).finished,true);return x;}
test('both current/legacy protocol terminal stages can retry, without marking verified',async()=>{for(const marker of [0xe0000000,0xf0000000]){const {u,l,sent}=await completed(marker);for(let i=0;i<3;i++)assert.equal(u.retryFinish(l,req(marker)),true);assert.equal(sent.length,5);assert.equal(u.verified,false);}});
test('uncompleted stage receives no retry token',()=>{const{u,l,sent}=setup();assert.equal(u.retryFinish(l,req(0xf0000000)),false);assert.equal(sent.length,0)});
test('malformed length and other terminal stage rejected',async()=>{const{u,l,sent}=await completed();for(const packet of [req(0xf0000000,7),req(0xe0000000)])assert.throws(()=>u.retryFinish(l,packet),{code:'badreq'});assert.equal(sent.length,2)});
test('ordinary and malformed request never causes replay',async()=>{const{u,l,sent}=await completed();assert.equal(u.retryFinish(l,req(0)),false);const bad=req(0xf0000000);bad[4]^=1;assert.equal(u.retryFinish(l,bad),false);assert.equal(sent.length,2)});
test('other port pair and expired context cannot receive replay',async()=>{const{u,l,sent}=await completed();assert.equal(u.retryFinish({...l,input:{}},req(0xf0000000)),false);u.finishRetry.until=Date.now()-1;assert.equal(u.retryFinish(l,req(0xf0000000)),false);assert.equal(sent.length,2)});
test('real disconnect causes failure not completion',async()=>{const{u,l}=await completed();l.output.state='disconnected';assert.throws(()=>u.retryFinish(l,req(0xf0000000)),{code:'lost'});assert.equal(u.verified,false)});
test('close clears completion context',async()=>{const{u,l}=await completed();u.close();assert.equal(u.retryFinish(l,req(0xf0000000)),false)});
test('stale Link close preserves discovery handler',()=>{const{l}=setup();const next=new Link(l.input,l.output);l.close();assert.equal(next.lost,false);next.close();assert.equal(next.input.onmidimessage,null)});
test('successful terminal retries do not bypass matching application identity',async()=>{const{u,l}=await completed();u.target={model:'SMK-37 Pro',text:'SMK-37 Pro_900'};u.product='SMK-37 Pro_900';l.close();l.input.open=async()=>{};l.output.open=async()=>{};l.output.send=()=>{const p=new Array(27).fill(0);[...'SMK-37 Elite_900'].forEach((x,i)=>p[i]=x.charCodeAt(0));l.input.onmidimessage({data:[240,...pack7([0,89,17,27,0,0,...p,~p.reduce((a,b)=>a+b,0)&255]),247]})};await assert.rejects(u.find(id=>!id.model.startsWith('ota-')),{code:'model'});assert.equal(u.verified,false);assert.equal(l.input.onmidimessage,null)});

test('queued success lost in transport is answered on discovery retry', async () => {
 const {u,l,sent}=setup();
 l.input.open=async()=>{};l.output.open=async()=>{};
 let delivered=0;
 l.output.send=frame=>{
   if(frame[7]===64) l.input.onmidimessage({data:req(0xf0000000)});
   else if(++delivered>=3) {
     const p=new Array(27).fill(0);
     [...'SMK-37 Pro_900'].forEach((x,i)=>p[i]=x.charCodeAt(0));
     l.input.onmidimessage?.({data:[240,...pack7([0,89,17,27,0,0,...p,~p.reduce((a,b)=>a+b,0)&255]),247]});
   }
 };
 l.q.push(req(0),req(0xf0000000));
 assert.equal((await u.serve(l,new Uint8Array(32),0xf0000000,1000)).finished,true);
 l.close();
 const back=await u.find(id=>!id.model.startsWith('ota-'));
 assert.ok(back,'queued terminal send success must not prevent retry recovery');
 assert.equal(delivered,3);
 assert.equal(u.finishRetry,null);
 assert.equal(u.verified,false,'discovery alone is not installation verification');
 back.link.close();
});
test('real five-second retry cadence survives discovery gaps and observes app at 60 seconds',async t=>{
 const {u,l}=await completed(); l.close();
 u.target={model:'SMK-37 Pro',text:'SMK-37 Pro_900'};
 l.input.open=async()=>{};l.output.open=async()=>{};
 const start=Date.now();let replies=0;const steps=[];
 t.mock.timers.enable({apis:['Date','setTimeout'],now:start});
 const emitIdentity=text=>{const p=new Array(27).fill(0);[...text].forEach((x,i)=>p[i]=x.charCodeAt(0));l.input.onmidimessage?.({data:[240,...pack7([0,89,17,27,0,0,...p,~p.reduce((a,b)=>a+b,0)&255]),247]});};
 l.output.send=frame=>{if(frame[7]===64){if(Date.now()-start>=60000)emitIdentity('SMK-37 Pro_900');}else replies++;};
 // Loader retries independently of identity queries. A connected loader can
 // ignore identity queries while it is waiting for the terminal token.
 for(let n=1;n<=11;n++)setTimeout(()=>l.input.onmidimessage?.({data:req(0xf0000000)}),n*5000);
 let settled=false,error,result;
 u.finishApplication('SMK-37 Pro_900',(...args)=>steps.push(args)).then(x=>{result=x;settled=true},e=>{error=e;settled=true});
 for(let elapsed=0;elapsed<76000&&!settled;elapsed+=100){t.mock.timers.tick(100);await new Promise(resolve=>setImmediate(resolve));}
 assert.equal(error,undefined);assert.equal(settled,true);assert.equal(result,'SMK-37 Pro_900');assert.ok(replies>=1);assert.equal(u.verified,true);assert.deepEqual(steps,[['reboot'],['done','SMK-37 Pro_900']]);assert.equal(l.input.onmidimessage,null);
});


}
