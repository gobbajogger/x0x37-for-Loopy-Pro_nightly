# SPDX-License-Identifier: GPL-3.0-only
"""Owned pages, real WAV parsing and DOM; simulated slot/MIDI boundaries, no hardware."""
import asyncio, json, os, threading, struct, math
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
IP='''window.probe={state:()=>({active:workspaceActive,writing,stock:!!stock}),busy:v=>{writing=v;},scanBusy:v=>{workspaceScanning=v;}};'''
SP='''window.sampleWrites=0;const reviewWriteImage=writeImage;writeImage=async(...args)=>{window.sampleWrites++;return reviewWriteImage(...args);};window.probe={seed:()=>{readOk=true;lay={count:1,size:81920,slots:[{size:81920,nz:false}]};dev=[null];render();},state:()=>({active:sampleActive,readOk,busy,loops:loops.length,names:loops.map(l=>l.file),send:!$("send").disabled}),busy:v=>{busy=v;render();},invalidate:()=>sampleWorkspace.invalidate(),holdDecode:()=>{const original=decode;decode=async f=>{await new Promise(r=>window.releaseDecode=r);decode=original;return original(f);};},clear:()=>{loops=[];render();},hold:()=>{window.requests=0;connect=async()=>{window.requests++;await new Promise(r=>window.releaseConnect=r);throw Error("simulated permission rejection");};}};'''
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT/'docs'),**kw)
 def log_message(self,*a):pass
 def do_GET(self):
  path=self.path.split('?')[0]
  if path in ['/install/','/breaks/']:
   s=(ROOT/'docs'/path.strip('/')/'index.html').read_text().replace('</script>',(IP if path=='/install/' else SP)+'</script>')
   self.send_response(200);self.send_header('Content-type','text/html');self.end_headers();self.wfile.write(s.encode())
  else:super().do_GET()
checks=[]
def check(v,label):
 checks.append((label,bool(v)));print(('PASS ' if v else 'FAIL ')+label,flush=True)
def wav(samples):
 data=b''.join(struct.pack('<h',int(1000*math.sin(i/10))) for i in range(samples))
 return b'RIFF'+struct.pack('<I',36+len(data))+b'WAVEfmt '+struct.pack('<IHHIIHH',16,1,1,44100,88200,2,16)+b'data'+struct.pack('<I',len(data))+data
