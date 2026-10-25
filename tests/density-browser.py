# SPDX-License-Identifier: GPL-3.0-only
"""Actual generated UI; no MIDI/device requests or private data."""
import asyncio,threading
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
class H(SimpleHTTPRequestHandler):
 def __init__(self,*a,**k):super().__init__(*a,directory=str(ROOT/'docs'),**k)
 def log_message(self,*a):pass
async def main():
 s=ThreadingHTTPServer(('127.0.0.1',0),H);threading.Thread(target=s.serve_forever,daemon=True).start();n=0
 async with async_playwright() as p:
  b=await p.chromium.launch()
  for w in [320,390,768,1280]:
   page=await b.new_page(viewport={'width':w,'height':900})
   for route in ['firmware','samples','projects']:
    await page.goto(f'http://127.0.0.1:{s.server_port}/install/#{route}');await page.wait_for_timeout(150)
    for id in ['firmware-tab','samples-tab','projects-tab']:
     assert await page.locator('#'+id).evaluate('(e)=>e.getBoundingClientRect().bottom<=innerHeight && e.getBoundingClientRect().height>=44'),(w,route,id);n+=1
    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth');n+=1
    assert await page.locator('.features').is_visible() and await page.locator('#workflows').is_visible();n+=1
    assert await page.locator('.features').evaluate('(e)=>e.getBoundingClientRect().bottom<=document.querySelector("#workflows").getBoundingClientRect().top');n+=1
    assert await page.locator('.setup-grid ol').evaluate_all('(els)=>els.length===3 && els.every(e=>e.getBoundingClientRect().height>0 && !e.closest("details"))');n+=1
    assert await page.locator('.explore-link').count()==0;n+=1
    assert 'not in offered builds' in await page.locator('.illustration-label').last.inner_text();n+=1
    assert await page.locator('#'+route+'-tab').get_attribute('aria-current')=='page';n+=1
   await page.close()
  await b.close()
 s.shutdown();print(f'{n} density and cross-route setup checks PASS')
asyncio.run(main())
