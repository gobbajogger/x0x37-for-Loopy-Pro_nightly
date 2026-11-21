# SPDX-License-Identifier: GPL-3.0-only
"""Navigation actions remain distinct from workspace layout state.
Runs the unchanged mandatory FunkyBeats step_drums case at all three sizes.
"""
import argparse,asyncio,hashlib,importlib.util,json,subprocess,tempfile
from pathlib import Path
from playwright.async_api import async_playwright,expect
ROOT=Path(__file__).resolve().parents[2]
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));obj=importlib.util.module_from_spec(spec);spec.loader.exec_module(obj);return obj
f=module('navigation_funkybeats','funkybeats-browser.py');core=module('navigation_server','envelope-browser.py')
VIEWS=['roll','sound','mix','patterns','files','drums','locks','song']
async def choose(page,view):
    action=page.locator('[data-view="'+view+'"]')
    if view in ['drums','locks','song'] and not await page.locator('.overflow').evaluate('e=>e.open'):await page.locator('.overflow summary').click()
    await action.click()
    if await page.locator('.overflow').evaluate('e=>e.open'):await page.locator('.overflow summary').click()
async def check_device_navigation(page, origin):
    await page.goto(origin + '/remote/device/', wait_until='networkidle')
    await page.evaluate('document.fonts.ready')
    links = page.get_by_role('navigation', name='Main').get_by_role('link')
    expected = ['Sounds', 'Remote', 'Samples', 'Projects', 'Presets', 'Manual', 'History', 'Install nightly']
    assert await links.all_text_contents() == expected
    bounds = await page.evaluate("""() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        links: [...document.querySelectorAll('header nav a')].map(a => {
            const r = a.getBoundingClientRect();
            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return {name: a.textContent, left: r.left, right: r.right,
                    reachable: Boolean(r.width && r.height && hit && a.contains(hit))};
        })
    })""")
    assert bounds['document'] == bounds['viewport'], bounds
    for link in bounds['links']:
        assert link['reachable'] and 0 <= link['left'] < link['right'] <= bounds['viewport'], link
    return bounds


async def check_roll_part_return(page):
    # Choose a different part while its roll is unmounted, then open Sequence.
    for away, part in [('sound', 'miami'), ('drums', 'chicago'), ('patterns', 'miami')]:
        await choose(page, away)
        await page.locator('[data-engine="' + part + '"]').click()
        await choose(page, 'roll')
        visible = await page.locator('#roll-scroll').evaluate("""pane => {
            const viewport = pane.getBoundingClientRect();
            return [...pane.querySelectorAll('[data-note]')].some(note => {
                const box = note.getBoundingClientRect();
                return box.left < viewport.right && box.right > viewport.left &&
                       box.top >= viewport.top && box.bottom <= viewport.bottom;
            });
        }""")
        assert visible, (away, part, 'selected part opened outside its notes')

    # Returning to the same part must preserve the position chosen by the player.
    pane = page.locator('#roll-scroll')
    initial = await pane.evaluate('el => el.scrollTop')
    await pane.hover()
    await page.mouse.wheel(0, 90)
    await page.wait_for_function("y => document.getElementById('roll-scroll').scrollTop !== y", arg=initial)
    await page.wait_for_timeout(150)
    position = await pane.evaluate('el => [el.scrollLeft,el.scrollTop]')
    await choose(page, 'sound')
    await choose(page, 'roll')
    restored = await pane.evaluate('el => [el.scrollLeft,el.scrollTop]')
    assert restored == position, (position, restored)


async def run(origin,out,negative):
    f.ORIGIN=origin
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(chromium_sandbox=True)
        try:
            for width,height in [(1440,900),(390,844),(844,390)]:
                context=await browser.new_context(viewport={'width':width,'height':height},accept_downloads=True,has_touch=True);page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                await page.add_init_script("window.navigationMidiCalls=0;navigator.requestMIDIAccess=()=>{navigationMidiCalls++;throw Error('No device access')};")
                history=[]; device_navigation=None
                try:
                    if not negative:
                        device_navigation = await check_device_navigation(page, origin)
                    await page.goto(origin+'/remote/',wait_until='networkidle')
                    for view in (['drums'] if negative else VIEWS):
                        await choose(page,view)
                        state=await page.evaluate("v=>({view:v,actions:[...document.querySelectorAll('[data-view=\"'+v+'\"]')].map(e=>({tag:e.tagName,id:e.id,current:e.getAttribute('aria-current')})),mainView:document.querySelector('#workspace-main').getAttribute('data-view'),layout:document.querySelector('#workspace-main').getAttribute('data-layout-view'),mainCurrent:document.querySelector('#workspace-main').getAttribute('aria-current')})",view);history.append(state)
                        assert len(state['actions'])==1 and state['actions'][0]['tag']=='BUTTON',state
                        assert state['mainView'] is None and state['mainCurrent'] is None and state['layout']==view,state
                        # A second user activation of the active action stays strict and functional.
                        await choose(page,view);await expect(page.locator('[data-view="'+view+'"]')).to_have_count(1)
                        await expect(page.locator('#workspace-main')).not_to_have_attribute('aria-current','page')
                        assert await page.evaluate('document.documentElement.scrollWidth === innerWidth'), (width,height,view)
                        if view=='locks':await expect(page.locator('#roll-view')).to_be_visible();await expect(page.locator('#motion-grid')).to_be_visible();await expect(page.locator('#motion-sequence-context')).to_contain_text('Sequence ·')
                    await page.goto(origin+'/remote/',wait_until='networkidle')
                    await f.step_drums(page)  # exact existing implementation, no selector narrowing
                    if not negative:
                        await check_roll_part_return(page)
                    assert not errors,errors;assert await page.evaluate('navigationMidiCalls')==0
                    assets={name:hashlib.sha256(await (await page.request.get(origin+'/remote/'+name)).body()).hexdigest() for name in ['app.mjs','style.css','index.html']}
                    (out/f'{width}x{height}.json').write_text(json.dumps({'viewport':[width,height],'navigation':history,'deviceNavigation':device_navigation,'existingCase':'funkybeats-browser.py:step_drums unchanged','assetSha256':assets,'pageErrors':errors,'midiCalls':0},indent=2)+'\n');await page.screenshot(path=str(out/f'{width}x{height}.png'));print(f'PASS navigation action uniqueness/repeated current/Motion + unchanged step_drums {width}x{height}',flush=True)
                except BaseException as error:
                    (out/f'{width}x{height}-failure.json').write_text(json.dumps({'exception':str(error),'navigation':history,'pageErrors':errors},indent=2)+'\n');await page.screenshot(path=str(out/f'{width}x{height}-failure.png'));raise
                finally:await context.close()
        finally:await browser.close()
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--site',type=Path);parser.add_argument('--negative',action='store_true',help='Reproduce the original first drums selector collision; failure is expected');parser.add_argument('--evidence-dir',type=Path,default=ROOT/'.output/navigation-state');args=parser.parse_args();args.evidence_dir.mkdir(parents=True,exist_ok=True)
    if args.site:
        with core.server(args.site.resolve()) as origin:asyncio.run(run(origin,args.evidence_dir,args.negative))
    else:
        (ROOT/'.output').mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='navigation-state-',dir=ROOT/'.output') as site:
            subprocess.run(['node','scripts/build-product-site.mjs','--output',site],cwd=ROOT,check=True)
            with core.server(site) as origin:asyncio.run(run(origin,args.evidence_dir,args.negative))
