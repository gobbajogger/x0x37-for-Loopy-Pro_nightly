# SPDX-License-Identifier: GPL-3.0-only
"""Actual Master More Draft journey. Runs only through the mandatory browser chain.
No device; normal sandbox; exact built source + existing pinned runtime for the
read-only native source-toggle boundary. Draft controls never send native writes.
"""
import asyncio,hashlib,importlib.util,json,os,subprocess,tempfile,argparse,datetime
from pathlib import Path
from playwright.async_api import async_playwright,expect
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('native_base',Path(__file__).with_name('envelope-browser.py'));base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
spec=importlib.util.spec_from_file_location('sound_base',Path(__file__).with_name('native-sound-browser.py'));sound=importlib.util.module_from_spec(spec);spec.loader.exec_module(sound)
SOURCE=json.loads((ROOT/'web/product-site/remote/master-source.mjs').read_text().split('export default ',1)[1].rsplit(';',1)[0])
MORE=[(6,p) for p in [0,1,2,3,4,5,7,10,11]]+[(4,p) for p in [1,3,0]]
PREFIX='source-master/'+SOURCE['source']+'/'
def identity(t,p):return PREFIX+f'{t}/0/{p}'
def selector(t,p):return f'[data-master-control="{t}:{p}"]'
def raw(d,t,p):return next((r['value'] for r in d['parameters'] if r['id']==identity(t,p)),next(c['default'] for c in SOURCE['controls'] if c['target']==t and c['parameter']==p))
async def draft(page):return json.loads(await sound.draft_bytes(page))
async def set_value(page,t,p,v):
 unit=page.locator(selector(t,p)) if (t,p) in MORE else page.locator(f'.mix-master-panel [data-param$="|1:{t}:0:{p}"]').first
 await unit.scroll_into_view_if_needed();await unit.press('Enter');field=page.locator('#parameter-value');await field.fill(str(v));await field.press('Tab')
 return unit
GEOMETRY=(ROOT/'tests/product-remote/master-more-geometry.js').read_text()
PROOFS=[]
RUN=None
SOURCE_ID={}

def exact_hash(path):
 b=path.read_bytes();return {'path':str(path),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}

def whole(measure):
 assert measure and measure['visible'] and not measure['unsupported'],measure
 a,b=measure['full'],measure['effective']
 assert a['width']>0 and a['height']>0 and all(abs(a[k]-b[k])<=1 for k in ['left','right','top','bottom']),measure
 assert not measure['overflow'],measure

async def image_proof(page,name):
 path=RUN/(name+'.png');await page.screenshot(path=str(path));return exact_hash(path)

async def visible_proof(page,element,name,focused=False,field=False):
 result=await element.evaluate(GEOMETRY);result['name']=name
 PROOFS.append(result);(RUN/'measurements.json').write_text(json.dumps(PROOFS,indent=2)+'\n')
 whole(result['unit']);r=result['unit']['effective'];assert r['width']>=40 and r['height']>=40,result
 assert all(p['owned'] for p in result['hits']),result
 for part in ['label','value']+([] if field else ['glyph']):
  whole(result['parts'][part]);m=result['parts'][part]
  if part!='glyph':
   assert m['text'] and m['fontSize']>=(11 if part=='value' else 8),result
   b=m['effective'];assert all(t['left']>=b['left']-1 and t['right']<=b['right']+1 and t['top']>=b['top']-1 and t['bottom']<=b['bottom']+1 for t in m['texts']),result
 if focused:assert result['focused'] and result['focusVisible'] and result['outline']['width']>=2 and result['outline']['style']!='none',result
 if focused and field:
  # Native focus scrolling must expose the painted ring, including its offset.
  extent=result['outline']['width']+result['outline']['offset'];full=result['unit']['full']
  ring={side:full[side]+sign*extent for side,sign in [('left',-1),('right',1),('top',-1),('bottom',1)]}
  result['paintedRing']=ring
  (RUN/'measurements.json').write_text(json.dumps(PROOFS,indent=2)+'\n')
  assert ring['left']>=0 and ring['right']<=result['viewport']['width'] and ring['top']>=0 and ring['bottom']<=result['viewport']['height'],result
  for ancestor in result['unit']['clips']:
   clip=ancestor['clip']
   if ancestor['x']:assert ring['left']>=clip['left'] and ring['right']<=clip['right'],result
   if ancestor['y']:assert ring['top']>=clip['top'] and ring['bottom']<=clip['bottom'],result
 result['image']=await image_proof(page,name)
 return result

