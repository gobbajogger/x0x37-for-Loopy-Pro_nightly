import test from 'node:test';
import {dom} from './tests/firmware-link-dom.mjs';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {mountFirmwareLink} from '../../web/product-site/remote/firmware-link.mjs';
import {OP,STATUS,encodeCommand,decodeCommand,decodeReply,encodeReply} from '../../web/product-site/remote/device/vendor/codec.mjs';

const dir=fileURLToPath(new URL('./tests/',import.meta.url));
const binary=join(mkdtempSync(join(tmpdir(),'dnr2-remote-')),'fixture');
const coreSha='4f7fae3087e3477d8bf8a65f77c3189dddddd3e1d34b8c264b3b1017578f97d4';
const wireSha='81b4a8729cab7af75bb8495f528d9979d0fc02abbedfba05aaac3f0dae659390';
for(const [name,sha] of [['remote_core.c',coreSha],['remote_wire.c',wireSha]])assert.equal(createHash('sha256').update(readFileSync(join(dir,'c-reference',name))).digest('hex'),sha);
execFileSync('cc',['-std=c11','-Wall','-Wextra','-Werror','-O2','c_fixture.c','c-reference/remote_core.c','c-reference/remote_wire.c','-o',binary],{cwd:dir});

function host(){
 const child=spawn(binary,[],{stdio:['pipe','pipe','pipe']}),lines=createInterface({input:child.stdout});
 let queue=[];
 lines.on('line',line=>{const parsed=JSON.parse(line);queue.shift()?.(parsed);});
 return {send(line){return new Promise(resolve=>{queue.push(resolve);child.stdin.write(line+'\n');});},close(){child.stdin.end();lines.close();child.kill();}};
}
function bundle(controls){
 return {catalog:{crc:0x12345678,count:controls.length,admitted:true,controls},admission:{catalogCrc:0x12345678,sourceSha:coreSha,reviewSha:wireSha,testOnly:true}};
}
const controls=[{id:1,kind:1,min:0,max:1000,label:'Scalar'},{id:2,kind:2,min:-1000,max:1000,label:'Level'},{id:37,kind:3,min:1,max:127,readMin:0,readMax:2,label:'Hold'}];

function midi(fixture,ops,replies,afterReply=async(_command,reply)=>reply){
 const input={state:'connected',type:'input',listeners:[],addEventListener(type,fn){if(type==='midimessage')this.listeners.push(fn);},removeEventListener(type,fn){this.listeners=this.listeners.filter(item=>item!==fn);},open:async()=>{},close:async()=>{},deliver(data){for(const fn of this.listeners)fn({data});}};
 const output={state:'connected',type:'output',open:async()=>{},close:async()=>{},send(bytes){const command=decodeCommand(bytes);ops.push(command.op);fixture.send(Buffer.from(bytes).toString('hex')).then(async reply=>{if(!reply.hex)return;const decoded=decodeReply(Buffer.from(reply.hex,'hex'));const actual=await afterReply(command,decoded);replies.push(actual);input.deliver(encodeReply(actual));}).catch(()=>{});}};
 return {access:{inputs:new Map([['in',input]]),outputs:new Map([['out',output]])},input,output};
}
async function until(read,label){const start=Date.now();let value;while(Date.now()-start<3000){value=read();if(value)return value;await new Promise(resolve=>setTimeout(resolve,10));}throw Error(`${label}: ${value}`);}

test('a page with no reviewed catalog sends nothing and leaves Apply disabled',async()=>{const {document,nodes}=dom();let calls=0;mountFirmwareLink({document,navigator:{requestMIDIAccess(){calls++;throw Error('should not be called');}},bundle:null});assert.equal(nodes.get('firmware-safety').textContent,'No reviewed firmware catalog. Apply stays off.');await nodes.get('connect').click();assert.equal(calls,0);assert.match(nodes.get('conn-state').textContent,/Apply stays off/);assert.equal(nodes.get('apply').disabled,true);});

