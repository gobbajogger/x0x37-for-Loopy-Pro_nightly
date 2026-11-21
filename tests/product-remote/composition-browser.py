"""Actual Draft composition and touch-sized controls; no native/cue/playback claims."""
import asyncio,importlib.util,json,subprocess,tempfile
from pathlib import Path
from playwright.async_api import async_playwright,expect
from break_generator_journey import exercise as exercise_break_generator
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('funky',Path(__file__).with_name('funkybeats-browser.py'));core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
CLIPPED="""e=>{const r=e.getBoundingClientRect();let l=Math.max(0,r.left),t=Math.max(0,r.top),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom);for(let p=e.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect(),bl=parseFloat(s.borderLeftWidth)||0,br=parseFloat(s.borderRightWidth)||0,bt=parseFloat(s.borderTopWidth)||0,bb=parseFloat(s.borderBottomWidth)||0,v=Math.max(0,p.offsetWidth-p.clientWidth-bl-br),h=Math.max(0,p.offsetHeight-p.clientHeight-bt-bb);if(/auto|scroll|hidden|clip/.test(s.overflowX)){l=Math.max(l,b.left+bl);right=Math.min(right,b.right-br-v)}if(/auto|scroll|hidden|clip/.test(s.overflowY)){t=Math.max(t,b.top+bt);bottom=Math.min(bottom,b.bottom-bb-h)}}return{box:r.toJSON(),width:Math.max(0,right-l),height:Math.max(0,bottom-t)}}"""
async def full_bounds(target,child=None):
 # Observer children are replaced on packet updates: sample through their stable host atomically.
 expression=CLIPPED if child is None else '(host,selector)=>{const node=host.querySelector(selector);if(!node)throw Error("Missing observed child");return ('+CLIPPED+')(node)}'
 result=await target.evaluate(expression,child)
 assert result['box']['width']>0 and result['box']['height']>0,('Detached/empty target',result)
 assert result['width']>=result['box']['width']-.2 and result['height']>=result['box']['height']-.2,('Control clipped by viewport/ancestor',result)
 return result
async def check_selected_grid(page):
    if page.viewport_size == {'width': 1440, 'height': 900}:
        # PDF page 9 devotes roughly 64% of its content width to the pad panel.
        geometry = await page.locator('.patterns-layout').evaluate('''layout => {
            const bounds = layout.getBoundingClientRect();
            const panel = layout.querySelector('.patterns-grid-panel').getBoundingClientRect();
            const cells = [...layout.querySelectorAll('[data-launch-part]')].map(cell => cell.getBoundingClientRect());
            return {ratio: panel.width / bounds.width, cells: cells.length,
                    height: Math.min(...cells.map(r => r.height)),
                    x: new Set(cells.map(r => r.left)).size, y: new Set(cells.map(r => r.top)).size};
        }''')
        assert 0.60 <= geometry['ratio'] <= 0.68 and geometry['height'] >= 76, geometry
        assert (geometry['cells'], geometry['x'], geometry['y']) == (32, 8, 4), geometry
        panel = page.locator('.patterns-grid-panel[data-scope="selected"]')
        count = panel.get_by_role('heading', name='32 patterns')
        await expect(count).to_be_visible()
        await expect(count).to_have_css('font-size', '28px')
        await expect(count).to_have_css('font-weight', '700')
        await expect(count).to_have_css('color', 'rgb(221, 231, 222)')
        await expect(count).to_have_css('text-transform', 'uppercase')
        pads = panel.locator('[data-launch-part]')
        assert await pads.all_text_contents() == [f'{number:02d}' for number in range(1, 33)]
        first = (await full_bounds(pads.first))['box']
        last = (await full_bounds(pads.last))['box']
        # PDF p9 first pad (53,296), last lower-right (892,691) at 1440×900.
        for observed, reference in [(first['left'], 53), (first['top'], 296),
                                    (last['right'], 892), (last['bottom'], 691)]:
            assert abs(observed-reference) <= 10, (first, last)
        selected = panel.get_by_role('button', name='Selected part')
        all_parts = panel.get_by_role('button', name='All parts')
        review = panel.get_by_role('button', name='Review draft')
        await selected.focus()
        for target in [all_parts, review, pads.first]:
            await page.keyboard.press('Tab')
            await expect(target).to_be_focused()
        await page.keyboard.press('Shift+Tab')
        await expect(review).to_be_focused()
        await review.press('Enter')
        await page.locator('#review-dialog').get_by_role('button', name='Return').click()
        await expect(review).to_be_focused()
        # Moving the same controls at a desktop breakpoint preserves their focus.
        await page.set_viewport_size({'width': 1024, 'height': 640})
        await expect(panel.locator(':scope > .pattern-scope:last-child')).to_have_count(1)
        await expect(review).to_be_focused()
        await page.set_viewport_size({'width': 1440, 'height': 900})
        await expect(panel.locator(':scope > .pattern-scope:first-child')).to_have_count(1)
        await expect(review).to_be_focused()
        return
    if page.viewport_size != {'width': 844, 'height': 390}:
        return
    cells = page.locator('[data-launch-part]')
    outline = await cells.evaluate_all("""cells => {
        const clip = document.querySelector('#other-view').getBoundingClientRect();
        const boxes = cells.map(cell => {
            const r = cell.getBoundingClientRect();
            return [r.left, r.top, r.right, r.bottom, r.height];
        });
        return {boxes, clip: [clip.left, clip.top, clip.right, clip.bottom],
                labels: cells.map(c => c.textContent.trim())};
    }""")
    boxes, clip = outline['boxes'], outline['clip']
    assert len(boxes) == 32
    assert all(clip[0] <= x and clip[1] <= y and right <= clip[2] and bottom <= clip[3]
               and height >= 44 for x, y, right, bottom, height in boxes), outline
    assert len({b[0] for b in boxes}) == 8 and len({b[1] for b in boxes}) == 4
    assert outline['labels'] == [str(n).zfill(2) for n in range(1, 33)]
    for selector in ['[data-pattern-scope="selected"]', '[data-pattern-scope="all"]', '#pattern-review']:
        button = await full_bounds(page.locator(selector))
        assert button['box']['top'] >= max(r[3] for r in boxes), (selector, button, boxes[-1])


