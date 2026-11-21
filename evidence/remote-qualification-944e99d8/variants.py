"""Capture additional page-9/10 variants and test every landscape drum glyph through real editable controls."""
import argparse, asyncio, hashlib, json, runpy, subprocess
from pathlib import Path
from playwright.async_api import async_playwright
p=argparse.ArgumentParser();p.add_argument('checkout',type=Path);p.add_argument('output',type=Path);p.add_argument('--only-drums',action='store_true');p.add_argument('--only-song',action='store_true');args=p.parse_args()
root=args.checkout.resolve();out=args.output.resolve();out.mkdir(exist_ok=True,parents=True)
site=root/'.output/product-site'
server=runpy.run_path(str(root/'tests/product-remote/envelope-browser.py'))['server']
inventory=runpy.run_path(str(root/'evidence/remote-owner-pages-20261121/1f6d7602-review/capture.py'))['INVENTORY']
digest=lambda b:hashlib.sha256(b).hexdigest()
async def main():
 with server(site) as origin:
  async with async_playwright() as pw:
   b=await pw.chromium.launch(chromium_sandbox=True)
   data={'commit':subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip(),'chromium':b.version,'states':{},'drums':[],'errors':[]}
   async def open_page(w,h):
    page=await b.new_page(viewport={'width':w,'height':h},has_touch=True,reduced_motion='reduce')
    page.on('pageerror',lambda e:data['errors'].append(str(e)))
    page.set_default_timeout(60000)
    await page.goto(origin+'/remote/',wait_until='domcontentloaded');await page.wait_for_function("typeof document.querySelector('[data-engine]').onclick==='function' && document.querySelector('#status').textContent.includes('Draft')")
    return page
   async def view(page,name):
    if name in ('drums','song','locks'):await page.locator('.overflow').evaluate('e=>e.open=true')
    await page.locator(f'[data-view="{name}"]').evaluate('e=>e.click()')
    await page.locator('.overflow').evaluate('e=>e.open=false')
    await page.wait_for_function("v=>document.querySelector('#workspace-main').dataset.layoutView===v",arg=name)
   async def snap(page,name):
    await page.evaluate('document.fonts.ready');row=await page.evaluate(inventory)
    row['pngSHA256']=digest(await page.screenshot(path=out/(name+'.png'),animations='disabled'));data['states'][name]=row
   if not args.only_drums:
    page=await open_page(1440,900)
    await view(page,'patterns');await page.locator('[data-launch-part="2"][data-pattern="0"]').click()
    await snap(page,'p9-selected-bass-a-p01')
    await page.locator('[data-pattern-scope="all"]').click()
    for part in range(5):await page.locator(f'[data-launch-part="{part}"][data-pattern="0"]').click()
    await view(page,'song')
    for row in range(5):await page.locator('#song-add').click()
    assert await page.locator('[data-song-pattern]').count()==25
    await snap(page,'p10-five-rows-all-on')
    for row in range(5):
     await page.locator(f'[data-song-pattern="{row}"][data-song-part="{row}"]').select_option(str(31-row))
     await page.locator(f'[data-song-on="{row}"][data-song-part="{row}"]').click()
     repeat=page.locator(f'[data-song-row="{row}"]');await repeat.fill(str(8-row));await repeat.press('Tab')
    await snap(page,'p10-five-rows-edited')
    data['song']=await page.locator('.song-table tbody tr').evaluate_all("""rs=>rs.map(r=>({patterns:[...r.querySelectorAll('select')].map(e=>e.value),on:[...r.querySelectorAll('[role=switch]')].map(e=>e.getAttribute('aria-checked')),repeats:r.querySelector('[data-song-row]').value}))""")
    assert all(row['patterns'][i]==str(31-i) and row['repeats']==str(8-i) and row['on'][i]=='false' for i,row in enumerate(data['song']))
    await page.close()
    (out/'variants.json').write_text(json.dumps(data,indent=2))
    if args.only_song:
     await b.close();print(data['commit'],b.version,len(data['states']),'states, five independent song rows');return
   page=await open_page(844,390)
   controls=page.locator('[data-drum-sound-strip] button[data-param-occurrence]')
   for kit in ['drum909','drum808']:
    await page.locator(f'[data-engine="{kit}"]').click();await view(page,'sound')
    for voice in range(11):
     await page.locator('#sound-voice').select_option(str(voice))
     count=await controls.count()
     assert count>0,(kit,voice,'no editable controls mounted')
     for i in range(count):
      unit=controls.nth(i)
      # Use the value inspector through its ordinary pointer activation and change listener.
      await unit.click()
      field=page.locator('#parameter-value')
      lo,hi,initial=await field.evaluate('e=>[Number(e.min),Number(e.max),Number(e.value)]')
      async def set_value(value):
       await field.evaluate("(e,v)=>{e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}))}",value)
       await page.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
       return await unit.evaluate("""e=>({label:e.querySelector('[data-drum-label]').innerText, identity:e.dataset.sourceControl || e.dataset.param.split('|').pop(), display:e.querySelector('output').innerText, paths:[...e.querySelectorAll('svg path')].map(p=>p.getAttribute('d')).join('|')})""")
      low=await set_value(lo);high=await set_value(hi);await set_value(initial)
      assert low['display']!=high['display'],(kit,voice,i,lo,hi,low,high)
      data['drums'].append({'kit':kit,'voice':voice,'identity':low['identity'],'label':low['label'],'lowRaw':lo,'highRaw':hi,'lowDisplay':low['display'],'highDisplay':high['display'],'lowPathSHA256':digest(low['paths'].encode()),'highPathSHA256':digest(high['paths'].encode()),'geometryChanges':low['paths']!=high['paths']})
     (out/'variants.json').write_text(json.dumps(data,indent=2));print(kit,voice,len(data['drums']),flush=True)
     if voice==0:await snap(page,kit+'-compact-after-roundtrip')
   assert len(data['drums'])==83 and not data['errors']
   data['changedGlyphs']=sum(r['geometryChanges'] for r in data['drums'])
   await b.close()
   (out/'variants.json').write_text(json.dumps(data,indent=2));print(data['commit'],b.version,len(data['states']),len(data['drums']),data['changedGlyphs'],'changed glyph shapes')
asyncio.run(main())
