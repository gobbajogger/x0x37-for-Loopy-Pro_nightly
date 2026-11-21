"""Actual captured drum controls: visible consumer names and transparent Tab focus."""
import asyncio, importlib.util, io, json, subprocess, tempfile
from PIL import Image, ImageChops
from pathlib import Path
from playwright.async_api import async_playwright, expect
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('funky',Path(__file__).with_name('funkybeats-browser.py'))
core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)

# Capture every unit in one DOM read, before any focus or scrolling can reveal clipped controls.
COMPACT_BOXES = """units => units.map(unit => {
 const rect = e => {
   const r=e.getBoundingClientRect();
   return {x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom};
 };
 const box=rect(unit);
 let visible=box.width>0 && box.height>0 && box.x>=0 && box.y>=0 && box.right<=innerWidth && box.bottom<=innerHeight;
 for(let p=unit.parentElement;p;p=p.parentElement){
   const style=getComputedStyle(p), b=p.getBoundingClientRect();
   if(/auto|scroll|clip|hidden/.test(style.overflowX))visible&&=box.x>=b.left-1 && box.right<=b.right+1;
   if(/auto|scroll|clip|hidden/.test(style.overflowY))visible&&=box.y>=b.top-1 && box.bottom<=b.bottom+1;
 }
 const action = selector => {
   const button=unit.querySelector(selector), b=rect(button);
   const top=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
   return {id:button.getAttribute(selector.slice(1,-1)), box:b, hit:top===button||button.contains(top)};
 };
 const label=unit.querySelector('[data-drum-label]'), value=unit.querySelector('[data-drum-value]');
 const originalIds=Array.from(unit.querySelectorAll('button[data-param]'),b=>b.dataset.param);
 const glyph=unit.querySelector('.drum-source-glyph');
 const contentsFit=[label,value,glyph].every(el=>{
   if(!el)return false;
   const r=rect(el),s=getComputedStyle(el);
   return s.visibility==='visible' && Number(s.opacity)>0 && r.width>0 && r.height>0 &&
     r.x>=box.x-1 && r.y>=box.y-1 && r.right<=box.right+1 && r.bottom<=box.bottom+1;
 });
 return {box, visible, originalIds, contentsFit, role:unit.dataset.drumRole, label:label.textContent.trim(), ink:getComputedStyle(label).color,
         value:value.textContent.trim(), down:action('[data-drum-decrement]'), up:action('[data-drum-increment]')};
})"""

FIRMWARE_DEFAULTS = json.loads((ROOT / 'tests/product-remote/fixtures/drum-firmware-defaults.json').read_text())

def editable_label(control):
 if control['identity']=='1:0:11:1':return 'Velocity'
 return 'Pitch depth' if control['context']['name']=='P.Dpth' else control['context']['name']

async def compact_voice(page, screen):
 strip=page.locator('[data-drum-sound-strip]')
 await expect(strip).to_be_visible()
 units=strip.locator('[data-drum-sound-unit]')
 await expect(units).to_have_count(len(screen['controls']))
 rows=await units.evaluate_all(COMPACT_BOXES)
 assert len({round(r['box']['y']) for r in rows})==1,('Controls wrapped',screen['path'],rows)
 for i,(row,control) in enumerate(zip(rows,screen['controls'])):
  expected_name=editable_label(control)
  expected_role='active' if control['markers']['visual-role']=='active glyph/value control' else 'summary'
  assert (row['label'],row['value'],row['role'])==(expected_name,FIRMWARE_DEFAULTS[screen['path']][i],expected_role),(control,row)
  assert row['contentsFit'] and row['visible'] and (i==0 or rows[i-1]['box']['right']<=row['box']['x']+1),(screen['path'],row)
  assert row['originalIds']==[screen['path']+'|'+control['identity']],row
  for action in [row['down'],row['up']]:
   assert action['id']==screen['path']+'|'+control['identity'],(screen['path'],row)
   assert action['box']['width']>=40 and action['box']['height']>=32 and action['hit'],(screen['path'],row)
 if screen['path'].endswith('/909-voice-00.svg'):
  assert [r['label'] for r in rows]==['Tune','Attack','Decay','Pitch depth','Pitch','Velocity']
  assert [r['role'] for r in rows]==['active']*4+['summary']*2
  assert {r['ink'] for r in rows[:4]}.isdisjoint(r['ink'] for r in rows[4:])
  # Owner p18 uses a 222px panel, with the step buttons at y303 and footer bottom at y382.
  # Keep room for the shared header and larger touch targets in the working 390px viewport.
  panel=await strip.bounding_box()
  footer=await page.get_by_role('button',name='Open original',exact=True).bounding_box()
  height=page.viewport_size['height']
  assert panel['height']>=height*.48 and min(r['down']['box']['y'] for r in rows)>=height*.71,('Drum row leaves landscape height unused',panel,rows)
  assert height*.93<=footer['y']+footer['height']<=height,('Drum footer does not fit at the foot of the viewport',footer)
 return rows

