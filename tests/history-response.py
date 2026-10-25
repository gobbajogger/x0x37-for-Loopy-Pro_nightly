# SPDX-License-Identifier: GPL-3.0-only
"""Real served history page, actual JSON-based fixtures; no firmware/device.
The five named mutations reproduce independent QA evidence 809965b4ddc4e2363e7344227adcf1b93f68005b.
Run --source /path/to/before-history.html to replay RED against the old page.
"""
import os
import argparse, asyncio, copy, json, threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser()
ap.add_argument('--source')
args = ap.parse_args()
HTML = Path(args.source).read_bytes() if args.source else (ROOT/'docs/builds/index.html').read_bytes()
DATA = json.loads((ROOT/'docs/build-status.json').read_text())
class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] == '/builds/':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(HTML)
        else:
            super().do_GET()
    def log_message(self, *args):
        pass
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT/'docs')))
threading.Thread(target=server.serve_forever, daemon=True).start()
results = []
async def case(browser, name, payload, width=375, negative=True, transport='json'):
    page = await browser.new_page(viewport={'width': width, 'height': 900})
    errors = []
    if transport == 'render-error':
        await page.add_init_script("const originalCreateElement=Document.prototype.createElement;let cards=0;Document.prototype.createElement=function(tag,...args){if(tag==='article'&&++cards===100)throw Error('synthetic card construction failure');return originalCreateElement.call(this,tag,...args);};")
    page.on('pageerror', lambda error: errors.append(str(error)))
    async def respond(route):
        if transport == 'network':
            await route.abort()
        else:
            await route.fulfill(status=404 if transport == '404' else 200,
                content_type='application/json', body='{' if transport == 'invalid-json' else json.dumps(payload))
    await page.route('**/build-status.json', respond)
    await page.goto(f'http://127.0.0.1:{server.server_port}/builds/', wait_until='domcontentloaded')
    await page.wait_for_function("!document.querySelector('#status').textContent.startsWith('Loading')")
    state = await page.evaluate('''()=>({error:document.querySelector('#status').classList.contains('error'),
        builds:document.querySelectorAll('#builds article').length,
        history:document.querySelectorAll('#history article').length,
        width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
        overflow:[...document.querySelectorAll('.item,.item h3,.item p,.item dd,.tag')].filter(e=>e.scrollWidth>e.clientWidth+1).length,
        executed:window.injected===true,injectedElements:document.querySelectorAll('#history img').length,
        forged:[...document.querySelectorAll('.tag')].some(e=>e.textContent==='DEVICE VERIFIED'),
        downloads:[...document.querySelectorAll('a[href]')].filter(e=>/\\.(fwsc|img)([?#]|$)/i.test(e.href)).length})''')
    if negative:
        ok = state['error'] and state['builds'] == 0 and state['history'] == 0 and not state['forged']
    else:
        ok = (not state['error'] and state['builds'] == len(payload['builds']) and
              state['history'] == len(payload['history']) and state['scrollWidth'] <= width and state['overflow'] == 0)
    ok = ok and not state['downloads'] and not errors and not state['executed'] and not state['injectedElements']
    results.append({'case': name, 'pass': ok, 'state': state, 'page_errors': errors})
    print(json.dumps(results[-1]), flush=True)
    await page.close()
async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None), args=['--no-sandbox'])
        print('Chromium '+browser.version, flush=True)
        base = copy.deepcopy(DATA)
        base['builds'] = base['builds'][:1]  # Same positive cardinality as independent evidence.
        for width in [320, 375]:
            await case(browser, f'positive-one-build-{width}', base, width, False)
        mutations = [
            ('null-history-last', lambda c: c['history'].__setitem__(-1, None)),
            ('null-history-first', lambda c: c['history'].__setitem__(0, None)),
            ('null-pro-model', lambda c: c['builds'][0]['models'].__setitem__('pro', None)),
            ('schema-999', lambda c: c.__setitem__('schema', 999)),
            ('forged-device-verified', lambda c: c['history'][0].__setitem__('status', 'DEVICE VERIFIED')),
            ('null-build', lambda c: c['builds'].__setitem__(0, None)),
            ('object-history', lambda c: c.__setitem__('history', {})),
            ('array-models', lambda c: c['builds'][0].__setitem__('models', [])),
            ('string-model-size', lambda c: c['builds'][0]['models']['pro'].__setitem__('size', '651392')),
            ('object-product', lambda c: c['builds'][0]['models']['pro'].__setitem__('product', {})),
            ('bad-model-hash', lambda c: c['builds'][0]['models']['pro'].__setitem__('sha256', 'bad')),
            ('model-physical-claim', lambda c: c['builds'][0]['models']['pro'].__setitem__('device_verified', True)),
            ('build-physical-claim', lambda c: c['builds'][0].__setitem__('hardware_tested', True)),
            ('build-installable-claim', lambda c: c['builds'][0].__setitem__('installable_from_nightly_status', True)),
            ('unsupported-build-status', lambda c: c['builds'][0].__setitem__('status', 'DEVICE VERIFIED')),
            ('object-history-description', lambda c: c['history'][0].__setitem__('description', {'status':'DEVICE VERIFIED'})),
            ('history-installable-claim', lambda c: c['history'][0].__setitem__('installable', True)),
            ('history-physical-claim', lambda c: c['history'][0].__setitem__('device_verified', True)),
            ('bad-history-source', lambda c: c['history'][0].__setitem__('source_commit', {})),
            ('duplicate-history-id', lambda c: c['history'][1].__setitem__('id', c['history'][0]['id'])),
        ]
        for label, mutate in mutations:
            payload = copy.deepcopy(base)
            mutate(payload)
            await case(browser, label, payload)
        actual = copy.deepcopy(DATA)
        actual['schema'] = 999
        await case(browser, 'actual-two-builds-schema-999', actual)
        for transport in ['network', '404', 'invalid-json']:
            await case(browser, transport, DATA, transport=transport)
        await case(browser, 'detached-render-error', DATA, transport='render-error')
        for width in [320, 375, 768, 1280]:
            await case(browser, f'actual-full-history-{width}', DATA, width, False)
        empty = copy.deepcopy(DATA)
        empty['builds'] = []
        empty['history'] = []
        await case(browser, 'valid-empty-history', empty, negative=False)
        appended = copy.deepcopy(DATA)
        row = copy.deepcopy(DATA['history'][0])
        row.update(id='synthetic-valid-append', title='Synthetic future source-only checkpoint', status='source-only')
        appended['history'].append(row)
        await case(browser, 'valid-future-append', appended, negative=False)
        inert = copy.deepcopy(DATA)
        inert['history'][0]['title'] = '<img src=x onerror="window.injected=true">'
        await case(browser, 'inert-title-text', inert, negative=False)
        await browser.close()
    server.shutdown()
    failed = sum(not r['pass'] for r in results)
    print(json.dumps({'checks': len(results), 'passed': len(results)-failed, 'failed': failed}), flush=True)
    raise SystemExit(1 if failed else 0)
asyncio.run(main())
