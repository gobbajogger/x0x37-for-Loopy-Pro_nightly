"""Capture owner-PDF workspaces using the real Remote, and inventory mounted controls."""
import argparse
import asyncio
import hashlib
import json
import sys
from pathlib import Path
from playwright.async_api import async_playwright

SIZES=[(1440,900),(844,390),(390,844),(1024,640)]
INVENTORY="""() => {
 const entries=[];
 const box=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(v=>Math.round(v*100)/100)};
 for(const e of document.querySelectorAll('button, input:not([type="hidden"]), select, a[href], summary, [role="slider"], [role="gridcell"]')){
  if(!e.checkVisibility() || e.closest('details:not([open])') && !e.closest('summary'))continue;
  const r=e.getBoundingClientRect(); if(!r.width || !r.height)continue;
  const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
  const label=e.getAttribute('aria-label')||e.labels?.[0]?.innerText||e.getAttribute('title')||e.innerText;
  entries.push({label:(label||'').trim(),id:e.id,role:e.getAttribute('role')||e.tagName.toLowerCase(),
   field:e.dataset.mixParamLabel||e.dataset.param||e.dataset.sj6Field||e.dataset.masterControl||'',value:e.getAttribute('aria-valuetext')||e.querySelector('output')?.textContent||e.value||'',
   box:box(e),hit:hit===e||e.contains(hit),disabled:e.matches(':disabled')});
 }
 const region=document.querySelector('[data-layout-view]')||document.body;
 return {entries,bodyWidth:document.documentElement.scrollWidth,fonts:document.fonts.status,
    workspace:region.dataset.layoutView||'',headings:[...document.querySelectorAll('h1,h2,h3')].filter(e=>e.checkVisibility()).map(e=>e.innerText),visibleText:document.body.innerText};
}"""