async def unit_state(page,t,p):
 unit=page.locator(selector(t,p)) if (t,p) in MORE else page.locator(f'.mix-master-panel [data-param$="|1:{t}:0:{p}"]').first
 return await unit.evaluate("""e=>({display:e.querySelector('output')?.textContent,glyphs:Array.from(e.querySelectorAll('[data-glyph-fn]')).map(g=>({value:g.dataset.glyphValue,target:g.glyphAnimator?.target})),raw:document.querySelector('#parameter-value')?.value,undo:!document.querySelector('#undo').disabled,redo:!document.querySelector('#redo').disabled})""")

async def gesture(page,ctx,t,p,width,cancel=True,interrupt=False):
 if await page.locator('.overflow').evaluate('e=>e.open'):await page.locator('.overflow summary').click()
 control=page.locator(selector(t,p)) if (t,p) in MORE else page.locator(f'.mix-master-panel [data-param$="|1:{t}:0:{p}"]').first
 await control.scroll_into_view_if_needed();await control.press('Enter')
 # Opening the detail field may scroll the unit out; restore it before the real drag.
 await control.scroll_into_view_if_needed();box=await control.bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
 hit=await control.evaluate("e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return{x,y,owned:!!h&&(e===h||e.contains(h)),tag:h?.tagName,id:h?.id}}");assert hit['owned'],hit
 PROOFS.append({'kind':'gesture-center-hit','target':[t,p],'hit':hit})
 before=await unit_state(page,t,p)
 # Positive delta uses y travel on narrow units, keeping the pointer in the viewport.
 dx=24 if x+24<width-2 else -24
 cdp=None
 if width==1440:
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y)
 else:
  cdp=await ctx.new_cdp_session(page)
  await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'id':1,'x':x,'y':y}]})
  await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'id':1,'x':x+dx,'y':y}]})
 # Observe the live raw field, formatter AND glyph target before any save/Review/cancel.
 preview=await unit_state(page,t,p);assert preview['raw']!=before['raw'],(before,preview)
 assert preview['glyphs']!=before['glyphs'],(before,preview)
 if (t,p)==(6,12):
  expected=SOURCE['macros'][int(preview['raw'])]
  shown=[]
  for parameter,value in zip([0,1,4],expected[:3]):
   c=next(c for c in SOURCE['controls'] if c['target']==6 and c['parameter']==parameter)
   actual=await page.locator(selector(6,parameter)+' output').inner_text();assert actual==c['displays'][value];shown.append(actual)
  preview['macroDetails']=shown
 PROOFS.append({'kind':'live-preview-before-cancel' if cancel else 'live-preview-before-commit','target':[t,p],'before':before,'preview':preview});(RUN/'measurements.json').write_text(json.dumps(PROOFS,indent=2)+'\n')
 await image_proof(page,f'preview-{t}-{p}-'+('cancel' if cancel else 'commit'))
 if interrupt:
  # Arrow on a separate More scalar must cancel macro preview before recording Glue.
  await page.locator(selector(4,3)).press('ArrowUp')
 elif cancel and width==1440:await page.keyboard.press('Escape')
 if width==1440:await page.mouse.up()
 else:
  await cdp.send('Input.dispatchTouchEvent',{'type':'touchCancel' if cancel else 'touchEnd','touchPoints':[]});await cdp.detach()
 return before,preview

