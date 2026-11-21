"""Actual shipped controls preserve raw vs normalized glyph domains."""
import asyncio,importlib.util,subprocess,tempfile
from pathlib import Path
from playwright.async_api import async_playwright,expect
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('envelope_core',Path(__file__).with_name('envelope-browser.py'));core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
async def miami_controls(page):
 await page.emulate_media(reduced_motion='no-preference')
 field = page.locator('#parameter-value')
 for slot,part in enumerate(['chicago','miami']):
  await page.locator('#part').select_option(part)
  await page.locator('#sound-bank').select_option('MIAMI')
  for parameter,section,states in [
   (0,'CARRIER',[(0,'TRI'),(31,'TRI'),(32,'SAW'),(95,'SAW'),(96,'SQR')]),
   (6,'XMOD',[(0,'TRI'),(21,'TRI'),(22,'SAW'),(63,'SAW'),(64,'SQR'),(105,'SQR'),(106,'PUL')]),
   (11,'WOBBLE',[(0,'TRI'),(21,'TRI'),(22,'DOWN'),(63,'DOWN'),(64,'UP'),(105,'UP'),(106,'SQR')]),
  ]:
   control=page.locator(f'[data-param="source-sound/MIAMI/{slot}|1:2:{slot}:{parameter}:1"]')
   summary=page.locator('#glyph-card .panel-section').filter(has=page.locator('h3').filter(has_text=section)).locator('.panel-cell').first
   await control.press('Enter')
   snapshot=await control.locator('output').text_content()
   assert snapshot=={0:'SQR',6:'SAW',11:'SQR'}[parameter]
   images={}
   for value,name in states:
    await field.fill(str(value))
    await field.press('Tab')
    await expect(control.locator('output')).to_have_text(name)
    await expect(page.locator('#parameter-readout')).to_have_text(name)
    await expect(summary.locator('output')).to_have_text(name)
    assert ', '+name+', local draft' in await control.get_attribute('aria-label')
    assert await control.locator('[data-glyph-fn]').evaluate('e=>e.glyphAnimator.idle')
    canvas=await control.locator('canvas').evaluate('e=>e.toDataURL()')
    svg=await summary.locator('svg path').last.get_attribute('d')
    assert images.setdefault(name,(canvas,svg))==(canvas,svg)
   assert len(set(images.values()))==len(images)
   await page.locator('#parameter-undo').click()
   await expect(control.locator('output')).to_have_text(states[-2][1])
   await expect(field).to_have_value(str(states[-2][0]))
   await page.locator('#redo').evaluate('b=>b.click()')
   await expect(control.locator('output')).to_have_text(states[-1][1])
   await expect(field).to_have_value(str(states[-1][0]))
 await page.emulate_media(reduced_motion='reduce')
 print('PASS Miami carrier, XMOD and wobble names, live canvas, SVG and Undo/Redo on both bass slots',flush=True)

async def cases(origin):
 async with async_playwright() as pw:
  for w,h in [(1440,900),(390,844),(844,390)]:
   browser=await pw.chromium.launch(chromium_sandbox=True)
   try:
    context=await browser.new_context(viewport={'width':w,'height':h},reduced_motion='reduce');page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    try:
     await page.goto(origin+'/remote/');await page.locator('[data-view="sound"]').click();await page.locator('#part').select_option('chicago')
     control=page.locator('[data-native-param="source-sound/CHICAGO/0|1:2:0:0:0"]');await control.wait_for();images={}
     for raw,key in [(0,'Home'),(1,'ArrowRight'),(2,'ArrowRight'),(127,'End')]:
      await control.press(key)
      actual=await control.evaluate("e=>{const g=e.closest('.funkybeats-typed-unit').querySelector('[data-glyph-fn]');return {raw:+e.value,target:g.glyphAnimator.target,domain:g.dataset.glyphDomain,pixels:g.querySelector('canvas').toDataURL()}}")
      assert actual['raw']==raw and abs(actual['target']-raw/127)<1e-12,actual;assert actual['domain']=='normalized';images[raw]=actual['pixels']
     assert images[1]!=images[127] and images[2]!=images[127]
     if w==1440:await miami_controls(page)
     await page.locator('[data-view="mix"]').click();drive=page.locator('[data-mix-param-label="Master Drive"]');await drive.press('Enter');field=page.locator('#parameter-value')
     for raw in [0,1,2,127]:
      await field.fill(str(raw));await field.press('Tab');target=await drive.locator('[data-glyph-fn]').evaluate('e=>e.glyphAnimator.target');assert abs(target-raw/127)<1e-12,(raw,target)
     assert not errors,errors;assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
     print(f'PASS glyph actual raw0/1/2/127 Sound+Mix {w}x{h}',flush=True)
    finally:await context.close()
   finally:await browser.close()
def main():
 out=ROOT/'.output';out.mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='glyph-domain-',dir=out) as tmp:
  subprocess.run(['node','scripts/build-product-site.mjs','--output',tmp],cwd=ROOT,check=True)
  with core.server(tmp) as origin:asyncio.run(cases(origin))
if __name__=='__main__':main()
