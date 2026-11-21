"""Independent real-UI/file Song acceptance. Audit code only, not a product runner."""
import asyncio,copy,hashlib,importlib.util,json,sys,traceback
from pathlib import Path
from playwright.async_api import async_playwright,expect
ROOT,SITE,OUT=map(Path,sys.argv[1:4]);BASELINE=Path(sys.argv[4])if len(sys.argv)>4 else None;OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('core',ROOT/'tests/product-remote/funkybeats-browser.py');core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core);core.SOURCE=SITE
ROWS=[{'patterns':[0,1,2,3,4],'repeats':1},{'patterns':[5,6,7,8,9],'repeats':3},{'patterns':[10,11,12,13,14],'repeats':8}]
receipts=[]
def save(r):receipts.append(r);(OUT/'proof.json').write_text(json.dumps(receipts,indent=2));print(json.dumps(r),flush=True)
def without_song(d):return {k:v for k,v in d.items()if k!='song'}
def sha(d):return hashlib.sha256(json.dumps(d,sort_keys=True).encode()).hexdigest()
async def focused_geometry(el):
 return await el.evaluate('''e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2),s=getComputedStyle(e);let clip={left:0,right:innerWidth,top:0,bottom:innerHeight};for(let a=e.parentElement;a;a=a.parentElement){const x=getComputedStyle(a),b=a.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(x.overflowX)){clip.left=Math.max(clip.left,b.left);clip.right=Math.min(clip.right,b.right)}if(/auto|scroll|hidden|clip/.test(x.overflowY)){clip.top=Math.max(clip.top,b.top);clip.bottom=Math.min(clip.bottom,b.bottom)}}return {box:[r.x,r.y,r.width,r.height],clip,fullVisible:r.left>=clip.left-1&&r.right<=clip.right+1&&r.top>=clip.top-1&&r.bottom<=clip.bottom+1,hit:hit===e||e.contains(hit),focused:document.activeElement===e,focusVisible:e.matches(':focus-visible'),outline:s.outlineWidth}}''')
async def supplemental_motion_visual(p,w,h):
 if await p.locator('dialog[open]').count():await p.keyboard.press('Escape')
 if not await p.locator('.overflow').evaluate('e=>e.open'):await p.locator('.overflow summary').press('Enter')
 await p.locator('[data-view="locks"]').press('Enter')
 if await p.locator('.overflow').evaluate('e=>e.open'):await p.locator('.overflow summary').press('Enter')
 await p.locator('#motion-step').fill('10');await p.locator('#motion-step').press('Tab');await p.locator('#motion-value').fill('77');await p.locator('#motion-value').press('Tab');await p.locator('#motion-grid').focus()
 for _ in range(18):await p.keyboard.press('Tab')
 await p.screenshot(path=str(OUT/f'visual-motion-focused-{w}x{h}.png'))
 save({'size':[w,h],'supplementalVisual':'actual Motion focused Value after Step10=77','value':await p.locator('#motion-value').input_value(),'selectedStep':await p.locator('#motion-step').input_value(),'partTitle':await p.locator('#part-title').inner_text(),'focus':await focused_geometry(p.locator('#motion-value'))})

