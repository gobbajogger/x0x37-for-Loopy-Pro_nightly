# SPDX-License-Identifier: GPL-3.0-only
"""Exercise the shipped identity page via Web MIDI callbacks backed by stock editor.c.

Called by touchosc-host.py --browser-identity with the compiled read-only editor probe.
"""
import json
import subprocess
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

from playwright.sync_api import sync_playwright


def check_identity(site, probe):
    def exchange(request):
        return json.loads(subprocess.check_output([probe, bytes(request).hex()], text=True))

    with ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=site)) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            return check_page(server.server_port, exchange)
        finally:
            server.shutdown()
            thread.join()


def check_page(port, exchange):
    frames = []

    def send(request):
        reply = exchange(request)
        frames.append({"request_hex": bytes(request).hex(), **reply})
        return list(bytes.fromhex(reply["reply_hex"]))

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(chromium_sandbox=True)
        try:
            page = browser.new_page()
            page.expose_function("stockHostSend", send)
            page.add_init_script("""(() => {
              const base = {state:'connected', open:async()=>{}, close:async()=>{}};
              const input = {...base, id:'input', name:'Host input', type:'input'};
              const output = {...base, id:'output', name:'Host output', type:'output',
                async send(data) {
                  const reply = await window.stockHostSend(Array.from(data));
                  if (reply.length) input.onmidimessage?.({data:new Uint8Array(reply)});
                }};
              Object.defineProperty(navigator,'requestMIDIAccess',{value:async options => {
                if (!options.sysex) throw Error('SysEx permission required');
                return {inputs:new Map([[input.id,input]]), outputs:new Map([[output.id,output]])};
              }});
            })()""")
            page.goto(f"http://127.0.0.1:{port}/remote/identity/index.html")
            page.locator("#permission").click()
            page.locator("#connect").click()
            page.wait_for_function("!['Not connected','Checking firmware…'].includes(document.querySelector('#status').textContent)")
            status = page.locator("#status").inner_text()
            if status != "Firmware replied: X0X DEV" or not page.locator("#next").is_visible():
                raise AssertionError(f"stock INFO returned {frames}, page said {status!r}")
            page.locator("#disconnect").click()
            # Send the production encoder's read-only HELLO across precisely the
            # same host wire adapter. Its reply is still unavailable on stock.
            hello = page.evaluate("""async () => {
              const {encodeCommand,OP} = await import('/remote/device/vendor/codec.mjs');
              return Array.from(encodeCommand({version:2,op:OP.HELLO,unit:0,unitHigh:[0,0,0],
                client:91,epoch:0,request:1,revision:0,control:0,token:0,value:0}));
            }""")
            send(hello)
            if len(frames) != 2 or frames[0]["editor_deferred"] or frames[0]["request_hex"] != "f07d464c01f7":
                raise AssertionError(f"unexpected stock identity exchange: {frames}")
            if not frames[1]["editor_deferred"] or frames[1]["reply_hex"]:
                raise AssertionError(f"stock DNR2 dispatch changed: {frames[1]}")
            return {"chromium": browser.version, "status": status, "exchanges": frames}
        finally:
            browser.close()