async def cases(origin,evidence,capture_only=False):
 global RUN,PROOFS
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(chromium_sandbox=True)
  try:
   for width,height in [(1440,900),(390,844),(844,390)]:
    RUN=evidence/f'{width}x{height}';RUN.mkdir(parents=True,exist_ok=False);PROOFS=[]
    (RUN/'source-identities.json').write_text(json.dumps(SOURCE_ID,indent=2)+'\n')
    ctx=await browser.new_context(viewport={'width':width,'height':height},has_touch=True,accept_downloads=True);page=await ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    await page.add_init_script('''window.midiCalls=0;window.nativeRequests=[];window.nativeNodes=[];navigator.requestMIDIAccess=()=>{midiCalls++;throw Error('No devices')};const AW=AudioWorkletNode;window.AudioWorkletNode=class extends AW{constructor(...a){super(...a);nativeNodes.push(this);const post=this.port.postMessage.bind(this.port);this.port.postMessage=(m,...rest)=>{nativeRequests.push({type:m?.type,op:m?.op,operation:m?.operation,kind:m?.kind,command:m?.command});return post(m,...rest)};this.port.start()}};''')
    try:
     await page.goto(origin+'/remote/');await page.locator('[data-view="mix"]').click()
     if capture_only:
      for name in ['top','middle','bottom']:
       await page.locator('#other-view').evaluate('(e,n)=>{e.scrollTop=n===0?0:n===1?e.scrollHeight/2:e.scrollHeight}',{'top':0,'middle':1,'bottom':2}[name]);await image_proof(page,'baseline-'+name)
      (RUN/'proof.json').write_text(json.dumps({'captureOnly':True,'source':SOURCE_ID,'images':[exact_hash(p) for p in sorted(RUN.glob('*.png'))]},indent=2)+'\n');continue
     await expect(page.locator('.master-more [data-master-control]')).to_have_count(12)
     if width==1440:
      # All twelve controls share the first desktop viewport with the four Master macros.
      for control in await page.locator('.mix-master-panel [data-param]').all():
       geometry=await control.evaluate(GEOMETRY)
       whole(geometry['unit'])
       assert all(hit['owned'] for hit in geometry['hits']),geometry
     before=await draft(page);before_params=before['parameters'];seen=[]
     # Real forward and reverse Tab, without corrective programmatic scrolling after Tab.
     anchor=page.locator('.mix-master-panel [data-param]').nth(3);await anchor.focus();await expect(anchor).to_be_focused()
     for t,p in MORE:
      await page.keyboard.press('Tab');unit=page.locator(selector(t,p));await expect(unit).to_be_focused()
      await visible_proof(page,unit,f'tab-{t}-{p}',focused=True)
     for t,p in reversed(MORE[:-1]):
      await page.keyboard.press('Shift+Tab');unit=page.locator(selector(t,p));await expect(unit).to_be_focused();await visible_proof(page,unit,f'shift-tab-{t}-{p}',focused=True)
     for t,p in MORE:
      unit=page.locator(selector(t,p));await unit.scroll_into_view_if_needed();await visible_proof(page,unit,f'unit-{t}-{p}')
      if width!=1440:
       box=await unit.bounding_box();await page.touchscreen.tap(box['x']+box['width']/2,box['y']+box['height']/2)
       assert (await unit_state(page,t,p))['raw']==str(raw(before,t,p))
      await unit.press('Enter');field=page.locator('#parameter-value');await expect(field).to_be_focused()
      await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await expect(field).to_be_focused()
      await visible_proof(page,field,f'detail-{t}-{p}',focused=True,field=True)
      c=next(c for c in SOURCE['controls'] if c['target']==t and c['parameter']==p)
      assert await field.get_attribute('min')=='0' and await field.get_attribute('max')==str(c['max'])
      for value in range(c['max']+1) if c['max']<13 else [0,c['max']]:
       await set_value(page,t,p,value);assert await unit.locator('output').inner_text()==c['displays'][value]
       assert await unit.locator('[data-glyph-fn]').evaluate('(e,v)=>Math.abs(Number(e.dataset.glyphValue)-v)<1e-9',value/c['max'])
       assert raw(await draft(page),t,p)==value
      await page.locator('#undo').click();await page.locator('#redo').click();await set_value(page,t,p,c['default']);seen.append([t,p])
     assert seen==[list(v) for v in MORE]
     async def load_document(document,name):
      if not await page.locator('.overflow').evaluate('e=>e.open'):await page.locator('.overflow summary').click()
      await page.locator('#draft-file').set_input_files({'name':name,'mimeType':'application/json','buffer':json.dumps(document).encode()});await page.locator('#draft-replace').click()
     await load_document(before,'before.json')
     await set_value(page,6,12,0);changed=await draft(page);assert [raw(changed,6,p) for p in [0,1,4]]==SOURCE['macros'][0][:3]
     await page.locator('#undo').click();assert (await draft(page))['parameters']==before_params
     await page.locator('#redo').click();assert (await draft(page))['parameters']==changed['parameters']
     await set_value(page,6,0,22);saved=await draft(page);assert raw(saved,6,12)==0
     await load_document(saved,'master.json');assert (await draft(page))==saved
     # Scalar AND macro cancellation: meaningful preview must be observed first.
     for t,p in [(6,2),(6,12)]:
      # Reload factory baseline for an unclamped positive drag and empty history.
      await load_document(before,'cancel-before.json');stable_bytes=await sound.draft_bytes(page)
      flags=await page.locator('#undo').is_disabled(),await page.locator('#redo').is_disabled()
      await gesture(page,ctx,t,p,width,cancel=True)
      assert await sound.draft_bytes(page)==stable_bytes
      assert (await page.locator('#undo').is_disabled(),await page.locator('#redo').is_disabled())==flags
     # Keyboard interrupt while macro preview is active retains only the Glue edit.
     await load_document(before,'interrupt-before.json');await gesture(page,ctx,6,12,width,cancel=True,interrupt=True)
     interrupted=await draft(page);assert raw(interrupted,6,12)==95 and raw(interrupted,4,3)==1
     await page.locator('#undo').click();assert (await draft(page))['parameters']==before_params
     # A committed real drag remains one command and exactly redoable.
     await gesture(page,ctx,6,2,width,cancel=False);edited=(await draft(page))['parameters'];assert edited!=before_params
     await page.locator('#undo').click();assert (await draft(page))['parameters']==before_params
     await page.locator('#redo').click();assert (await draft(page))['parameters']==edited
     # Import actual old-app exports, never manufactured legacy bytes.
     for kind in ['comp95','filter64']:
      folder=ROOT/'tests/product-remote/fixtures/legacy-ce667-master';provenance=json.loads((folder/(kind+'-provenance.json')).read_text());raw_bytes=(folder/(kind+'-after-undo.json')).read_bytes();assert hashlib.sha256(raw_bytes).hexdigest()==provenance['sha256']
      await load_document(json.loads(raw_bytes),kind+'.json');accepted=await draft(page)
      for c in SOURCE['controls']:assert raw(accepted,c['target'],c['parameter'])==c['default']
      if not await page.locator('.overflow').evaluate('e=>e.open'):await page.locator('.overflow summary').click()
      await page.locator('#review').click();await expect(page.locator('#changes')).to_have_text('No changes.');await page.locator('#review-dialog button').click()
      if await page.locator('.overflow').evaluate('e=>e.open'):await page.locator('.overflow summary').click()
      assert await page.locator('#undo').is_disabled() and await page.locator('#redo').is_disabled()
     assert await page.evaluate('nativeRequests.length')==0
     saved_native_boundary=await draft(page);await sound.menu_action(page,'#emulator-start');await expect(page.locator('#status')).to_contain_text('Emulator running',timeout=20000)
     await page.locator('[data-mix-source="emulator"]').click();await expect(page.locator('[data-runtime-key]')).not_to_have_count(0);await expect(page.locator('.master-more')).to_have_count(0)
     await image_proof(page,'native-more-absent');request_count=await page.evaluate('nativeRequests.length')
     await page.locator('#other-view').evaluate('(e,id)=>{const b=document.createElement("button");b.dataset.param=id;b.id="unsupported-master-probe";b.textContent="Test unsupported source identity";e.append(b)}',identity(6,0))
     await page.locator('#unsupported-master-probe').press('ArrowUp');await page.locator('#unsupported-master-probe').evaluate('e=>e.remove()');assert await page.evaluate('nativeRequests.length')==request_count
     requests=await page.evaluate('nativeRequests');assert not [r for r in requests if any(r.get(k) in ['set','undo'] for k in ['op','operation','kind','command'])],requests
     await page.locator('[data-mix-source="draft"]').click();await expect(page.locator('.master-more [data-master-control]')).to_have_count(12);assert (await draft(page))['parameters']==saved_native_boundary['parameters'];await image_proof(page,'draft-more-restored')
     await sound.menu_action(page,'#emulator-stop');assert await page.evaluate('midiCalls')==0;assert not errors,errors
     (RUN/'proof.json').write_text(json.dumps({'source':SOURCE_ID,'units':seen,'measurements':PROOFS,'nativeRequests':requests,'midiCalls':0,'images':[exact_hash(p) for p in sorted(RUN.glob('*.png'))]},indent=2)+'\n')
     print('MASTER_MORE PASS',width,height,'12 complete units/ancestors/hit/Tab/ShiftTab/detail/touch, observed scalar+macro cancel, exact legacy imports/history, source boundary',flush=True)
    except Exception as exc:
     try:failure_image=await image_proof(page,'failure')
     except Exception:failure_image=None
     (RUN/'failure.json').write_text(json.dumps({'error':repr(exc),'pageErrors':[str(e) for e in errors],'source':SOURCE_ID,'measurements':PROOFS,'image':failure_image},indent=2)+'\n');raise
    finally:await ctx.close()
  finally:await browser.close()
