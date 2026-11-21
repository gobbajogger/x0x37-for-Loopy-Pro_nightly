"""Independent actual-browser Master Review/Projects counter and history supplement."""
import argparse,asyncio,hashlib,importlib.util,json,re
from pathlib import Path
from playwright.async_api import async_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--site',type=Path,required=True);p.add_argument('--evidence-dir',type=Path,required=True);a=p.parse_args();a.evidence_dir.mkdir(parents=True,exist_ok=False)
spec=importlib.util.spec_from_file_location('master_fixture',a.root/'tests/product-remote/master-more-browser.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
async def run(origin):
 rows=[]
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(chromium_sandbox=True)
  try:
   for w,h in [(1440,900),(390,844),(844,390)]:
    folder=a.evidence_dir/f'{w}x{h}';folder.mkdir();ctx=await browser.new_context(viewport={'width':w,'height':h},has_touch=True,accept_downloads=True);page=await ctx.new_page();events=[]
    for kind in ['console','pageerror','requestfailed']:page.on(kind,lambda item,k=kind:events.append({'kind':k,'text':str(item)}))
    await page.add_init_script("window.midiCalls=0;window.nativeNodes=0;navigator.requestMIDIAccess=()=>{midiCalls++;throw Error('No devices')};const A=AudioWorkletNode;window.AudioWorkletNode=class extends A{constructor(...a){super(...a);nativeNodes++}}")
    record={'size':[w,h],'states':[]}
    async def load(document,name):
     if not await page.locator('.overflow').evaluate('e=>e.open'):await page.locator('.overflow summary').click()
     await page.locator('#draft-file').set_input_files({'name':name,'mimeType':'application/json','buffer':json.dumps(document).encode()});await page.locator('#draft-replace').click()
    async def check(name,count,labels=()):
     if not await page.locator('.overflow').evaluate('e=>e.open'):await page.locator('.overflow summary').click()
     await page.locator('#review').click();text=await page.locator('#changes').text_content();lines=[] if text=='No changes.' else text.splitlines();assert len(lines)==count,(name,count,text)
     for label in labels:assert sum((' '+label+':') in x for x in lines)==1,(name,label,text)
     await page.screenshot(path=str(folder/(name+'-review.png')));await page.locator('#review-dialog button').click()
     if await page.locator('.overflow').evaluate('e=>e.open'):await page.locator('.overflow summary').click()
     await page.locator('[data-view="files"]').click();summary=await page.locator('.project-summary p').inner_text();assert re.search(r'\b'+str(count)+r' sound edits\b',summary),(name,count,summary);await page.screenshot(path=str(folder/(name+'-projects.png')));record['states'].append({'name':name,'count':count,'review':text,'projects':summary});await page.locator('[data-view="mix"]').click()
    try:
     await page.goto(origin+'/remote/');await page.locator('[data-view="mix"]').click();before=await m.draft(page);params=before['parameters'];await check('factory',0)
     c=next(c for c in m.SOURCE['controls'] if c['target']==6 and c['parameter']==2);value=c['default']+1;assert value<=c['max'];await m.set_value(page,6,2,value);edited=(await m.draft(page))['parameters'];assert edited!=params;await check('scalar-edit',1,['Attack']);await page.locator('#undo').click();assert (await m.draft(page))['parameters']==params;await check('scalar-undo',0);await page.locator('#redo').click();assert (await m.draft(page))['parameters']==edited;await check('scalar-redo',1,['Attack'])
     await load(before,'factory.json');await m.set_value(page,6,12,0);saved=await m.draft(page);macro=[(12,0)]+list(zip([0,1,4],m.SOURCE['macros'][0][:3]));changed=[parameter for parameter,value in macro if value!=next(c['default'] for c in m.SOURCE['controls'] if c['target']==6 and c['parameter']==parameter)];labels={12:'COMP',0:'Threshold',1:'Ratio',4:'Makeup'};await check('macro-edit',len(changed),[labels[x] for x in changed]);await page.locator('#undo').click();assert (await m.draft(page))['parameters']==params;await check('macro-undo',0);await page.locator('#redo').click();assert (await m.draft(page))['parameters']==saved['parameters'];await check('macro-redo',len(changed),[labels[x] for x in changed])
     for kind in ['comp95','filter64']:
      source=a.root/'tests/product-remote/fixtures/legacy-ce667-master';raw=(source/(kind+'-after-undo.json')).read_bytes();provenance=json.loads((source/(kind+'-provenance.json')).read_text());assert hashlib.sha256(raw).hexdigest()==provenance['sha256'];await load(json.loads(raw),kind+'.json');await check('legacy-'+kind,0);assert await page.locator('#undo').is_disabled() and await page.locator('#redo').is_disabled()
     assert await page.evaluate('midiCalls')==0 and await page.evaluate('nativeNodes')==0;assert not [x for x in events if x['kind']=='pageerror'],events;print('MASTER_COUNTERS PASS',w,h,'scalar1/undo0/redo1 macro unique counts/history legacy0 native0 MIDI0',flush=True)
    except Exception as e:record['failure']=repr(e);await page.screenshot(path=str(folder/'failure.png'));raise
    finally:
     record['events']=events;(folder/'proof.json').write_text(json.dumps(record,indent=2)+'\n');rows.append(record);await ctx.close()
  finally:await browser.close()
 (a.evidence_dir/'summary.json').write_text(json.dumps(rows,indent=2)+'\n')
with m.base.server(a.site) as origin:asyncio.run(run(origin))