test('the C fixture handshake reads confirmed values and a conflicting Apply is refused',async()=>{
 const fixture=host(),ops=[],replies=[];const {document,nodes}=dom();const ports=midi(fixture,ops,replies);
 mountFirmwareLink({document,navigator:{requestMIDIAccess:async()=>ports.access},bundle:bundle(controls)});
 try{
  await nodes.get('connect').click();
  await until(()=>nodes.get('conn-state').textContent.startsWith('Connected'),'connect');
  assert.equal(nodes.get('fw-1').value,'500');
  assert.equal(nodes.get('fw-2').value,'128.5');
  assert.match([...nodes.get('firmware-controls').children].at(-1).textContent,/Hold 0/);
  assert.equal(ops.includes(OP.SET),false);
  assert.equal(nodes.get('apply').disabled,true);
  nodes.get('fw-1').value='800';nodes.get('fw-1').fire('input');
  assert.equal(nodes.get('apply').disabled,false);
  assert.equal(ops.includes(OP.SET),false);
  await nodes.get('apply').click();
  await until(()=>nodes.get('conn-state').textContent==='Firmware confirmed 800.','ack');
  assert.equal(ops.filter(op=>op===OP.SET).length,1);
  await fixture.send('change');
  nodes.get('fw-1').value='700';nodes.get('fw-1').fire('input');
  await nodes.get('apply').click();
  await until(()=>nodes.get('conn-state').textContent.includes('instrument changed'),'conflict');
  const open=replies.find(reply=>reply.op===OP.OPEN);
  const readback=decodeReply(Buffer.from((await fixture.send(Buffer.from(encodeCommand({version:2,op:OP.READ,unit:open.unit,unitHigh:open.unitHigh,client:91,epoch:open.epoch,request:900,revision:0,control:1,token:0,value:0})).toString('hex'))).hex,'hex'));
  assert.equal(readback.value,800);
  assert.equal(replies.filter(reply=>reply.op===OP.SET).at(-1).status,5);
  await nodes.get('connect').click();
  await until(()=>nodes.get('conn-state').textContent==='Disconnected','disconnect');
  const closed=JSON.parse(JSON.stringify(await fixture.send('tick 0')));
  assert.equal(closed.active,0);
 }finally{fixture.close();}
});

test('an unsupported C control stays unconfirmed and cannot be applied',async()=>{
 const fixture=host(),ops=[],replies=[];const {document,nodes}=dom();
 const inactive=bundle([controls[0],{id:99,kind:1,min:0,max:127,label:'Missing'},controls[2]]);
 mountFirmwareLink({document,navigator:{requestMIDIAccess:async()=>midi(fixture,ops,replies).access},bundle:inactive});
 try{
  await nodes.get('connect').click();
  await until(()=>nodes.get('conn-state').textContent.startsWith('Connected'),'connect');
  assert.match(nodes.get('firmware-controls').children[1].textContent,/Not confirmed/);
  assert.equal(nodes.get('fw-99'),undefined);
  assert.equal(nodes.get('apply').disabled,true);
  assert.equal(ops.includes(OP.SET),false);
 }finally{fixture.close();}
});

async function connectFixture(t,afterReply){
 const fixture=host(),ops=[],replies=[],{document,nodes}=dom();
 const ports=midi(fixture,ops,replies,afterReply);
 const link=mountFirmwareLink({document,bundle:bundle(controls),navigator:{requestMIDIAccess:async()=>ports.access}});
 t.after(async()=>{await link.destroy();fixture.close();});
 await nodes.get('connect').click();
 await until(()=>nodes.get('conn-state').textContent.startsWith('Connected'),'connect');
 async function edit(value){
  const field=nodes.get('fw-1');field.value=String(value);field.fire('input');
  await nodes.get('apply').click();
 }
 return {fixture,ops,replies,nodes,link,edit,document};
}

test('Apply and instrument Undo require independent reads of the committed revision',async t=>{
 const {ops,replies,nodes,edit}=await connectFixture(t);
 const start=ops.length;
 await edit(800);
 await until(()=>nodes.get('conn-state').textContent==='Firmware confirmed 800.','stored edit');
 assert.deepEqual(ops.slice(start).filter(op=>op!==OP.KEEPALIVE),[OP.SET,OP.READ,OP.READ,OP.READ]);
 const edited=replies.find(r=>r.op===OP.SET);
 assert.deepEqual([edited.value,edited.revision],[800,2]);
 await nodes.get('firmware-undo').click();
 await until(()=>nodes.get('conn-state').textContent==='Firmware restored 500.','stored Undo');
 assert.deepEqual(ops.slice(start).filter(op=>op!==OP.KEEPALIVE),[OP.SET,OP.READ,OP.READ,OP.READ,OP.READ,OP.SET,OP.READ,OP.READ,OP.READ]);
 const last=replies.filter(r=>r.op===OP.READ&&r.control===1).at(-1);
 assert.deepEqual([last.value,last.revision],[500,3]);
 assert.equal(nodes.get('fw-1').value,'500');
 assert.equal(nodes.get('firmware-controls').children.includes(nodes.get('firmware-undo')),false);
});

test('Undo keeps a later firmware revision even when the parameter value matches',async t=>{
 const {fixture,ops,nodes,edit}=await connectFixture(t);
 await edit(800);
 await until(()=>nodes.get('conn-state').textContent==='Firmware confirmed 800.','stored edit');
 const undo=nodes.get('firmware-undo');
 await fixture.send('change');
 await undo.click();
 await until(()=>nodes.get('conn-state').textContent.includes('instrument changed'),'stale Undo');
 assert.equal(ops.filter(op=>op===OP.SET).length,1);
 await undo.click();
 assert.equal(ops.filter(op=>op===OP.SET).length,1);
 assert.equal(nodes.get('apply').disabled,true);
});

