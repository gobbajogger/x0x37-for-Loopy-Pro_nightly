# SPDX-License-Identifier: GPL-3.0-only
"""Capture the 23 product drawings or exercise the BREAK toolbar on a built Remote."""
import argparse,asyncio,gzip,hashlib,json,runpy,time
from pathlib import Path
from playwright.async_api import async_playwright,expect
parser=argparse.ArgumentParser()
parser.add_argument('checkout',type=Path)
parser.add_argument('output',type=Path)
parser.add_argument('--break-journey',action='store_true')
parser.add_argument('--site',type=Path)
parser.add_argument('--landscape-only',action='store_true')
a=parser.parse_args()
checkout=a.checkout.resolve();out=a.output.resolve();out.mkdir(parents=True,exist_ok=True)
site=(a.site or checkout/'.output/product-site').resolve()
server=runpy.run_path(str(checkout/'tests/product-remote/envelope-browser.py'))['server']
INVENTORY=runpy.run_path(str(checkout/'evidence/remote-owner-pages-20261121/1f6d7602-review/capture.py'))['INVENTORY']
async def run():
 with server(site) as origin:
  async with async_playwright() as pw:
   b=await pw.chromium.launch(chromium_sandbox=True)
   try:
    ctx=await b.new_context(viewport={'width':1440,'height':900},has_touch=True,accept_downloads=True)
    p=await ctx.new_page();p.set_default_timeout(30000)
    result={'browser':b.version,'appSHA256':hashlib.sha256((site/'remote/app.mjs').read_bytes()).hexdigest(),'states':{},'errors':[]}
    p.on('pageerror',lambda e:result['errors'].append(str(e)))
    p.on('requestfailed',lambda r:print('REQUEST FAILED',r.url,r.failure,flush=True))
    t0=time.monotonic()
    await p.goto(origin+'/remote/',timeout=120000,wait_until='domcontentloaded')
    await p.wait_for_function("typeof document.querySelector('[data-engine]').onclick==='function' && document.getElementById('status').textContent.includes('Draft')",timeout=180000)
    print('BOOT',round(time.monotonic()-t0,2),b.version,flush=True)
    async def snap(key,pages):
     await p.evaluate('document.fonts.ready')
     data=await p.evaluate(INVENTORY)
     data['pages']=pages
     assert data['bodyWidth']==p.viewport_size['width'],(key,data['bodyWidth'],p.viewport_size)
     data['screenshotSHA256']=hashlib.sha256(await p.screenshot(path=out/(key+'.png'),animations='disabled',timeout=45000)).hexdigest()
     result['states'][key]=data
     with gzip.open(out/'inventory.json.gz','wt') as f:json.dump(result,f,separators=(',',':'))
     print('PASS',key,len(data['entries']), flush=True)
    async def view(v):
     if v in ('drums','song','locks'):await p.locator('.overflow').evaluate('e=>e.open=true')
     await p.locator('[data-view="'+v+'"]').evaluate('e=>e.click()')
     await p.locator('.overflow').evaluate('e=>e.open=false')
     await expect(p.locator('#workspace-main')).to_have_attribute('data-layout-view',v,timeout=30000)
    async def part(v):await p.locator('[data-engine="'+v+'"]').click()
    async def choose(pattern):
     await view('patterns');await p.locator(f'[data-launch-part="4"][data-pattern="{pattern}"]').click()
     await view('roll')
    if a.break_journey:
     for w,h in ([(844,390)] if a.landscape_only else [(1440,900),(844,390),(390,844)]):
      await p.set_viewport_size({'width':w,'height':h})
      await part('breaks'); await view('roll'); await p.locator('[data-break-view="slices"]').click()
      await choose(2)
      await p.locator('[data-break-step="15"]').wait_for()
      await expect(p.locator('#break-locks')).to_be_enabled()
      geometry=await p.locator('#break-views button').evaluate_all('items=>items.map(e=>{let r=e.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return [e.textContent,r.x,r.y,r.width,r.height,h===e||e.contains(h)]})')
      for name,x,y,width,height,hit in geometry:assert hit and width>=39 and height>=39,(w,geometry)
      await snap(f'{w}-slices',[11])
      await p.get_by_role('button',name='Step locks',exact=True).click()
      cells=p.locator('#velocity [data-lane-step]:enabled');await expect(cells).to_have_count(16)
      await expect(cells.first).to_be_focused()
      assert await p.locator('#lane-kind').input_value()=='patternLock'
      axis=await p.locator('#velocity .lane-track').evaluate('''track=>{
       const pane=track.parentElement.getBoundingClientRect(),roll=document.querySelector('#roll-scroll'),
        scale=Number(document.querySelector('#zoom').value),inner=track.getBoundingClientRect();
       const visible=[...track.querySelectorAll('[data-lane-step]')].filter(b=>{
        const r=b.getBoundingClientRect();return r.x>=pane.x-1 && r.right<=pane.right+1;});
       return {axis:inner.width,pane:pane.width,viewport:roll.clientWidth,scale,completeSteps:visible.length};
      }''')
      assert abs(axis['axis'] - axis['viewport']*axis['scale']) <= 1,axis
      if axis['scale']==1:assert axis['completeSteps']==16,axis
      print('AXIS',w,axis,flush=True)
      await cells.nth(7).press('ArrowDown')
      await expect(cells.nth(7)).to_have_attribute('aria-valuetext','-0.1dB')
      await snap(f'{w}-lock',[11])
      review=p.locator('#break-review');await review.click()
      await expect(p.locator('#changes')).to_contain_text('BREAK · P03 · Step 8 · Level lock: -0.1dB')
      await p.get_by_role('button',name='Return',exact=True).click();await expect(review).to_be_focused()
      await p.locator('#undo').click()
      await expect(cells.nth(7)).to_have_attribute('aria-valuetext','Unset')
      await p.locator('#redo').click()
      await expect(cells.nth(7)).to_have_attribute('aria-valuetext','-0.1dB')
      await p.locator('.overflow summary').click()
      async with p.expect_download() as dl:await p.locator('#draft-save').click()
      saved=json.loads(Path(await (await dl.value).path()).read_text())
      assert saved['context']['breakView']=='notes' and saved['context']['lane']=='patternLock'
      await p.locator('.overflow summary').click();await p.locator('[data-break-view="slices"]').click()
      await p.locator('#draft-file').set_input_files({'name':'break.json','mimeType':'application/json','buffer':json.dumps(saved).encode()})
      await p.locator('#draft-replace').click()
      await expect(p.locator('[data-break-view="notes"]')).to_have_attribute('aria-pressed','true')
      await expect(cells.nth(7)).to_have_attribute('aria-valuetext','-0.1dB')
      await cells.nth(7).press('Delete')
      await expect(cells.nth(7)).to_have_attribute('aria-valuetext','Unset')
      print('JOURNEY',w,geometry,flush=True)
    else:
     await part('chicago');await view('roll');await snap('01-notes',[1])
     await part('drum909');await view('drums');await snap('02-steps',[2])
     await part('chicago');await view('locks');await snap('03-motion',[3])
     await view('sound');await p.locator('#sound-bank').select_option('CHICAGO');await snap('04-chicago',[4])
     await part('miami');await p.locator('#sound-bank').select_option('MIAMI'); await snap('05-miami',[5])
     await p.locator('#sound-bank').select_option('SuperJ6');await snap('05-superj6',[5])
     await view('mix')
     for label,key,pg in [('levels','06-levels',6),('master','07-master',7),('fx','08-fx',8)]:
      await p.locator(f'[data-mix-mode="{label}"]').click();await snap(key,[pg])
     await part('chicago');await view('patterns');await snap('09-patterns',[9])
     await p.locator('[data-pattern-scope="all"]').click()
     for i in range(5):await p.locator(f'[data-launch-part="{i}"][data-pattern="0"]').click()
     await view('song');await p.locator('#song-add').click();await snap('10-song',[10])
     await part('breaks');await view('roll');await p.locator('[data-break-step="15"]').wait_for();await snap('11-slices',[11])
     await p.locator('[data-break-view="generator"]').click();await snap('11-generator',[11])
     await view('files');await snap('12-projects',[12]);await p.locator('.overflow').evaluate('e=>e.open=true')
     await p.locator('#review').click();await snap('13-review',[13])
     await p.locator('#review-dialog button').first.click();await p.locator('.overflow').evaluate('e=>e.open=false')
     await p.locator('#connect').click();await snap('13-connect',[13]);await p.locator('#close-connection').click()
     await p.set_viewport_size({'width':844,'height':390})
     await part('chicago');await view('roll');await snap('14-notes',[14])
     await part('drum909');await view('drums');await snap('15-steps',[15])
     await view('mix');await p.locator('[data-mix-mode="levels"]').click();await snap('16-levels',[16])
     await part('chicago');await view('locks');await snap('17-motion',[17])
     await part('drum909');await view('sound');await p.locator('#sound-voice').select_option('0');await snap('18-bassdrum',[18])
     await part('chicago');await view('patterns');await p.locator('[data-pattern-scope="selected"]').click();await snap('19-patterns',[19])
     await view('files');await snap('20-projects',[20])
     await p.set_viewport_size({'width':390,'height':844});await part('chicago');await view('roll');await snap('21-notes',[21])
     for i in range(12):
      if await p.locator('#lane-kind').input_value()=='gate':break
      await p.locator('#lane-param').click()
     await expect(p.locator('#lane-kind')).to_have_value('gate');await snap('22-gate',[22])
     await view('mix');await p.locator('[data-mix-mode="levels"]').click();await snap('23-levels',[23])
    assert not result['errors'],result['errors']
    with gzip.open(out/'inventory.json.gz','wt') as f:json.dump(result,f,separators=(',',':'))
    print('COMPLETE',len(result['states']),flush=True)
   finally:await b.close()
asyncio.run(run())
