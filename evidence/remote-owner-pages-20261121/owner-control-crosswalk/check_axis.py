# SPDX-License-Identifier: GPL-3.0-only
"""Verify the empty BREAK roll at 1× and 2× in a sandboxed browser."""
import argparse
import asyncio
import gzip
import hashlib
import json
import runpy
from pathlib import Path
from playwright.async_api import async_playwright

MEASURE = """() => {
 const id=name=>document.getElementById(name), find=selector=>document.querySelector(selector);
 const go=(selector)=>{const node=find(selector); if(!node) throw Error(selector);node.click()};
 go('[data-engine="breaks"]'); go('[data-view="patterns"]');
 go('[data-launch-part="4"][data-pattern="2"]'); go('[data-view="roll"]');
 go('[data-break-view="slices"]');
 const nav=[...document.querySelectorAll('#break-views button')].map(b=>{
  const r=b.getBoundingClientRect(), hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
  return [b.textContent,r.x,r.y,r.width,r.height,b===hit||b.contains(hit)];
 });
 const sizes={};
 for(const scale of [2,1]){
  go('[data-break-view="slices"]'); id('zoom').value=String(scale); go('#break-locks');
  const pane=id('velocity').getBoundingClientRect(),axis=id('velocity').firstElementChild.getBoundingClientRect();
  const cells=[...id('velocity').querySelectorAll('[data-lane-step]:enabled')];
  const complete=cells.filter(c=>{const r=c.getBoundingClientRect();return r.x>=pane.x-1&&r.right<=pane.right+1});
  sizes[scale]={axis:axis.width,pane:pane.width,viewport:id('roll-scroll').clientWidth,
      scale:Number(id('zoom').value),completeSteps:complete.length,focus:document.activeElement===cells[0]};
 }
 const cell=()=>find('#velocity [data-lane-step="7"]');
 const read=()=>cell().getAttribute('aria-valuetext');
 cell().focus(); cell().dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
 const edited=read(); go('#break-review'); const change=id('changes').textContent; id('review-dialog').close();
 go('#undo');const undone=read();go('#redo');const redone=read();
 return {nav,sizes,edited,undone,redone,change};
}"""
async def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('checkout',type=Path);parser.add_argument('output',type=Path);a=parser.parse_args()
 root=a.checkout.resolve();out=a.output.resolve();out.mkdir(parents=True,exist_ok=True)
 site=root/'.output/product-site'
 server=runpy.run_path(str(root/'tests/product-remote/envelope-browser.py'))['server']
 inventory=runpy.run_path(str(root/'evidence/remote-owner-pages-20261121/1f6d7602-review/capture.py'))['INVENTORY']
 with server(site) as origin:
  async with async_playwright() as pw:
   b=await pw.chromium.launch(chromium_sandbox=True)
   try:
    p=await b.new_page(viewport={'width':390,'height':844},has_touch=True)
    data={'renderer':b.version,'errors':[],'appSHA256':hashlib.sha256((site/'remote/app.mjs').read_bytes()).hexdigest(),'sizes':{}}
    p.on('pageerror',lambda e:data['errors'].append(str(e)))
    await p.goto(origin+'/remote/',wait_until='domcontentloaded',timeout=180000)
    await p.wait_for_function("document.getElementById('status')?.textContent.includes('Draft') && !document.querySelector('header').inert",timeout=180000)
    for w,h in [(390,844),(844,390),(1440,900)]:
     await p.set_viewport_size({'width':w,'height':h})
     res=await p.evaluate(MEASURE)
     assert all(abs(v['axis']-v['viewport']*v['scale'])<=1 and v['focus'] for v in res['sizes'].values()),res
     assert res['sizes']['1']['completeSteps']==16 and res['sizes']['2']['completeSteps']==8,res
     assert res['edited']==res['redone']=='-0.1dB' and res['undone']=='Unset' and 'P03 · Step 8 · Level lock: -0.1dB' in res['change'],res
     assert all(r[-1] for r in res['nav']),res
     print('GEOMETRY',w,res['sizes'],flush=True)
     data['sizes'][str(w)]=res
     (out/'geometry.json').write_text(json.dumps(data,indent=2))
     await p.screenshot(path=out/f'{w}-lock.png',animations='disabled',timeout=90000)
     # Reset by the same selected control, keeping the following width independent.
     await p.evaluate("""()=>{document.querySelector('#undo').click()}""")
    assert not data['errors'],data
   finally:await b.close()
if __name__=='__main__':asyncio.run(main())
