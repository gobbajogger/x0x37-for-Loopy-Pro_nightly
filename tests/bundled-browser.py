# SPDX-License-Identifier: GPL-3.0-only
"""Whole generated installer; synthetic packages, mocked fetch/MIDI, no device writes.
Run with the repository's Python Playwright environment and installed Chromium.
"""
import asyncio, copy, hashlib, json, os, subprocess, tempfile
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
PROBE = r'''
lang='en';
window.qa={state:()=>({image:!!image,disabled:$("go").disabled,status:$("status").textContent,
 hidden:$("download").hidden,blehidden:$("ble").hidden,controllerstatus:$("controllerstatus").textContent,
 permissions:window.permissions||0,writes:window.writes||0,writing}),
 ack:()=>{$("devagree").checked=true;updateInstallGate();},
 select:model=>{chosenModel=model;refreshModelUi();return loadSelectedPackage();},
 catalog:()=>catalogLive,
 mocks:()=>{window.permissions=0;window.writes=0;window.lastWritten=null;window.confirm=()=>true;
  // Count user permission grants, not cached access calls from post-write scan.
  const access={};let granted=false;
  midiAccess=async()=>{if(!granted){window.permissions++;granted=true;}return access;};
  Updater=class{async find(){return null;}};
  installKeepingSlots=async(up,img,product)=>{window.writes++;window.lastWritten=Array.from(img);return{product};};
 },
 poison:()=>{ctl=new Uint8Array([0]);insertCtl=()=>{throw Error('bundled path must not compose a local file');};},
 legacyCtl:raw=>{ctl=raw?new Uint8Array(raw):null;},
 holdControllerHash:()=>{const previous=sha256Hex;let held=false;sha256Hex=async b=>{
  const value=await previous(b);if(b.byteLength===4096&&!held){held=true;await new Promise(resolve=>window.releaseHash=resolve);}return value;};},
};
'''
checks=[]
def check(condition,label):
    checks.append((label,bool(condition)))
    print(('PASS ' if condition else 'FAIL ')+label,flush=True)
def render(catalog):
    code="import{readFileSync}from'node:fs';import{renderInstaller}from'./scripts/render-qualified-nightly.mjs';process.stdout.write(renderInstaller(JSON.parse(readFileSync(0,'utf8'))));"
    html=subprocess.check_output(['node','--input-type=module','-e',code],input=json.dumps(catalog).encode(),cwd=ROOT).decode()
    return html.replace('(async () => {',PROBE+'\n(async () => {',1)
def catalog(models):
    return {'schema':1,'latest':'synthetic-bundled','history':[],'versions':[{'version':'synthetic-bundled','label':'DEV / HARDWARE TEST — DEVICE NOT TESTED','status':'dev-checked','config':'dev','hardware_tested':False,'source_commit':'1'*40,'source_tree':'2'*40,'models':models}]}
async def fresh(browser,cat,payloads,width=390):
    page=await browser.new_page(viewport={'width':width,'height':900})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    html=render(cat)
    async def route(r):
        if r.request.url=='https://installer.example.invalid/install/':
            await r.fulfill(status=200,content_type='text/html',body=html)
        elif r.request.url in payloads:
            await r.fulfill(status=200,content_type='application/octet-stream',body=payloads[r.request.url])
        else:
            await r.abort()
    await page.route('**/*',route)
    await page.goto('https://installer.example.invalid/install/',wait_until='domcontentloaded')
    await page.wait_for_function('window.qa')
    return page,errors
