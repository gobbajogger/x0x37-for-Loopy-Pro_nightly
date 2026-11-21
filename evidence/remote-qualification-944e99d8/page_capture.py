"""Capture owner pages at their native viewport. Keep each completed state and its control inventory."""
import argparse
import asyncio
import hashlib
import json
import runpy
import subprocess
from pathlib import Path
from playwright.async_api import async_playwright

args = argparse.ArgumentParser()
args.add_argument("checkout", type=Path)
args.add_argument("output", type=Path)
args.add_argument("--size", choices=["844x390", "390x844"])
args = args.parse_args()
checkout = args.checkout.resolve()
output = args.output.resolve()
site = checkout / ".output/product-site"
server = runpy.run_path(str(checkout / "tests/product-remote/envelope-browser.py"))["server"]
inventory = runpy.run_path(str(checkout / "evidence/remote-owner-pages-20261121/1f6d7602-review/capture.py"))["INVENTORY"]

async def main():
 with server(site) as origin:
  async with async_playwright() as pw:
   browser = await pw.chromium.launch(chromium_sandbox=True)
   for w,h in [(844,390),(390,844)]:
    size = f"{w}x{h}"
    if args.size and args.size != size: continue
    dest = output / size
    dest.mkdir(parents=True,exist_ok=True)
    page = await browser.new_page(viewport={"width":w,"height":h},has_touch=True)
    page.set_default_timeout(20000)
    receipts = {"states":{},"pageErrors":[],"failures":[],"chromium":browser.version,
                "commit":subprocess.check_output(["git","-C",str(checkout),"rev-parse","HEAD"],text=True).strip()}
    page.on("pageerror",lambda exc:receipts["pageErrors"].append(str(exc)))
    def save():
     (dest/"inventory.json").write_text(json.dumps(receipts,separators=(",",":")))
    async def snap(name,pages):
     await page.evaluate("document.fonts.ready")
     await page.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
     result=await page.evaluate(inventory)
     result["sha256"]=hashlib.sha256(await page.screenshot(path=dest/(name+".png"),animations="disabled",timeout=30000)).hexdigest()
     result["pages"]=pages
     receipts["states"][name]=result
     save()
     print(size,name,len(result["entries"]),flush=True)
    async def view(name):
     if name in ("drums","locks"):
      await page.locator(".overflow").evaluate("e=>e.open=true")
     await page.locator(f'[data-view="{name}"]').evaluate("e=>e.click()")
     await page.locator(".overflow").evaluate("e=>e.open=false")
     await page.wait_for_function("v=>document.querySelector('#workspace-main').dataset.layoutView===v",arg=name)
    async def part(name):
     await page.locator(f'[data-engine="{name}"]').evaluate("e=>e.click()")
    try:
     await page.goto(origin+"/remote/")
     await page.wait_for_function("typeof document.querySelector('[data-engine]').onclick==='function' && document.querySelector('#status').textContent.includes('Draft')")
     await part("chicago");await view("roll");await snap("notes",[14] if w==844 else [21])
     if w==390:
      for _ in range(10):
       if await page.locator("#lane-kind").input_value()=="gate":break
       await page.locator("#lane-param").evaluate("e=>e.click()")
      assert await page.locator("#lane-kind").input_value()=="gate"
      await snap("lane-gate",[22])
     if w==844:
      for kit in ("drum909","drum808"):
       await part(kit);await view("drums")
       await snap(kit+"-steps",[15])
       nav=page.get_by_role("navigation",name=kit[4:]+" step navigation")
       for label,key in [("Voices 7–11","lower"),("Accent lane","accent")]:
        await nav.get_by_role("button",name=label).click()
        await snap(kit+"-"+key,[15])
      await part("drum909");await view("sound");await page.locator("#sound-voice").select_option("0")
      await snap("drum909-sound-0",[18])
      await page.locator("[data-drum-original]").click();await snap("drum909-original",[18])
      await page.locator("[data-drum-return]").click()
      await part("chicago");await view("locks");await snap("motion",[17])
      await view("patterns");await snap("patterns",[19])
      await page.locator('[data-launch-part="2"][data-pattern="0"]').click();await snap("patterns-selected",[19])
      await page.locator('[data-pattern-scope="all"]').click();await snap("patterns-all",[19])
      await view("files");await snap("projects",[20])
     await view("mix")
     await page.locator('[data-mix-mode="levels"]').click();await snap("levels",[16] if w==844 else [23])
    except Exception as exc:
     receipts["failures"].append(str(exc));save();raise
    finally:
     await page.close()
   await browser.close()

asyncio.run(main())
