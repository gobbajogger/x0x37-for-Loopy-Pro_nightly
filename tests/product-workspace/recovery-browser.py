"""Real startup failure/retry and invalid first draft recovery on built files."""
import asyncio,importlib.util,json,subprocess,tempfile
from pathlib import Path
from playwright.async_api import async_playwright,expect
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('core',ROOT/'tests/product-remote/envelope-browser.py');core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
async def geometry(page):
 return await page.locator('main').evaluate("e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}")

async def readable(page, selector):
 # A box alone can still contain clipped text. Check actual rendered text ranges.
 result=await page.locator(selector).evaluate("""e=>{
  const box=e.getBoundingClientRect(),style=getComputedStyle(e),range=document.createRange();range.selectNodeContents(e);
  const rects=[...range.getClientRects()].filter(r=>r.width&&r.height);
  return {box:{x:box.x,y:box.y,width:box.width,height:box.height},font:parseFloat(style.fontSize),
   visible:rects.length>0&&rects.every(r=>r.left>=box.left-1&&r.right<=box.right+1&&r.top>=box.top-1&&r.bottom<=box.bottom+1),
   viewport:box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight};
 }""")
 assert result['font']>=11 and result['visible'] and result['viewport'],(selector,'Text must be readable without clipping',result)
 return result['box']

async def cases(origin):
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(chromium_sandbox=True)
  try:
   for width,height in [(1440,900),(390,844),(844,390)]:
    for bad in (['trace','catalog','components','source-sounds','malformed'] if width==1440 else ['malformed']):
     context=await browser.new_context(viewport={'width':width,'height':height});page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
     try:
      source='catalog' if bad=='malformed' else bad
      async def refuse(route):await route.fulfill(status=200 if bad=='malformed' else 503,content_type='application/json',body='invalid')
      await page.route('**/remote/'+source+'.json',refuse)
      # Start the UI assertion deadline when the browser receives the injected failure.
      # Module loading can continue after the document load event.
      async with page.expect_response(lambda response: response.url == f'{origin}/remote/{source}.json') as pending_response:
       await page.goto(origin+'/remote/')
      response=await pending_response.value
      assert response.status == (200 if bad=='malformed' else 503), (source,response.status)
      await expect(page.locator('#workspace-error')).to_be_visible();await expect(page.locator('#workspace-retry')).to_be_focused();await expect(page.locator('[data-view="sound"]')).to_be_disabled();assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
      await page.unroute('**/remote/'+source+'.json',refuse)
      async with page.expect_event('domcontentloaded'):
       await page.locator('#workspace-retry').click()
      # Retry starts a new document. Wait until its four source files finish
      # loading before measuring whether the UI becomes usable.
      await page.wait_for_function('''() => ['trace', 'catalog', 'components', 'source-sounds'].every(name => {
       const url = new URL(name + '.json', location.href).href;
       return performance.getEntriesByName(url, 'resource').some(entry => entry.responseEnd > 0);
      })''')
      await expect(page.locator('main')).to_have_attribute('aria-busy','false');await expect(page.locator('[data-view="sound"]')).to_be_enabled();await page.locator('[data-view="sound"]').click();await page.locator('#part').select_option('chicago');await expect(page.locator('#workspace-error')).to_be_hidden()
      wave=page.locator('[data-native-param="source-sound/CHICAGO/0|1:2:0:0:0"]');await wave.press('Home');await wave.press('ArrowRight');await expect(wave).to_have_value('1')
      main_geometry=await geometry(page)
      await page.locator('#draft-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'invalid'})
      await expect(page.locator('#draft-dialog')).to_be_visible();await expect(page.locator('#draft-replace')).to_be_disabled();assert await page.locator('#draft-preview').inner_text();await readable(page,'#draft-preview');await page.locator('#draft-cancel').click();await expect(wave).to_have_value('1')
      assert await geometry(page)==main_geometry,('Feedback must not shrink editing geometry',main_geometry,await geometry(page))
      status_box=await readable(page,'#status');assert status_box['width']>=100 and status_box['height']>=16,('Feedback must be visibly readable',status_box)
      # This longer real validation failure wraps on phones; every word remains available.
      invalid=dict(schema='dnbox-local-workspace-draft/1',kind='local-preview-only',identity={k:'0'*64 for k in ['trace','catalog','components','source-sounds']},notes=[],parameters=[],motion={},launch=[],song=[],soundBanks=[],context={})
      await page.locator('#draft-file').set_input_files({'name':'wrong-source.json','mimeType':'application/json','buffer':json.dumps(invalid).encode()})
      message='Local draft: source identity mismatch; no automatic migration'
      await expect(page.locator('#draft-preview')).to_have_text(message);await readable(page,'#draft-preview');await expect(page.locator('#draft-replace')).to_be_disabled();await page.locator('#draft-cancel').click();await expect(page.locator('#status')).to_have_text(message)
      assert await geometry(page)==main_geometry,'Long error feedback must not shrink editing geometry'
      await expect(wave).to_have_value('1');assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors
      print(f'PASS recovery {bad} {width}x{height}: retry, visible invalid draft + full source mismatch, stable main geometry, authored value retained',flush=True)
     finally:await context.close()
  finally:await browser.close()
def main():
 output=ROOT/'.output';output.mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='recovery-',dir=output) as tmp:
  subprocess.run(['node','scripts/build-product-site.mjs','--output',tmp],cwd=ROOT,check=True)
  with core.server(tmp) as origin:asyncio.run(cases(origin))
if __name__=='__main__':main()