async def state(page):return await page.evaluate('qa.state()')
async def main():
    with tempfile.TemporaryDirectory(prefix='nightly-bundled-browser-') as td:
        subprocess.check_call(['node','tests/fixtures/bundled-synthetic.mjs','--dir',td],cwd=ROOT)
        folder=Path(td);manifest=json.loads((folder/'manifest.json').read_text())
        def rec(model,kind='bundled'):return copy.deepcopy(manifest[f'{model}-{kind}.fwsc'])
        def payload(p,model,kind='bundled'):return {p['pkg']:(folder/f'{model}-{kind}.fwsc').read_bytes()}
        async with async_playwright() as pw:
            browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'))
            print('Chromium '+browser.version,flush=True)
            for model in ['elite','pro']:
                p=rec(model);cat=catalog({model:p})
                page,errors=await fresh(browser,cat,payload(p,model),320 if model=='elite' else 1280)
                await page.wait_for_function('qa.state().image')
                s=await state(page)
                check(s['blehidden'] and 'Bluetooth is included' in s['controllerstatus'],model+' bundled package needs no separate file')
                check(not s['hidden'] and s['disabled'],model+' verified download available while DEV consent blocks install')
                await page.evaluate('qa.mocks();qa.poison();qa.ack()')
                await page.click('#go')
                await page.wait_for_function('qa.state().writes===1 && !qa.state().writing')
                s=await state(page)
                check(s['permissions']==1 and s['writes']==1,model+' bundled bytes install with no ctl.img and stale local input ignored')
                # Extract expected logical bytes independently from raw container markers.
                raw=(folder/f'{model}-bundled.fwsc').read_bytes()
                expected=b''.join(raw[i*48:i*48+47] for i in range(20))+raw[960:]
                written=bytes(await page.evaluate('lastWritten'))
                check(written==expected,model+' actual install boundary receives unchanged complete package image')
                check(not errors,model+' page has no script exceptions')
                await page.close()
                for kind in ['blank','app-crc','outer-crc','tail','abi','ctl-crc','no-map']:
                    p=rec(model,kind);page,errors=await fresh(browser,catalog({model:p}),payload(p,model,kind))
                    await page.wait_for_function('qa.state().status.includes("Bundled Bluetooth")')
                    s=await state(page)
                    check(not s['image'] and s['hidden'] and s['disabled'] and s['permissions']==0,model+'/'+kind+' denies package before download or MIDI')
                    check(not errors,model+'/'+kind+' refusal reports without script exception')
                    await page.close()
                for field,value in [('controller_sha256','f'*64),('controller_size',4095)]:
                    p=rec(model);p[field]=value;page,errors=await fresh(browser,catalog({model:p}),payload(p,model))
                    await page.wait_for_function('qa.state().status.includes("Bundled Bluetooth")')
                    s=await state(page);check(not s['image'] and s['hidden'] and s['disabled'],model+'/'+field+' mismatch rejected despite correct package SHA')
                    await page.close()
                for strategy in [None,False,'hosted',{},'']:
                    p=rec(model);p['controller_strategy']=strategy;page,errors=await fresh(browser,catalog({model:p}),payload(p,model))
                    s=await state(page);check(not s['image'] and s['hidden'] and s['disabled'],model+' malformed controller strategy '+str(strategy)+' denied')
                    await page.close()
                # Real product mismatch with correct package hash and size must fail before extraction.
                other='pro' if model=='elite' else 'elite';p=rec(other);p['product']=f'SMK-37 {"Elite" if model=="elite" else "Pro"}_900'
                page,errors=await fresh(browser,catalog({model:p}),payload(p,other))
                await page.wait_for_function('qa.state().status.includes("damaged")')
                s=await state(page);check(not s['image'] and s['hidden'] and s['disabled'],model+' wrong model package rejected despite correct downloaded hash')
                await page.close()
                # Legacy metadata still takes the local controller path; absence is a clear refusal before MIDI.
                p=rec(model);del p['controller_strategy'];del p['controller_size'];page,errors=await fresh(browser,catalog({model:p}),payload(p,model))
                await page.wait_for_function('qa.state().image')
                check(not (await state(page))['blehidden'],model+' legacy metadata retains local controller input')
                await page.evaluate('qa.mocks();qa.legacyCtl();qa.ack();window.confirm=()=>true')
                await page.click('#go');await page.wait_for_function('qa.state().status.includes("ctl.img")')
                s=await state(page);check(s['permissions']==0 and s['writes']==0,model+' missing legacy controller refuses before MIDI')
                await page.evaluate('(a)=>qa.legacyCtl(a)',list((folder/'controller.img').read_bytes()))
                await page.click('#go');await page.wait_for_function('qa.state().writes===1 && !qa.state().writing')
                s=await state(page);check(s['permissions']==1 and s['writes']==1,model+' matching local controller preserves legacy install path')
                await page.close()
            # Hold the actual embedded-image digest at install, then change selected model.
            models={m:rec(m) for m in ['elite','pro']};payloads={}
            for m,p in models.items():payloads.update(payload(p,m))
            page,errors=await fresh(browser,catalog(models),payloads)
            await page.wait_for_function('qa.state().image')
            await page.evaluate('qa.mocks();qa.holdControllerHash();qa.ack();window.confirm=()=>true')
            await page.click('#go');await page.wait_for_function('typeof window.releaseHash === "function"')
            await page.evaluate('()=>{qa.select("elite");}')
            # The new load is not held; release only the stale install digest.
            await page.evaluate('releaseHash()')
            await page.wait_for_function('qa.state().status.includes("X0X") || !qa.state().image')
            s=await state(page);check(s['permissions']==0 and s['writes']==0,'model change during embedded hash refuses stale install before MIDI')
            await page.close();await browser.close()
    failures=[name for name,ok in checks if not ok]
    print(json.dumps({'checks':len(checks),'failed':len(failures),'failures':failures}),flush=True)
    if failures:raise SystemExit(1)
if __name__=='__main__':asyncio.run(main())
