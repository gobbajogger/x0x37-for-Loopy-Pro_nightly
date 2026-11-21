# SPDX-License-Identifier: GPL-3.0-only
"""Check the master display against PCM from the qualified stereo worklet."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile

from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("native", Path(__file__).with_name("envelope-browser.py"))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)

INSTRUMENT = """
window.midiCalls=0;
navigator.requestMIDIAccess=()=>{midiCalls++;throw Error('Unexpected instrument access')};
window.pcm=new Map();
const read=AnalyserNode.prototype.getFloatTimeDomainData;
AnalyserNode.prototype.getFloatTimeDomainData=function(buffer){
  read.call(this,buffer);
  pcm.set(this, {peak:Math.max(...buffer.map(Math.abs)),wave:Array.from(buffer.slice(-128))});
};
const Source=AudioWorkletNode;
window.AudioWorkletNode=class extends Source {
  constructor(...args){super(...args);window.nativeNode=this;
    this.port.addEventListener('message',({data})=>{
      if(data.type==='frame')window.frame={playing:data.playing,time:data.time};
      if(data.type==='controls-result')window.pin=data.kernel;
    }); this.port.start();}
};
"""

OBSERVED = """
() => {
  const figure=document.querySelector('.master-output');
  if(!figure || pcm.size!==2) return false;
  const channels=Array.from(pcm.values()),peak=Math.max(...channels.map(c=>c.peak));
  const shown=figure.querySelector('output').textContent;
  if(!(peak>0) || shown!==(20*Math.log10(peak)).toFixed(1)+' dBFS') return false;
  const waves=[...figure.querySelectorAll('[data-wave]')].map(p=>p.getAttribute('d'));
  const gain=Math.max(1,Math.min(16,2**Math.floor(-Math.log2(peak))));
  if(figure.querySelector('[data-wave-scale]').textContent!=='×'+gain) return false;
  const expected=channels.map((c,channel)=>c.wave.map((n,i)=>(i?'L':'M')+i+' '+
    (8+channel*16-7*Math.max(-1,Math.min(1,n*gain))).toFixed(2)).join(' '));
  if(!waves.every((wave,i)=>wave===expected[i])) return false;
  const history=figure.querySelector('path').getAttribute('d')||'';
  if((history.match(/L/g)||[]).length<1) return false;
  return {peak,shown,gain,historyWindows:(history.match(/L/g)||[]).length+1,firmwareTime:frame.time};
}
"""


async def pulse(page, kind, bits):
    start = await page.evaluate("frame.time")
    await page.evaluate("([type,bits])=>nativeNode.port.postMessage({type,bits})", [kind, bits])
    await page.wait_for_function("t=>frame.time>=t+110", arg=start)
    await page.evaluate("type=>nativeNode.port.postMessage({type,bits:0})", kind)
    await page.wait_for_function("t=>frame.time>=t+220", arg=start)


async def check(browser, origin, size, kernel):
    page = await browser.new_page(viewport=dict(zip(("width", "height"), size)))
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    try:
        await page.add_init_script(INSTRUMENT)
        await page.goto(origin + "/remote/")
        await page.locator('[data-view="mix"]').click()
        figure = page.locator(".master-output")
        await expect(figure).to_have_count(0)
        await page.locator(".overflow summary").click()
        await page.locator("#emulator-start").click()
        await expect(page.locator("#status")).to_contain_text("Emulator running", timeout=20000)
        await page.locator(".overflow summary").click()
        await expect(figure).to_have_count(0)
        await page.locator('[data-mix-source="emulator"]').click()
        await expect(figure).to_be_visible()
        await page.wait_for_function("k=>window.pin===k && window.frame", arg=kernel)
        for key in (2, 1, 15):
            await pulse(page, "keys", 1 << key)
        await pulse(page, "buttons", 1 << 10)
        await page.wait_for_function("frame.playing===1")
        proof = await (await page.wait_for_function(OBSERVED)).json_value()
        assert await page.evaluate("document.documentElement.scrollWidth===innerWidth")
        out = ROOT / "test-results/native-master"
        out.mkdir(parents=True, exist_ok=True)
        await figure.screenshot(path=str(out / f"master-{size[0]}x{size[1]}.png"))
        await page.evaluate("nativeNode.context.suspend()")
        await expect(figure.locator("output")).to_have_text("—")
        await expect(figure.locator("path[d]")).to_have_count(0)
        await page.evaluate("nativeNode.context.resume()")
        await page.wait_for_function(OBSERVED)
        master = page.get_by_role("button", name="Master / More", exact=True)
        await master.click()
        await expect(master).to_be_focused()
        panel = page.get_by_role("region", name="Master controls")
        await expect(panel.locator("[data-runtime-key]:enabled")).to_have_count(4)
        assert set(await panel.locator("[data-runtime-key]").evaluate_all("els=>els.map(e=>e.dataset.runtimeKey)")) == {"4:0:2", "6:0:6", "6:0:12", "6:0:13"}
        await expect(panel.locator("[data-master-control], .mixer-fader")).to_have_count(0)
        await expect(panel.locator(".master-output")).to_be_visible()
        await page.wait_for_function(OBSERVED)
        await page.screenshot(path=str(out / f"destination-{size[0]}x{size[1]}.png"))
        assert await page.evaluate("document.documentElement.scrollWidth===innerWidth")
        await page.locator('[data-mix-mode="pan"]').click()
        await expect(figure).to_have_count(0)
        await page.locator('[data-mix-mode="levels"]').click()
        await expect(figure).to_be_visible()
        await page.locator('[data-mix-source="draft"]').click()
        await expect(figure).to_have_count(0)
        await page.locator(".overflow summary").click()
        await page.locator("#emulator-stop").click()
        await page.wait_for_function("nativeNode.context.state==='closed'")
        assert await page.evaluate("midiCalls") == 0 and not errors, errors
        print(f"PASS master PCM {size[0]}x{size[1]} {json.dumps(proof)}", flush=True)
    finally:
        await page.context.close()


async def run(origin, kernel):
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(chromium_sandbox=True)
        try:
            for size in ((1440, 900), (390, 844), (844, 390), (1024, 640)):
                await check(browser, origin, size, kernel)
        finally:
            await browser.close()


if __name__ == "__main__":
    runtime = Path(os.environ["DNBOX_EMULATOR_RUNTIME"])
    kernel = json.loads((runtime / "runtime.json").read_bytes())["wasm_sha256"]
    (ROOT / ".output").mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=ROOT / ".output") as temp:
        subprocess.run(["node", "scripts/build-product-site.mjs", "--output", temp], cwd=ROOT, check=True)
        with native.server(temp) as origin:
            asyncio.run(run(origin, kernel))
