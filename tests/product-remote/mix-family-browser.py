"""Reconstructed coherent Mix journey: actual unique shipped build, normal sandbox, no device."""
import asyncio,importlib.util,json,subprocess,tempfile
from pathlib import Path
from playwright.async_api import async_playwright,expect
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('funky',Path(__file__).with_name('funkybeats-browser.py'));core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
async def state(page):return await core.draft_state(page)
async def mode(page,name):await page.locator('[data-mix-mode="'+name+'"]').click()
def values(document):return {x['id']:x['value'] for x in document['parameters']}
def master_source_specs():
 # Read the actual qualified module; no independently invented fallback table.
 script="""import fs from 'node:fs';import {createMasterDraft} from './web/product-site/remote/master-draft.mjs';const read=n=>JSON.parse(fs.readFileSync('web/product-site/remote/'+n));const m=createMasterDraft(read('components.json'),read('catalog.json'));console.log(JSON.stringify(Object.fromEntries(m.specs.flatMap(s=>s.ids.map(id=>[id,{canonical:s.id,default:s.value,max:s.max}])))));"""
 return json.loads(subprocess.check_output(['node','--input-type=module','-e',script],cwd=ROOT,text=True))
async def effective(page,target):
 await target.press('Enter');field=page.locator('#parameter-value');await expect(field).to_be_enabled()
 return {'raw':int(await field.input_value()),'readout':await page.locator('#parameter-readout').text_content(),'output':await target.locator('output').text_content()}
async def check_master_destination(page, before, width, height):
 opener = page.get_by_role('button', name='Master / More', exact=True)
 await opener.focus()
 await opener.press('Enter')
 await expect(opener).to_be_focused()
 await expect(opener).to_have_attribute('aria-pressed', 'true')
 panel = page.get_by_role('region', name='Master controls')
 await expect(panel.locator('[data-mix-param-label]')).to_have_count(4)
 await expect(panel.locator('[data-master-control]')).to_have_count(12)
 await expect(page.locator('.mixer-fader, .master-output, [data-runtime-key]')).to_have_count(0)
 assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 geometry = await panel.locator('[data-param]').evaluate_all("els=>els.map(e=>{const b=e.getBoundingClientRect();return [b.width,b.height,b.bottom]})")
 assert all(w >= 44 and h >= 44 for w,h,_ in geometry), geometry
 if width == 1440:
  assert max(bottom for _,_,bottom in geometry) <= height, geometry
  macro = panel.locator('[data-mix-param-label]').first
  label, glyph, value = [await macro.locator(selector).bounding_box() for selector in (':scope > span:last-child', ':scope > .glyph', ':scope > output')]
  assert label['y']+label['height'] <= glyph['y'] and glyph['y']+glyph['height'] <= value['y'], (label,glyph,value)
 destination = ROOT/'test-results/mix-family'
 destination.mkdir(parents=True, exist_ok=True)
 await page.screenshot(path=str(destination/f'master-{width}x{height}.png'))
 detail = panel.locator('[data-master-control="6:2"]')
 label = await detail.locator('output').inner_text()
 await detail.press('ArrowUp')
 await expect(detail.locator('output')).not_to_have_text(label)
 changed = await state(page)
 assert changed['parameters'] != before['parameters']
 await mode(page,'levels')
 await expect(page.locator('[data-master-control="6:2"] output')).not_to_have_text(label)
 await page.locator('#undo').click()
 assert (await state(page))['parameters'] == before['parameters']
 await mode(page,'master')
 await expect(detail.locator('output')).to_have_text(label)
 await mode(page,'levels')
 await expect(page.locator('.mixer-fader')).to_have_count(5)