async def compact_bd_edits(page, screen):
 await page.locator('[data-engine="drum909"]').click()
 await page.locator('[data-view="sound"]').click()
 await page.locator('#sound-voice').select_option('0')
 before=await core.draft_state(page)
 units=page.locator('[data-drum-sound-unit]')
 changes={}
 for i,control in enumerate(screen['controls']):
  unit=units.nth(i)
  raw=int(control['context']['raw'])
  delta=-1 if raw==127 else 1
  action=unit.locator('[data-drum-decrement]' if delta<0 else '[data-drum-increment]')
  await expect(action).to_be_enabled()
  if control['context']['name']=='Attack':
   edge=unit.locator('[data-glyph-semantic] path')
   original=await edge.get_attribute('d')
  await action.press('Enter')
  if control['context']['name']=='Attack':
   await expect(edge).not_to_have_attribute('d',original)
  changes[screen['path']+'|'+control['identity']]=raw+delta
 values=units.locator('[data-drum-value]')
 await expect(values.nth(4)).to_have_text('+0.4st')
 await expect(values.nth(5)).to_have_text('99%')
 edited=await core.draft_state(page)
 saved={p['id']:p['value'] for p in edited['parameters']}
 assert all(saved.get(k)==v for k,v in changes.items()),(changes,saved)
 await page.locator('#undo').press('Enter')
 await expect(values.nth(5)).to_have_text('100%')
 await page.locator('#undo').press('Enter')
 await expect(values.nth(4)).to_have_text('+0.1st')
 await page.locator('#redo').press('Enter')
 await expect(values.nth(4)).to_have_text('+0.4st')
 await page.locator('#redo').press('Enter')
 await expect(values.nth(5)).to_have_text('99%')
 assert (await core.draft_state(page))['parameters']==edited['parameters']
 await core.load_draft(page,before)
 await expect(values.nth(4)).to_have_text('+0.1st')
 await expect(values.nth(5)).to_have_text('100%')
 await core.load_draft(page,edited)
 await expect(values.nth(4)).to_have_text('+0.4st')
 await expect(values.nth(5)).to_have_text('99%')
 assert (await core.draft_state(page))['parameters']==edited['parameters']


async def kick_depth_dependencies(page):
 # Four source-compiled y coordinates from the native 25-point idle curve.
 expected=[
  [6.79083109,8.46621895,10.5005817,10.9320412],  # Tune 34, Depth 0, Pitch 45
  [8.61200809,10.3244076,10.9316015,10.9417505],  # 0, 0, 45
  [6.73025703,9.65477753,10.9016714,10.9238968],  # 0, 127, 45
  [1.65163922,2.57380843,2.86714053,2.87189412],  # 0, 127, 127
 ]
 scope=':is([data-drum-editor],[data-drum-sound-strip])'
 path=scope+' [data-source-control="1:0:0:4"] [data-glyph-semantic="P.DPTH"] path'
 async def check(index):
  await page.wait_for_function(r"""([sel,want])=>{
   const d=document.querySelector(sel)?.getAttribute('d')??'';
   const points=[...d.matchAll(/[ML]([\d.]+) ([\d.]+)/g)];
   return points.length===25 && [0,6,12,24].every((i,j)=>Math.abs(+points[i][2]-want[j])<.00006)
  }""",arg=[path,expected[index]])
 await check(0)
 for i,(param,value) in enumerate([(0,0),(4,127),(5,127)],1):
  await page.locator(scope+f' [data-param$="|1:0:0:{param}"]').press('Enter')
  editor=page.locator('#parameter-value')
  await expect(editor).to_be_enabled()
  await editor.fill(str(value));await editor.press('Enter');await editor.blur()
  await check(i)
 for i in [2,1,0]:
  await page.locator('#undo').press('Enter');await check(i)
 for i in [1,2,3]:
  await page.locator('#redo').press('Enter');await check(i)
 for i in [2,1,0]:
  await page.locator('#undo').press('Enter');await check(i)


