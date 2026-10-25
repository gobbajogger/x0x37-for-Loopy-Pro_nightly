# SPDX-License-Identifier: GPL-3.0-only
"""Presentation/navigation checks on generated output; no device or firmware calls."""
import asyncio, os, threading
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT/'docs'),**kw)
 def log_message(self,*a):pass
async def main():
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
 threading.Thread(target=server.serve_forever,daemon=True).start()
 count=0
 def check(ok,label):
  nonlocal count
  assert ok,label
  count+=1;print('PASS '+label,flush=True)
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'))
  page=await browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  for width in [320,390,768,1280]:
   await page.set_viewport_size({'width':width,'height':900})
   await page.goto(f'http://127.0.0.1:{server.server_port}/install/')
   check(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'{width}px no page overflow')
   check(await page.locator('#firmware-tab').evaluate('(e)=>e.getBoundingClientRect().bottom<innerHeight') and await page.locator('#samples-tab').evaluate('(e)=>e.getBoundingClientRect().bottom<innerHeight'),'install and import routes visible in first viewport')
   check(await page.locator('#samples-tab').inner_text()=='Import samples','sample import is explicit at page top')
   check(await page.locator('.workspace-nav').evaluate('(e)=>e.getBoundingClientRect().bottom<document.querySelector(".hero").getBoundingClientRect().top'),'task routes precede product story')
   check(await page.locator('.setup-grid section').count()==3,'three musical setups explained')
   check(await page.locator('.setup-grid ol').evaluate_all('(els)=>els.length===3 && els.every(e=>e.getBoundingClientRect().height>0)'),'all setup steps visible by default')
   check(await page.locator('svg[role="img"][aria-label]').count()==3,'all faithful screen vectors have accessible names')
   check(await page.locator('svg.ui-illustration[viewBox="0 0 240 240"]').count()==3,'native square geometry for all three screens')
   check(await page.locator('svg.ui-illustration image').count()==0 and await page.locator('svg.ui-illustration text').count()==0,'screen art uses vector paths and original glyph outlines')
   check(await page.locator('.feature-grid').evaluate('(e)=>!/[a-f0-9]{8}/.test(e.innerText)'),'feature captions omit raw provenance hashes')
   check('Upcoming UI' in await page.locator('.illustration-label').last.inner_text(),'SMC newer-source status visible')
   check('BD, SD, LT, MT, HT, RS, CP and CH' in await page.locator('.feature-grid').inner_text(),'verified drum names accompany current SMC preview')
   check(await page.locator('.features').evaluate('(e)=>e.getBoundingClientRect().bottom<document.querySelector("#workflows").getBoundingClientRect().top'),'Closer look precedes integration as requested')
   check('65a0588' in await page.locator('.render-reference').text_content() and 'not downloadable or validated firmware' in await page.locator('.render-reference').text_content(),'source-preview pin and failed-link limitation retained')
   check(await page.locator('svg.ui-illustration').evaluate_all('(els)=>{const ids=els.flatMap(e=>[...e.querySelectorAll("[id]")].map(x=>x.id));return new Set(ids).size===ids.length}'),'inline vector clipping IDs are unique')
   check(await page.locator('.workspace-nav').evaluate('(e)=>e.getBoundingClientRect().bottom<document.querySelector(".features").getBoundingClientRect().top'),'task choice before illustrations')
   check(await page.locator('.illustration-label').last.is_visible() and 'not in offered builds' in await page.locator('.illustration-label').last.inner_text(),'SMC limitation visible before reference disclosure')
   check(await page.locator('#go').evaluate('(e)=>e.getBoundingClientRect().top<document.querySelector(".features").getBoundingClientRect().top'),'install action precedes feature visuals')
   check(not await page.locator('#package-details').evaluate('(e)=>e.open'),'source hashes and verbose provenance optional by default')
   check(await page.locator('#models').evaluate('(e)=>e.getBoundingClientRect().top<document.querySelector("#versionrow").getBoundingClientRect().top') or await page.locator('#modeldetails').is_hidden(),'device selection precedes firmware selection when available')
   check(not await page.locator('.render-reference').evaluate('(e)=>e.open'),'original raster references secondary by default')
   await page.locator('#samples-tab').focus();await page.keyboard.press('Enter')
   await page.wait_for_function('document.getElementById("samples-tab").getAttribute("aria-current")=="page"')
   check(await page.locator('#samples-tab').get_attribute('aria-current')=='page','keyboard switches task and current state')
   await page.wait_for_function('document.getElementById("sample-frame").contentWindow.sampleWorkspace')
   child=page.frames[1]
   check(await child.locator('#send').is_disabled(),'sample send denied before device read')
   check(await child.evaluate('document.documentElement.scrollWidth<=innerWidth'),'sample panel fits viewport')
   await page.locator('#firmware-tab').focus();await page.keyboard.press('Enter')
   await page.wait_for_function('document.getElementById("firmware-tab").getAttribute("aria-current")=="page"')
   check(await page.locator('#firmware-panel').is_visible() and await page.locator('#samples-panel').is_hidden(),'keyboard return displays firmware task')
   check(await page.locator('#go').is_disabled(),'keyboard return cannot enable install')
  await page.goto(f'http://127.0.0.1:{server.server_port}/install/#buildarchive')
  check(await page.locator('#buildarchive').evaluate('(e)=>e.open'),'archive deep link preserved')
  check(not errors,'no script errors')
  await browser.close()
 server.shutdown();print(f'{count} presentation checks PASS')
asyncio.run(main())
