# SPDX-License-Identifier: GPL-3.0-only
# Only RD-CODE-01/02 from implementation-review-r1; same retained reviewer.
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,mimetypes,hashlib,subprocess,sys
ROOT=Path(__file__).parent.resolve();OUT=Path('/workspace/dnbox-code-review-r1-corrections');OUT.mkdir(exist_ok=True)
red='--red-hidden-only' in sys.argv
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {DraftStore} from './model.js';import {putNote} from './editing.js';const s=new DraftStore();s.edit(d=>putNote(d,0,0,{start:0,pitch:72,slots:8,velocity:90}));console.log(JSON.stringify(s.doc));"],cwd=ROOT,text=True))
tr=bytes([0,144,60,96,131,96,128,60,0,0,255,47,0]);midi=b'MThd'+(6).to_bytes(4,'big')+bytes([0,0,0,1,1,224])+b'MTrk'+len(tr).to_bytes(4,'big')+tr
rows=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for w,h in ([(1440,1000)] if red else [(1440,1000),(1024,900),(390,844),(320,568)]):
  ctx=browser.new_context(viewport={'width':w,'height':h},is_mobile=w<500,has_touch=w<1100);page=ctx.new_page();errors=[];network=[]
  def route(r):
   f=(ROOT/(r.request.url.split('dnbox-editor.test/',1)[-1].split('?')[0] or 'index.html')).resolve()
   if f.parent!=ROOT or not f.is_file():network.append(r.request.url);r.abort();return
   r.fulfill(body=f.read_bytes(),content_type='text/javascript' if f.suffix=='.js' else mimetypes.guess_type(str(f))[0] or 'application/octet-stream')
  ctx.route('**/*',route);page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script('window.midiCalls=0;navigator.requestMIDIAccess=()=>{window.midiCalls++;throw Error("No device API authorized")};');page.goto('http://dnbox-editor.test/');page.wait_for_function('window.dnboxEditor && document.querySelector("#sound .sound-row")')
  snapshot=lambda:page.evaluate('dnboxEditor.snapshot()');rev=lambda:page.evaluate('dnboxEditor.revision()');initial=snapshot();geometry=[]
  if not red:
   for part in [0,1]:
    page.locator(f'[data-part="{part}"]').click();before=snapshot()
    for name in ['direction','transpose']:
     assert page.locator('#'+name+'-group').is_visible();assert page.locator('#'+name).is_enabled()
    page.locator('#direction').select_option('1');assert snapshot()['patterns'][0]['bass'][part]['direction']==1;assert snapshot()['patterns'][0]['bass'][1-part]==before['patterns'][0]['bass'][1-part];page.locator('#undo').click();assert snapshot()==before
    page.locator('#transpose').fill('7');page.locator('#transpose').dispatch_event('change');assert snapshot()['patterns'][0]['bass'][part]['transpose']==7;page.locator('#undo').click();assert snapshot()==before
  for part in [2,3,4]:
   page.locator(f'[data-part="{part}"]').click()
   values=page.evaluate("['direction','transpose'].map(id=>({id,hidden:document.getElementById(id+'-group').hidden,display:getComputedStyle(document.getElementById(id+'-group')).display,rects:document.getElementById(id+'-group').getClientRects().length,disabled:document.getElementById(id).disabled}))")
   geometry.append({'part':part,'controls':values})
   if red:(OUT/'browser-red-observation.json').write_text(json.dumps(geometry,indent=2)+'\n')
   assert all(x['hidden'] and x['display']=='none' and x['rects']==0 and x['disabled'] for x in values),values
   before=snapshot();r=rev();msg=page.locator('#message').inner_text()
   for name,value in [('direction','1'),('transpose','12')]:page.locator('#'+name).evaluate('(el,value)=>{el.value=value;el.dispatchEvent(new Event("change",{bubbles:true}));}',value)
   assert snapshot()==before and rev()==r and page.locator('#message').inner_text()==msg,'unsupported handlers must be inert'
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(OUT/f'rd-code-02-part{part}-{w}.png'),full_page=True)
  page.locator('[data-part="0"]').click();assert page.locator('#direction-group').is_visible() and page.locator('#direction').input_value()=='0';assert snapshot()==initial
  # Actual file-input / module worker regression: destination8-slot note, imported4-slot window.
  page.locator('#open-draft').set_input_files({'name':'destination-eight-slots.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()});page.get_by_role('button',name='Replace local draft',exact=True).click();before=snapshot();r=rev()
  page.locator('#midi-file').set_input_files({'name':'one-beat.mid','mimeType':'audio/midi','buffer':midi});page.get_by_role('button',name='Build replacement preview',exact=True).wait_for();page.get_by_label('Beats',exact=True).fill('1');page.get_by_label('Beats',exact=True).press('Tab');page.get_by_role('button',name='Build replacement preview',exact=True).click();apply=page.locator('[data-apply-plan]');apply.wait_for();assert apply.is_disabled();assert 'destination' in page.locator('#dialog-body').inner_text().lower() and 'tie' in page.locator('#dialog-body').inner_text().lower()
  assert snapshot()==before and rev()==r;apply.evaluate('(el)=>el.click()');assert snapshot()==before and rev()==r
  page.screenshot(path=str(OUT/f'rd-code-01-rejected-import-{w}.png'),full_page=True);page.get_by_role('button',name='Discard',exact=True).click();assert snapshot()==before;page.locator('#undo').click();assert snapshot()==initial,'rejected import must not insert an Undo frame'
  assert not errors and not network and page.evaluate('window.midiCalls')==0
  rows.append({'viewport':[w,h],'unsupported_control_geometry':geometry,'synth_controls':'VISIBLE_ENABLED_SCOPED_APPLY_UNDO_PASS','drum_BREAK_handlers':'NO_DOC_REVISION_STATUS_MUTATION_PASS','destination_tie_import':'BLOCKED_USE_DISABLED_NONMUTATING_UNDO_PRESERVED','errors':errors,'unexpected_network':network,'device_api_calls':0,'runtime_source_sha256':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in ROOT.iterdir() if f.suffix in ['.js','.css','.html']}});ctx.close()
 browser.close()
(OUT/'browser-green-receipt.json').write_text(json.dumps(rows,indent=2)+'\n');print('PASS RD-CODE-01/02 affected browser checks at4viewports;16fresh renders')