async def frame_values(scene, screen):
 # All source labels and hit regions survive; only the archival numeric ink is hidden.
 rows = await scene.evaluate("""e => [...e.querySelectorAll('.source-hit')].map(button => {
  const id=button.dataset.param, identity=id.split('|')[1];
  const source=e.querySelector('svg [data-source-control="'+identity+'"]');
  const value=e.querySelector('.drum-frame-values [data-param-value="'+id+'"]');
  const box=value.getBoundingClientRect(), group=source.querySelector('[data-glyph-semantic]').getBoundingClientRect();
  const panel=e.getBoundingClientRect(), old=source.lastElementChild;
  return {text:value.textContent, name:button.getAttribute('aria-label'), hidden:getComputedStyle(old).visibility==='hidden',
    fits:box.width>0 && box.left>=panel.left && box.right<=panel.right && box.top>=panel.top && box.bottom<=panel.bottom,
    clear:value.classList.contains('stacked-value')?box.top>=group.bottom-1:box.left>=group.right-1,
    left:box.left,right:box.right,top:box.top};
 })""")
 if any(control['identity']=='1:0:11:1' for control in screen['controls']):
  caption=scene.locator('.drum-velocity-label')
  await expect(caption).to_have_text('Velocity')
  assert await caption.evaluate('''e=>{
   const source=e.closest('.source-scene').querySelector('[data-source-control="1:0:11:1"]');
   const original=source.firstElementChild,glyph=source.querySelector('[data-glyph-semantic]').getBoundingClientRect();
   const r=e.getBoundingClientRect(),p=e.closest('.source-scene').getBoundingClientRect();
   return getComputedStyle(original).visibility==='hidden' && getComputedStyle(e).visibility==='visible' &&
     r.width>0 && r.left>=p.left && r.right<=glyph.left && r.top>=p.top && r.bottom<=p.bottom;
  }'''),screen['path']
 assert len(rows)==len(screen['controls']),rows
 for i,(row,control) in enumerate(zip(rows,screen['controls'])):
  label=editable_label(control)
  expected=FIRMWARE_DEFAULTS[screen['path']][i]
  assert row['text']==expected and row['name']==f'{label}, {expected}, local draft',(screen['path'],row)
  assert row['hidden'] and row['fits'] and row['clear'],(screen['path'],row)
  if i and abs(rows[i-1]['top']-row['top'])<1:
   assert rows[i-1]['right']<=row['left'],(screen['path'],rows[i-1],row)


async def widest_frame_values(scene):
 # Exercise the CSS grid's 280px Sound-column minimum with the actual loaded font.
 # Install the widest legal label in every field simultaneously before testing separation.
 result=await scene.evaluate("""async panel => {
  await document.fonts.ready;
  const {drumDisplay}=await import('/remote/drum-format.mjs');
  const saved=panel.style.maxWidth;
  const fields=[...panel.querySelectorAll('.drum-frame-values [data-param-value]')];
  const original=fields.map(field=>field.textContent);
  let checked=0;
  try{
   panel.style.maxWidth='280px';
   for(const field of fields){
    const identity=field.dataset.paramValue.split('|')[1];
    const labels=new Set();
    for(let raw=0;raw<=127;raw++){
     const value=drumDisplay(identity,raw);
     if(value!==null){labels.add(value);checked++;}
    }
    let widest='',width=-1;
    for(const label of labels){
     field.textContent=label;
     const next=field.getBoundingClientRect().width;
     if(next>width){widest=label;width=next;}
    }
    field.textContent=widest;
   }
   const bounds=panel.getBoundingClientRect();
   const boxes=fields.map(field=>field.getBoundingClientRect());
   const failures=fields.flatMap((field,i)=>{
    const box=boxes[i],id=field.dataset.paramValue.split('|')[1];
    const glyph=panel.querySelector('svg [data-source-control="'+id+'"] [data-glyph-semantic]').getBoundingClientRect();
    const separate=field.classList.contains('stacked-value')?box.top>=glyph.bottom-1:box.left>=glyph.right-1;
    const fits=box.width>0 && box.left>=bounds.left && box.right<=bounds.right;
    const overlap=boxes.slice(0,i).some(b=>b.left<box.right && box.left<b.right && b.top<box.bottom && box.top<b.bottom);
    return separate && fits && !overlap?[]:[{id,label:field.textContent,separate,fits,overlap}];
   });
   return {width:bounds.width,checked,failures};
  }finally{fields.forEach((f,i)=>f.textContent=original[i]);panel.style.maxWidth=saved;}
 }""")
 assert 0<result['width']<=280 and result['checked'] and not result['failures'],result
 return result['checked']


