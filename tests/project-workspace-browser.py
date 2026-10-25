# SPDX-License-Identifier: GPL-3.0-only
"""Actual generated UI, synthetic state only; no device or physical MIDI access."""
import asyncio, hashlib, json, threading
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'previews'
PROBE='''window.review={state:()=>({active:workspaceActive,busy,selected:!!selected}),busy:v=>{busy=v;controls();}};'''
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT/'docs'),**kw)
 def log_message(self,*a):pass
 def do_GET(self):
  if self.path.split('?')[0]=='/projects/':
   s=(ROOT/'docs/projects/index.html').read_text().replace('</script>',PROBE+'</script>')
   self.send_response(200);self.send_header('Content-type','text/html');self.end_headers();self.wfile.write(s.encode())
  else:super().do_GET()
checks=[]
def check(v,label):
 checks.append({'label':label,'pass':bool(v)})
 assert v,label
 print('PASS '+label,flush=True)
async def main():
 OUT.mkdir(exist_ok=True)
 srv=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=srv.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{srv.server_port}'
 errors=[];screens=[]
 async with async_playwright() as p:
  b=await p.chromium.launch()
  for width in [320,390,768,1280]:
   page=await b.new_page(viewport={'width':width,'height':900});page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto(base+'/install/')
   await page.wait_for_function('document.getElementById("project-frame").contentWindow.projectWorkspace')
   frame=page.frame_locator('#project-frame'); pf=page.frames[2]
   check(await page.locator('#firmware-tab').is_visible() and await page.locator('#samples-tab').is_visible(),f'{width} top install/sample tasks')
   check(await page.locator('#projects-tab').evaluate('(e)=>e.getBoundingClientRect().bottom<innerHeight'),f'{width} projects entry first viewport')
   check(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'{width} installer no overflow')
   await page.locator('#projects-tab').click()
   await pf.wait_for_function('review.state().active')
   check(await page.locator('#projects-panel').is_visible() and await page.locator('#samples-panel').is_hidden() and await page.locator('#firmware-panel').is_hidden(),f'{width} one panel visible')
   check(await pf.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'{width} project no overflow')
   check(await frame.locator('nav').is_hidden(),f'{width} embedded no duplicate navigation')
   check(await frame.locator('#reset').is_disabled() and await frame.locator('#import').is_disabled(),f'{width} writes denied without connection')
   text=await frame.locator('main').inner_text()
   check('whole live project' in text.lower() and 'arrangement' in text.lower() and 'keep samples' in text.lower(),f'{width} whole-project/reset scope explicit')
   check('autosave' in text.lower(),f'{width} autosave risk explained')
   await frame.locator('#name').fill('Draft song '+str(width));await frame.locator('#portable').uncheck()
   await frame.locator('#file').set_input_files({'name':'corrupt.x0xproject','mimeType':'application/octet-stream','buffer':b'bad'})
   await pf.wait_for_function('!review.state().busy')
   check(await frame.locator('#import').is_disabled(),f'{width} corrupt file cannot import')
   await pf.evaluate('review.busy(true)');await page.locator('#samples-tab').click();await page.wait_for_function('document.getElementById("workspace-message").textContent.includes("operation is in progress")')
   check(await page.locator('#projects-panel').is_visible() and 'operation is in progress' in await page.locator('#workspace-message').inner_text(),f'{width} transfer blocks task switch')
   await pf.evaluate('review.busy(false)');await page.locator('#samples-tab').click();await pf.wait_for_function('!review.state().active')
   check(not (await pf.evaluate('review.state()'))['active'],f'{width} projects relinquishes ownership')
   await page.locator('#projects-tab').click();await pf.wait_for_function('review.state().active')
   check(await frame.locator('#name').input_value()=='Draft song '+str(width) and not await frame.locator('#portable').is_checked(),f'{width} dirty name/options retained')
   check(await frame.locator('#file').evaluate('(e)=>e.files[0].name')=='corrupt.x0xproject',f'{width} chosen file retained')
   await page.go_back();await page.wait_for_function('document.getElementById("samples-tab").getAttribute("aria-current")==="page"')
   await page.go_forward();await pf.wait_for_function('review.state().active')
   check(await page.locator('#projects-tab').get_attribute('aria-current')=='page',f'{width} back/forward restores project task')
   if width in [390,1280]:
    # Fresh actual rendered view with no user/fixture files selected.
    await page.goto(base+'/install/#projects');await page.reload();await page.wait_for_function('document.getElementById("project-frame").contentWindow.projectWorkspace');await page.wait_for_timeout(100)
    path=OUT/f'song-project-workspace-{width}.png';await page.screenshot(path=str(path),full_page=True);screens.append(str(path))
   await page.close()
  page=await b.new_page();await page.goto(base+'/projects/');check(await page.locator('h1').inner_text()=='Songs & projects','standalone projects route renders');check(not await page.locator('nav').is_hidden(),'standalone navigation available');await page.close()
  check(not errors,'no JavaScript errors');await b.close()
 srv.shutdown()
 paths=['web/x0x_installer.html','web/x0x_projects.html','web/x0x_projects.js','scripts/build-preview.mjs','scripts/render-qualified-nightly.mjs','docs/install/index.html','docs/projects/index.html']
 receipt={'result':'PASS','checks':checks,'browser_errors':errors,'screenshots':screens,'sha256':{x:hashlib.sha256((ROOT/x).read_bytes()).hexdigest() for x in paths},'limit':'Headless actual UI with synthetic busy probe; no device/MIDI/flash or deployed proof.'}
 Path('/tmp/song-ux-review.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(str(len(checks))+' project workspace browser checks PASS')
asyncio.run(main())