async def main():
 source_specs=master_source_specs()
 (ROOT/'.output').mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='mix-family-',dir=ROOT/'.output') as tmp:
  core.SOURCE=Path(tmp)/'site';subprocess.run(['node','scripts/build-product-site.mjs','--output',str(core.SOURCE)],cwd=ROOT,check=True)
  async with async_playwright() as pw:
   browser=await pw.chromium.launch(chromium_sandbox=True)
   try:
    for w,h in [(1440,900),(390,844),(844,390)]:
     context=await browser.new_context(viewport={'width':w,'height':h},has_touch=True);await context.route('**/*',core.serve);page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
     await page.add_init_script('window.midiCalls=0;navigator.requestMIDIAccess=()=>{window.midiCalls++;throw Error("No device")}')
     await page.goto(core.ORIGIN+'/remote/');await page.locator('[data-view="mix"]').click();await page.locator('.mixer-fader').first.wait_for()
     before=await state(page)
     await check_master_destination(page,before,w,h)
     for view in ['levels','pan','sends','fx']:
      await mode(page,view);assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(w,view)
      for target in await page.locator('[data-mix-mode]').all():assert (await target.bounding_box())['height']>=44
      out=ROOT/'test-results/mix-family';out.mkdir(parents=True,exist_ok=True);await page.screenshot(path=str(out/f'{view}-{w}x{h}.png'),full_page=True)
     # FX edits keep the firmware display and raw Draft storage in sync.
     for label, initial, changed in [('Reverb DECAY','62%','63%'), ('Delay TIME','1/8.','1/4')]:
      target=page.get_by_role('button',name=label+' '+initial,exact=True)
      await expect(target.locator('output')).to_have_text(initial)
      await target.press('ArrowUp')
      edited=page.get_by_role('button',name=label+' '+changed,exact=True)
      await expect(edited.locator('output')).to_have_text(changed)
      await expect(page.locator('#parameter-readout')).to_have_text(changed)
      await page.locator('#undo').click()
      await expect(target.locator('output')).to_have_text(initial)
      assert (await state(page))['parameters']==before['parameters']
     await mode(page,'levels')
     for i in range(5):
      slider=page.locator('.mixer-fader').nth(i);old=int(await slider.input_value());await slider.press('ArrowRight');after=await state(page);assert values(after)[await slider.get_attribute('data-native-param')]==old+1;await page.locator('#undo').click();assert (await state(page))['parameters']==before['parameters']
     await mode(page,'sends')
     for i in range(10):
      slider=page.locator('.mix-send-strip input').nth(i);await slider.scroll_into_view_if_needed();box=await slider.bounding_box();old=int(await slider.input_value());x=box['x']+box['width']*.8;y=box['y']+box['height']/2
      if w==1440:await page.mouse.click(x,y)
      else:await page.touchscreen.tap(x,y)
      after=await state(page);identity=await slider.get_attribute('data-native-param');assert values(after).get(identity,old)!=old,(w,i,after['parameters'])
      key=identity.split('|')[1];aliases=[p['value'] for p in after['parameters'] if p['id'].endswith('|'+key)];assert len(set(aliases))==1
      await mode(page,'levels');await page.locator('#undo').click();assert (await state(page))['parameters']==before['parameters'];await mode(page,'sends')
     slider=page.locator('.mix-send-strip input').first;await slider.scroll_into_view_if_needed();box=await slider.bounding_box();cdp=await context.new_cdp_session(page);await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'id':1,'x':box['x']+box['width']*.9,'y':box['y']+box['height']/2}]});await cdp.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]});await cdp.detach();assert (await state(page))['parameters']==before['parameters']
     await mode(page,'levels')
     for index in range(4):
      target=page.locator('.mix-master-panel [data-param]').nth(index);identity=await target.get_attribute('data-param');prior=await state(page);prior_effective=await effective(page,target);spec=source_specs[identity];diagnostic={'size':(w,h),'index':index,'identity':identity,'source':spec,'prior':prior['parameters'],'priorEffective':prior_effective}
      assert prior_effective['raw']==values(prior).get(identity,spec['default']),diagnostic
      assert prior_effective['raw']<spec['max'],diagnostic
      await target.press('ArrowUp');edited=await state(page);edited_effective=await effective(page,target);diagnostic.update({'edited':edited['parameters'],'editedEffective':edited_effective})
      assert values(edited).get(identity)!=values(prior).get(identity),diagnostic
      assert values(edited)[identity]==prior_effective['raw']+1==edited_effective['raw'],diagnostic
      assert await target.locator('output').text_content() in (await target.get_attribute('aria-label') or ''),diagnostic
      await mode(page,'fx');await page.locator('#undo').click();restored=await state(page);diagnostic['restored']=restored['parameters']
      assert restored['parameters']==prior['parameters'],diagnostic
      await mode(page,'levels');assert await target.get_attribute('data-param')==identity,diagnostic
      restored_effective=await effective(page,target);diagnostic['restoredEffective']=restored_effective
      assert restored_effective==prior_effective,diagnostic
      await page.locator('#redo').click();redone=await state(page);redone_effective=await effective(page,target);diagnostic.update({'redone':redone['parameters'],'redoneEffective':redone_effective})
      assert redone['parameters']==edited['parameters'] and redone_effective==edited_effective,diagnostic
      await page.locator('#undo').click();final=await state(page);final_effective=await effective(page,target);diagnostic.update({'final':final['parameters'],'finalEffective':final_effective})
      assert final['parameters']==prior['parameters'] and final_effective==prior_effective,diagnostic
     fresh=await state(page);legacy=json.loads(json.dumps(fresh));legacy['parameters']=[{'id':'current-state-and-reference/mix-parts-live.svg|1:5:0:1','value':32}];await core.load_draft(page,legacy);imported=await state(page);assert len([p for p in imported['parameters'] if p['id'].endswith('|1:5:0:1') and p['value']==32])==3
     conflict=json.loads(json.dumps(imported));conflict['parameters'][0]['value']=0
     await page.locator('#draft-file').set_input_files({'name':'conflict.json','mimeType':'application/json','buffer':json.dumps(conflict).encode()})
     await expect(page.locator('#draft-dialog')).to_be_visible();await expect(page.locator('#draft-replace')).to_be_disabled();await expect(page.locator('#draft-preview')).to_have_text('Conflicting mixer aliases');await expect(page.locator('#status')).to_have_text('Conflicting mixer aliases')
     # Invalid imports stay modal; dismiss through the real UI before exporting to prove no mutation.
     await page.locator('#draft-cancel').click();await expect(page.locator('#draft-dialog')).to_be_hidden()
     assert (await state(page))['parameters']==imported['parameters'];await core.load_draft(page,before)
     await mode(page,'sends')
     for part in ['drum909','drum808','chicago','miami','breaks']:
      await page.locator('[data-mix-part="'+part+'"]').click();await expect(page.locator('[data-view="sound"]').first).to_have_attribute('aria-current','page');await page.locator('[data-view="mix"]').click()
     assert not errors,errors;assert await page.evaluate('window.midiCalls')==0;print('MIX_FAMILY',w,h,'PASS',flush=True);await context.close()
   finally:await browser.close()
 print('MIX_FAMILY PASS actual shipped build,3sizes,all10sends,5levels,cancel,Undo,5Soundroutes; no device')
if __name__=='__main__':asyncio.run(main())
