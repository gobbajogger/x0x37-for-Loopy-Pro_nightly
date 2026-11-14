# SPDX-License-Identifier: GPL-3.0-only
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,mimetypes,hashlib
ROOT=Path(__file__).parent.resolve();OUT=Path('/workspace/dnbox-browser-stage2-validation');OUT.mkdir(exist_ok=True);receipts=[]
def midi(pitch=60):
 tr=bytes([0,144,pitch,96,131,96,128,pitch,0,0,255,47,0]);return b'MThd'+(6).to_bytes(4,'big')+bytes([0,0,0,1,1,224])+b'MTrk'+len(tr).to_bytes(4,'big')+tr
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(1440,1000),(1024,900),(390,844),(320,568)]:
  print('VIEWPORT',width,height,flush=True)
  ctx=browser.new_context(viewport={'width':width,'height':height},is_mobile=width<500,has_touch=width<1100,accept_downloads=True);errors=[];net=[]
  def route(r):
   path=r.request.url.split('dnbox-editor.test/',1)[-1].split('?')[0] or 'index.html';f=(ROOT/path).resolve()
   if f.parent!=ROOT or not f.is_file():net.append(r.request.url);r.abort();return
   mime='text/javascript' if f.suffix=='.js' else mimetypes.guess_type(str(f))[0] or 'application/octet-stream';r.fulfill(body=f.read_bytes(),content_type=mime)
  ctx.route('**/*',route);page=ctx.new_page();page.on('pageerror',lambda e:(errors.append(str(e)),print('PAGE_ERROR',str(e),flush=True)));page.add_init_script('window.midiCalls=0; navigator.requestMIDIAccess=()=>{window.midiCalls++;throw Error("Device API forbidden in offline test")};');page.goto('http://dnbox-editor.test/');page.wait_for_function('window.dnboxEditor && document.querySelector("#sound .sound-row")');page.wait_for_timeout(80)
  snapshot=lambda:page.evaluate('window.dnboxEditor.snapshot()');notes=lambda:page.evaluate('window.dnboxEditor.notes()');rev=lambda:page.evaluate('window.dnboxEditor.revision()');before=snapshot()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  vp=page.locator('#viewport');vp.focus();page.keyboard.press('Enter');assert len(notes())==1;assert notes()[0]['pitch']==60
  page.keyboard.press('Shift+ArrowRight');assert notes()[0]['slots']==2;page.keyboard.press('Alt+ArrowUp');assert notes()[0]['velocity']==101
  page.get_by_label('Start step',exact=True).fill('3');page.get_by_label('Start step',exact=True).dispatch_event('change');assert notes()[0]['start']==2;page.locator('#undo').click();assert notes()[0]['start']==0
  # Actual note body drag, edge resize and velocity pointer gesture each commit once.
  page.locator('button[data-tool=select]').click();node=page.locator('[data-note="0"]');node.scroll_into_view_if_needed();box=node.bounding_box();r=rev();page.mouse.move(box['x']+8,box['y']+10);page.mouse.down();page.mouse.move(box['x']+18,box['y']+10);page.mouse.up();assert rev()==r;page.mouse.move(box['x']+8,box['y']+10);page.mouse.down();page.mouse.move(box['x']+88,box['y']-46,steps=8);assert rev()==r;page.mouse.up();assert rev()==r+1;assert notes()[0]['start']==2 and notes()[0]['pitch']==62
  edge=page.locator('[data-resize="2"]');edge.scroll_into_view_if_needed();b=edge.bounding_box();r=rev();page.mouse.move(b['x']+8,b['y']+16);page.mouse.down();page.mouse.move(b['x']+88,b['y']+16,steps=8);page.mouse.up();assert rev()==r+1 and notes()[0]['slots']==4
  bar=page.locator('[data-velocity="2"]');bar.scroll_into_view_if_needed();b=bar.bounding_box();r=rev();page.mouse.move(b['x']+8,b['y']+5);page.mouse.down();page.mouse.move(b['x']+8,b['y']-10,steps=4);page.mouse.up();assert rev()==r+1
  current=snapshot();page.locator('#undo').click();assert notes()[0]['velocity']==101
  # cancelled move does not change content/history
  node=page.locator('[data-note="2"]');node.scroll_into_view_if_needed();b=node.bounding_box();r=rev();saved=snapshot();page.mouse.move(b['x']+10,b['y']+10);page.mouse.down();page.mouse.move(b['x']+50,b['y']);vp.dispatch_event('pointercancel',{'pointerId':1});page.mouse.up();assert rev()==r and snapshot()==saved
  # Draw a second note directly on the roll and extend by two steps.
  page.locator('button[data-tool=draw]').click();vp.scroll_into_view_if_needed();vp.evaluate('(v)=>{v.scrollTop=32+(127-65)*28-180;v.scrollLeft=320}');rb=vp.bounding_box();x=rb['x']+48+10*40-320+8;y=rb['y']+180+8;r=rev();page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+80,y,steps=6);page.mouse.up();assert rev()==r+1 and len(notes())==2
  # Held edge drag scrolls the continuous viewport, then cancellation rolls back.
  page.locator('button[data-tool=select]').click();node=page.locator('[data-note="2"]');node.scroll_into_view_if_needed();bb=node.bounding_box();rb=vp.bounding_box();saved=snapshot();r=rev();left=vp.evaluate('(v)=>v.scrollLeft');page.mouse.move(bb['x']+8,bb['y']+10);page.mouse.down();page.mouse.move(rb['x']+rb['width']-8,bb['y']+10,steps=6);page.wait_for_timeout(220);assert vp.evaluate('(v)=>v.scrollLeft')>left;assert rev()==r;vp.dispatch_event('pointercancel',{'pointerId':1});page.mouse.up();assert snapshot()==saved and rev()==r
  synth1=snapshot()['patterns'][0]['bass'][0];page.locator('[data-part="1"]').click();assert len(notes())==0;assert snapshot()['patterns'][0]['bass'][0]==synth1
  # Real file-input -> module worker parser -> visible loss report -> oneUndo apply.
  page.locator('#midi-file').set_input_files({'name':'bass.mid','mimeType':'audio/midi','buffer':midi()});page.get_by_role('button',name='Build replacement preview',exact=True).wait_for();page.get_by_role('button',name='Build replacement preview',exact=True).click();page.locator('[data-apply-plan]').wait_for();assert page.locator('#dialog-body').inner_text().find('release rounded')>=0;unchanged=snapshot();r=rev();page.get_by_label('Accept reported replacements and losses').check();page.locator('[data-apply-plan]').click();assert rev()==r+1 and len(notes())==1;assert snapshot()['patterns'][0]['bass'][0]==synth1;page.locator('#undo').click();assert snapshot()==unchanged
  # generator previews do not mutate; Discard then Use/Undo is isolated
  page.locator('#generator').click();page.get_by_role('button',name='Preview New',exact=True).click();page.locator('[data-apply-plan]').wait_for();assert snapshot()==unchanged;page.get_by_role('button',name='Discard',exact=True).click();assert snapshot()==unchanged
  page.locator('#generator').click();page.get_by_role('button',name='Preview New',exact=True).click();page.get_by_label('Accept reported replacements and losses').check();page.locator('[data-apply-plan]').click();assert len(notes())>0;assert snapshot()['patterns'][0]['bass'][0]==synth1;page.locator('#undo').click();assert snapshot()==unchanged
  # pattern storage, drum distinct voices, BREAK unqualified negative
  page.locator('#pattern').fill('32');page.locator('#pattern').dispatch_event('change');assert page.evaluate('dnboxEditor.context().pattern')==31
  page.locator('[data-part="2"]').click();assert page.locator('[data-cell]').count()==768,(page.locator('[data-cell]').count(),errors,page.evaluate('dnboxEditor.context()'),page.locator('#title').inner_text(),page.locator('#dialog').is_visible());page.locator('[data-cell="0:0"]').click();assert snapshot()['patterns'][0]['drum'][0]['hits'][0][0]==1
  page.screenshot(path=str(OUT/f'drums-{width}.png'),full_page=True)
  page.locator('[data-part="3"]').click();assert page.get_by_role('button',name='Cowbell',exact=True).count()==2 or page.get_by_role('button',name='Cowbell',exact=True).count()==1
  page.locator('[data-part="4"]').click();assert page.locator('#import').is_disabled();page.locator('[data-cell="0:0"]').click();page.locator('[data-cell="1:0"]').click();assert snapshot()['patterns'][0]['breaks']['gates']==1 and snapshot()['patterns'][0]['breaks']['slices'][0]==1
  # swaps permitted; bothMiami rejected without modifying either binding
  page.locator('[data-part="0"]').click();page.get_by_role('button',name='Chicago',exact=True).click();page.locator('[data-part="1"]').click();page.get_by_role('button',name='Miami',exact=True).click();assert snapshot()['engines']==['Chicago','Miami'];page.locator('[data-part="0"]').click();saved=snapshot();page.get_by_role('button',name='Miami',exact=True).click();assert snapshot()==saved
  page.locator('[data-part="1"]').click();assert page.get_by_text('Filter Cutoff',exact=True).count()==1 and page.get_by_text('Filter Crush',exact=True).count()==1
  # export actual local draft; no device API is called
  with page.expect_download() as d:page.locator('#export').click()
  d.value.save_as(OUT/f'roundtrip-{width}.json');assert json.loads((OUT/f'roundtrip-{width}.json').read_text())==snapshot()
  page.locator('#sound').get_by_role('button',name='Output',exact=True).click();assert page.get_by_label('Pitch Bend',exact=True).is_disabled();page.locator('#sound').get_by_role('button',name='Filter / Crush',exact=True).click();page.get_by_label('Filter Cutoff',exact=True).press('ArrowRight');assert snapshot()['sound']['synth1/Miami/9']==1
  page.locator('[data-part="0"]').click();vp.scroll_into_view_if_needed()
  if width<500:
   # Real Chromium touch events: native one-finger pan and custom pinch cancel edit.
   page.locator('button[data-tool=pan]').click();vp.scroll_into_view_if_needed();vp.evaluate('(v)=>v.scrollLeft=0');rb=vp.bounding_box();saved=snapshot();r=rev();cdp=ctx.new_cdp_session(page)
   def touch(kind,points):cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[{'x':x,'y':y,'id':i,'radiusX':4,'radiusY':4} for i,x,y in points]})
   yy=rb['y']+180;xx=rb['x']+240;touch('touchStart',[(1,xx,yy)])
   for dx in [10,25,45,70,100,130]:touch('touchMove',[(1,xx-dx,yy)]);page.wait_for_timeout(20)
   touch('touchEnd',[]);page.wait_for_timeout(180);assert vp.evaluate('(v)=>v.scrollLeft')>0;assert snapshot()==saved and rev()==r
   page.locator('button[data-tool=draw]').click();vp.scroll_into_view_if_needed();rb=vp.bounding_box();yy=rb['y']+180;before_zoom=page.locator('#zoom').inner_text();touch('touchStart',[(1,rb['x']+120,yy),(2,rb['x']+180,yy)])
   for spread in [10,20,35,50]:touch('touchMove',[(1,rb['x']+120-spread,yy),(2,rb['x']+180+spread,yy)]);page.wait_for_timeout(20)
   touch('touchEnd',[]);page.wait_for_timeout(60);assert page.locator('#zoom').inner_text()!=before_zoom;assert snapshot()==saved and rev()==r
  page.evaluate('scrollTo(0,0)')
  # Beyond stored64 is navigable but cannot be drawn into.
  page.locator('button[data-tool=draw]').click();vp.scroll_into_view_if_needed();vp.evaluate('(v)=>v.scrollLeft=1e9');bb=vp.bounding_box();saved=snapshot();r=rev();page.mouse.click(bb['x']+160,bb['y']+180);assert snapshot()==saved and rev()==r;vp.evaluate('(v)=>v.scrollLeft=0')
  if width==1440:
   # Shared sound is truly global, while unsupported physical pitch bend stays disabled.
   page.get_by_role('button',name='Performance',exact=True).click();assert page.get_by_label('Pitch Bend',exact=True).is_disabled();page.locator('#sound summary').click();page.get_by_role('button',name='Shared master',exact=True).click();page.get_by_label('THRESH',exact=True).press('ArrowRight');assert snapshot()['sound']['Shared master/0']==1;assert not any('synth0/Shared' in k for k in snapshot()['sound']);page.locator('#undo').click()
   # Malformed file input cannot open an applyable preview.
   saved=snapshot();bad=bytearray(midi());bad[9]=2;page.locator('#midi-file').set_input_files({'name':'bad.mid','mimeType':'audio/midi','buffer':bytes(bad)});page.wait_for_function('document.querySelector("#message").textContent.includes("format 0 or 1")');assert snapshot()==saved and not page.locator('#dialog').is_visible()
  page.evaluate('scrollTo(0,0)');page.screenshot(path=str(OUT/f'editor-{width}.png'),full_page=True);assert page.evaluate('window.midiCalls')==0
  saved=snapshot();page.reload();page.wait_for_function('window.dnboxEditor && document.querySelector("#sound .sound-row")');assert snapshot()==saved

  assert not errors,errors;assert not net,net
  receipts.append({'viewport':[width,height],'assertions':'PASS','script_errors':errors,'unserved_network':net,'device_api_calls':0,'actual_source':'owned web/offline-sequencer assets served byte-for-byte by in-process Playwright fixture route; no file navigation/public server/device','source_sha256':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in ROOT.glob('*') if f.suffix in ['.js','.html','.css']}})
  ctx.close()
 browser.close()
(OUT/'browser-receipt.json').write_text(json.dumps(receipts,indent=2)+'\n');print('PASS actual editor interaction suites',len(receipts))
