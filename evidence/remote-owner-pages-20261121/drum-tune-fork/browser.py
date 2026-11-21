"""Drive built Remote drum Tune fields in Chromium. Requires only the product build and the public tuning-fork C oracle."""
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
native = [[float(v) for v in row.split()[1:]] for row in Path(sys.argv[2]).read_text().splitlines()]
screens = json.loads((site/'remote/components.json').read_text())['screens']
result = {'base':'16afbf2d100bd255190f9fa6f5d9dd2749b7e618', 'reducedMotion':True,
          'productModuleSHA256':hashlib.sha256((site/'remote/drum-strip.mjs').read_bytes()).hexdigest(), 'rows':[]}
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass
def save():
    Path(sys.argv[3]).write_text(json.dumps(result,indent=2)+'\n')
async def check(path,raw):
    await expect(path).to_be_visible()
    d=await path.get_attribute('d')
    numbers=[float(value) for value in re.findall(r'[-\d.]+',d)]
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
            voices=list(range(1 if kit=='909' else 0,11)) if all_voices else [1 if kit=='909' else 0]
            for voice in voices:
                screen=next(s for s in screens if s['path'].endswith(f'/{kit}-voice-{voice:02d}.svg'))
                idx,ctrl=next((i,c) for i,c in enumerate(screen['controls']) if c['context']['name']=='Tune')
                ident=ctrl['identity']; initial=int(ctrl['context']['raw'])
                await page.locator('#sound-voice').select_option(str(voice))
                if mode=='compact':
                    field=page.locator('[data-drum-sound-strip] [data-source-control="'+ident+'"]')
                    path=field.locator('[data-glyph-semantic] path')
                else:
                    field=page.locator('[data-drum-editor] .source-hit').nth(idx)
                    path=page.locator('[data-drum-editor] svg [data-source-control="'+ident+'"] [data-glyph-semantic] path')
                await expect(field).to_be_visible()
                worst=await check(path,initial)
                first,second=(0,127) if initial!=0 else (127,0)
                for raw in (first,second):
                    await field.press('Enter')
                    value=page.locator('#parameter-value')
                    await expect(value).to_be_enabled()
                    await value.fill(str(raw));await value.press('Enter');await value.blur()
                    worst=max(worst,await check(path,raw))
                for raw in (first,initial):
                    await page.locator('#undo').press('Enter')
                    worst=max(worst,await check(path,raw))
                if mode=='compact':
                    await page.get_by_role('button',name='Open original',exact=True).press('Enter')
                    archived=page.locator('.source-scene svg').first
                    same=await archived.evaluate("""(svg,source)=>svg.isEqualNode(new DOMParser().parseFromString(source,'image/svg+xml').documentElement)""",screen['body_svg'])
                    assert same,(kit,voice,'immutable Original changed')
                    await page.get_by_role('button',name='Return to Sound',exact=True).press('Enter')
                    await check(path,initial)
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