async def adjacent_kit_frames(page,screens,kit):
 count=0
 for voice in range(11):
  await page.locator('#sound-voice').select_option(str(voice))
  scene=page.locator('.drum-sound-panel [data-drum-editor]')
  screen=screens[await scene.get_attribute('data-source-frame')]
  assert screen['path'].endswith(f'/{kit[4:]}-voice-{voice:02d}.svg')
  await frame_values(scene,screen)
  count+=await widest_frame_values(scene)
 return count


async def frame_edits(page,kit,adjacent):
 # Use a summary value on the 909 and an active control on the 808.
 index,name,before,after=(4,'Pitch','+0.1st','+0.4st') if kit=='drum909' else (1,'Tone','33%','34%')
 await page.locator(f'[data-engine="{kit}"]').click()
 if adjacent:
  await page.locator('.overflow summary').click()
  await page.locator('[data-view="drums"]').click()
  if await page.locator('.overflow').get_attribute('open') is not None:
   await page.locator('.overflow summary').click()
 else:
  await page.locator('[data-view="sound"]').click()
 await page.locator('#sound-voice').select_option('0')
 scene=page.locator('.drum-sound-panel [data-drum-editor]' if adjacent else '[data-drum-editor]')
 hit=scene.locator('.source-hit').nth(index)
 output=scene.locator('[data-param-value]').nth(index)
 async def check(text):
  await expect(output).to_have_text(text)
  await expect(hit).to_have_attribute('aria-label',f'{name}, {text}, local draft')
  await expect(page.locator('#parameter-readout')).to_have_text(text)
 if kit=='drum808':
  tone=scene.locator('[data-source-control="1:1:0:1"] [data-glyph-semantic] path')
  tone_before=await tone.get_attribute('d')
 await hit.press('ArrowRight')
 if kit=='drum808':
  await expect(tone).not_to_have_attribute('d',tone_before)
 await expect(hit).to_be_focused()
 await check(after)
 await page.locator('#undo').press('Enter')
 await check(before)
 if kit=='drum808':
  await expect(tone).to_have_attribute('d',tone_before)
 await page.locator('#redo').press('Enter')
 await check(after)
 # A pointer gesture updates the readout during movement and restores it on Escape.
 await hit.scroll_into_view_if_needed()
 box=await hit.bounding_box()
 x,y=box['x']+box['width']/2,box['y']+box['height']/2
 await page.mouse.move(x,y)
 await page.mouse.down()
 await page.mouse.move(x,y-30,steps=3)
 await expect(output).not_to_have_text(after)
 await check(await output.text_content())
 await page.keyboard.press('Escape')
 await page.mouse.up()
 await check(after)
 await page.locator('#undo').press('Enter')
 await check(before)


