# SPDX-License-Identifier: GPL-3.0-only
"""Five real-browser FunkyBeats surfaces, local draft only; no device access.

Serve the actual product build through Playwright routing, without a test HTTP server.
Use Playwright's bundled Chromium with its normal sandbox. Never fall back to
an unsandboxed browser. Each case receives a fresh page and tests an edit plus
its persistence/undo, rather than accepting only that a heading is visible.
"""
import asyncio
import json
import linecache
import mimetypes
import re
import subprocess
import tempfile
import time
import traceback
from functools import cache, lru_cache
from pathlib import Path
from urllib.parse import unquote, urlparse
from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
SOURCE = None
ORIGIN = 'https://dnbox.test'

@lru_cache(maxsize=1)
def product_reader(source):
    # Each suite routes one immutable build, shared by all its browser contexts.
    root = source.resolve()

    @cache
    def read_file(path):
        return path.read_bytes()

    @cache
    def response(relative):
        path = (root / relative).resolve()
        if not path.is_relative_to(root):
            return {'status': 403, 'body': 'Forbidden'}
        mime_path = path
        if path.is_dir():
            mime_path = path / 'index.html'
            path = mime_path.resolve()
            if not path.is_relative_to(root):
                return {'status': 403, 'body': 'Forbidden'}
        if not path.is_file():
            return {'status': 404, 'body': 'Not found'}
        mime = 'text/javascript' if mime_path.suffix == '.mjs' else mimetypes.guess_type(mime_path)[0] or 'application/octet-stream'
        return {'status': 200, 'content_type': mime, 'body': read_file(path)}

    return response


def preload_product(source):
    response = product_reader(source)
    response('')
    for path in source.rglob('*'):
        response(path.relative_to(source).as_posix())


def product_response(source, relative):
    return product_reader(source)(relative)


async def serve(route):
    url = urlparse(route.request.url)
    if url.netloc != 'dnbox.test':
        await route.abort()
        return
    relative = unquote(url.path).strip('/')
    response = await asyncio.to_thread(product_response, SOURCE, relative)
    await route.fulfill(**response)


async def roll(page):
    green = 'rgb(130, 240, 90)'  # Owner PDF pages 1, 14 and 21, Bass A note fill.
    notes = page.locator('#roll-grid [data-note]')
    selected = page.locator('#roll-grid [aria-selected="true"][data-note]').first
    other = page.locator('#roll-grid [aria-selected="false"][data-note]').first
    for width, height in ((1440, 900), (390, 844), (844, 390)):
        await page.set_viewport_size({'width': width, 'height': height})
        await expect(selected).to_have_css('background-color', green)
        await expect(other).to_have_css('background-color', green)
        assert await notes.evaluate_all('(rows, color) => rows.every(n => getComputedStyle(n).backgroundColor === color)', green)
        ring = await selected.evaluate("""n => {
            const s = getComputedStyle(n, '::after');
            return [s.borderTopWidth, s.borderTopColor, s.pointerEvents];
        }""")
        assert ring == ['2px', 'rgb(5, 10, 13)', 'none'], ring
    await page.locator('[data-engine="miami"]').click()
    await expect(selected).not_to_have_css('background-color', green)
    await page.locator('[data-engine="chicago"]').click()
    await expect(selected).to_have_css('background-color', green)
    note = page.locator('#roll-grid [data-note]').first
    identity = await note.get_attribute('data-note')
    before = await note.get_attribute('aria-label')
    await note.press('ArrowUp')
    target = page.locator(f'#roll-grid [data-note="{identity}"]')
    await expect(target).not_to_have_attribute('aria-label', before)
    await page.locator('#undo').click()
    await expect(target).to_have_attribute('aria-label', before)

async def sequencer(page):
    await page.locator('.overflow summary').click()
    await page.locator('[data-view="drums"]').click()
    await page.locator('.overflow summary').click()
    cells = page.locator('.funkybeats-sequencer [data-drum-note]')
    await expect(cells).to_have_count(176)
    cell = cells.first
    before = await cell.get_attribute('aria-pressed')
    await cell.click()
    await expect(cells.first).to_have_attribute('aria-pressed', 'false' if before == 'true' else 'true')
    await page.locator('#undo').click()
    await expect(cells.first).to_have_attribute('aria-pressed', before)

async def drum_accent(page):
    from drum_navigation_journey import exercise as drum_navigation
    # Old v1 Drafts captured MIDI events, which cannot recover the kit accent bits.
    archive = Path(__file__).resolve().parent / 'fixtures/legacy-sound-banks/both-owners.json'
    old = json.loads(archive.read_text())
    assert 'stepLanes' not in old
    assert 'stepLanes' not in await draft_state(page)
    row = page.locator('.drum-accent-row')
    buttons = row.locator('[data-drum-accent-step]')
    for width, height in ((844, 390), (390, 844)):
        await page.set_viewport_size({'width': width, 'height': height})
        await load_draft(page, old)
        for kit in ('909', '808'):
            owner = 'drum' + kit
            await page.locator(f'[data-engine="{owner}"]').tap()
            await page.locator('.overflow summary').tap()
            await page.locator('[data-view="drums"]').tap()
            await page.locator('.overflow summary').tap()
            await expect(buttons).to_have_count(16)
            await expect(row.locator('[aria-pressed="mixed"]')).to_have_count(16)
            await expect(buttons.first).to_have_attribute('data-accent-track', owner)
            if width == 844:
                await drum_navigation(page, kit, draft_state)
            else:
                await expect(page.locator('.drum-grid-navigation')).to_be_hidden()
            # Edit the right edge of both grids by real touch, including silent steps.
            cell = buttons.last
            await cell.tap()
            await expect(cell).to_have_attribute('aria-pressed', 'true')
            await page.locator('#undo').tap()
            await expect(cell).to_have_attribute('aria-pressed', 'mixed')
            await page.locator('#redo').tap()
            await expect(cell).to_have_attribute('aria-pressed', 'true')
            await page.locator('#sound-voice').select_option('3')
            await expect(cell).to_have_attribute('aria-pressed', 'true')
            await cell.tap()
            await expect(cell).to_have_attribute('aria-pressed', 'false')
            await page.locator('#undo').tap()
            await expect(cell).to_have_attribute('aria-pressed', 'true')
            await page.locator('#redo').tap()
            await expect(cell).to_have_attribute('aria-pressed', 'false')
            await buttons.first.tap()
            await expect(buttons.first).to_have_attribute('aria-pressed', 'true')
            saved = await draft_state(page)
            assert saved['notes'] == old['notes'] and saved['parameters'] == old['parameters']
            assert saved['stepLanes'][owner]['drumAccent'] == [True] + [None] * 14 + [False]
            if kit == '909':
                assert 'drum808' not in saved['stepLanes']
            else:
                assert saved['stepLanes']['drum909'] == saved['stepLanes']['drum808']
            await load_draft(page, saved)
            await expect(buttons.first).to_have_attribute('aria-pressed', 'true')
            await expect(cell).to_have_attribute('aria-pressed', 'false')
            assert (await draft_state(page))['stepLanes'] == saved['stepLanes']
            # A velocity or integer masquerading as a stored bit cannot replace this Draft.
            invalid = json.loads(json.dumps(saved))
            invalid['stepLanes'][owner]['drumAccent'][0] = 1
            await page.locator('#draft-file').set_input_files({
                'name':'bad-accent.json', 'mimeType':'application/json', 'buffer':json.dumps(invalid).encode()})
            await expect(page.locator('#draft-dialog')).to_be_visible()
            await expect(page.locator('#draft-replace')).to_be_disabled()
            await page.locator('#draft-cancel').tap()
            assert (await draft_state(page))['stepLanes'] == saved['stepLanes']
            print(f'PASS {kit} kit Accent 16 real touch targets {width}x{height}, two voices, '
                  'Undo/Redo, unknown/off/on, v1 file and invalid rejection', flush=True)
        await load_draft(page, old)
        assert 'stepLanes' not in await draft_state(page)

