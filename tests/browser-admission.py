# SPDX-License-Identifier: GPL-3.0-only
"""Whole generated installer in real Chromium; synthetic bytes, mocked MIDI only.
No candidate, firmware, controller, external artifact or hardware is published.
Run --source /path/to/before-installer.html for the identical RED assertions.
"""
import os
import argparse, asyncio, hashlib, json, re, subprocess, threading
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
# Pin browser assertions to the independently verified source history lock, not the DOM.
PINNED_HISTORY_ROWS=json.loads((ROOT/'tests/fixtures/history-appendonly-baseline-20261024.json').read_text())['rows']
PINNED_HISTORY_IDS=[row['id'] for row in PINNED_HISTORY_ROWS]
PINNED_HISTORY_COUNT=len(PINNED_HISTORY_IDS)
SOURCE_HISTORY_IDS=[row['id'] for row in json.loads((ROOT/'docs/build-status.json').read_text())['history']]
assert PINNED_HISTORY_COUNT>=123 and SOURCE_HISTORY_IDS==PINNED_HISTORY_IDS, 'browser fixture and source history disagree'
ap=argparse.ArgumentParser();ap.add_argument('--source');ap.add_argument('--red-only',action='store_true');ap.add_argument('--race-only',action='store_true');ap.add_argument('--local-files-only',action='store_true');ap.add_argument('--approval-only',action='store_true');args=ap.parse_args()
def raw(product):
    b=bytearray([125]*1024)
    for i,c in enumerate(product): b[i*48+47]=(ord(c)+i+1)&255
    return bytes(b)
RAW={k:raw('SMK-37 '+name+'_900') for k,name in [('pro','Pro'),('elite','Elite')]}
CTL=hashlib.sha256(bytes([1,2,3])).hexdigest()
CAT={'schema':1,'latest':'synthetic-test','history':[],'versions':[{'version':'synthetic-test','status':'dev-checked','config':'dev','hardware_tested':False,'models':{k:{'product':'SMK-37 '+name+'_900','sha256':hashlib.sha256(RAW[k]).hexdigest(),'size':1024,'controller_sha256':CTL,'pkg':'https://example.invalid/'+hashlib.sha256(RAW[k]).hexdigest()+'/'+k+'.fwsc'} for k,name in [('pro','Pro'),('elite','Elite')]}}]}
probe=r'''
window.$ = $;
Object.defineProperty(window,"ctl",{get:()=>ctl,set:v=>{ctl=v;}});
window.qa = {
 state: () => ({image:!!image, product:selectedProduct, writing, status:$("status").textContent,
  href:$("download").getAttribute("href"), hidden:$("download").hidden, disabled:$("go").disabled}),
 select: model => {chosenModel=model; refreshModelUi(); return loadSelectedPackage();},
 load:()=>loadSelectedPackage(), meta:()=>refreshMeta(),
 catalog:()=>catalogLive, replace:c=>{catalogLive=c;fillVersions();},
 language:l=>{lang=l;applyLang();},
 hashHold:()=>{const old=sha256Hex;sha256Hex=async b=>{const result=await old(b);await new Promise(r=>window.hashRelease=r);return result;};},
 scan:()=>scan(),
 holdScanPermission:()=>{midiAccess=()=>new Promise(r=>window.scanMidiGrant=r);scan();},
 holdScan:()=>{window.closedLinks=0;midiAccess=async()=>({});Updater=class{async find(){return await new Promise(r=>window.scanRelease=r);}};scan();},
 holdLookup:()=>{Updater=class{async find(){return await new Promise(r=>window.lookupRelease=r);}};},
 badController:()=>{insertCtl=()=>{throw Error("synthetic controller assembly failure");};},
 installMocks:()=>{
  window.entries=[];window.permissions=0;window.midiResolvers=[];window.lookups=0;window.confirm=()=>true;
  midiAccess=()=>{window.permissions++;return new Promise((r,j)=>{window.midiResolvers.push(()=>r({}));window.midiGrant=()=>r({});window.midiDeny=()=>j({code:'denied'});});};
  Updater=class{async find(){lookups++;return null;}};
  installKeepingSlots=async(up,img,product)=>{window.entries.push({product,bytes:Array.from(img)});return await new Promise((r,j)=>{window.installDone=()=>r({});window.installFail=()=>j(new Error('synthetic interruption'));});};
  insertCtl=img=>img;
  ctl=new Uint8Array([1,2,3]);
  stock={image:new Uint8Array([99]),product:'SMK-37 Pro_016'};
  $("stockconfirm").disabled=false;$("stockconfirm").checked=true;$("stockgo").disabled=false;
 },
};
'''
def render():
    if not args.source:
        s=subprocess.check_output(['node','--input-type=module','-e',
          "import{readFileSync}from'node:fs';import{renderInstaller}from'./scripts/render-qualified-nightly.mjs';process.stdout.write(renderInstaller(JSON.parse(readFileSync(0,'utf8'))));"],input=json.dumps(CAT).encode(),cwd=ROOT).decode()
        return s.replace('(async () => {',probe+'\n(async () => {',1)
    s=Path(args.source).read_text()
    libs='\n'.join(re.sub(r'^import .*?;\r?\n','',re.sub(r'^export\s+','',(ROOT/p).read_text(),flags=re.M),flags=re.M) for p in ['web/fm1pkg.js','web/fm1ota.js','web/x0x_breaks.js'])
    s=s.replace('/*LIB*/',libs).replace('/*CATALOG*/',json.dumps(CAT))
    return s.replace('(async () => {',probe+'\n(async () => {',1)
