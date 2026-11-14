# SPDX-License-Identifier: GPL-3.0-only
# Actual owned-source runtime captures through UI actions, not design HTML injection.
from pathlib import Path
from playwright.sync_api import sync_playwright
import mimetypes,json,hashlib
ROOT=Path(__file__).parent.resolve();OUT=Path('/workspace/dnbox-browser-stage2-validation');rows=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for w,h in [(1440,1000),(1024,900),(390,844),(320,568)]:
  c=b.new_context(viewport={'width':w,'height':h},is_mobile=w<500,has_touch=w<1100);page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   f=ROOT/(r.request.url.split('dnbox-editor.test/',1)[-1] or 'index.html')
   if f.parent!=ROOT or not f.is_file():r.abort();return
   r.fulfill(body=f.read_bytes(),content_type='text/javascript' if f.suffix=='.js' else mimetypes.guess_type(str(f))[0] or 'application/octet-stream')
  c.route('**/*',route);page.goto('http://dnbox-editor.test/');page.wait_for_function('window.dnboxEditor&&document.querySelector("#sound .sound-row")')
  page.locator('#pattern').fill('7');page.locator('#pattern').press('Tab');page.locator('#length').fill('32');page.locator('#length').press('Tab');page.locator('#generator').click();page.get_by_label('Octaves',exact=True).fill('1');page.get_by_label('Octaves',exact=True).press('Tab');page.get_by_role('button',name='Preview New',exact=True).click()
  page.screenshot(path=str(OUT/f'actual-preview-{w}.png'),full_page=True);page.get_by_label('Accept reported replacements and losses').check();page.locator('[data-apply-plan]').click();page.locator('#note-list').click();page.locator('.note-picker button').first.click();page.get_by_label('Filter Cutoff',exact=True).press('ArrowRight');page.evaluate('scrollTo(0,0)');page.screenshot(path=str(OUT/f'actual-piano-{w}.png'),full_page=True)
  page.locator('[data-part="1"]').click();page.locator('#pattern').fill('12');page.locator('#pattern').press('Tab');page.locator('#viewport').focus();page.keyboard.press('Enter');page.keyboard.press('Shift+ArrowRight');page.locator('#sound').get_by_role('button',name='Bite / Gnaw',exact=True).click();page.evaluate('scrollTo(0,0)');page.screenshot(path=str(OUT/f'actual-chicago-{w}.png'),full_page=True)
  page.locator('[data-part="2"]').click();page.locator('[data-cell="0:0"]').click();page.locator('[data-cell="0:4"]').click();page.locator('[data-cell="1:2"]').click();page.evaluate('scrollTo(0,0)');page.screenshot(path=str(OUT/f'actual-909-{w}.png'),full_page=True)
  page.locator('[data-part="4"]').click();page.locator('[data-cell="0:0"]').click();page.locator('[data-cell="1:0"]').click();page.evaluate('scrollTo(0,0)');page.screenshot(path=str(OUT/f'actual-breaks-{w}.png'),full_page=True)
  assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');rows.append({'viewport':[w,h],'captures':5,'script_errors':errors,'source_kind':'ACTUAL_SOURCE_UI_GENERATION_EDIT_ACCEPTANCE','draft':page.evaluate('dnboxEditor.snapshot()'),'source_sha256':{x.name:hashlib.sha256(x.read_bytes()).hexdigest() for x in ROOT.glob('*') if x.suffix in ['.js','.css','.html']}});c.close()
 b.close()
(OUT/'actual-render-receipt.json').write_text(json.dumps(rows,indent=2)+'\n');print('PASS20 actual source runtime captures')