async def mixer(page):
    await page.locator('[data-view="mix"]').click()
    faders = page.locator('input.mixer-fader[data-native-param]')
    await expect(faders).to_have_count(5)
    slider = faders.first
    before = await slider.input_value()
    await slider.press('ArrowRight')
    await expect(slider).not_to_have_value(before)
    after = await slider.input_value()
    await page.locator('[data-view="roll"]').click()
    await page.locator('[data-view="mix"]').click()
    await expect(faders.first).to_have_value(after)
    await page.locator('#undo').click()
    await expect(faders.first).to_have_value(before)

    # FX controls live in the explicit FX workspace; exercise its actual navigation.
    await page.locator('[data-mix-mode="fx"]').click()
    await expect(page.locator('[data-mix-mode="fx"]')).to_have_attribute("aria-pressed", "true")
    # Actual painted readout changes for an edited delay control.
    feedback = page.locator('.mix-panel button[aria-label^="Delay FEEDBACK"]')
    canvas = feedback.locator('canvas')
    await expect(canvas).to_be_visible()
    original = await canvas.evaluate('(c) => c.toDataURL()')
    await feedback.press('Enter')
    field = page.locator('#parameter-value')
    raw = await field.input_value()
    minimum, maximum = await field.get_attribute('min'), await field.get_attribute('max')
    await field.fill(minimum if float(raw) != float(minimum) else maximum)
    await field.press('Enter')
    await field.blur()
    await page.wait_for_function(
        "before => document.querySelector('.mix-panel button[aria-label^=\"Delay FEEDBACK\"] canvas').toDataURL() !== before",
        arg=original)
    await page.locator('#undo').click()

async def fx_part_sends(page):
    await page.locator('[data-view="mix"]').click()
    fx = page.locator('[data-mix-mode="fx"]')
    sends = page.locator('[data-mix-mode="sends"]')
    sliders = page.locator('.mix-send-strip input[data-native-param]')
    expected = [f'current-state-and-reference/fx-reverb-direct.svg|1:5:{part}:{effect}'
                for part in range(5) for effect in (1, 2)]
    for width, height in ((1440, 900), (844, 390), (390, 844), (1024, 640)):
        await page.set_viewport_size({'width': width, 'height': height})
        await fx.click()
        await expect(sliders).to_have_count(10)
        assert await sliders.evaluate_all('els => els.map(e => e.dataset.nativeParam)') == expected
        if width == 1440:
            reverb, delay = (
                page.get_by_role('heading', name='Reverb', exact=True),
                page.get_by_role('heading', name='Delay', exact=True))
            left, right = await reverb.bounding_box(), await delay.bounding_box()
            assert abs(left['y'] - right['y']) <= 1 and left['x'] + left['width'] <= right['x']
            for slider in await sliders.all():
                await expect(slider).to_be_in_viewport(ratio=1)
        else:
            for slider in await sliders.all():
                await slider.scroll_into_view_if_needed()
                assert await slider.evaluate("""e => {
                    const r = e.getBoundingClientRect();
                    return r.height >= 44 && r.width >= 44 &&
                      document.elementFromPoint(r.x+r.width/2, r.y+r.height/2) === e;
                }""")
        assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')

        last = sliders.last
        before = await sliders.evaluate_all('els => els.map(e => e.value)')
        decrease = before[-1] == await last.get_attribute('max')
        await last.press('ArrowLeft' if decrease else 'ArrowRight')
        changed = str(int(before[-1]) + (-1 if decrease else 1))
        await expect(last).to_have_value(changed)
        await sends.click()
        assert await sliders.evaluate_all('els => els.map(e => e.value)') == before[:-1] + [changed]
        await page.locator('#undo').click()
        await fx.click()
        assert await sliders.evaluate_all('els => els.map(e => e.value)') == before


async def launcher(page):
    await page.locator('[data-engine="drum909"]').click()
    await page.locator('[data-view="patterns"]').click()
    await expect(page.locator('[data-launch-part]')).to_have_count(32)
    cell = page.locator('[data-launch-part="0"][data-pattern="1"]')
    await cell.click()
    await expect(cell).to_have_attribute('aria-pressed', 'true')
    await page.locator('[data-view="roll"]').click()
    await page.locator('[data-view="patterns"]').click()
    await expect(cell).to_have_attribute('aria-pressed', 'true')
    await expect(page.locator('[data-launch-part="0"][aria-pressed="true"]')).to_have_count(1)

async def synth(page):
    await page.locator('[data-engine="chicago"]').click()
    await page.locator('[data-view="sound"]').click()
    slider = page.locator('.funkybeats-typed-unit input[data-native-param]').first
    await expect(slider).to_be_visible()
    before = await slider.input_value()
    await slider.press('ArrowRight')
    await expect(slider).not_to_have_value(before)
    await expect(slider).not_to_have_attribute('aria-valuetext', '—')
    await page.locator('#undo').click()
    await expect(slider).to_have_value(before)

async def edit_geometry(page, note):
    # Do not scroll here: that would conceal the Undo clipping regression.
    return await note.evaluate("""n=>{
        const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
        const edge=n.querySelector('[data-edge="end"]'),r=edge.getBoundingClientRect();
        const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return {main:rect(document.querySelector('main')),roll:rect(document.querySelector('#roll-scroll')),
            note:rect(n),edge:rect(edge),endHit:hit===edge||edge.contains(hit)};
    }""")

async def gesture_edits(page):
    for width,height in [(844,390),(390,844),(1440,900)]:
        await page.set_viewport_size({'width':width,'height':height})
        await page.reload()
        await page.wait_for_function('document.getElementById("status").textContent.includes("Draft")')
        await gesture_edits_at_size(page)
        print(f'PASS Undo + resize stable geometry {width}x{height}',flush=True)