async def main():
 srv=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=srv.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{srv.server_port}'
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'))
  page=await browser.new_page(viewport={'width':1280,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(base+'/install/');await page.wait_for_function('document.getElementById("sample-frame").contentWindow.sampleWorkspace')
  child=page.frames[1]
  check(await page.locator('#go').is_disabled(),'empty preview cannot install')
  check('Not connected' in await page.locator('#conn').inner_text(),'no invented connection')
  await page.locator('#samples-tab').click();await child.wait_for_function('probe.state().active')
  check(await page.locator('#firmware-panel').is_hidden(),'one action panel visible')
  check(await child.locator('.home').is_hidden(),'embedded panel has no duplicate home control')
  check(await child.evaluate('getComputedStyle(document.body).backgroundColor==="rgb(20, 25, 28)"'),'embedded sample panel matches workspace theme')
  check(await child.locator('#send').is_disabled(),'samples require real read before writing')
  await child.evaluate('probe.seed()')
  await child.locator('#files').set_input_files({'name':'loop-a.wav','mimeType':'audio/wav','buffer':wav(8820)})
  await child.wait_for_function('probe.state().loops===1')
  check((await child.evaluate('probe.state()'))['names']==['loop-a.wav'],'real WAV parsing stages one loop')
  await child.locator('.rep').click(no_wait_after=True)
  await child.locator('#files').set_input_files({'name':'loop-b.wav','mimeType':'audio/wav','buffer':wav(4410)})
  await child.wait_for_function('probe.state().names[0]==="loop-b.wav"')
  check((await child.evaluate('probe.state()'))['loops']==1,'file replace retains count')
  await child.locator('#files').set_input_files([])
  check((await child.evaluate('probe.state()'))['names']==['loop-b.wav'],'chooser cancel retains draft')
  await child.evaluate('probe.holdDecode()')
  await child.locator('#files').set_input_files({'name':'loop-c.wav','mimeType':'audio/wav','buffer':wav(4410)})
  await child.wait_for_function('typeof releaseDecode === "function"')
  await page.locator('#firmware-tab').click()
  check(await page.locator('#firmware-panel').is_hidden(),'pending audio decode prevents firmware operation')
  await child.evaluate('releaseDecode()');await child.wait_for_function('!probe.state().busy')
  await child.locator('.del').last.click()
  await child.locator('#archive').set_input_files({'name':'bad.x0xslots','mimeType':'application/octet-stream','buffer':b'invalid'})
  await child.wait_for_function('document.getElementById("status").textContent.length>0')
  check(''!=await child.locator('#status').inner_text() and await child.evaluate('sampleWrites===0'),'invalid backup reports an error without device writes')
  await page.locator('#firmware-tab').click();await page.locator('#samples-tab').click()
  check((await child.evaluate('probe.state()'))['names']==['loop-b.wav'],'task switches retain draft and same frame')
  await page.go_back();check(await page.locator('#samples-panel').is_hidden(),'browser back restores firmware task')
  await page.go_forward();check(await page.locator('#firmware-panel').is_hidden(),'browser forward restores sample task')
  await child.evaluate('probe.busy(true)');await page.locator('#firmware-tab').click()
  check(await page.locator('#firmware-panel').is_hidden(),'sample operation prevents competing firmware operation')
  await child.evaluate('probe.busy(false)');await page.locator('#firmware-tab').click();await page.evaluate('probe.busy(true)');await page.locator('#samples-tab').click()
  check(await page.locator('#samples-panel').is_hidden(),'firmware operation prevents sample navigation')
  await page.evaluate('probe.busy(false)');await page.locator('#samples-tab').click();await child.evaluate('probe.invalidate()')
  check((await child.evaluate('probe.state()'))['names']==['loop-b.wav'] and await child.locator('#send').is_disabled(),'firmware invalidation preserves draft but denies stale write')
  page.once('dialog',lambda d:d.dismiss());await child.locator('#connect').click()
  check((await child.evaluate('probe.state()'))['names']==['loop-b.wav'],'cancel reread preserves prepared sample')
  await child.evaluate('probe.clear();probe.hold()');await child.locator('#connect').click();await child.evaluate('document.getElementById("connect").click()')
  check(await child.evaluate('requests===1'),'repeated connect coalesces while permission pending')
  await child.evaluate('releaseConnect()');await child.wait_for_function('!probe.state().busy')
  check('simulated permission rejection' in await child.locator('#status').inner_text(),'permission failure shown and retry enabled')
  await page.locator('#firmware-tab').click();await page.locator('#stockfile').set_input_files({'name':'bad.fwsc','mimeType':'application/octet-stream','buffer':b'x'*1000})
  check(await page.locator('#stockgo').is_disabled(),'malformed local package denied')
  await page.locator('#stockfile').set_input_files([]);check(await page.locator('#stockgo').is_disabled(),'cancelled firmware file chooser stays denied')
  await page.reload();await page.wait_for_function('document.getElementById("sample-frame").contentWindow.sampleWorkspace')
  for width in [320,390,1280]:
   await page.set_viewport_size({'width':width,'height':900});await page.screenshot(path=str(ROOT.parent/f'workspace-{width}.png'),full_page=True)
   check(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'{width}px no horizontal overflow')
   await page.locator('#samples-tab').click()
   check(await page.frames[1].evaluate('document.documentElement.scrollWidth<=innerWidth'),f'{width}px sample panel has no horizontal overflow')
   await page.locator('#firmware-tab').click()
  check(not errors,'no page script errors: '+str(errors))
  await browser.close()
 srv.shutdown();print(json.dumps({'checks':len(checks),'failures':[x for x,v in checks if not v]}));assert all(v for _,v in checks)
asyncio.run(main())