async def cases(evidence=None):
 data=json.loads((ROOT/'web/product-site/remote/components.json').read_text())
 screens={s['path']:s for s in data['screens']};proof=[];samples=0;active_count=0
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(chromium_sandbox=True)
  try:
   for width,height in [(1440,900),(390,844),(844,390)]:
    context=await browser.new_context(viewport={'width':width,'height':height})
    await context.route('**/*',core.serve);page=await context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    await page.add_init_script('window.midiCalls=0;navigator.requestMIDIAccess=()=>{midiCalls++;throw Error("No devices")}')
    await page.goto(core.ORIGIN+'/remote/')
    for kit in ['drum909','drum808']:
     await page.locator(f'[data-engine="{kit}"]').click();await page.locator('[data-view="sound"]').click()
     options=await page.locator('#sound-voice option').evaluate_all('es=>es.map(e=>e.value)');assert len(options)==11
     for voice in options:
      await page.locator('#sound-voice').select_option(voice)
      voice_screen=next(s for s in screens.values() if s['path'].endswith(f'/{kit[4:]}-voice-{int(voice):02d}.svg'))
      opener=page.get_by_role('button',name='Open original',exact=True)
      original_return=page.get_by_role('button',name='Return to Sound',exact=True)
      compact=None
      if kit=='drum909' and voice=='0':await kick_depth_dependencies(page)
      if width==844:
       compact=await compact_voice(page,voice_screen)
       await expect(opener).to_be_visible()
       await opener.press('Enter')
       await expect(original_return).to_be_focused()
       anchor=original_return
      else:
       await expect(page.locator('[data-drum-sound-strip]')).to_be_hidden()
       anchor=page.locator('#sound-voice')
      scene=page.locator('.source-scene');path=await scene.get_attribute('data-source-frame');screen=screens[path]
      assert path==voice_screen['path'],(path,voice_screen['path'])
      assert await scene.get_attribute('data-runtime-admitted')=='false'
      assert await scene.locator('svg').evaluate("""(svg,body)=>{
       const original=new DOMParser().parseFromString(body,'image/svg+xml').documentElement;
       const copy=svg.cloneNode(true);
       if(svg.closest('[data-drum-editor]'))for(const cell of copy.querySelectorAll('[data-source-control]')){
        const id=cell.getAttribute('data-source-control'), glyph=cell.querySelector('[data-glyph-semantic]');
        const sourceCell=original.querySelector('[data-source-control="'+id+'"]');
        const donor=sourceCell?.querySelector('[data-glyph-semantic]');
        if(!glyph || !donor)return false;
        const semantic=donor.getAttribute('data-glyph-semantic'), role=sourceCell.getAttribute('data-visual-role');
        const tuningFork=semantic==='TUNE' && id!=='1:0:0:0';
        const kitSummary=semantic==='ACCENT' && ['1:0:11:1','1:1:11:1'].includes(id) &&
          role==='inactive bank parameter summary';
        const decay=['DECAY','TAIL'].includes(semantic) && id!=='1:1:6:2' && role==='active glyph/value control';
        const depth=id==='1:0:0:4' && semantic==='P.DPTH' && role==='active glyph/value control';
        const eligible=semantic==='ATTACK' || id==='1:1:0:1' || tuningFork || kitSummary || decay || depth;
        if((glyph.getAttribute('data-glyph-origin')==='firmware dv_glyph')!==eligible)return false;
        if(!eligible)continue;
        glyph.setAttribute('data-glyph-origin',donor.getAttribute('data-glyph-origin'));
        glyph.querySelector('path').setAttribute('d',donor.querySelector('path').getAttribute('d'));
       }
       return copy.isEqualNode(original);
      }""",screen['body_svg']),path
      if width==844:
       await expect(scene.locator('.drum-frame-values')).to_have_count(0)
      else:
       await frame_values(scene,screen)
      active=[c for c in screen['controls'] if c.get('markers',{}).get('visual-role')=='active glyph/value control']
      # Exercise real Tab even on the negative: an opaque blank hit is a separate defect.
      first=scene.locator('.source-hit').first
      await anchor.focus();await first.scroll_into_view_if_needed()
      box=await first.bounding_box()
      clip={'x':box['x']+4,'y':box['y']+4,'width':box['width']-8,'height':box['height']-8}
      unfocused=await page.screenshot(clip=clip)
      await page.keyboard.press('Tab');await expect(first).to_be_focused()
      focused=await page.screenshot(clip=clip)
      before_image=Image.open(io.BytesIO(unfocused)).convert('RGB');after_image=Image.open(io.BytesIO(focused)).convert('RGB')
      same_ink=ImageChops.difference(before_image,after_image).getbbox() is None
      glyph_pixels=sum(r>100 and g>60 and b<120 for r,g,b in before_image.getdata())
      if evidence:
       folder=Path(evidence).parent/'screenshots';folder.mkdir(exist_ok=True)
       (folder/f'{width}x{height}-{kit}-{voice}-before.png').write_bytes(unfocused)
       (folder/f'{width}x{height}-{kit}-{voice}-focused.png').write_bytes(focused)

      background=await first.evaluate('e=>getComputedStyle(e).backgroundColor')
      assert background=='rgba(0, 0, 0, 0)' and same_ink and glyph_pixels>0,('Focused source glyph/value is covered',path,background,same_ink,glyph_pixels)
      labels=scene.locator('[data-source-label]');assert await labels.count()==len(active),('Missing visible control names',path,len(active),await labels.count())
      row=[]
      for c in active:
       label=scene.locator(f'[data-source-label="{c["identity"]}"]');await label.scroll_into_view_if_needed()
       await expect(label).to_have_text('Pitch depth' if c['context']['name']=='P.Dpth' else c['context']['name'])
       metrics=await label.evaluate('''e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e),range=document.createRange();range.selectNodeContents(e);const text=range.getBoundingClientRect(),scene=e.closest('.source-scene'),ink=scene.querySelector('svg [data-source-control="'+e.dataset.sourceLabel+'"] [data-glyph-semantic]').getBoundingClientRect();return {font:parseFloat(s.fontSize),opacity:s.opacity,box:{x:r.x,y:r.y,width:r.width,height:r.height},textFits:text.left>=r.left&&text.right<=r.right&&text.top>=r.top&&text.bottom<=r.bottom,onscreen:r.top>=0&&r.bottom<=innerHeight,aligned:Math.abs((r.left+r.right)/2-(ink.left+ink.right)/2)<r.width/2,aboveInk:r.bottom<=ink.top+1}}''')
       assert metrics['font']>=12 and metrics['textFits'] and metrics['onscreen'] and metrics['aligned'] and metrics['aboveInk'],(path,c['context']['name'],metrics)
       row.append(metrics['box']);active_count+=1
      if evidence:await page.screenshot(path=str(Path(evidence).parent/'screenshots'/f'{width}x{height}-{kit}-{voice}-labels.png'))
      for a,b in zip(row,row[1:]):assert a['x']+a['width']<=b['x']+.01,(path,'Labels collide')
      # Re-start from the select: each source control must remain a real Tab target.
      await anchor.focus()
      for index,c in enumerate(screen['controls']):
       hit=scene.locator('.source-hit').nth(index);await hit.scroll_into_view_if_needed()
       before=await hit.evaluate('e=>({style:e.getAttribute("style"),w:e.offsetWidth,h:e.offsetHeight})')
       await page.keyboard.press('Tab');await expect(hit).to_be_focused()
       after=await hit.evaluate('''e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {style:e.getAttribute('style'),w:e.offsetWidth,h:e.offsetHeight,background:s.backgroundColor,focus:e.matches(':focus-visible')&&s.outlineWidth==='2px',hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===e}}''')
       assert all(before[k]==after[k] for k in before),(path,index,'Focus changed hit geometry')
       assert after['background']=='rgba(0, 0, 0, 0)' and after['focus'] and after['hit'],(path,index,after)
       expected='Pitch depth' if c['context']['name']=='P.Dpth' else c['context']['name']
       if width==844:
        assert (await hit.get_attribute('aria-label')).startswith(expected+', source example ')
       else:
        await expect(hit).to_have_attribute('aria-label',editable_label(c)+', '+FIRMWARE_DEFAULTS[path][index]+', local draft')
       assert c['identity'] in (await hit.get_attribute('data-param'))
       samples+=1
      # Keep the original transparent-pan interaction sample on the final displayed voice.
      if kit=='drum808' and voice==options[-1]:
       await first.evaluate("e=>{e.dataset.live='pan';e.textContent='L25'}")
       await expect(first).to_have_text('L25')
       assert await first.evaluate("e=>getComputedStyle(e).backgroundColor")=='rgba(14, 20, 22, 0.72)'
      if width==844:
       await original_return.press('Enter')
       await expect(opener).to_be_focused()
       await expect(page.locator('[data-drum-sound-strip]')).to_be_visible()
      proof.append({'size':[width,height],'path':path,'controls':len(screen['controls']),'visibleNames':len(active),'labels':row,'compact':compact})
      print('DRUM_CONTROLS',width,height,path,'PASS',flush=True)
    width_samples=0
    for kit in ['drum909','drum808']:
     await frame_edits(page,kit,adjacent=True)
     if width==844:
      width_samples+=await adjacent_kit_frames(page,screens,kit)
     if width!=844:
      await frame_edits(page,kit,adjacent=False)
    if width==844:
     assert width_samples==9994,width_samples
     print('DRUM_FRAME_WIDTH PASS',width_samples,'source occurrences at 280px',flush=True)
     await compact_bd_edits(page, screens['current-state-and-reference/909-voice-00.svg'])
    assert not errors,errors;assert await page.evaluate('midiCalls')==0
    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    await context.close()
  finally:await browser.close()
 assert len(proof)==66 and samples==249 and active_count==180,(len(proof),samples,active_count)
 if evidence:Path(evidence).write_text(json.dumps({'states':proof,'focusSamples':samples,'visibleNameSamples':active_count},indent=2)+'\n')
 print('DRUM_CONTROLS PASS 66states 249TabTargets 180visibleNames immutableSVG stableHits',flush=True)

def main():
 (ROOT/'.output').mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='drum-controls-',dir=ROOT/'.output') as output:
  core.SOURCE=Path(output);subprocess.run(['node','scripts/build-product-site.mjs','--output',output],cwd=ROOT,check=True)
  asyncio.run(cases())
if __name__=='__main__':main()