def main():
 global SOURCE_ID
 parser=argparse.ArgumentParser();parser.add_argument('--site',type=Path,help='Read-only existing built source, no build');parser.add_argument('--source-sha',help='Declared source ref for existing built site; actual asset hashes are always recorded');parser.add_argument('--capture-only',action='store_true',help='Only capture existing site top/middle/bottom; not acceptance');parser.add_argument('--evidence-dir',type=Path,default=Path(os.environ.get('DNBOX_MASTER_EVIDENCE_DIR',ROOT/'.output/master-more-evidence')));args=parser.parse_args()
 assert not args.capture_only or args.site,'Capture-only requires explicit existing --site'
 if not args.capture_only:assert os.environ.get('DNBOX_EMULATOR_RUNTIME'),'Explicit qualified runtime required for source-toggle boundary'
 run=args.evidence_dir/(datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+str(os.getpid()));run.mkdir(parents=True,exist_ok=False)
 def execute(site):
  global SOURCE_ID
  SOURCE_ID={'declaredSource':args.source_sha,'site':str(site),'captureOnly':args.capture_only,'fixture':exact_hash(Path(__file__)),'geometry':exact_hash(Path(__file__).with_name('master-more-geometry.js')),'servedAssets':[exact_hash(site/p) for p in ['remote/app.mjs','remote/style.css','remote/master-draft.mjs','remote/master-source.mjs'] if (site/p).exists()]}
  print('MASTER_MORE_EVIDENCE',run,flush=True)
  with base.server(site) as origin:asyncio.run(cases(origin,run,args.capture_only))
 if args.site:execute(args.site.resolve())
 else:
  (ROOT/'.output').mkdir(exist_ok=True)
  with tempfile.TemporaryDirectory(prefix='master-more-',dir=ROOT/'.output') as tmp:
   subprocess.run(['node','scripts/build-product-site.mjs','--output',tmp],cwd=ROOT,check=True);execute(Path(tmp))
if __name__=='__main__':main()
