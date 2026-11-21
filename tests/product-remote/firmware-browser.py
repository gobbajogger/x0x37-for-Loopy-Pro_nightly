# SPDX-License-Identifier: GPL-3.0-only
"""Drive the Remote page against the copied DNR2 C core. Not a device test."""
import asyncio, hashlib, json, os, subprocess, tempfile, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'web/product-site'
REF = ROOT / 'tests/product-remote/tests'
CORE = '4f7fae3087e3477d8bf8a65f77c3189dddddd3e1d34b8c264b3b1017578f97d4'
WIRE = '81b4a8729cab7af75bb8495f528d9979d0fc02abbedfba05aaac3f0dae659390'
for name, sha in (('remote_core.c', CORE), ('remote_wire.c', WIRE)):
    digest = hashlib.sha256((REF / 'c-reference' / name).read_bytes()).hexdigest()
    if digest != sha:
        raise SystemExit(f'{name} hash mismatch')
TMP = Path(tempfile.mkdtemp(prefix='dnr2-browser-'))
BINARY = TMP / 'fixture'
subprocess.check_call(['cc', '-std=c11', '-Wall', '-Wextra', '-Werror', '-O2', 'c_fixture.c', 'c-reference/remote_core.c', 'c-reference/remote_wire.c', '-o', str(BINARY)], cwd=REF)
PROC = subprocess.Popen([str(BINARY)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
LOCK = threading.Lock()
OPS = []

def fixture(line):
    with LOCK:
        PROC.stdin.write(line + '\n')
        PROC.stdin.flush()
        return json.loads(PROC.stdout.readline())

BUNDLE = json.dumps({
    'catalog': {'crc': 0x12345678, 'count': 3, 'admitted': True, 'controls': [
        {'id': 1, 'kind': 1, 'min': 0, 'max': 1000, 'label': 'Scalar'},
        {'id': 2, 'kind': 2, 'min': -1000, 'max': 1000, 'label': 'Level'},
        {'id': 37, 'kind': 3, 'min': 1, 'max': 127, 'readMin': 0, 'readMax': 2, 'label': 'Hold'}]},
    'admission': {'catalogCrc': 0x12345678, 'sourceSha': CORE, 'reviewSha': WIRE, 'testOnly': True}})
MIDI = r'''
window.__DNBOX_FIRMWARE_BUNDLE = __FIXTURE_BUNDLE_JSON__;
navigator.requestMIDIAccess = async () => {
  const input = {state:'connected', type:'input', fn:null, addEventListener(t,f){if(t==='midimessage')this.fn=f;}, removeEventListener(){this.fn=null;}, open:async()=>{}, close:async()=>{}, deliver(data){this.fn&&this.fn({data});}};
  const output = {state:'connected', type:'output', open:async()=>{}, close:async()=>{}, send(bytes){
    const hex=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
    const reply = window.dnboxMidi(hex);
    reply.then(value=>{if(value&&value.hex){const raw=value.hex.match(/../g).map(h=>parseInt(h,16));input.deliver(new Uint8Array(raw));}}).catch(()=>{});
  }};
  return {inputs:new Map([['in',input]]), outputs:new Map([['out',output]])};
};
'''

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SOURCE), **kwargs)
    def log_message(self, *args):
        pass

checks = []
def check(value, label):
    checks.append((label, bool(value)))
    print(('PASS ' if value else 'FAIL ') + label, flush=True)

async def connect_test_midi(page, bundle, midi):
    await page.expose_binding('dnboxMidi', midi)
    await page.add_init_script(MIDI.replace('__FIXTURE_BUNDLE_JSON__', bundle))