async def gesture_edits_at_size(page):
    identity = await page.locator('#roll-grid .note').evaluate_all('(ns)=>ns.find(n=>n.getBoundingClientRect().width>24).dataset.note')
    note = page.locator(f'#roll-grid [data-note="{identity}"]')
    await note.scroll_into_view_if_needed()
    geometry = await edit_geometry(page,note)
    assert geometry['endHit'],('Resize edge must receive pointer input before feedback',geometry)
    before = await note.get_attribute('aria-label')
    start,end = map(int,re.search(r'(\d+) to (\d+) samples',before).groups())
    box = await note.bounding_box()
    x,y = box['x']+box['width']/2, box['y']+box['height']/2
    await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x+20,y,steps=4); await page.mouse.up()
    after = await note.get_attribute('aria-label')
    moved_start,moved_end = map(int,re.search(r'(\d+) to (\d+) samples',after).groups())
    assert moved_start > start and moved_end-moved_start == end-start
    await page.locator('#undo').click()
    await expect(note).to_have_attribute('aria-label',before)
    restored = await edit_geometry(page,note)
    assert restored==geometry,('Undo feedback must preserve main, roll and selected-note hit geometry',geometry,restored)
    edge = await note.locator('[data-edge="end"]').bounding_box()
    x,y = edge['x']+edge['width']/2, edge['y']+edge['height']/2
    await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x+20,y,steps=4); await page.mouse.up()
    resized_start,resized_end = map(int,re.search(r'(\d+) to (\d+) samples',await note.get_attribute('aria-label')).groups())
    assert resized_start == start and resized_end > end
    await page.locator('#undo').click()
    await expect(note).to_have_attribute('aria-label',before)
    empty = await page.locator('#roll-scroll').evaluate("e=>{const r=e.getBoundingClientRect();for(let y=r.y+10;y<r.bottom-12;y+=15)for(let x=r.x+20;x<r.right-30;x+=25){const t=document.elementFromPoint(x,y);if(t?.closest('#roll-grid')&&!t.closest('[data-note]'))return{x,y};}throw Error('No empty visible roll cell');}")
    count = await page.locator('#roll-grid .note').count()
    await page.mouse.move(empty['x'],empty['y']); await page.mouse.down(); await page.mouse.move(empty['x']+15,empty['y'],steps=3); await page.mouse.up()
    await expect(page.locator('#roll-grid .note')).to_have_count(count+1)
    await page.locator('#undo').click()
    await expect(page.locator('#roll-grid .note')).to_have_count(count)

async def gesture_delete(page):
    identity = await page.locator('#roll-grid .note').evaluate_all('(ns)=>ns.find(n=>n.getBoundingClientRect().width>24).dataset.note')
    note = page.locator(f'#roll-grid [data-note="{identity}"]')
    await note.scroll_into_view_if_needed()
    before = await note.get_attribute('aria-label')
    client = await page.context.new_cdp_session(page)
    await page.evaluate("""() => {
      window.deleteTouchTrace=[];
      window.recordDeleteTouch=e=>{if(e.pointerType==='touch')deleteTouchTrace.push({type:e.type,time:e.timeStamp,note:e.target.closest?.('[data-note]')?.dataset.note,target:e.target.id});};
      for(const type of ['pointerdown','pointerup','pointercancel'])document.addEventListener(type,recordDeleteTouch,true);
    }""")
    try:
        # Input timing is part of the gesture contract. Controller scheduling
        # must not silently turn the positive double tap into two slow taps.
        for name, offsets, expected in [('implicit-delayed',None,1),('fast-stamped',[0,.02,.10,.12],0),('slow-stamped',[0,.02,.50,.52],1)]:
            await page.locator('#roll-scroll').press('Escape')
            await note.scroll_into_view_if_needed()
            box=await note.bounding_box()
            await page.evaluate('deleteTouchTrace=[]')
            base=time.time()-.1
            for i in range(4):
                if i==2: await asyncio.sleep(.6)  # deliberate host delivery delay
                event={'type':'touchStart' if i%2==0 else 'touchEnd','touchPoints':[{'x':box['x']+box['width']/2,'y':box['y']+box['height']/2,'id':1}] if i%2==0 else []}
                if offsets is not None: event['timestamp']=base+offsets[i]
                await client.send('Input.dispatchTouchEvent',event)
            trace=await page.evaluate('deleteTouchTrace')
            downs=[e for e in trace if e['type']=='pointerdown'];ups=[e for e in trace if e['type']=='pointerup']
            assert len(downs)==2 and len(ups)==2 and all(e.get('note')==identity for e in downs),trace
            assert all(e['target']=='roll-scroll' for e in ups) and not any(e['type']=='pointercancel' for e in trace),trace
            delta=ups[1]['time']-ups[0]['time']
            if offsets is None: assert delta>=350,trace
            else:
                assert abs(delta-(offsets[3]-offsets[1])*1000)<2,trace
                assert all(abs(ups[i]['time']-downs[i]['time']-20)<2 for i in range(2)),trace
            await expect(note).to_have_count(expected)
            print('TOUCH_DELETE',name,json.dumps(trace),flush=True)
            if expected==0:
                await page.locator('#undo').click()
                await expect(note).to_have_attribute('aria-label',before)
            else: await expect(note).to_have_attribute('aria-label',before)
    finally:
        await client.detach()
        await page.evaluate("""() => {for(const type of ['pointerdown','pointerup','pointercancel'])document.removeEventListener(type,recordDeleteTouch,true);delete window.recordDeleteTouch;delete window.deleteTouchTrace;}""")

async def gesture_navigation(page):
    viewport, grid, zoom = (page.locator(s) for s in ['#roll-scroll','#roll-grid','#zoom'])
    async def notes():
        return await grid.locator('[data-note]').evaluate_all(
            'ns=>ns.map(n=>[n.dataset.note,n.getAttribute("aria-label")])')
    original=await notes()
    box=await viewport.bounding_box()
    x=box['x']+box['width']/2
    y=box['y']+box['height']/2
    client=await page.context.new_cdp_session(page)
    async def touch(kind,points):
        await client.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[
            {'id':i+1,'x':a,'y':b} for i,(a,b) in enumerate(points)]})
    try:
        await zoom.evaluate('el=>{el.value="1";el.dispatchEvent(new Event("input"))}')
        basis=await grid.evaluate('g=>g.offsetWidth')
        for start,end,bars in [(80,40,2),(80,40,4),(80,40,8),(40,80,4),(40,80,2),(40,80,1),(80,40,2)]:
            await touch('touchStart',[(x-start,y),(x+start,y)])
            await touch('touchMove',[(x-end,y),(x+end,y)])
            await touch('touchEnd',[])
            assert float(await zoom.input_value())==1/bars
            assert abs(await grid.evaluate('g=>g.offsetWidth')-basis/bars)<=1
            if bars>1:
                await expect(page.locator('#beat-ruler span')).to_have_count(bars)
                await expect(viewport).to_have_attribute('aria-label',f'Piano roll, {bars} four-beat bars. Only bar 1 is captured.')
        # Tap and drag in unrecorded time, then pan over that same region.
        outside=box['x']+.8*box['width']
        await touch('touchStart',[(outside,y)])
        await touch('touchMove',[(outside+12,y)])
        await touch('touchEnd',[])
        top=await viewport.evaluate('e=>e.scrollTop')
        await touch('touchStart',[(outside-25,y),(outside+25,y)])
        await touch('touchMove',[(outside-25,y-20),(outside+25,y-20)])
        await touch('touchEnd',[])
        assert abs(await viewport.evaluate('e=>e.scrollTop')-top-20)<2
        assert float(await zoom.input_value())==.5
        assert await notes()==original
    finally:
        await client.detach()
    zoomed_width=await grid.evaluate('g=>g.offsetWidth')
    await page.locator('.overflow summary').click()
    async with page.expect_download() as requested:
        await page.locator('#draft-save').click()
    download=await requested.value
    draft=Path(await download.path()).read_bytes()
    assert json.loads(draft)['context']['zoom']==.5
    await zoom.evaluate('el=>{el.value="1";el.dispatchEvent(new Event("input"))}')
    await page.locator('#draft-file').set_input_files({'name':'roundtrip.json','mimeType':'application/json','buffer':draft})
    await page.locator('#draft-replace').click()
    assert await grid.evaluate('g=>g.offsetWidth')==zoomed_width
    assert await notes()==original