async def main():
 async with async_playwright()as pw:
  browser=await pw.chromium.launch(chromium_sandbox=True)
  try:
   if BASELINE:
    core.SOURCE=BASELINE
    for bw,bh in [(1440,900),(390,844),(844,390)]:
     bc=await browser.new_context(viewport={'width':bw,'height':bh});await bc.route('**/*',core.serve);bp=await bc.new_page();await bp.goto(core.ORIGIN+'/remote/');await expect(bp.locator('main')).to_have_attribute('aria-busy','false');bd=await core.draft_state(bp);bd['song']=copy.deepcopy(ROWS);bd['context']['view']='song';await core.load_draft(bp,bd)
     gaps={'size':[bw,bh],'step':'baseline-rendered-feature-gap','patternSelects':await bp.locator('[data-song-pattern]').count(),'repeats':await bp.locator('[data-song-row]').count(),'newRowActions':await bp.locator('#song-up,#song-down,#song-remove,#song-review').count(),'readonlyPatternCells':await bp.locator('#other-view td:not(:has(input))').all_text_contents()};save(gaps);assert gaps['patternSelects']==0 and gaps['repeats']==3 and gaps['newRowActions']==0 and len(gaps['readonlyPatternCells'])==15;await bc.close()
    core.SOURCE=SITE
   for w,h in [(1440,900),(390,844),(844,390)]:
    c=await browser.new_context(viewport={'width':w,'height':h},has_touch=True);await c.route('**/*',core.serve);p=await c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
    await p.add_init_script('window.midiCalls=0;window.auditAudioContexts=0;navigator.requestMIDIAccess=()=>{midiCalls++;throw Error("No devices")};const AC=AudioContext;window.AudioContext=class extends AC{constructor(...a){super(...a);auditAudioContexts++}};')
    try:
     await p.goto(core.ORIGIN+'/remote/');await expect(p.locator('main')).to_have_attribute('aria-busy','false');await p.locator('#roll-grid [data-note]').first.press('ArrowUp');seed=await core.draft_state(p);seed['song']=copy.deepcopy(ROWS);seed['launch']=[15,16,17,18,19];seed['context']['view']='song';non_song=without_song(seed);await core.load_draft(p,seed)
     def radio(i):return p.locator(f'[data-song-select="{i}"]')
     def cell(i,j):return p.locator(f'[data-song-pattern="{i}"][data-song-part="{j}"]')
     async def snapshot(name,expected):
      ui=await p.evaluate('''()=>({selected:[...document.querySelectorAll('[data-song-select]:checked')].map(e=>Number(e.dataset.songSelect)),focus:{tag:document.activeElement.tagName,id:document.activeElement.id,label:document.activeElement.getAttribute('aria-label'),row:document.activeElement.dataset.songSelect??document.activeElement.dataset.songPattern??document.activeElement.dataset.songRow}})''')
      if name in ['one-cell-P32','move-up','invalid-repeat-9','remove-only-empty']:await p.screenshot(path=str(OUT/f'visual-song-{name}-{w}x{h}.png'))
      d=await core.draft_state(p);assert d['song']==expected,(name,d['song'],expected);assert without_song(d)==non_song,(name,'non-Song Draft changed');assert all(set(r)=={'patterns','repeats'}and len(r['patterns'])==5 for r in d['song']);save({'size':[w,h],'step':name,'song':d['song'],'nonSongSha256':sha(without_song(d)),'uiBeforeExport':ui,'undoDisabled':await p.locator('#song-undo').is_disabled(),'redoDisabled':await p.locator('#song-redo').is_disabled()});return d
     async def load(rows):
      d=copy.deepcopy(seed);d['song']=copy.deepcopy(rows);await core.load_draft(p,d);await snapshot('load',rows)
     async def selected(i):
      await expect(radio(i)).to_be_checked();await expect(radio(i)).to_be_focused();g=await focused_geometry(radio(i));assert g['fullVisible']and g['hit']and g['focused'],('Selected row focus clipped',i,g)
     async def physical_tap(selector):
      target=p.locator(selector);await target.scroll_into_view_if_needed();b=await target.bounding_box();await p.touchscreen.tap(b['x']+b['width']/2,b['y']+b['height']/2)
     await expect(p.locator('[data-song-pattern]')).to_have_count(15);await p.screenshot(path=str(OUT/f'visual-song-populated-{w}x{h}.png'))
     await p.locator('#stop').click();scroll=p.locator('.song-scroll');await scroll.locator('thead').scroll_into_view_if_needed();b=await scroll.bounding_box();before=await scroll.evaluate('e=>e.scrollLeft');overflow=await scroll.evaluate('e=>e.scrollWidth>e.clientWidth+1')
     if overflow:
      header=await scroll.locator('thead').bounding_box();y=max(1,min(h-40,header['y']+header['height']/2));client=await c.new_cdp_session(p);x=b['x']+b['width']*.85;end=b['x']+b['width']*.15
      await client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'id':1,'x':x,'y':y}]})
      for fraction in [.25,.5,.75,1]:await client.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'id':1,'x':x+(end-x)*fraction,'y':y}]})
      await client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});await client.detach();await p.wait_for_timeout(120)
     after=await scroll.evaluate('e=>e.scrollLeft');assert not overflow or after>before,('Touch horizontal pan did not move scoped table',before,after,b);save({'size':[w,h],'step':'real-touch-horizontal-pan','needed':overflow,'before':before,'after':after})
     await radio(0).focus();await p.keyboard.press('Tab');cells=[]
     for i in range(3):
      for j in range(5):
       target=cell(i,j);await expect(target).to_be_focused();options=await target.locator('option').evaluate_all('es=>es.map(e=>[e.value,e.textContent])');assert options==[[str(n),'P'+str(n+1).zfill(2)]for n in range(32)];g=await focused_geometry(target);assert g['focused']and g['focusVisible']and g['fullVisible']and g['hit'],(i,j,g)
       if j==4:await p.screenshot(path=str(OUT/f'visual-song-focused-row-{i}-rightward-{w}x{h}.png'))
       b=g['box'];value=await target.input_value();await p.touchscreen.tap(b[0]+b[2]/2,b[1]+b[3]/2);await p.keyboard.press('Escape');await expect(target).to_have_value(value);cells.append({'kind':'pattern','row':i,'part':j,**g,'touchTap':True,'scrollLeft':await scroll.evaluate('e=>e.scrollLeft')});await p.keyboard.press('Tab')
       switch=p.locator(f'[data-song-on="{i}"][data-song-part="{j}"]');await expect(switch).to_be_focused();await expect(switch).to_be_checked();g=await focused_geometry(switch);assert g['fullVisible']and g['hit']and g['focusVisible'],('Switch clipped',i,j,g);cells.append({'kind':'part-switch','row':i,'part':j,**g});await p.keyboard.press('Tab')
      number=p.locator(f'[data-song-row="{i}"]');await expect(number).to_be_focused();g=await focused_geometry(number);assert g['fullVisible']and g['hit']and g['focusVisible'],('Repeat cell clipped',i,g);b=g['box'];await p.touchscreen.tap(b[0]+b[2]/2,b[1]+b[3]/2);await expect(number).to_have_value(str(ROWS[i]['repeats']));cells.append({'kind':'repeats','row':i,**g,'touchTap':True,'scrollLeft':await scroll.evaluate('e=>e.scrollLeft')});await p.keyboard.press('Tab')
     save({'size':[w,h],'step':'all15-patterns-15-switches-plus3-repeats-keyboard-touch','patternCells':15,'switchCells':15,'repeatCells':3,'cells':cells});await snapshot('reachability-no-mutation',ROWS)
     await cell(1,2).press('End');await cell(1,2).press('Tab');changed=copy.deepcopy(ROWS);changed[1]['patterns'][2]=31;await snapshot('one-cell-P32',changed);await p.locator('#song-undo').press('Enter');await selected(0);await snapshot('one-cell-Undo',ROWS);await p.locator('#song-redo').press('Enter');await selected(1);await snapshot('one-cell-Redo',changed)
     repeat=p.locator('[data-song-row="1"]');await repeat.fill('8');await repeat.press('Tab');repeat8=copy.deepcopy(changed);repeat8[1]['repeats']=8;await snapshot('repeat8',repeat8);await p.locator('#song-undo').press('Enter');await snapshot('repeat-Undo',changed)
     for invalid in ['0','9','1.5']:
      await repeat.fill(invalid);await repeat.press('Tab');await expect(repeat).to_have_value('3');await expect(p.locator('#song-redo')).to_be_enabled();await snapshot('invalid-repeat-'+invalid,changed)
     await repeat.fill('3');await repeat.press('Tab');await expect(p.locator('#song-redo')).to_be_enabled();await p.locator('#song-redo').press('Enter');await snapshot('invalid-no-history-Redo',repeat8);await p.locator('#song-undo').press('Enter');await snapshot('repeat-restored',changed)
     for bad in [{'patterns':[5,6,32,8,9],'repeats':3},{'patterns':[5,6,31,8,9],'repeats':9},{'patterns':[5,6,31,8,9],'repeats':3,'enabled':True}]:
      before_doc=await core.draft_state(p);flags=[await p.locator('#song-undo').is_disabled(),await p.locator('#song-redo').is_disabled()];invalid_doc=copy.deepcopy(before_doc);invalid_doc['song'][1]=bad;await p.locator('#draft-file').set_input_files({'name':'invalid-song.json','mimeType':'application/json','buffer':json.dumps(invalid_doc).encode()});await expect(p.locator('#draft-dialog')).to_be_visible();await expect(p.locator('#draft-replace')).to_be_disabled();assert await p.locator('#draft-preview').inner_text();await p.locator('#draft-cancel').press('Enter');assert await core.draft_state(p)==before_doc;assert flags==[await p.locator('#song-undo').is_disabled(),await p.locator('#song-redo').is_disabled()]
     await snapshot('strict-invalid-imports-atomic',changed)
     before_review=await core.draft_state(p)
     for key in ['Space','Escape']:
      await p.locator('#song-review').press('Enter');await expect(p.locator('#review-dialog')).to_be_visible();text=await p.locator('#changes').inner_text();assert 'Song row 2:'in text and 'P32'in text and '3 repeats'in text
      await p.locator('#review-dialog button').focus();await p.keyboard.press(key);await expect(p.locator('#song-review')).to_be_focused();assert await core.draft_state(p)==before_review
     await snapshot('Review-return-focus-no-mutation',changed)
     await load(changed);await physical_tap('[data-song-select="0"]');await expect(p.locator('#song-up')).to_be_disabled();await physical_tap('#song-up');await expect(p.locator('#song-undo')).to_be_disabled();await snapshot('first-boundary-no-history',changed)
     await physical_tap('[data-song-select="2"]');await expect(p.locator('#song-down')).to_be_disabled();await physical_tap('#song-down');await expect(p.locator('#song-undo')).to_be_disabled();await snapshot('last-boundary-no-history',changed)
     await physical_tap('[data-song-select="1"]');await p.locator('#song-up').press('Enter');moved=[changed[1],changed[0],changed[2]];await selected(0);await snapshot('move-up',moved);await p.locator('#song-undo').press('Enter');await selected(1);await snapshot('move-Undo',changed);await p.locator('#song-redo').press('Enter');await selected(0);await snapshot('move-Redo',moved);await p.locator('#song-down').press('Space');await selected(1);await snapshot('move-down',changed)
     await physical_tap('[data-song-select="1"]');await p.locator('#song-remove').press('Space');await selected(1);await snapshot('remove-middle',[changed[0],changed[2]]);await p.locator('#song-undo').press('Enter');await selected(1);await snapshot('remove-middle-Undo',changed);await p.locator('#song-redo').press('Enter');await selected(1);await snapshot('remove-middle-Redo',[changed[0],changed[2]]);await p.locator('#song-undo').press('Enter')
     await physical_tap('[data-song-select="2"]');await p.locator('#song-remove').press('Space');await selected(1);two=[changed[0],changed[1]];await snapshot('remove-last',two);await p.locator('#song-undo').press('Enter');await selected(2);await snapshot('remove-last-Undo',changed);await p.locator('#song-redo').press('Enter');await selected(1);await snapshot('remove-last-Redo',two)
     saved=await core.draft_state(p);await core.load_draft(p,saved);assert await core.draft_state(p)==saved;await expect(p.locator('#song-undo')).to_be_disabled();await expect(p.locator('#song-redo')).to_be_disabled();await snapshot('exact-save-open-order-schema',two)
     await physical_tap('[data-song-select="1"]');await p.locator('#song-remove').press('Space');await selected(0);await snapshot('one-left',[changed[0]]);await p.locator('#song-remove').press('Space');await expect(p.locator('#song-add')).to_be_focused();await expect(p.locator('#song-remove')).to_be_disabled();await expect(p.locator('#song-up')).to_be_disabled();await expect(p.locator('#song-down')).to_be_disabled();await snapshot('remove-only-empty',[]);await p.locator('#song-undo').press('Enter');await selected(0);await snapshot('remove-only-Undo',[changed[0]]);await p.locator('#song-redo').press('Enter');await expect(p.locator('#song-add')).to_be_focused();await snapshot('remove-only-Redo',[])
     await p.locator('#song-add').press('Space');await selected(0);await snapshot('add-launch-after-empty',[{'patterns':seed['launch'],'repeats':1}]);await p.locator('#song-undo').press('Enter');await snapshot('add-Undo-empty',[])
     assert await p.evaluate('document.documentElement.scrollWidth<=innerWidth');assert await p.evaluate('midiCalls===0&&auditAudioContexts===0');assert not errors,errors;save({'size':[w,h],'complete':True,'midiCalls':0,'audioContexts':0,'pageErrors':errors})
    except Exception as e:save({'size':[w,h],'failure':str(e),'traceback':traceback.format_exc()});await p.screenshot(path=str(OUT/f'failure-{w}x{h}.png'))
    finally:
     try:await supplemental_motion_visual(p,w,h)
     except Exception as e:save({'size':[w,h],'supplementalVisualFailure':str(e),'traceback':traceback.format_exc()})
     await c.close()
  finally:await browser.close()
 print('SONG INDEPENDENT BROWSER CLOSED',flush=True)
 assert sum(r.get('complete',False)for r in receipts)==3,receipts[-1]
asyncio.run(main())
