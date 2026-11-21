# SPDX-License-Identifier: GPL-3.0-only
"""Actual frozen owning-worklet product playing indicator; no fabricated frames.
Prepared for explicit root browser release. Source/model tests are separate.
"""
import asyncio, hashlib, importlib.util, json, os, subprocess, tempfile
from pathlib import Path
from playwright.async_api import async_playwright, expect
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('sound_acceptance',Path(__file__).with_name('native-sound-browser.py'))
sound=importlib.util.module_from_spec(spec);spec.loader.exec_module(sound)

async def pulse_play(page):
    await page.evaluate('nativeNodes.at(-1).port.postMessage({type:"buttons",bits:1<<10})')
    await page.wait_for_timeout(110)  # qualified stock panel hold, distinct press/release
    before=await page.evaluate('nativeFrames.length')
    await page.evaluate('nativeNodes.at(-1).port.postMessage({type:"buttons",bits:0})')
    await page.wait_for_function('n=>nativeFrames.length>=n+4',arg=before)

async def geometry(page):
    return await page.evaluate("""() => {
        const selectors = ['.hdr', '.project-name', '#conn-state', '#native-playing', '#connect', '#roll-scroll'];
        return selectors.map(selector => {
            const {x, y, width, height} = document.querySelector(selector).getBoundingClientRect();
            return {selector, x, y, width, height};
        });
    }""")

async def check_status_area(page):
    # The project title and musical position retain their own header fields.
    # Both live readouts belong beside Connect, with their complete text visible.
    await expect(page.locator('.project-name')).to_have_text('Example project')
    await expect(page.locator('#native-playing')).to_have_attribute('aria-live', 'polite')
    await expect(page.locator('#native-playing')).to_have_attribute('aria-atomic', 'true')
    bounds = await page.evaluate("""() => {
        const textBox = selector => {
            const range = document.createRange();
            range.selectNodeContents(document.querySelector(selector));
            return range.getBoundingClientRect().toJSON();
        };
        const box = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
        return {connection: textBox('#conn-state'), playing: textBox('#native-playing'),
                connect: box('#connect'), group: box('.link-status'), header: box('.hdr')};
    }""")
    group, header = bounds['group'], bounds['header']
    for text in (bounds['connection'], bounds['playing']):
        assert group['left'] <= text['left'] < text['right'] <= bounds['connect']['left'], bounds
        assert header['top'] <= text['top'] < text['bottom'] <= header['bottom'], bounds
    assert bounds['connection']['bottom'] <= bounds['playing']['top'] + 1, bounds

