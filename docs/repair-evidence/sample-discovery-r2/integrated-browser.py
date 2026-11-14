import asyncio, json, pathlib, threading, hashlib, datetime
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.async_api import async_playwright
ROOT=pathlib.Path('/workspace/discovery-r2-integration/docs')
OUT=pathlib.Path('/workspace/discovery-r2-delivery')
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**k):super().__init__(*a,directory=str(ROOT),**k)
 def log_message(self,*a):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE=f'http://127.0.0.1:{server.server_port}'
INIT="(() => {\n const events=[]; let pairs=[], midi, requests=0;\n window.__scenario=(mode='echo')=>{\n  pairs=[];\n  for(let i=0;i<2;i++){\n   const name=`DnBOX SMK-37 Pro fake ${i}`, pair={};\n   for(const type of ['input','output']) pair[type]={id:`${type}${i}`,name,manufacturer:'Fake only',type,state:'connected',connection:'closed',onmidimessage:null,onstatechange:null,\n    async open(){events.push(`${i}:${type}:open`);this.connection='open';return this;},\n    async close(){events.push(`${i}:${type}:close`);this.connection='closed';return this;},\n    send(data){\n     if(type!=='output' || this.connection!=='open')throw Error('FAKE endpoint requires open');\n     if(data[0]!==240 || data[1]!==125 || data[2]!==70 || data[3]!==76 || data.at(-1)!==247 || ![1,15].includes(data[4]))throw Error('BLOCKED: fake-only read/identity whitelist');\n     events.push(`${i}:command:${data[4]}`);\n     const good=[88,48,88,32,68,69,86,0,0,0,0,64,0,0];\n     const payload=i===0?(mode==='malformed'?[88,48,88,32,68,69,86,0]:[]):(mode==='all-malformed'?[0]:good);\n     const reply=data[4]===1?[240,125,70,76,1,...payload,247]:[240,125,70,76,15,1,80,0,0,0,247];\n     queueMicrotask(()=>pair.input.onmidimessage?.({data:new Uint8Array(reply)}));\n    }};\n   pairs.push(pair);\n  }\n  midi={inputs:new Map(pairs.map(p=>[p.input.id,p.input])),outputs:new Map(pairs.map(p=>[p.output.id,p.output])),onstatechange:null,sysexEnabled:true};\n };\n window.__scenario();\n // This replaces the browser entry point before any app script runs. The native API is never saved or invoked.\n Object.defineProperty(navigator,'requestMIDIAccess',{configurable:false,value:async()=>{requests++;events.push('fake-access');return midi;}});\n window.__fake=()=>({events:[...events],requests,ports:pairs.map(p=>({input:p.input.connection,output:p.output.connection,listener:!!p.input.onmidimessage}))});\n window.__disconnect=()=>{pairs[1].output.state='disconnected';midi.onstatechange?.();};\n})();"

async def main():
 receipt={'time_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'integrated generated breaks page, injected fake endpoints only','source_sha256':hashlib.sha256((ROOT/'breaks/index.html').read_bytes()).hexdigest(),'checks':[],'page_errors':[],'off_origin_requests':[]}
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  receipt['browser_version']=browser.version
  ctx=await browser.new_context(viewport={'width':1440,'height':1000},service_workers='block')
  await ctx.add_init_script(INIT)
  async def guard(route):
   if not route.request.url.startswith(BASE+'/'):
    receipt['off_origin_requests'].append(route.request.url);await route.abort()
   else:await route.continue_()
  await ctx.route('**/*',guard)
  page=await ctx.new_page();page.on('pageerror',lambda e:receipt['page_errors'].append(str(e)))
  await page.goto(BASE+'/breaks/')
  await page.locator('#connect').focus();await page.keyboard.press('Enter')
  await page.wait_for_function("document.querySelector('#connect').textContent==='Read again' && !document.querySelector('#connect').disabled")
  assert 'No loops yet' in await page.locator('#list').inner_text()
  state=await page.evaluate('__fake()')
  assert state['ports'][0]=={'input':'closed','output':'closed','listener':False}
  assert state['ports'][1]=={'input':'open','output':'open','listener':True}
  assert await page.locator('#send').is_disabled() and await page.locator('#backup').is_enabled()
  receipt['checks'].append({'name':'keyboard Connect skips echo; later valid fake selected; empty slot read; writes disabled','status':'PASS','state':state})
  await page.screenshot(path=str(OUT/'integrated-success.png'),full_page=True)
  await page.evaluate('__disconnect()')
  assert 'Device disconnected' in await page.locator('#status').inner_text()
  assert await page.locator('#send').is_disabled() and await page.locator('#backup').is_disabled()
  receipt['checks'].append({'name':'disconnect invalidates ready state','status':'PASS'})
  await page.set_viewport_size({'width':390,'height':1000})
  await page.goto(BASE+'/breaks/');await page.evaluate("__scenario('all-malformed')")
  await page.locator('#connect').click()
  await page.wait_for_function("document.querySelector('#status').textContent.startsWith('No SMK-37 running DnBOX found.')")
  assert await page.locator('#connect').is_enabled()
  assert await page.locator('#send').is_disabled() and await page.locator('#backup').is_disabled()
  assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  receipt['checks'].append({'name':'all malformed: retry enabled, writes disabled, no mobile overflow','status':'PASS','state':await page.evaluate('__fake()')})
  await page.screenshot(path=str(OUT/'integrated-error-mobile.png'),full_page=True)
  assert not receipt['page_errors'] and not receipt['off_origin_requests']
  receipt['status']='PASS'
  (OUT/'integrated-browser-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
  print(json.dumps({'status':'PASS','browser':browser.version,'checks':3,'errors':receipt['page_errors'],'off_origin_requests':receipt['off_origin_requests']}))
  await browser.close()
try:asyncio.run(main())
finally:server.shutdown()
