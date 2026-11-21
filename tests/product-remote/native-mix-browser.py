# SPDX-License-Identifier: GPL-3.0-only
"""Built Remote UI against real native WASM transactions, never a fake provider."""
import asyncio,importlib.util,json,os,subprocess,tempfile
from pathlib import Path
from playwright.async_api import async_playwright,expect
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('envelope_core',Path(__file__).with_name('envelope-browser.py'));core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
FX_READOUTS = json.loads((ROOT / 'web/product-site/remote/fx-format.json').read_text())

async def check_feedback_boundary(page, baseline):
    control = next(c for c in baseline if (c['target'], c['voice'], c['parameter']) == (4, 0, 9))
    readouts = FX_READOUTS['1:4:0:9']
    assert control['value'] == 52 and readouts[52:55] == ['35%', '35%', '36%']
    target = page.locator('[data-runtime-key="4:0:9"]')
    await expect(target.locator('output')).to_have_text(readouts[52])
    await target.press('Enter')
    field = page.locator('#parameter-value')
    await expect(field).to_have_value('52')
    count = await page.evaluate('controlPackets.length')
    await field.fill('54')
    await field.press('Tab')
    await page.wait_for_function('n=>controlPackets.length>n', arg=count)
    expected = [dict(c, value=54) if c == control else c for c in baseline]
    assert await page.evaluate('controlPackets.at(-1).controls') == expected
    await expect(target.locator('output')).to_have_text(readouts[54])
    await expect(target).to_have_accessible_name('Delay FEEDBACK ' + readouts[54])
    await page.locator('#undo').click()
    await page.wait_for_function('n=>controlPackets.length>n', arg=count + 1)
    assert await page.evaluate('controlPackets.at(-1).controls') == baseline
    await expect(target.locator('output')).to_have_text(readouts[52])
    await expect(target).to_have_accessible_name('Delay FEEDBACK ' + readouts[52])
    print('PASS Delay FEEDBACK raw 52/53 = 35%, cross to 54 = 36%, Undo to 52 = 35%', flush=True)

