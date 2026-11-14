# SPDX-License-Identifier: GPL-3.0-only
import asyncio, hashlib, json, pathlib, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / 'browser'; OUT.mkdir(exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args): pass
    def do_GET(self):
        if self.path == '/harness.html':
            self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(b'<!doctype html><title>Fake MIDI harness</title>');return
        super().do_GET()
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE=f'http://127.0.0.1:{server.server_port}'
INIT=r'''(() => {
 const events=[]; let pairs=[], midi, requests=0;
 window.__scenario=(mode='echo')=>{
  pairs=[];
  for(let i=0;i<2;i++){
   const name=`DnBOX SMK-37 Pro fake ${i}`, pair={};
   for(const type of ['input','output']) pair[type]={id:`${type}${i}`,name,manufacturer:'Fake only',type,state:'connected',connection:'closed',onmidimessage:null,onstatechange:null,
    async open(){events.push(`${i}:${type}:open`);this.connection='open';return this;},
    async close(){events.push(`${i}:${type}:close`);this.connection='closed';return this;},
    send(data){
     if(type!=='output' || this.connection!=='open')throw Error('FAKE endpoint requires open');
     if(data[0]!==240 || data[1]!==125 || data[2]!==70 || data[3]!==76 || data.at(-1)!==247 || ![1,15].includes(data[4]))throw Error('BLOCKED: fake-only read/identity whitelist');
     events.push(`${i}:command:${data[4]}`);
     const good=[88,48,88,32,68,69,86,0,0,0,0,64,0,0];
     const payload=i===0?(mode==='malformed'?[88,48,88,32,68,69,86,0]:[]):(mode==='all-malformed'?[0]:good);
     const reply=data[4]===1?[240,125,70,76,1,...payload,247]:[240,125,70,76,15,1,80,0,0,0,247];
     queueMicrotask(()=>pair.input.onmidimessage?.({data:new Uint8Array(reply)}));
    }};
   pairs.push(pair);
  }
  midi={inputs:new Map(pairs.map(p=>[p.input.id,p.input])),outputs:new Map(pairs.map(p=>[p.output.id,p.output])),onstatechange:null,sysexEnabled:true};
 };
 window.__scenario();
 // This replaces the browser entry point before any app script runs. The native API is never saved or invoked.
 Object.defineProperty(navigator,'requestMIDIAccess',{configurable:false,value:async()=>{requests++;events.push('fake-access');return midi;}});
 window.__fake=()=>({events:[...events],requests,ports:pairs.map(p=>({input:p.input.connection,output:p.output.connection,listener:!!p.input.onmidimessage}))});
 window.__disconnect=()=>{pairs[1].output.state='disconnected';midi.onstatechange?.();};
})();'''

async def main():
 receipt={'scope':'Chromium / fake endpoints only','off_origin_requests':[],'errors':[],'checks':[]}
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  receipt['browser_version']=browser.version
  ctx=await browser.new_context(viewport={'width':1440,'height':1000},service_workers='block')
  await ctx.add_init_script(INIT)
  async def guard(route):
   if not route.request.url.startswith(BASE+'/'):
    receipt['off_origin_requests'].append(route.request.url);await route.abort()
   else: await route.continue_()
  await ctx.route('**/*',guard)
  page=await ctx.new_page();page.on('pageerror',lambda e:receipt['errors'].append(str(e)))
  await page.goto(BASE+'/harness.html')
  source=(ROOT/'candidate/web/x0x_breaks.html').read_text();start=source.index('class Link {');end=source.index('\nfunction unpack7(',start)
  receipt['matrix']=await page.evaluate("""async source=>{const {handshakeMatrix}=await import('/fake-midi-harness.mjs');return await handshakeMatrix(source);}""",source[start:end])
  # Exact original source wrongly accepts an echo as the connected firmware.
  await page.goto(BASE+'/original/breaks/index.html');await page.locator('#connect').click()
  await page.wait_for_function("document.querySelector('#connect').textContent==='Read again' && !document.querySelector('#connect').disabled")
  negative=await page.evaluate('__fake()')
  assert not any(e.startswith('1:') for e in negative['events'])
  assert '0:command:15' in negative['events']
  receipt['browser_negative_control']={'status':'EXPECTED_FALSE_SUCCESS_REPRODUCED','state':negative,'detail':'Original selected echo-only endpoint and sent fake slot query without valid INFO'}
  await page.screenshot(path=str(OUT/'original-echo-false-success.png'),full_page=True)
  await page.set_viewport_size({'width':1440,'height':1000})
  await page.goto(BASE+'/candidate/docs/breaks/index.html')
  await page.locator('#connect').focus();await page.keyboard.press('Enter')
  await page.wait_for_function("document.querySelector('#connect').textContent==='Read again' && !document.querySelector('#connect').disabled")
  assert 'No loops yet' in await page.locator('#list').inner_text()
  assert await page.locator('#send').is_disabled()
  assert await page.locator('#backup').is_enabled()
  state=await page.evaluate('__fake()')
  assert state['ports'][0]=={'input':'closed','output':'closed','listener':False},state
  assert state['ports'][1]=={'input':'open','output':'open','listener':True},state
  receipt['checks'].append({'name':'keyboard Connect ignores echo, reaches later valid INFO and reads fake empty slot only','status':'PASS','state':state})
  await page.screenshot(path=str(OUT/'candidate-connected-desktop.png'),full_page=True)
  await page.evaluate('__disconnect()')
  assert 'Device disconnected' in await page.locator('#status').inner_text()
  assert await page.locator('#send').is_disabled() and await page.locator('#backup').is_disabled()
  receipt['checks'].append({'name':'disconnect invalidates ready-to-write state','status':'PASS'})
  await page.set_viewport_size({'width':390,'height':1000})
  await page.screenshot(path=str(OUT/'candidate-disconnected-mobile.png'),full_page=True)
  await page.goto(BASE+'/candidate/docs/breaks/index.html');await page.evaluate("__scenario('all-malformed')")
  await page.locator('#connect').click()
  await page.wait_for_function("document.querySelector('#status').textContent.startsWith('No SMK-37 running DnBOX found.')")
  assert await page.locator('#connect').is_enabled()
  assert await page.locator('#send').is_disabled() and await page.locator('#backup').is_disabled()
  assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  receipt['checks'].append({'name':'all malformed INFO shows final error with retry enabled and writes disabled','status':'PASS','state':await page.evaluate('__fake()')})
  await page.screenshot(path=str(OUT/'candidate-all-malformed-mobile.png'),full_page=True)
  assert not receipt['errors'],receipt['errors']
  assert not receipt['off_origin_requests'],receipt['off_origin_requests']
  receipt['status']='PASS'
  (ROOT/'browser-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
  print(json.dumps({'status':'PASS','browser':browser.version,'matrix':len(receipt['matrix']),'ui_checks':len(receipt['checks']),'errors':receipt['errors'],'off_origin_requests':receipt['off_origin_requests']},indent=2))
  await browser.close()
try: asyncio.run(main())
finally: server.shutdown()