test('the C revision guard refuses a change between the Undo read and write',async t=>{
 let changeAfterRead=false;
 const {fixture,nodes,replies,edit}=await connectFixture(t,async(command,reply)=>{
  if(changeAfterRead&&command.op===OP.READ){changeAfterRead=false;await fixture.send('change');}
  return reply;
 });
 await edit(800);
 await until(()=>nodes.get('conn-state').textContent==='Firmware confirmed 800.','stored edit');
 changeAfterRead=true;
 await nodes.get('firmware-undo').click();
 await until(()=>nodes.get('conn-state').textContent.includes('instrument changed'),'conflict');
 assert.equal(replies.filter(r=>r.op===OP.SET).at(-1).status,STATUS.CONFLICT);
});

test('queued scalar Apply and inverse SET confirm the stored target at the acknowledged revision',async t=>{
 const {nodes,ops,replies,edit}=await connectFixture(t,async(command,reply)=>
  command.op===OP.SET?{...reply,status:STATUS.QUEUED}:reply);
 await edit(800);
 await until(()=>nodes.get('conn-state').textContent==='Stored 800. Update queued.','queued edit readback');
 assert.equal(nodes.get('fw-1').value,'800');
 assert.equal(nodes.get('firmware-undo').textContent,'Undo stored Scalar value');
 await nodes.get('firmware-undo').click();
 await until(()=>nodes.get('conn-state').textContent==='Restored stored value 500. Update queued.','queued inverse readback');
 assert.equal(nodes.get('fw-1').value,'500');
 assert.deepEqual(replies.filter(r=>r.op===OP.SET).map(r=>[r.status,r.revision]),[[STATUS.QUEUED,2],[STATUS.QUEUED,3]]);
 assert.equal(ops.filter(op=>op===OP.SET).length,2);
});

test('queued confirmation uses the canonical float returned by firmware',async t=>{
 const {nodes}=await connectFixture(t,async(command,reply)=>
  command.op===OP.SET?{...reply,status:STATUS.QUEUED}:reply);
 const field=nodes.get('fw-2');
 field.value='0.1';field.fire('input');
 await nodes.get('apply').click();
 const stored=Math.fround(0.1);
 await until(()=>nodes.get('conn-state').textContent===`Stored ${stored}. Update queued.`,'float32 readback');
 assert.equal(Number(nodes.get('fw-2').value),stored);
 await nodes.get('firmware-undo').click();
 await until(()=>nodes.get('fw-2').value==='128.5','canonical inverse');
});

test('a queued edit that changes another control refreshes both values and offers no scalar Undo',async t=>{
 let wrote=false;
 const {nodes,edit}=await connectFixture(t,async(command,reply)=>{
  if(command.op===OP.SET){wrote=true;return {...reply,status:STATUS.QUEUED};}
  if(wrote&&command.op===OP.READ&&command.control===2)return {...reply,value:0x43000000}; // float32 128
  return reply;
 });
 await edit(800);
 await until(()=>nodes.get('conn-state').textContent.includes('Other control values changed (Level).'),'coupled controls');
 assert.equal(nodes.get('fw-1').value,'800');
 assert.equal(nodes.get('fw-2').value,'128');
 assert.equal(nodes.get('firmware-undo'),undefined);
});

test('an inverse of a queued edit reports changes outside the addressed stored value',async t=>{
 for(const inverseStatus of [STATUS.QUEUED,STATUS.OK]){
  await t.test(inverseStatus===STATUS.QUEUED?'queued inverse':'immediate inverse',async t=>{
   let writes=0;
   const {nodes,edit}=await connectFixture(t,async(command,reply)=>{
    if(command.op===OP.SET){
     writes++;
     return {...reply,status:writes===1?STATUS.QUEUED:inverseStatus};
    }
    if(writes===2&&command.op===OP.READ&&command.control===2)return {...reply,value:0x43000000};
    return reply;
   });
   await edit(800);
   await until(()=>nodes.get('firmware-undo'),'stored forward value');
   await nodes.get('firmware-undo').click();
   const queued=inverseStatus===STATUS.QUEUED?' Update queued.':'';
   await until(()=>nodes.get('conn-state').textContent===`Restored stored value 500.${queued} Other control values changed (Level).`,'inverse scope');
   assert.equal(nodes.get('fw-1').value,'500');
   assert.equal(nodes.get('fw-2').value,'128');
  });
 }
});