async def no_tool_row(page):
    screenshots = ROOT / 'build/remote-gestures'
    screenshots.mkdir(parents=True, exist_ok=True)
    await expect(page.locator('.roll-tools')).to_have_count(0)
    await expect(page.locator('[data-mode]:visible')).to_have_count(0)
    await page.screenshot(path=str(screenshots / '844x390.png'))
    await page.set_viewport_size({'width':1440,'height':900})
    await expect(page.locator('.roll-tools')).to_have_count(0)
    await expect(page.locator('[data-mode]:visible')).to_have_count(0)
    await page.screenshot(path=str(screenshots / '1440x900.png'))

async def draft_state(page):
    menu = page.locator('.overflow')
    if not await menu.evaluate('e=>e.open'):
        await page.locator('.overflow summary').click()
    async with page.expect_download() as requested:
        await page.locator('#draft-save').click()
    result = json.loads(Path(await (await requested.value).path()).read_text())
    await page.locator('.overflow summary').click()
    return result

async def load_draft(page, state):
    await page.locator('#draft-file').set_input_files({'name':'step-roundtrip.json','mimeType':'application/json','buffer':json.dumps(state).encode()})
    await page.locator('#draft-replace').click()

async def step_roll(page):
    state = await draft_state(page)
    first = next(n for n in state['notes'] if n['track']=='chicago')
    chord = dict(first, id='draft999', sourceOrder=None, note=first['note']+4, velocity=80)
    state['notes'].append(chord)
    await load_draft(page, state)
    before = (await draft_state(page))['notes']
    cell = page.locator('#velocity [data-lane-step="0"]')
    await expect(page.locator('#velocity [data-lane-step]')).to_have_count(16)
    await expect(cell).to_have_attribute('aria-label', re.compile('2 notes.*Mixed'))
    for kind, key in [('velocity','velocity'),('chance','chance'),('pan','pan'),('pitch','note')]:
        await page.locator('#lane-kind').evaluate('(e,k)=>{e.value=k;e.dispatchEvent(new Event("change"))}',kind)
        original = (await draft_state(page))['notes']
        await cell.press('ArrowDown' if kind=='chance' else 'ArrowUp')
        edited = (await draft_state(page))['notes']
        ids = {first['id'],chord['id']}
        for old,new in zip(original,edited):
            if old['id'] in ids:
                assert old.get(key) != new.get(key), (kind,old,new)
                assert (old['start'],old['end'],old['id']) == (new['start'],new['end'],new['id'])
            else:
                assert old == new
        await page.locator('#undo').click()
        assert (await draft_state(page))['notes'] == original
        await page.locator('#redo').click()
        assert (await draft_state(page))['notes'] == edited
        await page.locator('#undo').click()
    assert (await draft_state(page))['notes'] == before
    await page.locator('#lane-kind').evaluate('(e)=>{e.value="velocity";e.dispatchEvent(new Event("change"))}')
    await cell.scroll_into_view_if_needed()
    track = await page.locator('#velocity .lane-track').bounding_box()
    lane_box = await page.locator('#velocity').bounding_box()
    x0 = track['x']+track['width']/32
    x4 = track['x']+track['width']*4.5/16
    await page.mouse.move(x0,lane_box['y']+lane_box['height']-10)
    await page.mouse.down()
    await page.mouse.move(x4,lane_box['y']+10,steps=1)
    await page.mouse.up()
    ramp = (await draft_state(page))['notes']
    changed = [(a,b) for a,b in zip(before,ramp) if a!=b]
    assert len(changed)>=3, changed
    assert {b['velocity'] for a,b in changed if a['id'] in {first['id'],chord['id']}}=={1}
    await page.locator('#undo').click()
    assert (await draft_state(page))['notes']==before
    await page.locator('#lane-kind').evaluate('(e)=>{e.value="pan";e.dispatchEvent(new Event("change"))}')
    await cell.scroll_into_view_if_needed()
    box = await cell.bounding_box()
    client = await page.context.new_cdp_session(page)
    x,y = box['x']+box['width']/2,box['y']+10
    await client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'id':1,'x':x,'y':y}]})
    await client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'id':1,'x':x,'y':y},{'id':2,'x':x+30,'y':y+10}]})
    await client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    assert (await draft_state(page))['notes'] == before
    note = page.locator('#roll-grid [data-note="'+first['id']+'"]')
    await note.scroll_into_view_if_needed()
    nb = await note.bounding_box()
    lb = await cell.bounding_box()
    roll_point = {'id':11,'x':nb['x']+nb['width']/2,'y':nb['y']+nb['height']/2}
    lane_point = {'id':12,'x':lb['x']+lb['width']/2,'y':lb['y']+10}
    for start,second in [(roll_point,lane_point),(lane_point,roll_point)]:
        await client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[start]})
        await client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[start,second]})
        await client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        assert (await draft_state(page))['notes'] == before
    await client.detach()
    await cell.press('ArrowRight')
    exported = await draft_state(page)
    await load_draft(page,exported)
    assert (await draft_state(page))['notes'] == exported['notes']

async def step_drums(page):
    for kit in ['909','808']:
        await page.locator('[data-engine="drum'+kit+'"]').click()
        await page.locator('.overflow summary').click()
        await page.locator('[data-view="drums"]').click()
        await page.locator('.overflow summary').click()
        cells = page.locator('#drum-lane [data-lane-step]')
        await expect(cells).to_have_count(16)
        if kit=='808':
            await expect(page.locator('#drum-lane [data-lane-step]:disabled')).to_have_count(16)
            await page.locator('#sound-voice').select_option('1')
        cell = page.locator('#drum-lane [data-lane-step]:not(:disabled)').first
        before = (await draft_state(page))['notes']
        for _ in range(4):
            kind = await page.locator('#lane-kind').input_value()
            print('STEP_DRUM_CONTROL',kit,kind,flush=True)
            await cell.press('ArrowDown' if kind=='chance' else 'ArrowUp')
            after = (await draft_state(page))['notes']
            changes = [(a,b) for a,b in zip(before,after) if a!=b]
            assert changes, (kit,kind)
            for a,b in changes:
                assert a['track']==b['track']=='drum'+kit
                assert (a['note'],a['start'],a['end'])==(b['note'],b['start'],b['end'])
                if kind=='pitch': assert b['pitchOffset']==1
            if kind=='pitch':
                await page.locator('[data-view="roll"]').click()
                await expect(page.locator('#lane-value')).to_have_text('+1st')
                await page.locator('[data-view="drums"]').evaluate('e=>e.click()')
            await page.locator('#undo').click()
            assert (await draft_state(page))['notes']==before
            await page.locator('[data-lane-cycle]').click()
        await expect(page.locator('#lane-kind')).to_have_value('drumAccent')
        await page.locator('[data-lane-cycle]').click()
        await expect(page.locator('#lane-kind')).to_have_value('velocity')
        assert await page.locator('.drum-step-lane').evaluate('e=>e.getBoundingClientRect().height') <= 49
        assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        await expect(page.locator('#inspector')).to_have_count(0)

async def thin_step_lanes(page):
    await expect(page.locator('#inspector')).to_have_count(0)
    for width,height in [(844,390),(1440,900)]:
        await page.set_viewport_size({'width':width,'height':height})
        assert await page.locator('.lane').evaluate('e=>e.getBoundingClientRect().height') <= 49
        assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        target = ROOT/'build/remote-step-lanes'
        target.mkdir(parents=True,exist_ok=True)
        await page.screenshot(path=str(target/f'{width}x{height}.png'))

