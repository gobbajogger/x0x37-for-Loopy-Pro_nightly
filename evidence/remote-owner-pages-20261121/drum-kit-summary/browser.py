"""Drive built Remote drum kit summary fields in Chromium. Requires only the product build and the public kit-summary C oracle."""
import asyncio
import functools
import hashlib
import json
import re
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.async_api import async_playwright, expect

site = Path(sys.argv[1]).resolve()
native = [[float(v) for v in row.split()[2:]] for row in Path(sys.argv[2]).read_text().splitlines()[:256]]
screens = json.loads((site/'remote/components.json').read_text())['screens']
result = {'base':'16afbf2d100bd255190f9fa6f5d9dd2749b7e618', 'reducedMotion':True,
          'productModuleSHA256':hashlib.sha256((site/'remote/drum-strip.mjs').read_bytes()).hexdigest(), 'rows':[]}
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass
def save():
    Path(sys.argv[3]).write_text(json.dumps(result,indent=2)+'\n')
async def check(path,raw,kit):
    await expect(path).to_be_visible()
    d=await path.get_attribute('d')
    numbers=[n for x,y,end in re.findall(r'M([\d.]+) ([\d.]+)V([\d.]+)',d) for n in (float(x),float(y),float(x),float(end))]
    raw=(128 if kit=='808' else 0)+raw
    assert len(numbers)==len(native[raw]),(d,raw)
    error=max(abs(a-b) for a,b in zip(numbers,native[raw]))
    assert error<0.000055,(raw,error,d)
    return error
async def visit(browser,origin,mode,all_voices):
    viewport={'width':844,'height':390} if mode=='compact' else {'width':1440,'height':900}
    page=await browser.new_page(viewport=viewport,reduced_motion='reduce')
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    try:
        response=await page.goto(origin+'/remote/',wait_until='networkidle')
        assert response.ok and await page.title()=='DnBOX Remote'
        await expect(page.locator('header.top')).to_have_attribute('aria-busy','false',timeout=45000)
        for kit in ('909','808'):
            await page.locator('[data-engine="drum'+kit+'"]').click()
            await page.locator('[data-view="sound"]').click()
            voices=range(11)
            for voice in voices:
                screen=next(s for s in screens if s['path'].endswith(f'/{kit}-voice-{voice:02d}.svg'))
                idx,ctrl=next((i,c) for i,c in enumerate(screen['controls']) if c['identity'] in ('1:0:11:1','1:1:11:1'))
                ident=ctrl['identity']; initial=int(ctrl['context']['raw'])
                await page.locator('#sound-voice').select_option(str(voice))
                if mode=='compact':
                    field=page.locator('[data-drum-sound-strip] [data-source-control="'+ident+'"]')
                    path=field.locator('[data-glyph-semantic] path')
                else:
                    field=page.locator('[data-drum-editor] .source-hit').nth(idx)
                    path=page.locator('[data-drum-editor] svg [data-source-control="'+ident+'"] [data-glyph-semantic] path')
                await expect(field).to_be_visible()
                role=(await field.locator('..').get_attribute('data-drum-role') if mode=='compact' else
                      await path.locator('xpath=ancestor::*[@data-source-control][1]').get_attribute('data-visual-role'))
                assert role==('summary' if mode=='compact' else 'inactive bank parameter summary'),(kit,voice,role)
                worst=await check(path,initial,kit)
                first,second=(0,127) if initial!=0 else (127,0)
                for raw in (first,second):
                    await field.press('Enter')
                    value=page.locator('#parameter-value')
                    await expect(value).to_be_enabled()
                    await value.fill(str(raw));await value.press('Enter');await value.blur()
                    worst=max(worst,await check(path,raw,kit))
                for raw in (first,initial):
                    await page.locator('#undo').press('Enter')
                    worst=max(worst,await check(path,raw,kit))
                if mode=='compact':
                    await page.get_by_role('button',name='Open original',exact=True).press('Enter')
                    archived=page.locator('.source-scene svg').first
                    same=await archived.evaluate("""(svg,source)=>svg.isEqualNode(new DOMParser().parseFromString(source,'image/svg+xml').documentElement)""",screen['body_svg'])
                    assert same,(kit,voice,'immutable Original changed')
                    cell=archived.locator('[data-source-control="'+ident+'"]')
                    assert await cell.get_attribute('data-visual-role')=='inactive bank parameter summary'
                    assert await cell.locator('[data-glyph-semantic] path').get_attribute('d')=='M2 12V9M10 12V6M18 12V3M26 12V0'
                    await page.get_by_role('button',name='Return to Sound',exact=True).press('Enter')
                    await check(path,initial,kit)
                else:
                    same=None
                result['rows'].append({'view':mode,'kit':kit,'voice':voice,'id':ident,'raw':[initial,first,second,first,initial],
                                       'maxCoordinateError':worst,'originalFrameEqual':same})
                save()
                print(mode,kit,voice,'edited 2 endpoints, restored',initial,flush=True)
        assert not errors,errors
    finally:
        await page.close()
async def main():
    with ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(site))) as server:
        threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            async with async_playwright() as pw:
                browser=await pw.chromium.launch(chromium_sandbox=True)
                try:
                    result['chromium']=browser.version
                    origin=f'http://127.0.0.1:{server.server_port}'
                    modes = sys.argv[4:] or ['compact','desktop']
                    for mode in modes:
                        assert mode in ('compact','desktop')
                        await visit(browser,origin,mode,True)
                    result['passed']=True;save()
                finally:await browser.close()
        finally:server.shutdown()
asyncio.run(main())