HTML=render().encode()
class Server(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split('?')[0]
        page = {'/empty/':'docs/install/index.html', '/builds/':'docs/builds/index.html', '/build-status.json':'docs/build-status.json'}.get(path)
        self.send_response(200)
        self.send_header('Content-Type','application/json' if path.endswith('.json') else 'text/html')
        self.end_headers()
        self.wfile.write((ROOT/page).read_bytes() if page else HTML)
    def log_message(self,*a):pass
srv=ThreadingHTTPServer(('127.0.0.1',0),Server);threading.Thread(target=srv.serve_forever,daemon=True).start()
INIT='''window.pending=[];window.fetch=(url,opts)=>new Promise((resolve,reject)=>pending.push({url,opts,resolve,reject}));'''
checks=0; failures=[]
def check(ok,label):
    global checks
    checks+=1
    print('CHECK',checks,label,flush=True)
    if not ok: failures.append(label);print('FAIL',label,flush=True)
async def state(p):return await p.evaluate('qa.state()')
async def reply(p,model='pro',data=None,status=200,index=0,reject=False):
    await p.evaluate('''a=>{const q=pending.splice(a.index,1)[0];if(!q)throw Error('no pending fetch');if(a.reject)q.reject(Error('synthetic network interruption'));else q.resolve(new Response(new Uint8Array(a.bytes),{status:a.status}));}''',{'index':index,'reject':reject,'status':status,'bytes':list(RAW[model] if data is None else data)})
    await p.wait_for_timeout(25)
async def fresh(browser,width=390,language='en'):
    p=await browser.new_page(viewport={'width':width,'height':900},accept_downloads=True)
    errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
    await p.add_init_script(INIT);await p.goto(f'http://127.0.0.1:{srv.server_port}/install/',wait_until='domcontentloaded')
    await p.wait_for_function('window.qa && pending.length===1');await p.evaluate('(l)=>qa.language(l)',language)
    return p,errors
async def ready(browser,width=390,language='en',model='pro'):
    p,e=await fresh(browser,width,language)
    if model!='pro':
        await p.evaluate('(m)=>{qa.select(m)}',model);await reply(p,'pro',index=0)
    await reply(p,model)
    return p,e
async def catalog_approvals(browser):
 # Actual public metadata at gh-pages b7af05f00a91056ca732b21cbe1dc719edbcb585,
 # versions.json Git blob 519d9500c57848d5ed103fbd88befb5f43f6d020. Fetch is
 # intercepted before any external bytes; this tests continuity, not package QA.
 published=json.loads((ROOT/'tests/fixtures/published-dev-catalog-b7af05f.json').read_text())
 for model in ['pro','elite']:
  p,e=await ready(browser,model=model)
  await p.evaluate('(c)=>qa.replace(c)',published)
  await p.evaluate('(m)=>{qa.select(m);}',model)
  request=await p.evaluate('pending.at(-1)?.url')
  check(request==published['versions'][0]['models'][model]['pkg'],model+' existing public DEV metadata remains admitted without optional hints')
  st=await state(p)
  check(st['href'] is None and st['disabled'],model+' public metadata alone never enables download or install')
  await p.close()
 approvals=['qualified','installable','qa_pass','source_licenses_approved','immutable_http_pass','backup_integrity_pass','model_and_controller_pass']
 for model in ['pro','elite']:
  for target in ['version','package']:
   for field in approvals:
    p,e=await ready(browser,model=model)
    for value in [False,None,0,1,'false','true',[],{}]:
     await p.evaluate('(a)=>{const v=qa.catalog().versions[0];(a.target==="version"?v:v.models[a.model])[a.field]=a.value;qa.load();}',{'target':target,'model':model,'field':field,'value':value})
     requests=await p.evaluate('pending.length')
     if requests: await reply(p,model)
     st=await state(p)
     label=f'{model}/{target}/{field}={json.dumps(value)}'
     check(requests==0 and not st['image'] and st['href'] is None and st['disabled'],label+' denies before fetch despite dev-checked status')
     # Removing an optional hint restores the preexisting verified-byte path.
     await p.evaluate('(a)=>{const v=qa.catalog().versions[0];delete (a.target==="version"?v:v.models[a.model])[a.field];qa.load();}',{'target':target,'model':model,'field':field})
     await reply(p,model)
    await p.evaluate('(a)=>{const v=qa.catalog().versions[0];(a.target==="version"?v:v.models[a.model])[a.field]=true;qa.load();}',{'target':target,'model':model,'field':field})
    await reply(p,model);await p.locator('#devagree').check()
    st=await state(p)
    check(bool(st['href'] and st['href'].startswith('blob:')) and not st['disabled'],f'{model}/{target}/{field}=true preserves verified Blob and acknowledgement gate')
    # In-place denial must invalidate cached bytes at actual click-time, too.
    await p.evaluate('qa.installMocks()')
    await p.evaluate('(a)=>{const v=qa.catalog().versions[0];(a.target==="version"?v:v.models[a.model])[a.field]=false;$("download").dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true}));$("go").dispatchEvent(new MouseEvent("click"));}',{'target':target,'model':model,'field':field})
    await p.wait_for_timeout(15)
    st=await state(p)
    check(st['href'] is None and st['disabled'] and await p.evaluate('permissions===0 && entries.length===0'),f'{model}/{target}/{field} cached download/install denial precedes MIDI')
    check(not e,f'{model}/{target}/{field} no page errors')
    await p.close()
async def catalog_hardware_facts(browser):
 # These optional facts have the inverse semantics of approval hints: DEV may
 # omit them or explicitly say false; true and malformed supplied values deny.
 for model in ['pro','elite']:
  for target in ['version','package']:
   for field in ['device_verified','hardware_tested']:
    p,e=await ready(browser,model=model)
    selector={'target':target,'model':model,'field':field}
    for present in [False,True]:
     await p.evaluate('(a)=>{const v=qa.catalog().versions[0],r=a.target==="version"?v:v.models[a.model];if(a.present)r[a.field]=false;else delete r[a.field];qa.load();}',dict(selector,present=present))
     await reply(p,model)
     st=await state(p)
     check(bool(st['href'] and st['href'].startswith('blob:')) and st['disabled'],f'{model}/{target}/{field} '+('false' if present else 'absent')+' preserves verified Blob and DEV acknowledgement gate')
    await p.locator('#devagree').check()
    check(not (await state(p))['disabled'],f'{model}/{target}/{field} DEV false permits acknowledged install')
    for value in [None,0,1,'false','true',[],{},True]:
     await p.evaluate('(a)=>{const v=qa.catalog().versions[0];(a.target==="version"?v:v.models[a.model])[a.field]=a.value;qa.load();}',dict(selector,value=value))
     requests=await p.evaluate('pending.length')
     if requests: await reply(p,model)
     st=await state(p)
     check(requests==0 and not st['image'] and st['href'] is None and st['disabled'],f'{model}/{target}/{field}={json.dumps(value)} denies before fetch')
     await p.evaluate('(a)=>{const v=qa.catalog().versions[0];(a.target==="version"?v:v.models[a.model])[a.field]=false;qa.load();}',selector)
     await reply(p,model)
    await p.locator('#devagree').check()
    check(not (await state(p))['disabled'],f'{model}/{target}/{field} false recovery enables acknowledged install before cached denial')
    await p.evaluate('qa.installMocks()')
    await p.evaluate('(a)=>{const v=qa.catalog().versions[0];(a.target==="version"?v:v.models[a.model])[a.field]="true";$("download").dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true}));$("go").dispatchEvent(new MouseEvent("click"));}',selector)
    await p.wait_for_timeout(15)
    st=await state(p)
    check(st['href'] is None and st['disabled'] and await p.evaluate('permissions===0 && entries.length===0'),f'{model}/{target}/{field} cached malformed denial precedes MIDI')
    check(not e,f'{model}/{target}/{field} no page errors')
    await p.close()

async def local_files(browser):
 p,e=await ready(browser)
 # Exercise the generated page's actual chooser handlers. Only File metadata and
 # read completion are synthetic; no large buffer or external artifact is used.
 await p.evaluate(r'''() => {
  window.localReads=0;
  window.controllerBytes=()=>{
   const b=new Uint8Array(160);b.fill(0xa5);const v=new DataView(b.buffer);
   for(const [o,n]of [[0,0x43423058],[8,0x20000],[12,160],[16,0],[20,2],[24,0x02087080],[28,0x02087090],[32,0x01c06e80],[36,0x01c07680],[40,0x01c01800],[44,0x01c07680],[48,0],[52,0]])v.setUint32(o,n,true);
   v.setUint16(4,2,true);v.setUint16(6,68,true);
   let crc=0xffffffff;for(const octet of b){crc^=octet;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}v.setUint32(16,(crc^0xffffffff)>>>0,true);return b;
  };
  window.stockBytes=()=>{const b=new Uint8Array(1024).fill(125),name='SMK-37 Pro_900';for(let i=0;i<name.length;i++)b[i*48+47]=(name.charCodeAt(i)+i+1)&255;return b;};
  window.chooseLocal=(kind,size,hold=false,reject=false)=>{
   const input=document.getElementById(kind==='ctl'?'ctlfile':'stockfile');
   const raw=kind==='ctl'?controllerBytes():stockBytes();
   const file=new File([raw],kind==='ctl'?'synthetic-ctl.img':'synthetic-stock.fwsc');
   Object.defineProperties(file,{size:{value:size},arrayBuffer:{value:()=>{localReads++;if(hold)return new Promise(r=>window.localRelease=()=>r(raw.buffer));if(reject)return Promise.reject(Error('synthetic read interruption'));return Promise.resolve(raw.buffer);}}});
   Object.defineProperty(input,'files',{configurable:true,value:[file]});input.dispatchEvent(new Event('change'));
  };
 }''')
 for kind,minimum,maximum in [('ctl',68,65536),('stock',960,16*1024*1024)]:
  for expr in ['0','-1','NaN','Infinity','1.5',"'1024'",'Number.MAX_SAFE_INTEGER+1',str(minimum-1),str(maximum+1),'1073741824']:
   before=await p.evaluate('localReads')
   await p.evaluate(f"chooseLocal('{kind}',{expr})");await p.wait_for_timeout(15)
   check(await p.evaluate('localReads')==before,kind+' invalid File.size '+expr+' rejects before arrayBuffer')
  for size in [minimum,maximum]:
   before=await p.evaluate('localReads');await p.evaluate('(a)=>chooseLocal(a.kind,a.size)',{'kind':kind,'size':size});await p.wait_for_timeout(25)
   check(await p.evaluate('localReads')==before+1,kind+' inclusive size boundary '+str(size)+' reaches bounded read')
  await p.evaluate('(kind)=>chooseLocal(kind,1024)',kind);await p.wait_for_timeout(25)
  check(await p.evaluate("ctl?.length===160" if kind=='ctl' else "!$('stockconfirm').disabled && $('dropmeta').textContent.includes('SMK-37 Pro_900')"),kind+' valid format accepted')
  await p.evaluate('(kind)=>chooseLocal(kind,1024,true)',kind);await p.wait_for_function("typeof localRelease==='function'")
  await p.evaluate('(kind)=>chooseLocal(kind,1073741824)',kind);await p.wait_for_timeout(15)
  before=await p.locator('#status').text_content();await p.evaluate('localRelease();delete window.localRelease');await p.wait_for_timeout(25)
  cleared=await p.evaluate("ctl===null" if kind=='ctl' else "$('stockconfirm').disabled && $('stockgo').disabled && $('dropmeta').textContent===''")
  check(cleared and await p.locator('#status').text_content()==before,kind+' invalid new selection clears prior state and defeats stale pending read')
  await p.evaluate('(kind)=>chooseLocal(kind,1024,false,true)',kind);await p.wait_for_timeout(25)
  await p.evaluate('(kind)=>chooseLocal(kind,1024)',kind);await p.wait_for_timeout(25)
  check(await p.evaluate("ctl?.length===160" if kind=='ctl' else "!$('stockconfirm').disabled && $('dropmeta').textContent.includes('SMK-37 Pro_900')"),kind+' interrupted read can retry valid file')
 # Drag/drop reaches the same bounded stock-file function.
 for size in [1073741824,1024]:
  before=await p.evaluate('localReads')
  await p.evaluate("""size=>{const raw=stockBytes(),f=new File([raw],'synthetic-drop.fwsc');Object.defineProperties(f,{size:{value:size},arrayBuffer:{value:async()=>{localReads++;return raw.buffer;}}});const event=new Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:{files:[f]}});$('stockdrop').dispatchEvent(event);}""",size)
  await p.wait_for_timeout(25)
  check(await p.evaluate('localReads')==before+(0 if size>16777216 else 1),'stock drop preallocation guard '+str(size))
 # Real erased padding, not metadata alone: retain the controller format's64KiB maximum.
 await p.evaluate("""()=>{const input=$('ctlfile');const raw=new Uint8Array(65536).fill(255);raw.set(controllerBytes());Object.defineProperty(input,'files',{configurable:true,value:[{size:raw.length,arrayBuffer:async()=>raw.buffer}]});input.dispatchEvent(new Event('change'));}""")
 await p.wait_for_timeout(25);check(await p.evaluate('ctl?.length===65536'),'valid erased controller padding remains accepted at64KiB')
 check(not e,'local file paths have no uncaught page errors')
 await p.close()

async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None),args=['--no-sandbox'])
  print('Chromium',browser.version,flush=True)
  if args.approval_only or not (args.race_only or args.local_files_only):
   await catalog_approvals(browser)
   await catalog_hardware_facts(browser)
  if args.approval_only:
   await browser.close();srv.shutdown()
   print(json.dumps({'checks':checks,'failed':len(failures),'failures':failures,'scope':'complete generated page catalog hints and existing public metadata; external fetch/MIDI mocked','source':args.source or 'current'}),flush=True)
   raise SystemExit(1 if failures else 0)
  if not args.race_only:
   await local_files(browser)
  if args.local_files_only:
   print(json.dumps({'checks':checks,'failed':len(failures),'failures':failures,'scope':'actual generated local File handlers; synthetic size/read fixtures, no giant allocation or hardware'}),flush=True)
   await browser.close();srv.shutdown();raise SystemExit(1 if failures else 0)
  if args.race_only:
   p,e=await ready(browser);await p.evaluate('qa.installMocks()');await p.locator('#devagree').check();await p.locator('#go').click();await p.wait_for_function('permissions===1')
   await p.evaluate("$('stockgo').dispatchEvent(new MouseEvent('click'))")
   check(await p.evaluate('permissions===1 && qa.state().writing'),'pre-MIDI lock rejects second path')
   await p.evaluate('midiResolvers.forEach(r=>r())');await p.wait_for_timeout(50)
   check(await p.evaluate('entries.length===1'),'exactly one installer entry')
   print(json.dumps({'checks':checks,'failed':len(failures),'permissions':await p.evaluate('permissions'),'installer_entries':await p.evaluate('entries.length'),'source':args.source or 'current'}),flush=True)
   await browser.close();srv.shutdown();raise SystemExit(1 if failures else 0)
  if not args.source:
   for width in [320,390,1280]:
    p=await browser.new_page(viewport={'width':width,'height':900});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
    await p.goto(f'http://127.0.0.1:{srv.server_port}/empty/',wait_until='domcontentloaded')
    check(await p.locator('#go').is_disabled(),'unmodified empty page install disabled '+str(width))
    check(await p.locator('#stockgo').is_disabled(),'unmodified local file install disabled '+str(width))
    check(await p.locator('#download').get_attribute('href') is None,'unmodified empty page no download '+str(width))
    check(await p.evaluate('document.documentElement.scrollWidth<=innerWidth') and not errors,'unmodified empty responsive page '+str(width))
    await p.close()
  for width in [320,390,1280]:
   for language in ['en','ja']:
    for model in ['pro','elite']:
     label=f'{width}/{language}/{model}'
     p,errors=await fresh(browser,width,language)
     check((await state(p))['href'] is None,label+' no link before verification')
     if model=='elite':
      await p.evaluate("()=>{qa.select('elite');}");await reply(p,'pro',index=0)
      check(not (await state(p))['image'],label+' stale model response ignored')
     await reply(p,model)
     st=await state(p);check(bool(st['href'] and st['href'].startswith('blob:')),label+' verified Blob only')
     check(st['product']==CAT['versions'][0]['models'][model]['product'],label+' product parsed')
     check(st['disabled'],label+' requires DEV acknowledgement')
     await p.locator('#devagree').check();check(not (await state(p))['disabled'],label+' ack enables verified install')
     check(await p.evaluate('document.documentElement.scrollWidth<=innerWidth'),label+' no horizontal overflow')
     if st['href'] and st['href'].startswith('blob:'):
      async with p.expect_download() as download:
       await p.locator('#download').click()
      d=await download.value;path=await d.path();check(Path(path).read_bytes()==RAW[model],label+' downloaded bytes exact')
     check(not errors,label+' no page errors')
     await p.close()
  # Every rejection exercises the actual generated page and real SHA/product parser.
  mutations=[('bad hash',"p.sha256='0'.repeat(64);p.pkg='https://example.invalid/'+p.sha256+'/pro.fwsc'"),
   ('missing hash','delete p.sha256'),('short hash',"p.sha256='a'"),('missing controller hash','delete p.controller_sha256'),
   ('revoked model','p.revoked=true'),('revoked version','v.revoked=true'),('blocked','v.blocked=true'),('withdrawn','p.withdrawn=true'),
   ('unqualified','p.qualified=false'),('failed model',"p.status='failed'"),('product suffix',"p.product='SMK-37 ProEVIL_900'"),
   ('missing version',"p.product='SMK-37 Pro'"),('invalid URL',"p.pkg='https://'"),('wrong model',"p.product='SMK-37 Elite_900'"),
   ('string Release',"p.fromRelease='true'"),('version Release',"v.fromRelease=true"),('device claim',"p.device_verified=true"),('superseded',"v.lifecycle='superseded'"),('credentials',"p.pkg='https://u:p@example.invalid/'+p.sha256+'/pro.fwsc'")]
  for name,mutation in mutations:
   p,e=await fresh(browser)
   await p.evaluate('()=>{const v=qa.catalog().versions[0],p=v.models.pro;'+mutation+';qa.load();}')
   await reply(p)
   if await p.evaluate('pending.length'):await reply(p)
   st=await state(p);check(not st['image'] and st['href'] is None and st['disabled'],name+' rejected')
   await p.close()
  for name,data,status,reject in [('truncated',RAW['pro'][:-1],200,False),('oversized',RAW['pro']+b'x',200,False),('wrong bytes',RAW['elite'],200,False),('http failure',b'',404,False),('network interruption',None,200,True)]:
   p,e=await fresh(browser);await reply(p,data=data,status=status,reject=reject)
   st=await state(p);check(not st['image'] and st['href'] is None and st['disabled'],name+' fail closed')
   await p.evaluate('()=>{qa.load();}');await reply(p);check((await state(p))['image'],name+' retry succeeds')
   await p.close()
  if args.red_only:
   await browser.close();srv.shutdown()
   print(json.dumps({'checks':checks,'failed':len(failures),'failures':failures,'source':args.source,'device_tested':False}),flush=True)
   raise SystemExit(1 if failures else 0)
  # Delayed digest, stale failure, catalog empty/revoked, and in-place metadata changes.
  p,e=await fresh(browser);await p.evaluate('qa.hashHold()');await reply(p);await p.wait_for_function("typeof window.hashRelease === 'function'")
  await p.evaluate("qa.replace({versions:[],history:[]});hashRelease()")
  await p.wait_for_timeout(30);st=await state(p);check(not st['image'] and st['href'] is None,'empty catalog invalidates delayed digest');await p.close()
  p,e=await fresh(browser);await p.evaluate("()=>{qa.select('elite');}");await reply(p,'elite',index=1)
  st=await state(p);await reply(p,index=0,reject=True)
  check((await state(p))==st,'stale failed request cannot overwrite current state');await p.close()
  p,e=await ready(browser);await p.evaluate('qa.catalog().versions[0].models.pro.size++;qa.meta()')
  check((await state(p))['href'] is None and (await state(p))['disabled'],'in-place byte identity change clears cached admission');await p.close()
  p,e=await ready(browser);await p.evaluate('qa.catalog().versions[0].revoked=true')
  prevented=await p.evaluate('''()=>{const event=new MouseEvent('click',{bubbles:true,cancelable:true});return !$('download').dispatchEvent(event);}''')
  check(prevented and (await state(p))['href'] is None,'click-time revocation cancels download');await p.close()
  p,e=await fresh(browser);await p.evaluate('qa.hashHold()');await reply(p);await p.wait_for_function("typeof hashRelease==='function'")
  await p.evaluate("qa.select('elite');hashRelease()")
  await p.wait_for_timeout(25);check(not (await state(p))['image'],'model switch invalidates held digest')
  await reply(p,'elite');await p.wait_for_timeout(25);await p.evaluate('hashRelease()');await p.wait_for_timeout(25)
  check((await state(p))['product']=='SMK-37 Elite_900','new model verifies after stale digest')
  await p.close()
  p,e=await fresh(browser)
  await p.evaluate("pending.shift().resolve(new Response(new ReadableStream({start(controller){window.bodyReject=error=>controller.error(error);}})))")
  await p.wait_for_function("typeof bodyReject==='function'");await p.evaluate("()=>{qa.select('elite');}");await reply(p,'elite')
  st=await state(p);await p.evaluate("bodyReject(Error('stale body failure'))");await p.wait_for_timeout(25)
  check((await state(p))==st,'stale response body rejection ignored');await p.close()
  # Independent QA F1: a real click must cancel before malformed lookup can throw.
  for mutation in [
    'qa.catalog().versions[0].models=null', 'qa.catalog().versions={}',
    'qa.catalog().versions[0]=null', 'qa.catalog().versions=null',
    'qa.catalog().versions[0].models.pro=null',
    'qa.catalog().versions[0].self=qa.catalog().versions[0]',
    "Object.defineProperty(qa.catalog(),'versions',{get(){throw Error('malformed versions')}})",
    "Object.defineProperty(qa.catalog().versions[0].models,'pro',{get(){throw Error('malformed model')}})",
    "Object.defineProperty(qa.catalog().versions[0],'status',{get(){throw Error('malformed status')}})",
  ]:
   p,e=await ready(browser);downloads=[];p.on('download',lambda d:downloads.append(d))
   await p.locator('#devagree').check()
   await p.evaluate("$('download').addEventListener('click',event=>{window.cancelled=event.defaultPrevented})")
   await p.evaluate('()=>{'+mutation+';}')
   await p.locator('#download').click();await p.wait_for_timeout(100)
   st=await state(p)
   check(await p.evaluate('window.cancelled') and not downloads,'malformed actual click cancels download: '+mutation)
   check(st['href'] is None and st['disabled'] and not st['image'] and not e,'malformed click clears cached admission without errors: '+mutation)
   await p.close()
  # Independent QA F2: render every real immutable row and inspect card content.
  for width in [320,375,768,1280]:
   p=await browser.new_page(viewport={'width':width,'height':900})
   await p.goto(f'http://127.0.0.1:{srv.server_port}/builds/',wait_until='domcontentloaded')
   await p.wait_for_function("(count) => document.querySelector('#history').children.length === count",arg=PINNED_HISTORY_COUNT)
   check(await p.locator('#history article').count()==PINNED_HISTORY_COUNT and await p.locator('#builds article').count()==2,'pinned history count retained '+str(width))
   rendered_ids=await p.locator('#history article').evaluate_all("""cards => cards.map(card => {
     const label=[...card.querySelectorAll('dt')].find(node=>node.textContent==='Checkpoint');
     return label?.nextElementSibling?.textContent ?? null;
   })""")
   check(rendered_ids==PINNED_HISTORY_IDS,'pinned history identities and order '+str(width))
   geometry=await p.evaluate("""()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    overflow:[...document.querySelectorAll('.item,.item h3,.item p,.item dd,.tag')]
     .filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>el.textContent.slice(0,80))})""")
   check(geometry['scrollWidth']<=width and not geometry['overflow'],'full history and card content wrap '+str(width)+' '+json.dumps(geometry))
   await p.close()
  # F6: bound actual response streams before allocation/digest; no-reader must not buffer.
  for mode in ['bodyless','oversized-stream','split-valid']:
   p,e=await fresh(browser)
   await p.evaluate("window.boundary={buffers:0,pulls:0,cancelled:0}")
   if mode=='bodyless':
    await p.evaluate("pending.shift().resolve({ok:true,body:null,arrayBuffer:async()=>{boundary.buffers++;return new Uint8Array(2097153).buffer;}})")
   elif mode=='oversized-stream':
    await p.evaluate("pending.shift().resolve(new Response(new ReadableStream({pull(controller){boundary.pulls++;if(boundary.pulls<=4)controller.enqueue(new Uint8Array(1024));else controller.close();},cancel(){boundary.cancelled++;}})))")
   else:
    await p.evaluate("bytes=>{let offset=0;pending.shift().resolve(new Response(new ReadableStream({pull(controller){boundary.pulls++;if(offset===bytes.length)controller.close();else {controller.enqueue(new Uint8Array(bytes.slice(offset,offset+128)));offset+=128;}},cancel(){boundary.cancelled++;}})))}",list(RAW['pro']))
   await p.wait_for_timeout(50)
   st=await state(p);boundary=await p.evaluate('window.boundary')
   check(not e and (st['image'] if mode=='split-valid' else not st['image'] and st['href'] is None and st['disabled']),'bounded stream admission '+mode)
   check(boundary['buffers']==0 and (boundary['cancelled']>0 and boundary['pulls']<5 if mode=='oversized-stream' else True),'bounded resource behavior '+mode+' '+json.dumps(boundary))
   await p.close()
  p,e=await fresh(browser)
  await p.evaluate("window.cancelledStream=0;pending.shift().resolve(new Response(new ReadableStream({start(c){window.streamChunk=()=>c.enqueue(new Uint8Array([1]));},cancel(){cancelledStream++;}})))")
  await p.wait_for_timeout(25);await p.evaluate("()=>{qa.select('elite');}");await reply(p,'elite')
  st=await state(p);await p.evaluate('streamChunk()');await p.wait_for_timeout(25)
  check(await p.evaluate('cancelledStream===1') and (await state(p))==st,'stale in-flight stream cancelled without replacing current model')
  await p.close()
  # Actual DEV/stock listeners plus run(): no physical MIDI, held permission/install promises.
  for outcome in ['grant','deny','selection-change','revoked','interrupt','lookup-change']:
   p,e=await ready(browser);await p.evaluate('qa.installMocks()');await p.locator('#devagree').check();
   if outcome=='lookup-change':await p.evaluate('qa.holdLookup()')
   await p.locator('#go').click()
   await p.wait_for_function('window.permissions===1')
   await p.evaluate("$('stockgo').dispatchEvent(new MouseEvent('click'));$('go').dispatchEvent(new MouseEvent('click'))")
   check(await p.evaluate('permissions===1 && qa.state().writing'),'single writer before MIDI '+outcome)
   if outcome=='selection-change':await p.evaluate("()=>{qa.select('elite');}")
   if outcome=='revoked':await p.evaluate('qa.catalog().versions[0].revoked=true')
   await p.evaluate('midiDeny()' if outcome=='deny' else 'midiGrant()');await p.wait_for_timeout(30)
   if outcome=='lookup-change':
    await p.wait_for_function("typeof lookupRelease==='function'");await p.evaluate("qa.select('elite');lookupRelease(null)");await p.wait_for_timeout(25)
   count=await p.evaluate('entries.length')
   check(count==(0 if outcome in ['deny','selection-change','revoked','lookup-change'] else 1),'install target admission '+outcome)
   if count:
    entry=await p.evaluate('entries[0]');check(entry['product']=='SMK-37 Pro_900' and len(entry['bytes'])==1004,'exact logical image and product '+outcome)
    await p.evaluate('installFail()' if outcome=='interrupt' else 'installDone()');await p.wait_for_timeout(30)
   check(not (await state(p))['writing'],'write lock released '+outcome)
   if outcome in ['deny','interrupt']:
    await p.locator('#go').click();await p.wait_for_function('permissions===2');await p.evaluate('midiGrant()');await p.wait_for_timeout(30)
    check(await p.evaluate('entries.length')==(1 if outcome=='deny' else 2),'install retry '+outcome)
    await p.evaluate('installDone()')
   await p.close()
  p,e=await ready(browser);await p.evaluate('qa.installMocks()');await p.locator('#devagree').check()
  await p.locator('#stockgo').click();await p.evaluate("$('go').dispatchEvent(new MouseEvent('click'));$('stockgo').dispatchEvent(new MouseEvent('click'))")
  check(await p.evaluate('permissions===1 && qa.state().writing'),'stock-first locks both paths')
  await p.evaluate('midiGrant()');await p.wait_for_timeout(30)
  check(await p.evaluate("entries.length===1 && entries[0].product==='SMK-37 Pro_016' && entries[0].bytes[0]===99"),'stock target preserved')
  await p.evaluate('installDone()');await p.close()
  p,e=await ready(browser);await p.evaluate('qa.holdScan()');await p.wait_for_function("typeof scanRelease==='function'")
  await p.evaluate('qa.installMocks()');await p.locator('#devagree').check();await p.locator('#go').click();await p.wait_for_function('permissions===1')
  await p.evaluate("scanRelease({id:{model:'SMK-37 Elite',text:'synthetic'},link:{close(){closedLinks++;}}})");await p.wait_for_timeout(25)
  check(await p.evaluate("closedLinks===1 && qa.state().product==='SMK-37 Pro_900' && qa.state().writing"),'stale scan cannot switch model during pending write')
  await p.evaluate('midiDeny()');await p.close()
  p,e=await ready(browser);await p.evaluate('qa.holdScanPermission()');await p.wait_for_function("typeof scanMidiGrant==='function'")
  await p.evaluate('qa.installMocks()');await p.locator('#devagree').check();await p.locator('#go').click();await p.wait_for_function('permissions===1')
  await p.evaluate('scanMidiGrant({})');await p.wait_for_timeout(25)
  check(await p.evaluate('lookups===0 && qa.state().writing'),'stale scan permission cannot start device lookup during write')
  await p.evaluate('midiDeny()');await p.close()
  # Controller rejection/retry and mutation during its actual async digest.
  for kind in ['missing','wrong','changed','insert-fail']:
   p,e=await ready(browser);await p.evaluate('qa.installMocks()');await p.locator('#devagree').check()
   await p.evaluate({'missing':'ctl=null','wrong':'ctl=new Uint8Array([9])','changed':'qa.hashHold()','insert-fail':'qa.badController()'}[kind]);await p.locator('#go').click()
   if kind=='changed':
    await p.wait_for_function("typeof window.hashRelease === 'function'");await p.evaluate("qa.select('elite');hashRelease()")
   await p.wait_for_timeout(30);check(await p.evaluate('permissions===0'),'controller '+kind+' blocks MIDI')
   if kind not in ['changed','insert-fail']:
    await p.evaluate('ctl=new Uint8Array([1,2,3])');await p.locator('#go').click();await p.wait_for_function('permissions===1');await p.evaluate('midiDeny()')
    check(True,'controller '+kind+' retry')
   await p.close()
  await browser.close()
 print(json.dumps({'checks':checks,'failed':len(failures),'failures':failures,'source':args.source or 'current full generated installer','device_tested':False}),flush=True)
 srv.shutdown()
 if failures:raise SystemExit(1)
asyncio.run(main())