async def chicago_sound_desktop(page):
    await page.set_viewport_size({'width': 1440, 'height': 900})
    await page.locator('#roll-grid [data-note]').first.wait_for(state='attached')
    await page.locator('[data-engine="chicago"]').click()
    await page.locator('[data-view="sound"]').click()
    await expect(page.locator('#sound-bank')).to_have_value('CHICAGO')
    await expect(page.locator('[data-sound-source="draft"]')).to_have_attribute('aria-pressed', 'true')

    section = page.locator('.source-sound-list .envelope-controls')
    stages = section.locator('.envelope-stage')
    await expect(stages.locator('span')).to_have_text(['ATTACK', 'DECAY', 'SUSTAIN', 'RELEASE'])
    await expect(stages.locator('output')).to_have_text(['27%', '40%', '57%', '17%'])
    await expect(page.locator('.source-sound-list [aria-label="WAVE"]')).to_have_attribute('aria-valuetext', 'SAW')
    assert await page.locator('#other-view').evaluate('viewport => viewport.scrollTop') == 0
    for target in [section.locator('svg.envelope-graph'), *await stages.all()]:
        await expect(target).to_be_in_viewport(ratio=1)
    await stages.first.focus()
    await page.keyboard.press('Tab')
    await expect(stages.nth(1)).to_be_focused()

async def full_envelopes(page):
    try:
        await check_draft_envelopes(page)
    except Exception as error:
        try:
            frame, line = next(((frame, line) for frame, line in traceback.walk_tb(error.__traceback__)
                                if frame.f_code is check_draft_envelopes.__code__), (None, 0))
            observed = frame.f_locals if frame else {}
            details = {key: observed.get(key) for key in ('part', 'bank', 'stage_index')}
            details.update(case='full_envelopes', operation=linecache.getline(__file__, line).strip(),
                           viewport=page.viewport_size, dom=None)
            try:
                if not page.is_closed():
                    details['dom'] = await asyncio.wait_for(page.evaluate("""() => {
                      const owner = document.querySelector('[data-engine][aria-pressed="true"]');
                      const stages = [...document.querySelectorAll('#other-view .envelope-controls .envelope-stage')];
                      return {part: owner?.dataset.engine, bank: document.querySelector('#sound-bank')?.value,
                        count: stages.length, stages: stages.map(b => ({id: b.dataset.param, label: b.querySelector('span')?.textContent}))};
                    }"""), timeout=0.65)
            except Exception:
                pass
            print('Draft envelope context', json.dumps(details), flush=True)
        except Exception:
            pass  # Reporting must preserve the original fixture failure.
        raise


async def check_draft_envelopes(page):
    await page.locator('#roll-grid [data-note]').first.wait_for(state='attached')
    archived = Path(__file__).with_name('fixtures') / 'legacy-sound-banks' / 'both-owners.json'
    await page.locator('#draft-file').set_input_files(archived)
    await page.locator('#draft-replace').click()
    await page.locator('[data-view="sound"]').click()
    graph = page.locator('#other-view .envelope-graph')
    root = page.locator('#other-view .envelope-controls')
    buttons = root.locator('.envelope-stage')
    for part in ['chicago','miami']:
        bank = stage_index = None
        await page.locator('[data-engine="'+part+'"]').click()
        picker = page.locator('#sound-bank')
        await expect(picker).to_have_value('JUNO')
        await picker.select_option('CHICAGO')
        await page.locator('[data-restore-legacy-juno]').click()
        for bank in ['JUNO','CHICAGO']:
            if bank == 'CHICAGO':
                await picker.select_option(bank)
            await expect(picker).to_have_value(bank)
            await expect(buttons).to_have_count(4)
            for width,height in [(390,844),(844,390),(1440,900)]:
                await page.set_viewport_size({'width':width,'height':height})
                assert (await graph.bounding_box())['width'] >= (await root.bounding_box())['width'] - 18
            for stage_index, button in enumerate(await buttons.all()):
                before = await graph.screenshot()
                original_shape = await graph.locator('path').get_attribute('d')
                initial = await button.locator('output').inner_text()
                await button.press('Enter')
                field = page.locator('#parameter-value')
                await field.fill('115')
                await field.press('Enter')
                await expect(button.locator('output')).to_have_text('91%')
                assert await graph.screenshot() != before
                await page.locator('#undo').click()
                await expect(button.locator('output')).to_have_text(initial)
                assert await graph.locator('path').get_attribute('d') == original_shape
            stage_index = None
            await buttons.first.press('ArrowRight')
            saved = await draft_state(page)
            shape = await graph.locator('path').get_attribute('d')
            await load_draft(page,saved)
            assert shape == await graph.locator('path').get_attribute('d')
    await page.locator('#sound-bank').select_option('MIAMI')
    await expect(graph).to_have_count(0)

async def break_step_chance(page, previous):
    # Import two ordinary pre-Chance notes on one step; the lock belongs to that step only.
    previous = dict(previous, notes=[*previous['notes'], dict(next(n for n in previous['notes'] if n['id']=='draft998'), id='draft999', note=64)])
    await load_draft(page, previous)
    await page.locator('[data-break-view="notes"]').click()
    await page.locator('#lane-param').click()
    owner=page.locator('#velocity [data-lane-step="0"]')
    await expect(owner).to_have_attribute('aria-label','Step 1, 2 notes, chance 100%')
    await owner.press('ArrowUp')
    assert 'breakSequence' not in await draft_state(page)
    await owner.press('ArrowDown')
    await expect(owner).to_have_attribute('aria-valuetext','95%')
    saved=await draft_state(page)
    assert saved['breakSequence']['chance']==[95]+[None]*15 and saved['notes']==previous['notes']
    await page.locator('#undo').click()
    assert 'breakSequence' not in await draft_state(page)
    await page.locator('#redo').click()
    await expect(owner).to_have_attribute('aria-valuetext','95%')
    # A real stroke into an empty step stores the whole gesture as one command.
    silent=page.locator('#velocity [data-lane-step="2"]')
    first=await owner.bounding_box(); third=await silent.bounding_box()
    await page.mouse.move(first['x']+first['width']/2,first['y']+2);await page.mouse.down()
    await page.mouse.move(third['x']+third['width']/2,third['y']+third['height']-2,steps=3);await page.mouse.up()
    await expect(silent).to_have_attribute('aria-valuetext','8:8')
    await expect(page.locator('#lane-param output')).to_have_text('8:8')
    stroke=await draft_state(page)
    assert stroke['breakSequence']['chance'][0] is None and stroke['breakSequence']['chance'][2]==135
    assert stroke['notes']==previous['notes'] and await page.locator('#apply').is_disabled()
    await page.locator('#undo').click()
    assert (await draft_state(page))['breakSequence']==saved['breakSequence']
    # Focus on a different step must not change the step under the pointer.
    await owner.focus()
    await page.mouse.move(third['x']+third['width']/2,third['y']+third['height']-2);await page.mouse.down()
    await expect(page.locator('#lane-param output')).to_have_text('8:8')
    await expect(silent).to_have_attribute('aria-pressed','true')
    # Keyboard navigation away from Notes cancels the held preview.
    await page.locator('[data-break-view="slices"]').press('Enter');await page.mouse.up()
    await page.locator('[data-break-view="notes"]').click()
    assert (await draft_state(page))['breakSequence']==saved['breakSequence']
    await silent.press('ArrowDown')
    await expect(page.locator('#lane-param output')).to_have_text('95%')
    await expect(silent).to_have_attribute('aria-pressed','true')
    await load_draft(page,stroke)
    await page.locator('[data-view="patterns"]').click()
    await page.get_by_role('button',name='BREAK P2, not loaded',exact=True).click()
    selected=await draft_state(page)
    assert selected['launch'][4]==1 and selected['breakSequence']==stroke['breakSequence']
    await load_draft(page,previous)
    assert 'breakSequence' not in await draft_state(page)