async def check_pattern_scopes(page):
    await check_selected_grid(page)
    selected = page.get_by_role('button', name='Selected part', exact=True)
    all_parts = page.get_by_role('button', name='All parts', exact=True)
    await expect(selected).to_have_attribute('aria-pressed', 'true', timeout=2500)
    initial = await core.draft_state(page)
    await all_parts.press('Enter')
    await expect(all_parts).to_be_focused()
    await expect(page.locator('#part-title')).to_have_text('All parts · Draft')
    await expect(all_parts).to_have_attribute('aria-pressed', 'true')
    await expect(page.locator('[data-launch-part]')).to_have_count(160)
    assert await core.draft_state(page) == initial
    for part in range(5):
        choices = page.locator(f'[data-launch-part="{part}"]')
        await expect(choices).to_have_count(32)
        assert await choices.evaluate_all('cells => cells.map(c => Number(c.dataset.pattern))') == list(range(32))
    target = page.locator('[data-launch-part="4"][data-pattern="31"]')
    await target.tap()
    await expect(target).to_be_focused()
    await expect(target).to_have_attribute('aria-pressed', 'true')
    await full_bounds(target)
    expected = json.loads(json.dumps(initial))
    expected['launch'][4] = 31
    assert await core.draft_state(page) == expected
    assert await page.evaluate('document.documentElement.scrollWidth === innerWidth')
    await selected.press('Space')
    await expect(selected).to_be_focused()
    await expect(page.locator('[data-launch-part]')).to_have_count(32)
    await expect(page.locator('#pattern-target')).to_have_text('P32')
    assert await core.draft_state(page) == expected