async def inspect(browser,origin,site,out,w,h,groups):
 ctx=await browser.new_context(viewport={'width':w,'height':h},has_touch=True,accept_downloads=True)
 page=await ctx.new_page()
 page.set_default_timeout(12000)
 directory=out/f'{w}x{h}';directory.mkdir(parents=True,exist_ok=True)
 rows={};errors=[];unstaged=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 async def view(v):
  if v in ('drums','song','locks'):
   await page.locator('.overflow').evaluate('e=>e.open=true')
  await page.locator(f'[data-view="{v}"]').evaluate('e=>e.click()')
  await page.locator('.overflow').evaluate('e=>e.open=false')
  await page.wait_for_function("v=>document.getElementById('workspace-main').dataset.layoutView===v",arg=v)
 async def part(p):
  await page.locator(f'[data-engine="{p}"]').evaluate('e=>e.click()')
  await page.wait_for_function("p=>document.getElementById('part').value===p",arg=p)
 async def snap(key,pages):
  await page.evaluate('document.fonts.ready')
  await page.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  data=await page.evaluate(INVENTORY);data['pages']=pages
  png=await page.screenshot(path=directory/(key+'.png'),animations='disabled',timeout=20000)
  data['sha256']=hashlib.sha256(png).hexdigest();rows[key]=data
 async def run(key,fn):
  try: await fn()
  except Exception as e:unstaged.append([key,str(e)]);print(w,key,str(e)[:1500],flush=True);await page.goto(origin+'/remote/');await page.locator('#status').wait_for(state='attached')
 async def notes():
  await part('chicago');await view('roll');await snap('notes',[1,14,21,22])
  for kind in ['chance','pitch','pan','gate','slide','accent','release']:
   for _ in range(12):
    if await page.locator('#lane-kind').input_value()==kind:break
    await page.locator('#lane-param').evaluate('e=>e.click()')
   if await page.locator('#lane-kind').input_value()!=kind:raise AssertionError(kind)
   await snap('lane-'+kind,[3,17,22])
 async def drums():
  for p in ['drum909','drum808']:
   await part(p);await view('drums');await snap(p+'-steps',[2,15])
   navigation=page.get_by_role('navigation',name=p[4:]+' step navigation')
   for label,key in ([('Voices 7–11','lower'),('Accent lane','accent')] if w==844 else []):
    await navigation.get_by_role('button',name=label).evaluate('e=>e.click()');await snap(p+'-'+key,[2,15])
   await view('sound')
   for index in range(11):
    await page.locator('#sound-voice').select_option(str(index));await snap(p+'-sound-'+str(index),[18])
 async def engines():
  for p in ['chicago','miami']:
   await part(p);await view('sound')
   for bank in ['CHICAGO','MIAMI','Synth One','SuperJ6']:
    await page.locator('#sound-bank').select_option(bank)
    await snap(p+'-'+bank.replace(' ','-'),[4] if bank=='CHICAGO' else [5])
 async def mixes():
  await view('mix')
  for mode,refs in [('levels',[6,16,23]),('pan',[6,16,23]),('master',[7]),('sends',[8]),('fx',[8])]:
   await page.locator(f'[data-mix-mode="{mode}"]').evaluate('e=>e.click()');await snap(mode,refs)
 async def motion():
  await part('chicago');await view('locks');await snap('motion',[3,17])
 async def pattern_song():
  await part('chicago');await view('patterns');await snap('patterns',[9,19])
  await page.locator('[data-pattern-scope="all"]').evaluate('e=>e.click()');await snap('patterns-all',[9,19])
  for i in range(5):await page.locator(f'[data-launch-part="{i}"]').first.evaluate('e=>e.click()')
  await view('song');await snap('song-empty',[10])
  await page.locator('#song-add').evaluate('e=>e.click()');await snap('song-row',[10])
  await page.locator('[data-song-on]').first.evaluate('e=>e.click()');await snap('song-muted',[10])
 async def breaks():
  await part('breaks');await view('roll');await snap('break-slices',[11])
  await page.locator('[data-break-view="notes"]').evaluate('e=>e.click()');await snap('break-notes',[11])
 async def project():
  await view('files');await snap('projects',[12,20]);await page.locator('[data-project-preset-open]').evaluate('e=>e.click()')
  dialog=page.locator('#project-preset-dialog')
  await snap('project-open',[12,20]);await dialog.locator('[data-preset-file]').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':b'{}'})
  await dialog.get_by_text('Invalid Synth One file',exact=True).wait_for();await snap('project-invalid',[12,20])
  await dialog.locator('[data-preset-file]').set_input_files(site/'remote/synth-one-banks/Starter Bank.json')
  await dialog.locator('[data-preset-keep]:enabled').wait_for();await snap('project-loaded',[12,20])
  await dialog.locator('[data-preset-keep]').evaluate('e=>e.click()');await snap('project-kept',[12,20])
 async def review():
  await page.locator('.overflow').evaluate('e=>e.open=true');await page.locator('#review').evaluate('e=>e.click()');await snap('review',[13])
  if await page.locator('#review-discard').is_enabled():
   await page.locator('#review-discard').evaluate('e=>e.click()');await snap('discard',[13]);await page.locator('#review-keep').evaluate('e=>e.click()')
  await page.locator('#review-dialog button').first.evaluate('e=>e.click()')
  await page.locator('.overflow').evaluate('e=>e.open=false')
  await page.locator('#connect').evaluate('e=>e.click()');await snap('connect',[13]);await page.locator('#close-connection').evaluate('e=>e.click()')
 try:
  await page.goto(origin+'/remote/');await page.wait_for_function("typeof document.querySelector('[data-engine]').onclick === 'function' && document.querySelector('#status').textContent.includes('Draft')")
  for k,fn in [('notes',notes),('drums',drums),('engines',engines),('mix',mixes),('motion',motion),('patterns',pattern_song),('break',breaks),('projects',project),('review',review)]:
   if not groups or k in groups:await run(k,fn)
 finally:
  (directory/'inventory.json').write_text(json.dumps({'states':rows,'pageErrors':errors,'failures':unstaged,'chromium':browser.version},separators=(',',':')))
  await ctx.close()
 print('CAPTURE',w,h,len(rows),'states',len(errors),'page errors',unstaged,flush=True)

async def main():
 a=argparse.ArgumentParser(description=__doc__);a.add_argument('checkout',type=Path);a.add_argument('site',type=Path);a.add_argument('output',type=Path);a.add_argument('--groups',nargs='+');a.add_argument('--size',nargs=2,type=int);args=a.parse_args()
 import runpy
 server=runpy.run_path(str(args.checkout/'tests/product-remote/envelope-browser.py'))['server']
 with server(args.site.resolve()) as origin:
  async with async_playwright() as pw:
   b=await pw.chromium.launch(chromium_sandbox=True)
   try:
    for w,h in ([tuple(args.size)] if args.size else SIZES):await inspect(b,origin,args.site.resolve(),args.output,w,h,args.groups)
   finally:await b.close()
if __name__=='__main__':asyncio.run(main())