async def break_and_tape(page):
    await page.locator('[data-engine="breaks"]').click()
    await expect(page.locator('[data-break-step]')).to_have_count(16)
    await expect(page.locator('#break-sequence [data-action="play"]')).to_have_count(5)
    preview = page.locator('#break-sequence [data-action="play"]').first
    await preview.click()
    await expect(preview).to_have_attribute('aria-pressed','true')
    await expect(preview).to_have_attribute('aria-pressed','false',timeout=7000)
    await expect(preview).to_have_text('Play')
    assert await page.locator('[data-break-loop="0"]').input_value() == ''
    await page.locator('[data-break-loop="0"]').select_option('personal-br1-zone2')
    await page.locator('[data-break-loop="1"]').select_option('personal-br2-zone1')
    await page.locator('[data-break-rate]').select_option('1/8')
    await page.locator('[data-break-step="15"]').select_option('32')
    await page.locator('#undo').click()
    await expect(page.locator('[data-break-step="15"]')).to_have_value('0')
    await page.locator('#redo').click()
    await expect(page.locator('[data-break-step="15"]')).to_have_value('32')
    await page.locator('[data-view="mix"]').click()
    await page.locator('[data-mix-mode="fx"]').click()
    await expect(page.locator('[data-mix-mode="fx"]')).to_have_attribute('aria-pressed', 'true')
    wear = page.locator('button[data-mix-param-label="Tape Wear"]')
    await expect(wear.locator('output')).to_have_text('50%')
    painted = await wear.locator('canvas').evaluate('el => el.toDataURL()')
    await wear.press('Enter')
    field = page.locator('#parameter-value')
    await field.fill('127')
    await field.press('Enter')
    await expect(wear.locator('output')).to_have_text('100%')
    await page.wait_for_function("before => document.querySelector('[data-mix-param-label=\"Tape Wear\"] canvas').toDataURL() !== before",arg=painted)
    state = await draft_state(page)
    assert state['breakSequence'] == {'loops':['personal-br1-zone2','personal-br2-zone1'], 'rate':'1/8', 'slices':[0]*15+[32]}
    assert {'id':'catalog/1551', 'value':127} in state['parameters']
    await load_draft(page, state)
    await expect(wear.locator('output')).to_have_text('100%')
    await page.locator('[data-view="roll"]').click()
    await expect(page.locator('[data-break-step="15"]')).to_have_value('32')
    broken = dict(state, breakSequence=dict(state['breakSequence'],loops=['unknown-loop',None]))
    await page.locator('#draft-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(broken).encode()})
    await expect(page.locator('#status')).to_have_text('Local draft: invalid BREAK sequence')
    await expect(page.locator('[data-break-loop="0"]')).to_have_value('personal-br1-zone2')
    old = dict(state)
    del old['breakSequence']
    old['notes'].append(dict(id='draft998', track='breaks', note=60, velocity=100, channel=0, start=0, end=500, sourceOrder=None, pulse=False))
    await load_draft(page, old)
    await page.locator('[data-view="roll"]').click()
    await expect(page.locator('[data-break-step="15"]')).to_have_value('0')
    await expect(page.locator('[data-break-loop="0"]')).to_have_value('')
    assert not await page.locator('#roll-view').is_visible()
    await page.locator('[data-break-view="notes"]').click()
    legacy = page.locator('[data-note="draft998"]')
    await expect(legacy).to_be_visible()
    await legacy.press('ArrowUp')
    legacy_file = await draft_state(page)
    assert next(n for n in legacy_file['notes'] if n['id']=='draft998')['note'] == 61
    assert 'breakSequence' not in legacy_file
    await break_step_chance(page,legacy_file)
    await page.locator('[data-break-view="slices"]').click()
    await page.locator('[data-engine="chicago"]').click()
    await expect(page.locator('#roll-view')).to_be_visible()
    await page.locator('#connect').click()
    await expect(page.locator('#connection-message')).to_have_text('No reviewed firmware catalog. Apply stays off.')
    await page.locator('#close-connection').click()
    await expect(page.locator('#connection-result')).to_be_hidden()
    await page.route('**/sample-contract.json', lambda route:route.fulfill(status=200,body='{}'))
    await page.locator('[data-engine="breaks"]').click()
    await expect(page.locator('#break-sequence')).to_contain_text('Starting breaks unavailable')
    await expect(page.locator('#break-sequence [data-action="play"]')).to_have_count(0)
    assert await page.locator('#apply').is_disabled()

async def project_files(page):
    for width,height in [(1440,900),(390,844),(844,390)]:
        await page.set_viewport_size({'width':width,'height':height})
        await page.goto(ORIGIN+'/remote/')
        await page.locator('[data-view="files"]').click()
        summary = page.locator('.project-summary')
        await expect(summary.get_by_role('heading',name='Current session',exact=True)).to_be_visible()
        await expect(summary.locator('p')).to_have_text(re.compile(r'\d+ notes · \d+ sound edits · \d+ song rows'))
        destinations = [
            ('Export backup', '/projects/#export-title', '#export'),
            ('Inspect restore', '/projects/#import-title', '#file'),
            ('Choose range', '/projects/#project-exchange-root', '#project-exchange-root input[type="number"]'),
            ('Export availability', '/projects/#project-exchange-availability', '#project-exchange-availability'),
            ('Samples', '/breaks/', 'h1'),
            ('Manual', '/manual/', 'h1'),
        ]
        cards = page.locator('.destinations>section')
        assert await cards.locator('h3').all_text_contents() == ['Project backup','Original presets','MIDI for a DAW']
        if width == 844:
            bounds = [await card.bounding_box() for card in await cards.all()]
            assert len({box['y'] for box in bounds}) == 1
            resources = page.get_by_role('navigation', name='Project resources')
            for name in ('Samples', 'Manual'):
                link = resources.get_by_role('link', name=name, exact=True)
                await expect(link).to_be_in_viewport(ratio=1)
                box = await link.bounding_box()
                assert box and box['width'] >= 44 and box['height'] >= 44, (name, box)
        await page.locator('.project-guide summary').click()
        await expect(page.locator('.project-guide p')).to_contain_text('Import project.mid into Ableton Live')
        await page.locator('.project-guide summary').click()
        async def save():
            async with page.expect_download() as requested:
                await summary.get_by_role('button',name='Save draft',exact=True).click()
            return json.loads(Path(await (await requested.value).path()).read_text())
        before = await save()
        assert before['notes']
        await summary.get_by_role('button',name='Review changes',exact=True).click()
        await expect(page.locator('#review-dialog')).to_be_visible()
        await page.locator('#review-dialog').get_by_role('button',name='Return',exact=True).click()
        async with page.expect_file_chooser() as requested:
            await summary.get_by_role('button',name='Open draft',exact=True).click()
        await (await requested.value).set_files({'name':'invalid.json','mimeType':'application/json','buffer':b'invalid'})
        await expect(page.locator('#draft-dialog')).to_be_visible()
        await expect(page.locator('#draft-replace')).to_be_disabled()
        assert await page.locator('#draft-preview').inner_text()
        await page.locator('#draft-cancel').click()
        await expect(page.locator('#status')).to_be_visible()
        assert await page.locator('#status').inner_text()
        after = await save()
        assert after==before, 'Rejected draft changed Current session'
        from project_preset_journey import exercise as project_presets
        await project_presets(page)
        for name,path,target in destinations:
            action = page.get_by_role('link',name=name,exact=True)
            await expect(action).to_have_attribute('href','..'+path)
            async with page.expect_popup() as opened:
                await action.click()
            tab = await opened.value
            try:
                await tab.wait_for_url(ORIGIN+path)
                await expect(tab.locator(target).first).to_be_visible()
                if name == 'Choose range':
                    await tab.locator(target).fill('12')
                    await expect(tab.get_by_role('button',name='Prepare MIDI export')).to_be_disabled()
                elif name == 'Export availability':
                    await expect(tab.locator(target)).to_contain_text('no qualified source-executed browser provider')
            finally:
                await tab.close()
        assert await save() == before, 'Opening a companion tool discarded or changed the local Draft'
        print(f'PASS Projects: backup, presets, MIDI range and guide, samples, manual, original Draft preserved {width}x{height}',flush=True)

async def motion_keyboard(page):
    for width,height in [(1440,900),(390,844),(844,390)]:
        await page.set_viewport_size({'width':width,'height':height})
        await page.goto(ORIGIN+'/remote/')
        await page.locator('.overflow summary').click()
        await page.locator('[data-view="locks"]').click()
        if await page.locator('.overflow').evaluate('(el)=>el.open'):
            await page.locator('.overflow summary').click()
        grid = page.locator('#motion-grid')
        steps = grid.locator('[data-motion-step]')
        await expect(steps).to_have_count(16)
        await grid.focus()
        for _ in range(9):
            await page.keyboard.press('Tab')
        await expect(steps.nth(8)).to_be_focused()
        await page.keyboard.press('Enter')
        await expect(page.locator('#motion-step')).to_have_value('9')
        await expect(steps.nth(8)).to_have_attribute('aria-pressed','true')
        await expect(steps.nth(8)).to_be_focused()
        await page.keyboard.press('Tab')
        await expect(steps.nth(9)).to_be_focused()
        await page.keyboard.press('Space')
        await expect(page.locator('#motion-step')).to_have_value('10')
        await expect(steps.nth(9)).to_have_attribute('aria-pressed','true')
        await expect(steps.nth(9)).to_be_focused()
        assert await steps.evaluate_all('(buttons)=>buttons.every(b=>b.getAttribute("aria-label").endsWith(", unset"))')
        await expect(page.locator('#undo')).to_be_disabled()
        # Traverse the remaining six step buttons and Step field to Value.
        for _ in range(8):
            await page.keyboard.press('Tab')
        await expect(page.locator('#motion-value')).to_be_focused()
        await page.keyboard.type('77')
        await page.keyboard.press('Tab')
        await expect(steps.nth(9)).to_have_attribute('aria-label','Step 10, 77')
        assert await steps.evaluate_all('(buttons)=>buttons.every((b,i)=>i===9||b.getAttribute("aria-label").endsWith(", unset"))')
        await page.locator('#undo').focus()
        await page.keyboard.press('Enter')
        assert await steps.evaluate_all('(buttons)=>buttons.every(b=>b.getAttribute("aria-label").endsWith(", unset"))')
        await page.locator('#redo').focus()
        await page.keyboard.press('Enter')
        await expect(steps.nth(9)).to_have_attribute('aria-label','Step 10, 77')
        # Pointer drawing remains one independent history entry after keyboard selection.
        await grid.scroll_into_view_if_needed()
        box = await grid.bounding_box()
        await page.mouse.move(box['x']+box['width']*2.5/16,box['y']+box['height']/2)
        await page.mouse.down()
        await page.mouse.up()
        await expect(steps.nth(2)).to_have_attribute('aria-label','Step 3, 64')
        await page.locator('#undo').focus()
        await page.keyboard.press('Enter')
        await expect(steps.nth(2)).to_have_attribute('aria-label','Step 3, unset')
        await expect(steps.nth(9)).to_have_attribute('aria-label','Step 10, 77')
        print(f'PASS Motion Tab/Enter/Space selects the edited step, preserves focus/history and pointer drawing {width}x{height}',flush=True)

async def motion_context(page):
    for width,height in [(1440,900),(390,844),(844,390)]:
        await motion_context_at_size(page,width,height)

async def motion_context_at_size(page,width,height):
    await page.set_viewport_size({'width':width,'height':height})
    await page.goto(ORIGIN+'/remote/')
    await page.locator('.overflow summary').click()
    await page.locator('[data-view="locks"]').click()
    if await page.locator('.overflow').evaluate('(el)=>el.open'):
        await page.locator('.overflow summary').click()
    await page.locator('#motion-step').fill('10')
    await page.locator('#motion-step').press('Tab')
    await page.locator('#motion-value').fill('77')
    await page.locator('#motion-value').press('Tab')
    await page.locator('#motion-grid').focus()
    # Native Tab traversal scrolls the working controls into view on landscape.
    for _ in range(18):
        await page.keyboard.press('Tab')
    value=page.locator('#motion-value')
    await expect(value).to_be_focused()
    await expect(value).to_have_value('77')
    await expect(page.locator('#part-title')).to_have_text('MIAMI Wave')
    label=value.locator('..')
    assert (await label.inner_text()).strip()=='Value'
    for target in [page.locator('#part-title'),label,value]:
        box=await target.bounding_box()
        assert box and box['x']>=0 and box['y']>=0 and box['x']+box['width']<=width+1 and box['y']+box['height']<=height+1,(width,height,box)
        assert await target.evaluate('(e)=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e===hit||e.contains(hit)}')
    await expect(page.get_by_text('Local draft',exact=True)).to_have_count(0)
    expected=[None]*16;expected[9]=77
    assert (await draft_state(page))['motion']['values']==expected
    await page.locator('#undo').click()
    assert (await draft_state(page))['motion']['values']==[None]*16
    await page.locator('#redo').click()
    assert (await draft_state(page))['motion']['values']==expected
    await page.locator('[data-view="roll"]').click()
    await expect(page.locator('#part-title')).to_have_text('CHICAGO / P01')
    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    print(f'PASS Motion visible target/value identity after keyboard scroll and intact history {width}x{height}',flush=True)

async def project_sound_edit_count(page):
    for width,height in [(1440,900),(390,844),(844,390)]:
        await project_sound_edit_count_at_size(page,width,height)

async def project_sound_edit_count_at_size(page,width,height):
    await page.set_viewport_size({'width':width,'height':height})
    await page.goto(ORIGIN+'/remote/')
    await page.locator('[data-engine="drum909"]').click()
    await page.locator('[data-view="sound"]').click()
    await page.locator('#sound-voice').select_option('0')
    prefix='current-state-and-reference/909-voice-00.svg|'
    attack_id,tune_id=prefix+'1:0:0:1',prefix+'1:0:0:0'
    async def snapshot(label):
        await page.locator('[data-view="sound"]').click()
        await page.locator('[data-param="'+tune_id+'"]').press('Enter')
        effective=await page.locator('#parameter-value').input_value()
        document=await draft_state(page)
        raw={entry['id']:entry['value'] for entry in document['parameters']}
        await page.locator('[data-view="files"]').click()
        summary=await page.locator('.project-summary p').inner_text()
        await page.locator('[data-project-action="review"]').click()
        review=await page.locator('#changes').inner_text()
        await page.locator('#review-dialog button').click()
        result={'raw':raw,'effectiveTune':effective,'summary':summary,'review':review}
        print('PROJECT_SOUND_COUNT',width,height,label,json.dumps(result),flush=True)
        return result
    await page.locator('[data-param="'+attack_id+'"]').press('Enter')
    await expect(page.locator('#parameter-value')).to_have_value('13')
    await page.locator('[data-param="'+attack_id+'"]').press('ArrowUp')
    before=await snapshot('authored-Attack')
    assert before['raw']=={attack_id:14} and '1 sound edits' in before['summary']
    await page.locator('[data-view="sound"]').click()
    await page.locator('[data-param="'+tune_id+'"]').press('ArrowDown')
    edited=await snapshot('edited-Tune')
    assert edited['raw']=={attack_id:14,tune_id:33} and edited['effectiveTune']=='33'
    assert '2 sound edits' in edited['summary']
    await page.locator('#undo').press('Enter')
    undone=await snapshot('Undo-Tune')
    # Undo restores the entries that existed immediately before the Tune edit.
    assert undone['raw']==before['raw'] and undone['effectiveTune']=='34'
    assert '1 sound edits' in undone['summary']
    assert 'Attack: 10% → 11%' in undone['review'] and 'Tune:' not in undone['review']
    await page.locator('#redo').press('Enter')
    redone=await snapshot('Redo-Tune')
    assert redone['raw']=={attack_id:14,tune_id:33} and redone['effectiveTune']=='33'
    assert '2 sound edits' in redone['summary'] and 'Tune: 13ms (−1 step)' in redone['review']
    await page.locator('#undo').press('Enter')
    await page.locator('#undo').press('Enter')
    zero=await snapshot('Undo-Attack')
    assert zero['raw']=={} and zero['effectiveTune']=='34'
    assert '0 sound edits' in zero['summary'] and zero['review']=='No changes.'
    await expect(page.locator('#undo')).to_be_disabled()
    # Older Drafts can explicitly store the native Tune default. Keep that row on Undo.
    imported=await draft_state(page)
    assert imported['parameters']==[]
    imported['parameters']=[{'id':tune_id,'value':34}]
    await load_draft(page,imported)
    await page.locator('[data-view="sound"]').click()
    await page.locator('[data-param="'+tune_id+'"]').press('ArrowDown')
    imported_edit=await snapshot('edited-explicit-Tune')
    assert imported_edit['raw']=={tune_id:33} and imported_edit['effectiveTune']=='33'
    assert '1 sound edits' in imported_edit['summary']
    await page.locator('#undo').press('Enter')
    restored=await snapshot('Undo-explicit-Tune')
    assert restored['raw']=={tune_id:34} and restored['effectiveTune']=='34'
    assert '0 sound edits' in restored['summary'] and restored['review']=='No changes.'
    print(f'PASS Projects sound-edit count follows actual Draft changes and preserves effective Undo/Redo {width}x{height}',flush=True)

async def kit_accent_across_voices(page):
    for width, height in [(1440, 900), (390, 844), (844, 390)]:
        await page.set_viewport_size({'width':width,'height':height})
        for target,kit in enumerate(('909','808')):
            await page.locator('[data-engine="drum'+kit+'"]').click()
            await page.locator('[data-view="sound"]').click()
            voice = page.locator('#sound-voice')
            suffix = '|1:'+str(target)+':11:1'
            value = page.locator('[data-param-value$="'+suffix+'"]')
            hit = page.locator('button[data-param$="'+suffix+'"]')
            await voice.select_option('0')
            await expect(value).to_have_text('100%')
            if target == 0:
                label=page.locator('.drum-velocity-label, [data-drum-sound-unit] [data-drum-label]').filter(has_text='Velocity')
                await expect(label).to_be_visible()
                await expect(hit).to_have_accessible_name(re.compile('Velocity'))
            await hit.press('ArrowDown')
            await expect(value).to_have_text('99%')
            await voice.select_option('1')
            await expect(value).to_have_text('99%')
            await page.locator('[data-view="files"]').click()
            await expect(page.locator('.project-summary p')).to_contain_text('1 sound edits')
            await page.locator('[data-project-action="review"]').click()
            await expect(page.locator('#changes')).to_have_text('Parameter · '+kit+' / KIT · '+('Velocity' if target==0 else 'Accent')+': 100% → 99%')
            await page.locator('#review-dialog').get_by_role('button',name='Return').click()
            await page.locator('[data-view="sound"]').click()
            await page.locator('#undo').click()
            await expect(value).to_have_text('100%')
            await page.locator('#redo').click()
            await expect(value).to_have_text('99%')
            await page.locator('#undo').click()
        print('KIT_ACCENT_SHARED PASS',width,height,'both kits, BD → SD, Review, Undo and Redo',flush=True)

async def browser_cases():
    notice = (ROOT / 'LICENSES/FunkyBeats-MIT.md').read_text()
    assert 'Permission is hereby granted' in notice
    from discard_draft_journey import exercise as review_discard
    async def discard_draft(page):
        await review_discard(page,draft_state,load_draft)
    from pattern_lock_journey import exercise as pattern_locks
    async def pattern_lock_points(page):
        await pattern_locks(page,draft_state,load_draft)
    from bass_step_journey import exercise as bass_steps
    async def bass_step_fields(page):
        await bass_steps(page, draft_state, load_draft)
    from step_label_journey import exercise as step_labels
    async def step_label_widths(page):
        await step_labels(page, draft_state, load_draft)
    cases = (discard_draft, bass_step_fields, pattern_lock_points, step_label_widths, roll, sequencer, drum_accent, mixer, fx_part_sends, launcher, synth, gesture_edits, gesture_delete, gesture_navigation, no_tool_row, step_roll, step_drums, thin_step_lanes, break_and_tape, chicago_sound_desktop, full_envelopes, project_files, motion_keyboard, project_sound_edit_count, kit_accent_across_voices, motion_context)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(chromium_sandbox=True)
        try:
            for case in cases:
                context = await browser.new_context(viewport={'width': 844, 'height': 390}, has_touch=True)
                await context.route('**/*', serve)
                page = await context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                await page.add_init_script('navigator.requestMIDIAccess=()=>{throw Error("Device access forbidden in local draft test")};')
                await page.goto(ORIGIN + '/remote/')
                await page.wait_for_function('document.getElementById("status").textContent.includes("Draft")')
                await case(page)
                assert not errors, errors
                print(f'PASS FunkyBeats {case.__name__}', flush=True)
                await context.close()
        finally:
            await browser.close()
    print(f'FUNKYBEATS-BROWSER pages={len(cases)} failures=0')

async def main():
    global SOURCE
    output_root = ROOT / '.output'
    output_root.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='funkybeats-browser-', dir=output_root) as output:
        SOURCE = Path(output)
        subprocess.run(['node', 'scripts/build-product-site.mjs', '--output', output], cwd=ROOT, check=True)
        await asyncio.to_thread(preload_product, SOURCE)
        await browser_cases()

if __name__ == '__main__':
    asyncio.run(main())