async def cases(evidence=None):
 proof=[]
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(chromium_sandbox=True)
  try:
   for w,h in [(1440,900),(390,844),(844,390)]:
    c=await browser.new_context(viewport={'width':w,'height':h},has_touch=True);await c.route('**/*',core.serve);p=await c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
    await p.add_init_script('window.midiCalls=0;navigator.requestMIDIAccess=()=>{midiCalls++;throw Error("No device access")}')
    try:
     await p.goto(core.ORIGIN+'/remote/');await expect(p.locator('main')).to_have_attribute('aria-busy','false')
     async def menu_view(view):
      if not await p.locator('.overflow').evaluate('e=>e.open'):await p.locator('.overflow summary').click()
      await p.locator('[data-view="'+view+'"]').click()
      if await p.locator('.overflow').evaluate('e=>e.open'):await p.locator('.overflow summary').click()
     async def reachable(target,minimum):
      await target.scroll_into_view_if_needed();await target.focus();await expect(target).to_be_focused()
      await full_bounds(target)
      box=await target.bounding_box();assert box and box['width']>=minimum-.1 and box['height']>=minimum-.1,(w,h,box)
      assert await target.evaluate('e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest("button,input,select")===e}'),(w,h,'Control center blocked')
     async def screenshot(name):
      if evidence:
       out=Path(evidence).parent/'screenshots';out.mkdir(exist_ok=True);await p.screenshot(path=str(out/f'{w}x{h}-{name}.png'))
     header_samples=[];scroll_samples=[]
     async def header_fit(state,part):
      title=p.locator('#part-title');await full_bounds(title)
      info=await title.evaluate('''e=>{const r=e.getBoundingClientRect(),q=document.createRange();q.selectNodeContents(e);const t=q.getBoundingClientRect(),buttons=[...document.querySelectorAll('.transport button,.history button,.engines summary')].filter(b=>b.getBoundingClientRect().height);return{text:e.textContent,fits:t.left>=r.left-1&&t.right<=r.right+1&&t.top>=r.top-1&&t.bottom<=r.bottom+1,overlaps:buttons.some(b=>{const x=b.getBoundingClientRect();return Math.min(r.right,x.right)>Math.max(r.left,x.left)+.2&&Math.min(r.bottom,x.bottom)>Math.max(r.top,x.top)+.2})}}''')
      assert info['fits'] and not info['overlaps'],(w,h,part,state,info)
      for button in await p.locator('.transport button,.history button,.engines summary').all():
       if await button.is_visible():await full_bounds(button)
      header_samples.append({'part':part,'state':state,**info})
     for kit in ['909','808']:
      await p.locator('[data-engine="drum'+kit+'"]').click();await menu_view('drums')
      await expect(p.locator('.drum-layout')).to_be_visible()
      grid=await p.locator('.drum-grid-panel').bounding_box();sound=await p.locator('.drum-sound-panel').bounding_box();assert grid and sound
      if w>600:
       layout=await p.locator('.drum-layout').bounding_box();assert layout and max(grid['height'],sound['height'])<=layout['height']+.2,('Drum columns exceed bounded workspace',w,grid,sound,layout)
       assert grid['x']+grid['width']<=sound['x']+1 and abs(grid['y']-sound['y'])<=2,(w,grid,sound)
      else:assert grid['y']+grid['height']<=sound['y']+1,(w,grid,sound)
      cells=p.locator('[data-drum-note]');await expect(cells).to_have_count(176)
      dimensions=await cells.evaluate_all('es=>es.map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))');assert all(d['width']>=39.9 and d['height']>=39.9 for d in dimensions)
      await cells.first.focus()
      for index in range(176):
       await expect(cells.nth(index)).to_be_focused();await full_bounds(cells.nth(index))
       if index<175:await p.keyboard.press('Tab')
      for index in range(174,158,-1):
       await p.keyboard.press('Shift+Tab');await expect(cells.nth(index)).to_be_focused();await full_bounds(cells.nth(index))
      for target in [cells.first,cells.last]:await reachable(target,40)
      if w==844:
       # Native diagonal wheel latches to one scroller. Prove both real axes separately.
       await p.mouse.move(grid['x']+grid['width']/2,grid['y']+50);await p.mouse.wheel(0,-1200);await p.wait_for_function("document.querySelector('.sequencer-grid').scrollTop===0")
       await p.mouse.move(grid['x']+grid['width']/2,grid['y']+12);await p.mouse.wheel(-1200,0);await p.wait_for_function("document.querySelector('.funkybeats-sequencer').scrollLeft===0")
       await p.mouse.wheel(1200,0);await p.wait_for_function("document.querySelector('.funkybeats-sequencer').scrollLeft>0")
       await p.mouse.move(grid['x']+grid['width']/2,grid['y']+50);await p.mouse.wheel(0,1200);await p.wait_for_function("document.querySelector('.sequencer-grid').scrollTop>0")
       await full_bounds(cells.last)
       scroll_samples.append({'kit':kit,'rows':await p.locator('.sequencer-grid').evaluate('e=>e.scrollTop'),'steps':await p.locator('.funkybeats-sequencer').evaluate('e=>e.scrollLeft')})
       await p.mouse.wheel(0,-1200);await p.wait_for_function("document.querySelector('.sequencer-grid').scrollTop===0")
       await p.mouse.move(grid['x']+grid['width']/2,grid['y']+12);await p.mouse.wheel(-1200,0);await p.wait_for_function("document.querySelector('.funkybeats-sequencer').scrollLeft===0");await full_bounds(cells.first)
      if w>600:assert await p.locator('#other-view').evaluate('e=>e.scrollTop')==0,'No-observer workspace displaced instead of inner scrolling'
      old=(await core.draft_state(p))['notes'];await p.locator('#sound-voice').select_option('10');await expect(p.locator('#sound-voice')).to_be_focused();await expect(p.locator('.drum-sound-panel .source-scene')).to_have_attribute('data-source-frame',__import__('re').compile('/'+kit+'-voice-10.svg$'));assert (await core.draft_state(p))['notes']==old
      cell=p.locator('[data-drum-note]').first;before=await cell.get_attribute('aria-pressed');await cell.click();await expect(cell).to_have_attribute('aria-pressed','false' if before=='true' else 'true');await p.locator('#undo').click();assert (await core.draft_state(p))['notes']==old
      await expect(p.locator('#drum-lane [data-lane-step]')).to_have_count(16)
      for _ in range(4):await p.locator('[data-lane-cycle]').click()
      await screenshot('drums-'+kit)
     targets=[None]*5
     for index,part in enumerate(['drum909','drum808','chicago','miami','breaks']):
      await p.locator('[data-engine="'+part+'"]').click();await p.locator('[data-view="patterns"]').click();choices=p.locator('[data-launch-part]');await expect(choices).to_have_count(32)
      assert set(await choices.evaluate_all('es=>es.map(e=>Number(e.dataset.launchPart))'))=={index}
      await header_fit('unset',part)
      await reachable(choices.last,44);await choices.last.click();await header_fit('P32',part);await choices.first.click();await header_fit('P01',part)
      await choices.nth(31-index).click();targets[index]=31-index
      await expect(p.locator('#pattern-target')).to_have_text('P'+str(32-index).zfill(2));await expect(p.locator('.patterns-actions')).to_contain_text('Not loaded');assert (await core.draft_state(p))['launch']==targets
     saved=await core.draft_state(p);await core.load_draft(p,saved);assert (await core.draft_state(p))['launch']==targets
     await p.locator('#pattern-review').click();await expect(p.locator('#review-dialog')).to_be_visible();await p.locator('#review-dialog').get_by_role('button',name='Return').click();await expect(p.locator('#pattern-review')).to_be_focused()
     await screenshot('patterns')
     await check_pattern_scopes(p)
     await p.locator('[data-pattern-action="song"]').click();await expect(p.locator('#song-add')).to_be_visible()
     await p.locator('[data-engine="breaks"]').click();await p.locator('[data-view="roll"]').click();await expect(p.locator('[data-break-step]')).to_have_count(16)
     plays=p.locator('#break-sequence [data-action="play"]');await expect(plays).to_have_count(5)
     boxes=await p.locator('#break-sequence .break-rows li').evaluate_all('es=>es.map(e=>e.getBoundingClientRect().toJSON())')
     if w==1440:
      steps=p.locator('[data-break-step]')
      step_boxes=await steps.evaluate_all('es=>es.map(e=>e.getBoundingClientRect().toJSON())')
      assert len(step_boxes)==16 and len({box['top'] for box in step_boxes})==1,step_boxes
      for step in await steps.all():
       await full_bounds(step)
      for play in await plays.all():
       await full_bounds(play)
     if w>600:assert max(b['y'] for b in boxes)-min(b['y'] for b in boxes)<1,(w,boxes)
     for play in await plays.all():await reachable(play,44)
     await p.locator('#break-sequence [data-action="none"]').click();await expect(p.locator('#break-sequence [data-asset]:checked')).to_have_count(0);await p.locator('#break-sequence [data-action="all"]').click();await expect(p.locator('#break-sequence [data-asset]:checked')).to_have_count(5)
     await screenshot('break-previews')
     preview=plays.first;await preview.click();await expect(preview).to_have_attribute('aria-pressed','true');await expect(preview).to_have_attribute('aria-pressed','false',timeout=7000);await expect(preview).to_have_text('Play')
     await preview.click();await expect(preview).to_have_attribute('aria-pressed','true');audio=await p.locator('#break-sequence audio').element_handle();assert audio
     await p.locator('[data-view="sound"]').click();assert await audio.evaluate('e=>e.paused&&!e.hasAttribute("src")'),'Preview did not retire on leaving Slices'
     await p.locator('[data-view="roll"]').click();await expect(plays).to_have_count(5)
     async def refuse_preview(route):await route.fulfill(status=503,body='Unavailable')
     await p.route('**/assets/starting-breaks/*.wav',refuse_preview);await plays.first.click();error=p.locator('#break-sequence [data-audio-status]');await expect(error).to_contain_text('Could not load this preview');await expect(plays.first).to_have_attribute('aria-pressed','false');await error.scroll_into_view_if_needed();await full_bounds(error);await screenshot('break-error');await p.unroute('**/assets/starting-breaks/*.wav',refuse_preview)
     await exercise_break_generator(p,core.draft_state,core.load_draft)
     assert await p.evaluate('document.documentElement.scrollWidth<=innerWidth');assert await p.evaluate('midiCalls')==0;assert not errors,errors
     proof.append({'size':[w,h],'drumCellsPerKit':176,'drumMinimumHit':40,'patternsPerPart':32,'targets':targets,'previews':5,'previewBoxes':boxes,'midiCalls':0,'headerSamples':header_samples,'physicalScroll':scroll_samples,'realTabTargetsPerKit':176,'previewEnd':True,'previewStopOnLeave':True,'previewFetchError':True});print('COMPOSITION PASS',w,h,flush=True)
    finally:await c.close()
  finally:await browser.close()
 if evidence:Path(evidence).write_text(json.dumps(proof,indent=2)+'\n')
 print('COMPOSITION PASS all3sizes; Draft only',flush=True)