async def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    async def midi(_source, hexline):
        raw = bytes.fromhex(hexline)
        OPS.append(raw[5])
        return fixture(hexline)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(chromium_sandbox=True)
        plain = await browser.new_page(viewport={'width': 1280, 'height': 900})
        plain_errors = []
        plain.on('pageerror', lambda error: plain_errors.append(str(error)))
        await plain.add_init_script('navigator.requestMIDIAccess=()=>{window.__midiCalls=(window.__midiCalls||0)+1; throw Error("unused");};')
        await plain.goto(base + '/remote/', wait_until='networkidle')
        await plain.wait_for_function('document.getElementById("status").textContent !== "Loading…"')
        await plain.locator('#connect').click()
        check('Apply stays off' in await plain.locator('#conn-state').inner_text(), 'no catalog sends no handshake')
        check(await plain.evaluate('window.__midiCalls||0') == 0, 'MIDI permission stays unrequested without a catalog')
        no_ports = await browser.new_page(viewport={'width': 844, 'height': 390})
        await no_ports.add_init_script('window.__DNBOX_FIRMWARE_BUNDLE='+BUNDLE+';navigator.requestMIDIAccess=async()=>({inputs:new Map(),outputs:new Map()});')
        await no_ports.goto(base + '/remote/', wait_until='networkidle')
        await no_ports.locator('#connect').click()
        await no_ports.locator('#connection-message').get_by_text('No MIDI input and output pair', exact=False).wait_for()
        check(await no_ports.locator('#apply').is_disabled(), 'missing ports show an actionable message and keep Apply disabled')
        await no_ports.locator('#close-connection').click()
        check(await no_ports.locator('#connection-result').is_hidden(), 'Return to draft dismisses connection details')
        page = await browser.new_page(viewport={'width': 1280, 'height': 900})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        await connect_test_midi(page, BUNDLE, midi)
        await page.goto(base + '/remote/', wait_until='networkidle')
        await page.wait_for_function('document.getElementById("status").textContent !== "Loading…"')
        check(OPS == [], 'loading the Remote sends no SysEx')
        await page.locator('#connect').click()
        await page.wait_for_function('document.getElementById("conn-state").textContent.startsWith("Connected")')
        check(await page.locator('#fw-1').input_value() == '500', 'READ returns the C scalar')
        check(await page.locator('#fw-2').input_value() == '128.5', 'READ returns the C float')
        check(3 not in OPS, 'connect does not SET')
        before_local_edits = list(OPS)
        await page.locator('[data-engine="breaks"]').click()
        await page.locator('[data-break-loop="0"]').select_option('personal-br1-zone1')
        await page.locator('[data-break-step="4"]').select_option('12')
        await page.locator('[data-view="mix"]').click()
        await page.locator('[data-mix-mode="fx"]').click()
        check(await page.locator('[data-mix-mode="fx"]').get_attribute('aria-pressed') == 'true', 'FX workspace selected before local Wear edit')
        await page.locator('button[data-mix-param-label="Tape Wear"]').press('ArrowRight')
        check(before_local_edits == OPS, 'BREAK assignments, slices and Wear edits send zero protocol frames')
        check('Simulator connected' in await page.locator('#status').text_content(), 'draft status retains confirmed simulator identity')
        await page.locator('#undo').click()
        check('Simulator connected' in await page.locator('#status').text_content(), 'Undo preserves simulator status')
        for button in ['play','stop','rec']:
            await page.locator('#'+button).click()
            check('Local transport · Simulator connected' == await page.locator('#status').text_content(), button+' reports the local transport and actual connection')
        check(before_local_edits == OPS, 'draft history and transport buttons send zero protocol frames')
        check(await page.locator('#apply').is_disabled(), 'offline edits do not arm native Apply')
        await page.locator('#apply').is_disabled()
        check(await page.locator('#apply').is_disabled(), 'Apply stays disabled before an edit')
        await page.locator('#fw-1').evaluate('el=>{el.value="800";el.dispatchEvent(new Event("input"));}')
        check(not await page.locator('#apply').is_disabled(), 'an edit arms Apply and still sends nothing')
        check(3 not in OPS, 'editing does not SET')
        before_apply = len(OPS)
        await page.locator('details.overflow').evaluate('d=>{d.open=true}');await page.locator('#apply').click()
        await page.wait_for_function('document.getElementById("conn-state").textContent === "Firmware confirmed 800."')
        check(OPS.count(3) == 1, 'Apply writes the edited control once')
        # A long snapshot can renew the same lease between any two reads.
        check([op for op in OPS[before_apply:] if op != 6] == [3, 2, 2, 2], 'Apply reads the committed catalog back')
        before_undo = len(OPS)
        await page.get_by_role('button', name='Undo instrument edit').click()
        await page.wait_for_function('document.getElementById("conn-state").textContent === "Firmware restored 500."')
        check([op for op in OPS[before_undo:] if op != 6] == [2, 3, 2, 2, 2], 'Undo checks the revision, writes once and rereads the catalog')
        check(await page.locator('#fw-1').input_value() == '500', 'Undo shows the fresh stored value')
        check(await page.locator('#firmware-undo').count() == 0, 'confirmed instrument Undo is consumed')
        fixture('change')
        await page.locator('#fw-1').evaluate('el=>{el.value="700";el.dispatchEvent(new Event("input"));}')
        await page.locator('details.overflow').evaluate('d=>{d.open=true}');await page.locator('#apply').click()
        await page.wait_for_function('document.getElementById("conn-state").textContent.includes("instrument changed")')
        check(True, 'a C revision conflict is shown and not treated as applied')
        await page.locator('#connect').click()
        await page.wait_for_function('document.getElementById("conn-state").textContent === "Disconnected"')
        check(fixture('tick 0')['active'] == 0, 'Disconnect closes the C lease')
        check(errors == [] and plain_errors == [], 'the page raised no script errors')
        if checkout := os.environ.get('DNBOX_REMOTE_HOST_CHECKOUT'):
            from firmware_queued_host import verify_queued_cutoff
            await verify_queued_cutoff(browser, base, Path(checkout), connect_test_midi)
        await browser.close()
    server.shutdown()
    PROC.kill()
    if not all(ok for _, ok in checks):
        raise SystemExit(1)

if __name__ == '__main__':
    asyncio.run(main())
