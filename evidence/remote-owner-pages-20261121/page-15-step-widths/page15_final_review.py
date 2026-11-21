"""Independent page 15 first-viewport geometry and input audit over pre/post built product bytes."""
from pathlib import Path
from playwright.async_api import async_playwright,expect
from hashlib import sha256
import asyncio,json,runpy,subprocess,argparse
cli=argparse.ArgumentParser();cli.add_argument('before',type=Path);cli.add_argument('after',type=Path);cli.add_argument('out',type=Path);args=cli.parse_args()
out=args.out.resolve();out.mkdir(parents=True,exist_ok=True)
measure="""() => {
 const cells=[...document.querySelectorAll('.sequencer-grid [data-drum-note]')], accents=[...document.querySelectorAll('[data-drum-accent-step]')];
 function fully(el) {
  const r=el.getBoundingClientRect(); let x1=0,y1=0,x2=innerWidth,y2=innerHeight;
  for(let p=el.parentElement;p;p=p.parentElement){
   const s=getComputedStyle(p), b=p.getBoundingClientRect();
   if(/auto|scroll|clip|hidden/.test(s.overflowX)){x1=Math.max(x1,b.x); x2=Math.min(x2,b.right);}
   if(/auto|scroll|clip|hidden/.test(s.overflowY)){y1=Math.max(y1,b.y); y2=Math.min(y2,b.bottom);}
  }
  return r.width>0 && r.height>0 && r.left>=x1-.01 && r.top>=y1-.01 && r.right<=x2+.01 && r.bottom<=y2+.01 && el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
 }
 const shown=cells.map((el,i)=>fully(el)?[Math.floor(i/16)+1,1+(i%16)]:null).filter(Boolean);
 const buttons=[...document.querySelectorAll('.drum-step-navigation button, [aria-label$="step navigation"] button')];
 const panel=document.querySelector('.drum-sound-panel').getBoundingClientRect(); const hit=cells[0].getBoundingClientRect();
 return {mounted:cells.length,accent:accents.length,whole:shown,voiceRows:[...new Set(shown.map(x=>x[0]))],stepsFirstVoice:shown.filter(x=>x[0]===1).map(x=>x[1]),cellWidth:hit.width,cellHeight:hit.height,nav:buttons.map(b=>({name:b.textContent,whole:fully(b)})),soundPanelWidth:panel.width,bodyWidth:document.documentElement.scrollWidth};
}"""
async def main():
 evidence={'variants':{},'errors':[]};server=runpy.run_path(str(args.before/'tests/product-remote/envelope-browser.py'))['server']
 async with async_playwright() as p:
  browser=await p.chromium.launch(chromium_sandbox=True);evidence['chromium']=browser.version
  try:
   for label,repo in [('before',args.before.resolve()),('after',args.after.resolve())]:
    site=repo/'.output/product-site';css=(site/'remote/style.css').read_bytes()
    assert css==(repo/'web/product-site/remote/style.css').read_bytes()
    rhs={'baseCommit':subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip(),'cssSHA256':sha256(css).hexdigest(),'sourceManifestSHA256':sha256((repo/'web/product-site/SOURCE-MANIFEST.json').read_bytes()).hexdigest(),'states':[]};evidence['variants'][label]=rhs
    with server(site) as origin:
     pg=await browser.new_page(viewport={'width':844,'height':390},has_touch=True)
     pg.set_default_timeout(60000);pg.on('pageerror',lambda e:evidence['errors'].append(str(e)))
     await pg.goto(origin+'/remote/',wait_until='domcontentloaded');await expect(pg.locator('main')).to_have_attribute('aria-busy','false',timeout=60000)
     for w,h in [(844,390),(739,390),(740,390),(900,390),(901,390),(1000,390),(1080,390),(1280,390),(390,844),(1440,900)]:
      await pg.set_viewport_size({'width':w,'height':h})
      for kit in (['909','808'] if w==844 else ['909']):
       await pg.locator(f'[data-engine="drum{kit}"]').evaluate('e=>e.click()')
       await pg.locator('.overflow').evaluate('e=>e.open=true')
       await pg.locator('[data-view="drums"]').evaluate('e=>e.click()')
       await pg.locator('.overflow').evaluate('e=>e.open=false')
       await pg.wait_for_function("document.querySelector('.sequencer-grid [data-drum-note]')")
       await pg.evaluate('document.fonts.ready')
       await pg.evaluate("""() => {for(const e of document.querySelectorAll('.funkybeats-sequencer,.sequencer-grid')){e.scrollTo(0,0)}window.scrollTo(0,0)}""")
       await pg.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
       state=await pg.evaluate(measure);state.update(kit=kit,size=[w,h]);rhs['states'].append(state)
       assert state['mounted']==176 and state['accent']==16 and state['bodyWidth']==w,(label,state)
       if w==844:
        assert state['cellWidth']>=40 and state['cellHeight']>=40 and len(state['nav'])==4 and all(btn['whole'] for btn in state['nav'])
        name=f'{label}-{kit}-{w}.png';state['screenshot']=name;state['screenshotSHA256']=sha256(await pg.screenshot(path=out/name,animations='disabled')).hexdigest()
        cells=pg.locator('.sequencer-grid [data-drum-note]')
        index=10 if label=='after' else 8
        cell=cells.nth(index)
        v=await cell.get_attribute('aria-pressed');await cell.tap();await expect(cell).not_to_have_attribute('aria-pressed',v);await pg.locator('#undo').press('Enter');await expect(cell).to_have_attribute('aria-pressed',v)
        state['tapUndo']={'step':index+1,'restored':v}
        controls=pg.locator('.drum-sound-panel .source-hit')
        output=pg.locator('.drum-sound-panel .drum-frame-values [data-param-value]')
        fields=await output.evaluate_all("""nodes=>nodes.map(el=>{const r=el.getBoundingClientRect(),p=el.closest('.source-scene').getBoundingClientRect(),s=getComputedStyle(el);return {text:el.innerText,px:parseFloat(s.fontSize),left:r.x-p.x,right:r.right-p.x,top:r.y-p.y,bottom:r.bottom-p.y,availableWidth:p.width,visible:s.visibility==='visible'&&s.display!=='none'&&r.width>0&&r.height>0}})""")
        assert len(fields)==await controls.count() and len(fields)==(6 if kit=='909' else 5)
        for i,field in enumerate(fields):
         assert field['visible'] and field['text'].strip() and field['left']>=-1 and field['right']<=field['availableWidth']+1,field
         control=controls.nth(i);await control.scroll_into_view_if_needed()
         name=await control.get_attribute('aria-label')
         assert field['text'] in name,(field,name)
         hit=await control.evaluate("e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}")
         assert hit,(label,kit,i,name);field['accessibleName']=name;field['centerHitAfterScroll']=hit
        state['adjacentReadouts']=fields
       (out/'measurements.json').write_text(json.dumps(evidence,indent=2));print(label,w,kit,len(state['whole']),len(state['stepsFirstVoice']),flush=True)
     await pg.close()
   assert not evidence['errors']
   b,a=[evidence['variants'][k]['states'] for k in ('before','after')]
   for prior,post in zip(b,a):
    if prior['size'][0] in (739,390,1440):assert prior['whole']==post['whole'] and abs(prior['cellWidth']-post['cellWidth'])<0.01
   landscape=[len(r['stepsFirstVoice']) for r in a if r['size'][1]==390 and r['kit']=='909']; sizes=[r['size'][0] for r in a if r['size'][1]==390 and r['kit']=='909']; points=sorted(zip(sizes,landscape));assert all(y[1]>=x[1] for x,y in zip(points,points[1:])),points
   assert all(len(r['voiceRows'])==3 and len(r['stepsFirstVoice'])==9 for r in b if r['size'][0]==844)
   assert all(len(r['voiceRows'])==3 and len(r['stepsFirstVoice'])==11 for r in a if r['size'][0]==844)
   evidence['status']='PASS scoped 9-to-11 change, owner drawing 6x16 still open';(out/'measurements.json').write_text(json.dumps(evidence,indent=2));print(evidence['status'])
  finally:await browser.close()
asyncio.run(main())