async def observed_cases(origin,evidence=None):
 """Real frozen runtime909BD/SD observer geometry; no injected observations."""
 proof=[]
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(chromium_sandbox=True)
  try:
   for w,h in [(1440,900),(390,844),(844,390)]:
    c=await browser.new_context(viewport={'width':w,'height':h});p=await c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
    await p.add_init_script("window.nativePackets=[];window.nativePlaying=null;window.nativeNodes=[];window.contexts=[];window.midiCalls=0;navigator.requestMIDIAccess=()=>{midiCalls++;throw Error('No device access')};const AC=AudioContext;window.AudioContext=class extends AC{constructor(o){super(o);contexts.push(this)}};const AW=AudioWorkletNode;window.AudioWorkletNode=class extends AW{constructor(...a){super(...a);nativeNodes.push(this);this.port.addEventListener('message',e=>{if(e.data?.type==='envelopes')nativePackets.push(e.data);if(e.data?.type==='frame')nativePlaying=e.data.playing});this.port.start()}};")
    try:
     await p.goto(origin+'/remote/');await expect(p.locator('main')).to_have_attribute('aria-busy','false');await p.locator('.overflow summary').click();await p.locator('#emulator-start').click();await expect(p.locator('#status')).to_contain_text('Emulator running',timeout=20000);await p.locator('.overflow summary').click();await p.wait_for_function('nativePackets.length>2')
     meta=json.loads((core.SOURCE/'emu/runtime.json').read_text());packet=await p.evaluate('nativePackets.at(-1)');assert packet['firmware']==meta['firmware_source'] and packet['kernel']==meta['wasm_sha256']
     async def pulse(kind,bits):
      at=await p.evaluate('nativePackets.at(-1).timeMs');await p.evaluate('([type,bits])=>nativeNodes.at(-1).port.postMessage({type,bits})',[kind,bits]);await p.wait_for_function('t=>nativePackets.at(-1).timeMs>=t+90',arg=at);await p.evaluate('type=>nativeNodes.at(-1).port.postMessage({type,bits:0})',kind);await p.wait_for_function('t=>nativePackets.at(-1).timeMs>=t+180',arg=at)
     for key in [2,1,15]:await pulse('keys',1<<key)
     await pulse('buttons',1<<10);await p.wait_for_function('nativePlaying===1')
     await p.locator('[data-engine="drum909"]').click();await p.locator('.overflow summary').click();await p.locator('[data-view="drums"]').click();await p.locator('.overflow summary').click()
     for slot in [0,1]:
      await p.locator('#sound-voice').select_option(str(slot));await expect(p.locator('#native-envelopes')).to_be_visible()
      await p.wait_for_function('slot=>{const n=document.querySelector("[data-observed-level]");return n&&nativePackets.slice(-10).some(p=>p.voices.some(v=>v.engine==="909"&&v.slot===slot&&v.available&&v.role==="amp"&&String(v.snapshot.level??v.snapshot.raw_level)===n.dataset.observedLevel))}',arg=slot)
      graph=p.locator('#native-envelopes .envelope-graph');await p.locator('#native-envelopes').scroll_into_view_if_needed();graph_bounds=await full_bounds(p.locator('#native-envelopes'),'.envelope-graph');assert graph_bounds['box']['height']>=80,(w,h,slot,graph_bounds);await full_bounds(p.locator('#native-envelopes'),'[data-observed-level]')
      layout=await p.locator('.drum-layout').bounding_box();assert layout and (w<=600 or layout['height']>=136),('Observer left no usable row/lane viewport',w,layout)
      if evidence:
       out=Path(evidence).parent/'screenshots';out.mkdir(exist_ok=True);await p.screenshot(path=str(out/f'{w}x{h}-observed-909-{slot}-graph.png'))
      outer_y=None
      if w==844:
       g=graph_bounds['box'];await p.mouse.move(g['x']+g['width']/2,g['y']+g['height']/2);await p.mouse.wheel(0,1200);await p.wait_for_function("document.querySelector('#other-view').scrollTop>0");outer_y=await p.locator('#other-view').evaluate('e=>e.scrollTop')
       heading=p.locator('#other-view>h2');await full_bounds(heading);r=await heading.bounding_box();await p.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);await p.mouse.wheel(0,-1200);await p.wait_for_function("document.querySelector('#other-view').scrollTop===0");await full_bounds(p.locator('#native-envelopes'),'.envelope-graph')
      cells=p.locator('[data-drum-note]');await cells.last.focus();await full_bounds(cells.last);await p.locator('[data-lane-cycle]').focus();await full_bounds(p.locator('[data-lane-cycle]'))
      source=p.locator('.drum-sound-panel .source-hit').first;await p.locator('#sound-voice').focus();await p.keyboard.press('Tab');await expect(source).to_be_focused();await full_bounds(source);await source.press('Enter');await expect(p.locator('#parameter-value')).to_be_focused();await full_bounds(p.locator('#parameter-value'))
      if evidence:await p.screenshot(path=str(out/f'{w}x{h}-observed-909-{slot}-inspector.png'))
      proof.append({'size':[w,h],'slot':slot,'engine':'909','role':'amp','firmware':packet['firmware'],'kernel':packet['kernel'],'layoutHeight':layout['height'],'graphHeight':graph_bounds['box']['height'],'physicalOuterY':outer_y,'midiCalls':await p.evaluate('midiCalls')});print('COMPOSITION_OBSERVER PASS',w,h,'909',slot,flush=True)
     await p.locator('#sound-voice').select_option('2');await expect(p.locator('#native-envelopes')).to_be_hidden();await p.locator('[data-engine="drum808"]').click();await expect(p.locator('#native-envelopes')).to_be_hidden()
     await p.locator('.overflow summary').click();await p.locator('#emulator-stop').click();await p.wait_for_function('contexts.every(c=>c.state==="closed")');assert not errors,errors
    finally:await c.close()
  finally:await browser.close()
 if evidence:Path(evidence).write_text(json.dumps(proof,indent=2)+'\n')
 print('COMPOSITION_OBSERVER PASS 909BD/SD all3sizes; actual packets',flush=True)

def main():
 (ROOT/'.output').mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='composition-',dir=ROOT/'.output') as output:
  core.SOURCE=Path(output);subprocess.run(['node','scripts/build-product-site.mjs','--output',output],cwd=ROOT,check=True);asyncio.run(cases())
  spec=importlib.util.spec_from_file_location('envelope',Path(__file__).with_name('envelope-browser.py'));envelope=importlib.util.module_from_spec(spec);spec.loader.exec_module(envelope)
  with envelope.server(core.SOURCE) as origin:asyncio.run(observed_cases(origin))
if __name__=='__main__':main()