async def cases(origin,meta,out):
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(chromium_sandbox=True)
        try:
            for width,height in [*sound.SIZES, (1024, 640)]:
                context=await browser.new_context(viewport={'width':width,'height':height},accept_downloads=True)
                page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                await page.add_init_script('window.recordNativeFrameHistory=true;\n'+sound.INSTRUMENT)
                try:
                    await page.goto(origin+'/remote/',wait_until='networkidle')
                    indicator=page.locator('#native-playing');await expect(indicator).to_have_text('Emulator play: —')
                    await expect(indicator).to_be_visible();await expect(indicator).to_have_attribute('aria-label','Emulator sequencer unavailable')
                    await check_status_area(page)
                    note=page.locator('#roll-grid [data-note]').first;note_id=await note.get_attribute('data-note');before=await note.get_attribute('aria-label');await note.press('ArrowUp');edited=await note.get_attribute('aria-label');assert edited!=before
                    draft=await sound.draft_bytes(page);layout=await geometry(page)
                    await sound.menu_action(page,'#emulator-start');await expect(indicator).to_have_text('Emulator play: off',timeout=20000)
                    await expect(indicator).to_have_attribute('aria-label','Emulator sequencer stopped');assert await geometry(page)==layout
                    await page.locator('#play').click();await expect(indicator).to_have_text('Emulator play: off')
                    await pulse_play(page);await expect(indicator).to_have_text('Emulator play: on');await expect(indicator).to_have_attribute('aria-label','Emulator sequencer playing');assert await geometry(page)==layout
                    await check_status_area(page)
                    await page.locator('#stop').click();await expect(indicator).to_have_text('Emulator play: on')
                    await page.locator('[data-view="sound"]').click();await expect(indicator).to_have_text('Emulator play: on')
                    await page.locator('[data-view="roll"]').click()
                    await pulse_play(page);await expect(indicator).to_have_text('Emulator play: off');assert await geometry(page)==layout
                    await page.evaluate('nativeContext.suspend()');await expect(indicator).to_have_text('Emulator play: —',timeout=3000)
                    await page.evaluate('nativeContext.resume()');await expect(indicator).to_have_text('Emulator play: off')
                    await sound.menu_action(page,'#emulator-stop');await expect(indicator).to_have_text('Emulator play: —')
                    count=await page.evaluate('nativeFrames.length');await page.wait_for_timeout(300);assert await page.evaluate('nativeFrames.length')==count
                    await sound.menu_action(page,'#emulator-start');await expect(indicator).to_have_text('Emulator play: off',timeout=20000)
                    await sound.menu_action(page,'#emulator-stop');await expect(indicator).to_have_text('Emulator play: —')
                    entered,release,finished=asyncio.Event(),asyncio.Event(),asyncio.Event()
                    async def delayed(route):
                        response=await route.fetch();entered.set()
                        try:await release.wait();await route.fulfill(response=response)
                        except Exception:pass  # canceled owning loader request is expected
                        finally:finished.set()
                    await page.route('**/emu/kernel.wasm',delayed)
                    await sound.menu_action(page,'#emulator-start');await asyncio.wait_for(entered.wait(),10)
                    await sound.menu_action(page,'#emulator-stop');release.set();await asyncio.wait_for(finished.wait(),10);await page.unroute('**/emu/kernel.wasm',delayed)
                    await page.wait_for_timeout(300);await expect(indicator).to_have_text('Emulator play: —')
                    assert await sound.draft_bytes(page)==draft
                    await page.locator('#undo').click();await expect(page.locator('[data-note="'+note_id+'"]')).to_have_attribute('aria-label',before)
                    await page.locator('#redo').click();await expect(page.locator('[data-note="'+note_id+'"]')).to_have_attribute('aria-label',edited)
                    assert await page.evaluate('midiCalls')==0;assert not errors,errors
                    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                    await expect(indicator).to_be_visible();assert await geometry(page)==layout
                    frames=await page.evaluate('nativeFrames')
                    assert all(f['playing'] in [0,1] and f['framebufferLength']==57600 for f in frames)
                    (out/f'{width}x{height}.json').write_text(json.dumps({'viewport':[width,height],'runtime':meta,'frames':frames,'draftSha256':hashlib.sha256(draft).hexdigest(),'geometry':layout,'midiCalls':0,'pageErrors':errors},indent=2)+'\n')
                    await page.screenshot(path=str(out/f'{width}x{height}.png'))
                    print(f'PASS actual product playing0-1-0/expiry/restart/cancel/Draft/history/geometry/MIDI0 {width}x{height}',flush=True)
                except BaseException as error:
                    diagnostics={'exception':str(error),'pageErrors':errors}
                    try:
                        diagnostics.update(indicator=await page.locator('#native-playing').text_content(),
                                           frames=await page.evaluate('nativeFrames'))
                        await page.screenshot(path=str(out/f'{width}x{height}-failure.png'))
                    except Exception as capture_error:
                        diagnostics['captureError']=str(capture_error)
                    (out/f'{width}x{height}-failure.json').write_text(json.dumps(diagnostics,indent=2)+'\n')
                    raise
                finally:await context.close()
        finally:await browser.close()

if __name__=='__main__':
    runtime=Path(os.environ['DNBOX_EMULATOR_RUNTIME']).resolve();meta=json.loads((runtime/'runtime.json').read_text());binary=(runtime/'kernel.wasm').read_bytes()
    assert len(binary)==meta['wasm_bytes'] and hashlib.sha256(binary).hexdigest()==meta['wasm_sha256'];assert meta['device_control'] is False
    out=ROOT/'.output/playing-browser';out.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='playing-product-',dir=ROOT/'.output') as site:
        subprocess.run(['node','scripts/build-product-site.mjs','--output',site],cwd=ROOT,check=True)
        assert (Path(site)/'emu/kernel.wasm').read_bytes()==binary
        with sound.core.server(site) as origin:asyncio.run(cases(origin,meta,out))