test('a queued inverse whose prior value is not read back fails closed',async t=>{
 let sets=0;
 const {nodes,edit}=await connectFixture(t,async(command,reply)=>{
  if(command.op===OP.SET){sets++;return {...reply,status:STATUS.QUEUED};}
  if(sets===2&&command.op===OP.READ&&command.control===1)return {...reply,value:800};
  return reply;
 });
 await edit(800);
 await until(()=>nodes.get('firmware-undo'),'verified original edit');
 await nodes.get('firmware-undo').click();
 await until(()=>nodes.get('conn-state').dataset.session==='disconnected','unconfirmed inverse');
 assert.equal(nodes.get('apply').disabled,true);
 assert.equal(nodes.get('firmware-controls').children.length,0);
});

test('unverifiable writes do not create an Undo action',async t=>{
 for(const scenario of ['queued not stored','queued with different revision','different revision','different stored value','ack and stored both differ from request']){
  await t.test(scenario,async t=>{
   let wrote=false;
   const {nodes,edit}=await connectFixture(t,async(command,reply)=>{
    if(command.op===OP.SET){
     wrote=true;
     if(scenario==='ack and stored both differ from request')return {...reply,value:799};
     if(scenario.startsWith('queued'))return {...reply,status:STATUS.QUEUED};
    }
    if(wrote&&command.op===OP.READ){
     if(scenario.includes('different revision'))return {...reply,revision:reply.revision+1};
     if(scenario==='queued not stored'&&command.control===1)return {...reply,value:500};
     if(['different stored value','ack and stored both differ from request'].includes(scenario)&&command.control===1)return {...reply,value:799};
    }
    return reply;
   });
   await edit(800);
   await until(()=>nodes.get('conn-state').dataset.session==='disconnected','uncertain outcome');
   assert.equal(nodes.get('firmware-undo'),undefined);
   assert.equal(nodes.get('apply').disabled,true);
  });
 }
});

test('destroy during a pending readback retires the old connection and Undo',async t=>{
 let unblock,requested=false,written=false;
 const delayed=new Promise(resolve=>unblock=resolve);
 const {nodes,link,edit}=await connectFixture(t,async(command,reply)=>{
  if(command.op===OP.SET)written=true;
  if(written&&command.op===OP.READ){requested=true;await delayed;}
  return reply;
 });
 await edit(800);
 await until(()=>requested,'pending READ');
 const closed=link.destroy();unblock();await closed;
 assert.equal(nodes.get('firmware-undo'),undefined);
 assert.equal(nodes.get('apply').disabled,true);
 assert.equal(nodes.get('conn-state').dataset.session,'disconnected');
});

test('expired firmware lease rejects Undo even if a READ is still available',async t=>{
 const {fixture,nodes,replies,edit}=await connectFixture(t);
 await edit(800);
 await until(()=>nodes.get('conn-state').textContent==='Firmware confirmed 800.','stored edit');
 assert.equal((await fixture.send('tick 5000')).active,0);
 await nodes.get('firmware-undo').click();
 await until(()=>nodes.get('conn-state').dataset.session==='disconnected','expired');
 assert.equal(replies.filter(r=>r.op===OP.SET).at(-1).status,STATUS.STALE);
 assert.equal(nodes.get('apply').disabled,true);
});

test('returning to a cached page requires a new handshake and drops the prior Undo',async t=>{
 const {document,nodes,ops,replies,edit}=await connectFixture(t);
 await edit(800);
 await until(()=>nodes.get('conn-state').textContent==='Firmware confirmed 800.','stored edit');
 const oldUndo=nodes.get('firmware-undo');
 document.defaultView.dispatchEvent(new Event('pagehide'));
 await until(()=>nodes.get('conn-state').textContent==='Disconnected','released on pagehide');
 document.defaultView.dispatchEvent(new Event('pageshow'));
 await nodes.get('connect').click();
 await until(()=>nodes.get('conn-state').textContent.startsWith('Connected'),'fresh open');
 assert.deepEqual(replies.filter(r=>r.op===OP.OPEN).map(r=>r.epoch),[1,2]);
 assert.equal(nodes.get('fw-1').value,'800');
 await oldUndo.click();
 assert.equal(ops.filter(op=>op===OP.SET).length,1);
});

test('a fractional setting is compared to its transmitted float32 value',async t=>{
 const {nodes}=await connectFixture(t);
 const field=nodes.get('fw-2');
 field.value='0.1';field.fire('input');
 await nodes.get('apply').click();
 await until(()=>nodes.get('conn-state').textContent==='Firmware confirmed '+Math.fround(0.1)+'.','float edit');
 await nodes.get('firmware-undo').click();
 await until(()=>nodes.get('conn-state').textContent==='Firmware restored 128.5.','float Undo');
});
