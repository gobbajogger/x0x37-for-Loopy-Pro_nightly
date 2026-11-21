# SPDX-License-Identifier: GPL-3.0-only
"""Real Master detail keyboard reveal, complete field and focus-ring clipping.

Optional --baseline-site records an expected negative before the candidate.
Both use the unchanged main fixture's ancestor geometry oracle.
"""
import argparse,asyncio,hashlib,importlib.util,json,os
from pathlib import Path
from playwright.async_api import async_playwright,expect
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('master_main',Path(__file__).with_name('master-more-browser.py'))
main=importlib.util.module_from_spec(spec);spec.loader.exec_module(main)

async def cases(origin,evidence,label):
 rows=[]
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(chromium_sandbox=True)
  try:
   for width,height in [(1440,900),(390,844),(844,390)]:
    out=evidence/label/f'{width}x{height}';out.mkdir(parents=True,exist_ok=False)
    ctx=await browser.new_context(viewport={'width':width,'height':height},has_touch=True)
    try:
     page=await ctx.new_page();await page.goto(origin+'/remote/');await page.locator('[data-view="mix"]').click()
     await page.screenshot(path=str(out/'overview.png'))
     for target,parameter in main.MORE:
      unit=page.locator(main.selector(target,parameter));await unit.scroll_into_view_if_needed();await unit.press('Enter')
      field=page.locator('#parameter-value');await expect(field).to_be_focused()
      await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await expect(field).to_be_focused()
      r=await field.evaluate(main.GEOMETRY)
      extra=await field.evaluate('e=>{const s=getComputedStyle(e);return{offset:parseFloat(s.outlineOffset),margin:s.scrollMarginBlock}}')
      extent=r['outline']['width']+extra['offset'];b=r['unit']['full']
      ring={'left':b['left']-extent,'right':b['right']+extent,'top':b['top']-extent,'bottom':b['bottom']+extent}
      ring_fits=ring['left']>=0 and ring['right']<=width and ring['top']>=0 and ring['bottom']<=height
      for c in r['unit']['clips']:
       clip=c['clip']
       if c['x']:ring_fits=ring_fits and ring['left']>=clip['left'] and ring['right']<=clip['right']
       if c['y']:ring_fits=ring_fits and ring['top']>=clip['top'] and ring['bottom']<=clip['bottom']
      r.update(size=[width,height],target=[target,parameter],ring=ring,ringFits=ring_fits,outlineOffset=extra['offset'],scrollMargin=extra['margin'])
      try:main.whole(r['unit']);main.whole(r['parts']['label']);main.whole(r['parts']['value']);whole=True
      except AssertionError:whole=False
      effective=r['unit']['effective']
      r['pass']=whole and effective['width']>=40 and effective['height']>=40 and all(p['owned'] for p in r['hits']) and r['focused'] and r['focusVisible'] and r['outline']['width']>=2 and ring_fits
      image=out/f'detail-{target}-{parameter}.png';await page.screenshot(path=str(image));r['image']={'path':str(image),'sha256':hashlib.sha256(image.read_bytes()).hexdigest()}
      rows.append(r);(evidence/(label+'-measurements.json')).write_text(json.dumps(rows,indent=2)+'\n')
    finally:await ctx.close()
  finally:await browser.close()
 print('MASTER_FOCUS',label,sum(r['pass'] for r in rows),'/',len(rows),'complete40px+ring+hit+realTab',flush=True)
 return rows

def run():
 parser=argparse.ArgumentParser();parser.add_argument('--site',type=Path,required=True);parser.add_argument('--baseline-site',type=Path);parser.add_argument('--evidence-dir',type=Path,required=True);args=parser.parse_args()
 assert os.environ.get('DNBOX_EMULATOR_RUNTIME'),'Use the explicit qualified runtime environment'
 args.evidence_dir.mkdir(parents=True,exist_ok=False)
 if args.baseline_site:
  with main.base.server(args.baseline_site.resolve()) as origin:rows=asyncio.run(cases(origin,args.evidence_dir,'baseline'))
  assert any(not r['pass'] for r in rows),'Baseline must reproduce the actual clipping defect'
 with main.base.server(args.site.resolve()) as origin:rows=asyncio.run(cases(origin,args.evidence_dir,'candidate'))
 assert len(rows)==36 and all(r['pass'] for r in rows),[(r['size'],r['target'],r['unit']['effective'],r['ring']) for r in rows if not r['pass']]

if __name__=='__main__':run()