async def cases(origin):
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(chromium_sandbox=True)
  try:
   for w,h in [(1440,900),(390,844),(844,390)]:
    context=await browser.new_context(viewport={'width':w,'height':h},accept_downloads=True,has_touch=True);page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    await page.add_init_script("window.controlPackets=[];window.controlErrors=[];window.nativeNodes=[];window.midiCalls=0;navigator.requestMIDIAccess=()=>{midiCalls++;throw Error('No devices')};const AW=AudioWorkletNode;window.AudioWorkletNode=class extends AW{constructor(...a){super(...a);nativeNodes.push(this);window.nativeContext=a[0];this.port.addEventListener('message',e=>{if(e.data?.type==='controls-result')controlPackets.push(e.data);if(e.data?.type==='controls-error')controlErrors.push(e.data)});this.port.start()}};")
    try:
     await page.goto(origin+'/remote/',wait_until='networkidle');await page.locator('[data-view="mix"]').click();await page.locator('.mixer-fader').first.wait_for();draft=await page.locator('.mixer-fader').first.input_value()
     await page.locator('.overflow summary').click();await page.locator('#emulator-start').click();await expect(page.locator('#status')).to_contain_text('Emulator running',timeout=20000);await page.locator('.overflow summary').click()
     await page.locator('[data-mix-source="emulator"]').click();await expect(page.locator('[data-mix-source="emulator"]')).to_have_attribute('aria-pressed','true');await page.wait_for_function('controlPackets.length>0')
     baseline=await page.evaluate('controlPackets.at(-1).controls');seen=set()
     for mode in ['levels','pan','sends','fx']:
      await page.locator('[data-mix-mode="'+mode+'"]').click()
      for key in await page.locator('[data-runtime-key]').evaluate_all('els=>els.map(e=>e.dataset.runtimeKey)'):
       if key in seen:continue
       seen.add(key);target=page.locator('[data-runtime-key="'+key+'"]').first;before_count=await page.evaluate('controlPackets.length');old_text=await target.evaluate("e=>e.tagName==='INPUT'?e.value:e.querySelector('output')?.textContent")
       before=next(c for c in baseline if ':'.join(str(c[k]) for k in ['target','voice','parameter'])==key);value=before['value'];delta=-1 if value==before['max'] else 1
       await target.press('ArrowLeft' if delta<0 else 'ArrowRight')
       await page.wait_for_function('n=>controlPackets.length>n',arg=before_count)
       packet=await page.evaluate('controlPackets.at(-1)');actual=next(c for c in packet['controls'] if ':'.join(str(c[k]) for k in ['target','voice','parameter'])==key);assert actual['value']==value+delta,(key,value,actual)
       new_text=await target.evaluate("e=>e.tagName==='INPUT'?e.value:e.querySelector('output')?.textContent")
       readouts=FX_READOUTS.get('1:'+key)
       if readouts is not None:
        assert (old_text,new_text)==(readouts[value],readouts[actual['value']]),(key,value,actual['value'],old_text,new_text)
       else:
        assert new_text!=old_text,(key,old_text,new_text)
       if await target.evaluate("e=>e.tagName==='BUTTON' && e.classList.contains('encoder')"):assert new_text in (await target.get_attribute('aria-label') or ''),(key,'stale accessible value',new_text,await target.get_attribute('aria-label'))
       if await target.evaluate("e=>e.tagName==='INPUT'"):assert await target.get_attribute('aria-valuetext')==await target.evaluate("e=>e.closest('.funkybeats-typed-unit').querySelector('[data-param-value]').textContent")
       await page.locator('#undo').click();await page.wait_for_function('n=>controlPackets.length>n',arg=before_count+1);assert await page.evaluate('controlPackets.at(-1).controls')==baseline
       assert await target.evaluate("e=>e.tagName==='INPUT'?e.value:e.querySelector('output')?.textContent")==old_text
     assert len(seen)==29,seen
     await check_feedback_boundary(page,baseline)
     fx_send_keys=await page.locator('.mix-fx-sends [data-runtime-key]').evaluate_all('els=>els.map(e=>e.dataset.runtimeKey)')
     assert fx_send_keys==[f'5:{part}:{effect}' for part in range(5) for effect in (1,2)],fx_send_keys
     fx_send=page.locator('.mix-fx-sends [data-runtime-key="5:0:1"]')
     before_count=await page.evaluate('controlPackets.length')
     before=next(c for c in baseline if (c['target'],c['voice'],c['parameter'])==(5,0,1))
     delta=-1 if before['value']==before['max'] else 1
     await fx_send.press('ArrowLeft' if delta<0 else 'ArrowRight')
     await page.wait_for_function('n=>controlPackets.length>n',arg=before_count)
     expected=[dict(c,value=c['value']+delta) if c==before else c for c in baseline]
     assert await page.evaluate('controlPackets.at(-1).controls')==expected
     await page.locator('#undo').click()
     await page.wait_for_function('n=>controlPackets.length>n',arg=before_count+1)
     assert await page.evaluate('controlPackets.at(-1).controls')==baseline
     # Actual pointer/touch edits and cancellation use the same native owner.
     await page.locator('[data-mix-mode="sends"]').click()
     slider=page.locator('[data-runtime-key="5:0:1"]');await slider.scroll_into_view_if_needed();box=await slider.bounding_box();count=await page.evaluate('controlPackets.length')
     x=box['x']+box['width']*.8;y=box['y']+box['height']/2
     if w==1440:await page.mouse.click(x,y)
     else:await page.touchscreen.tap(x,y)
     await page.wait_for_function('n=>controlPackets.length>n',arg=count);assert await page.evaluate('controlPackets.at(-1).controls')!=baseline
     await page.locator('#undo').click();await page.wait_for_function('n=>controlPackets.length>n',arg=count+1);assert await page.evaluate('controlPackets.at(-1).controls')==baseline
     count=await page.evaluate('controlPackets.length');box=await slider.bounding_box();cdp=await context.new_cdp_session(page)
     await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'id':1,'x':box['x']+box['width']*.9,'y':box['y']+box['height']/2}]})
     await cdp.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]});await cdp.detach()
     assert await page.evaluate('controlPackets.length')==count
     await page.locator('[data-mix-mode="fx"]').click();encoder=page.locator('[data-runtime-key="4:0:4"]');await encoder.press('Enter');field=page.locator('#parameter-value');old=int(await field.input_value());await field.fill(str(old+1 if old<127 else old-1));await field.press('Tab')
     await page.wait_for_function('n=>controlPackets.length>n',arg=count);assert await page.evaluate('controlPackets.at(-1).controls')!=baseline
     await page.locator('#undo').click();await page.wait_for_function('n=>controlPackets.length>n',arg=count+1);assert await page.evaluate('controlPackets.at(-1).controls')==baseline
     out=ROOT/'test-results/native-mix';out.mkdir(parents=True,exist_ok=True);await page.screenshot(path=str(out/f'fx-{w}x{h}.png'))
     # A real second native consumer changes the engine; stale UI must refuse, not overwrite it.
     await page.locator('[data-mix-mode="levels"]').click()
     await page.evaluate('''async()=>{const {createNativeControlProvider}=await import('/emu/native-session.mjs');const last=controlPackets.at(-1);window.externalMix=createNativeControlProvider({port:nativeNodes.at(-1).port,pin:last});const c=last.controls.find(c=>c.target===5&&c.voice===0&&c.parameter===0);window.externalReceipt=await externalMix.set({target:5,voice:0,parameter:0,expected:c.value,value:c.value===127?125:c.value+2});}''')
     errors_before=await page.evaluate('controlErrors.length');await page.locator('[data-runtime-key="5:0:0"]').press('ArrowRight');await page.wait_for_function('n=>controlErrors.length>n',arg=errors_before)
     await expect(page.locator('#status')).to_contain_text('not confirmed')
     assert await page.locator('[data-runtime-key]').count()==0
     await page.evaluate('async()=>{const current=await externalMix.read();if(JSON.stringify(current.controls)!==JSON.stringify(externalReceipt.controls))throw Error("stale UI changed native state");await externalMix.undo({token:externalReceipt.undoToken});externalMix.close();}')
     assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert await page.evaluate('midiCalls')==0;assert not errors,errors
     await page.locator('[data-mix-source="draft"]').click();await page.locator('[data-mix-mode="levels"]').click();assert await page.locator('.mixer-fader').first.input_value()==draft
     # Stop and source changes while a real native request is pending cannot
     # repaint the draft or replace its status with a late provider rejection.
     await page.locator('[data-mix-source="emulator"]').click();await expect(page.locator('[data-runtime-key="5:0:0"]')).to_be_enabled()
     await page.evaluate('nativeContext.suspend()');await page.locator('[data-runtime-key="5:0:0"]').press('ArrowRight')
     await page.locator('[data-mix-source="draft"]').click();await expect(page.locator('#status')).to_contain_text('Draft')
     assert await page.locator('.mixer-fader').first.input_value()==draft
     await page.locator('.overflow summary').click();await page.locator('#emulator-stop').click()
     await expect(page.locator('#status')).not_to_contain_text('not confirmed');assert await page.locator('[data-runtime-key]').count()==0
     print(f'PASS native Mix29 actual UI edits/Undo/aliases/draft/MIDI0 {w}x{h}',flush=True)
    finally:await context.close()
  finally:await browser.close()
def main():
 assert os.environ.get('DNBOX_EMULATOR_RUNTIME'),'Explicit qualified native runtime required'
 out=ROOT/'.output';out.mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='native-mix-',dir=out) as tmp:
  subprocess.run(['node','scripts/build-product-site.mjs','--output',tmp],cwd=ROOT,check=True)
  with core.server(tmp) as origin:asyncio.run(cases(origin))
if __name__=='__main__':main()
