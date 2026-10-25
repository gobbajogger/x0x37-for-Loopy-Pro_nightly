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
   check(await page.locator('svg[role="img"][aria-label]').count()==3,'all faithful screen vectors have accessible names')
   check(await page.locator('svg.ui-illustration[viewBox="0 0 240 240"]').count()==3,'native square geometry for all three screens')
   check(await page.locator('svg.ui-illustration image').count()==0 and await page.locator('svg.ui-illustration text').count()==0,'screen art uses vector paths and original glyph outlines')
   check(await page.locator('.illustration-label').first.inner_text()=='Public DEV source · 54f2ffbc','HOME offered-source context is visible')
   check('Historical newer-source preview' in await page.locator('.illustration-label').last.inner_text(),'SMC historical status visible')
   check('redesign is still in progress' in await page.locator('.feature-grid').inner_text(),'pending redesign gap visible')
   check(await page.locator('svg.ui-illustration').evaluate_all('(els)=>{const ids=els.flatMap(e=>[...e.querySelectorAll("[id]")].map(x=>x.id));return new Set(ids).size===ids.length}'),'inline vector clipping IDs are unique')
   check(await page.locator('.workspace-nav').evaluate('(e)=>e.getBoundingClientRect().bottom<document.querySelector(".features").getBoundingClientRect().top'),'task choice before illustrations')
   check(await page.locator('.illustration-label').last.is_visible() and 'not in offered builds' in await page.locator('.illustration-label').last.inner_text(),'SMC limitation visible before reference disclosure')
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
