# SPDX-License-Identifier: GPL-3.0-only
"""Actual Motion + live sequence composition and optional old-layout capture.

Ordinary gate mode builds and tests the candidate. --site/--capture-baseline can
record an existing exact baseline build without asserting new-layout behavior.
No synthetic native frames or device access. The counter covers only the five
frozen4758 request/input types listed in the receipt, not all native traffic.
"""
import argparse,asyncio,hashlib,importlib.util,json,os,subprocess,tempfile
from pathlib import Path
from playwright.async_api import async_playwright,expect
ROOT=Path(__file__).resolve().parents[2]
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));obj=importlib.util.module_from_spec(spec);spec.loader.exec_module(obj);return obj
f=module('motion_funkybeats','funkybeats-browser.py');core=module('motion_envelope','envelope-browser.py')
SIZES=[(1440,900),(390,844),(844,390)]
async def enter(page):
    if not await page.locator('.overflow').evaluate('e=>e.open'):await page.locator('.overflow summary').click()
    await page.locator('[data-view="locks"]').click()
    if await page.locator('.overflow').evaluate('e=>e.open'):await page.locator('.overflow summary').click()
async def geometry(page):
    return await page.evaluate("""()=>Object.fromEntries(['main','#roll-view','#roll-scroll','#velocity','#motion-sequence-context','#other-view','#motion-grid','#motion-value','#part-title','#status'].map(selector=>{const e=document.querySelector(selector);if(!e||e.hidden||!e.getClientRects().length)return [selector,null];const r=e.getBoundingClientRect();return [selector,{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}]}))""")

# A viewport-contained bounding box is insufficient in nested scroll/grid areas.
EFFECTIVE = r'''(e,delegated)=>{
 const rect=e.getBoundingClientRect(),box=r=>({x:r.left,y:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
 let clip={left:0,top:0,right:innerWidth,bottom:innerHeight},ancestors=[];
 for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p),r=p.getBoundingClientRect();
  if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return {ok:false,reason:'hidden ancestor',ancestor:p.id||p.tagName};
  if(p!==e){const x=/(auto|scroll|hidden|clip)/.test(s.overflowX),y=/(auto|scroll|hidden|clip)/.test(s.overflowY);
   if(x){clip.left=Math.max(clip.left,r.left+p.clientLeft);clip.right=Math.min(clip.right,r.left+p.clientLeft+p.clientWidth);}
   if(y){clip.top=Math.max(clip.top,r.top+p.clientTop);clip.bottom=Math.min(clip.bottom,r.top+p.clientTop+p.clientHeight);}
   if(x||y)ancestors.push({id:p.id||p.tagName,overflowX:s.overflowX,overflowY:s.overflowY,rect:box(r),clip:{...clip}});
  }
 }
 const full=rect.width>0&&rect.height>0&&rect.left>=clip.left-.6&&rect.top>=clip.top-.6&&rect.right<=clip.right+.6&&rect.bottom<=clip.bottom+.6;
 const shape=getComputedStyle(e),radius=Math.max(...['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'].map(k=>parseFloat(shape[k])||0));
 const dx=Math.min(Math.max(2,radius),rect.width/4),dy=Math.min(Math.max(2,radius),rect.height/4),owner=delegated?document.querySelector(delegated):null;
 const samples=[[rect.left+dx,rect.top+dy],[rect.right-dx,rect.top+dy],[rect.left+dx,rect.bottom-dy],[rect.right-dx,rect.bottom-dy],[rect.left+rect.width/2,rect.top+rect.height/2]].map(([x,y])=>{const hit=document.elementFromPoint(x,y);return {x,y,hit:hit?.id||hit?.tagName,owned:!!hit&&(e===hit||e.contains(hit)||owner===hit)};});
 return {ok:full&&samples.every(p=>p.owned),full,rect:box(rect),clip,ancestors,samples,delegatedOwner:delegated,focused:document.activeElement===e};
}'''
async def effective(page,selector,delegated=None):
    result=await page.locator(selector).evaluate(EFFECTIVE,delegated)
    assert result['ok'],(selector,result)
    return result
async def audit(page,label,measurements,focused=None):
    if focused:
        locator=page.locator(focused);await locator.scroll_into_view_if_needed()
    rows={}
    for selector in ['#roll-scroll','#velocity','#motion-sequence-context','#part-title']:
        rows[selector]=await effective(page,selector)
    if focused:
        rows[focused]=await effective(page,focused,'#motion-grid' if 'data-motion-step' in focused else None)
        if focused in ['#motion-value','#motion-step']:
            rows[focused+' label']=await locator.locator('..').evaluate(EFFECTIVE,None)
            assert rows[focused+' label']['ok'],rows[focused+' label']
    measurements.append({'state':label,'targets':rows,'geometry':await geometry(page)})
async def touch(client,kind,points):
    await client.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':points})
async def center(locator,identity):
    await locator.scroll_into_view_if_needed();r=await locator.bounding_box();assert r
    return {'id':identity,'x':r['x']+r['width']/2,'y':r['y']+r['height']/2}
async def touch_study(page,client,expected):
    grid=page.locator('#motion-grid');r=await grid.bounding_box();assert r
    a={'id':1,'x':r['x']+r['width']*2.5/16,'y':r['y']+r['height']/2}
    b={'id':1,'x':r['x']+r['width']*3.5/16,'y':r['y']+r['height']/4}
    await touch(client,'touchStart',[a]);await touch(client,'touchMove',[b]);await touch(client,'touchEnd',[])
    state=await f.draft_state(page);assert state['motion']['values'][2]==64 and state['motion']['values'][3]==95 and state['motion']['values'][9]==77
    await page.locator('#undo').click();assert (await f.draft_state(page))['motion']['values']==expected
    # Two actual roll touches navigate (including canceling the initial note preview).
    viewport=page.locator('#roll-scroll');r=await viewport.bounding_box();before=await viewport.evaluate('e=>({x:e.scrollLeft,y:e.scrollTop})');notes=(await f.draft_state(page))['notes']
    p={'id':3,'x':r['x']+r['width']*.35,'y':r['y']+r['height']*.45};q={'id':4,'x':r['x']+r['width']*.65,'y':r['y']+r['height']*.45}
    await touch(client,'touchStart',[p]);await touch(client,'touchStart',[p,q]);await touch(client,'touchMove',[{**p,'y':p['y']+24},{**q,'y':q['y']+24}]);await touch(client,'touchEnd',[])
    after=await viewport.evaluate('e=>({x:e.scrollLeft,y:e.scrollTop})');assert after!=before,('real two-touch pan must move the roll',before,after)
    state=await f.draft_state(page);assert state['notes']==notes and state['motion']['values']==expected
    return {'drawing':'real CDP touch points3=64,4=95 then one Undo','panBefore':before,'panAfter':after}
async def cross_surfaces(page,client,expected):
    results=[]
    for first,second in [('motion','roll'),('motion','lane'),('roll','motion'),('lane','motion')]:
        before=await f.draft_state(page)
        # Focus the real note so browser scrolling exposes its actual hit rectangle.
        note=page.locator('#roll-grid [data-note]').first;await note.focus();await note.scroll_into_view_if_needed()
        lane=page.locator('#velocity [data-lane-step]:not(:disabled)').first;grid=page.locator('#motion-grid');r=await grid.bounding_box()
        points={'motion':{'id':11,'x':r['x']+r['width']*2.5/16,'y':r['y']+r['height']/2},'roll':await center(note,11),'lane':await center(lane,11)}
        a=points[first];b={**points[second],'id':12};original=await (grid.locator('[data-motion-step="2"]') if first=='motion' else note if first=='roll' else lane).get_attribute('aria-label')
        await touch(client,'touchStart',[a])
        moved={**a,'x':a['x']+(18 if first=='roll' else 0),'y':a['y']-(12 if first!='roll' else 0)}
        await touch(client,'touchMove',[moved])
        preview=await (grid.locator('[data-motion-step="2"]') if first=='motion' else note if first=='roll' else lane).get_attribute('aria-label')
        assert preview!=original,('first surface must have meaningful preview',first,original,preview)
        await touch(client,'touchStart',[moved,b])
        # Continue both fingers after cancellation to detect stale capture resurrection.
        await touch(client,'touchMove',[{**moved,'x':moved['x']+5},{**b,'y':b['y']-5}]);await touch(client,'touchEnd',[])
        await page.wait_for_function('motionCaptured.size===0')
        after=await f.draft_state(page);assert after['notes']==before['notes'] and after['motion']['values']==expected,(first,second,before,after)
        # No command was added: the very next Undo removes the earlierpoint10=77.
        await page.locator('#undo').click();assert (await f.draft_state(page))['motion']['values']==[None]*16;await expect(page.locator('#undo')).to_be_disabled()
        await page.locator('#redo').click();assert (await f.draft_state(page))['motion']['values']==expected
        results.append({'first':first,'second':second,'original':original,'preview':preview,'capturesAfter':await page.evaluate('motionCaptured.size'),'nextUndo':'earlier point10 only'})
    return results
async def feedback_resize(page,out,width,height,measurements):
    before=await geometry(page)
    # Genuine save feedback, then genuine invalid-file error; no injected status text.
    await f.draft_state(page);await audit(page,'download-feedback',measurements,'#motion-value')
    assert (await geometry(page))['#roll-scroll']==before['#roll-scroll']
    await page.locator('#draft-file').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':b'{'})
    await expect(page.locator('#draft-dialog')).to_be_visible();await effective(page,'#draft-cancel');await effective(page,'#draft-preview')
    await page.screenshot(path=str(out/f'{width}x{height}-actual-import-error.png'));await page.locator('#draft-cancel').click()
    await audit(page,'error-dismissed',measurements,'#motion-value');assert (await geometry(page))['#roll-scroll']==before['#roll-scroll']
    # Scroll each real container to its ends, then focus every Motion action/field.
    for selector in ['#workspace-main','#other-view']:
        await page.locator(selector).evaluate('e=>{e.scrollTop=e.scrollHeight;e.scrollLeft=e.scrollWidth}')
    for selector in ['#motion-step','#motion-value','#motion-clear','#motion-undo','#motion-redo','[data-motion-step="9"]']:
        await page.locator(selector).focus();await expect(page.locator(selector)).to_be_focused();await audit(page,'scrolled-focus '+selector,measurements,selector)
    await page.screenshot(path=str(out/f'{width}x{height}-scrolled-focused.png'))
    for w,h in SIZES+[ (width,height) ]:
        await page.locator('#motion-value').focus();await page.set_viewport_size({'width':w,'height':h});await page.wait_for_timeout(100)
        await expect(page.locator('#motion-value')).to_be_focused();await expect(page.locator('#motion-value')).to_have_value('77')
        # Programmatic scrolling serves only reachability; it cannot satisfy a
        # failed clipping/hit assertion because all core targets are rechecked.
        await audit(page,f'resize {w}x{h}',measurements,'#motion-value')
        widths=await page.evaluate("[document.querySelector('#roll-grid').getBoundingClientRect().width,document.querySelector('#velocity .lane-track').getBoundingClientRect().width,document.querySelector('#beat-ruler .ruler-track').getBoundingClientRect().width]")
        assert max(widths)-min(widths)<1,widths

async def run(origin,out,baseline):
    f.ORIGIN=origin
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(chromium_sandbox=True)
        try:
            for width,height in SIZES:
                context=await browser.new_context(viewport={'width':width,'height':height},accept_downloads=True,has_touch=True);page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                measurements=[]
                await page.add_init_script("window.motionCaptured=new Set();addEventListener('gotpointercapture',e=>motionCaptured.add(e.pointerId));addEventListener('lostpointercapture',e=>motionCaptured.delete(e.pointerId));window.motionNativeWrites=0;window.motionMidiCalls=0;const post=MessagePort.prototype.postMessage;MessagePort.prototype.postMessage=function(m,...rest){if(['controls','sound-controls','buttons','keys','turn'].includes(m?.type))motionNativeWrites++;return post.call(this,m,...rest)};navigator.requestMIDIAccess=()=>{motionMidiCalls++;throw Error('No devices')};")
                try:
                    await page.goto(origin+'/remote/',wait_until='networkidle');await enter(page)
                    initial=await geometry(page);await page.screenshot(path=str(out/f'{width}x{height}-unset.png'))
                    if baseline:
                        (out/f'{width}x{height}-baseline.json').write_text(json.dumps({'viewport':[width,height],'geometry':initial,'target':await page.locator('#part-title').text_content(),'pageErrors':errors},indent=2)+'\n');continue
                    await expect(page.locator('#roll-view')).to_be_visible();await expect(page.locator('#velocity')).to_be_visible();await expect(page.locator('#motion-sequence-context')).to_have_text('Sequence · Bass A / CHICAGO · Draft');await expect(page.locator('#part-title')).to_have_text('MIAMI Wave')
                    for selector in ['#roll-scroll','#velocity','#motion-grid','#motion-value','#motion-sequence-context']:
                        r=initial[selector];assert r and r['x']>=0 and r['y']>=0 and r['right']<=width+1 and r['bottom']<=height+1,(selector,initial)
                    assert initial['#roll-scroll']['height']>=64 and initial['#velocity']['height']>=24
                    if width>height or width>=1000:assert initial['#roll-view']['right']<=initial['#other-view']['x']+1
                    else:assert initial['#roll-view']['bottom']<=initial['#other-view']['y']+1
                    await audit(page,'unset composition',measurements);assert await page.locator('[data-mode]:visible,.roll-tools,#inspector:visible').count()==0
                    notes=(await f.draft_state(page))['notes'];grid=page.locator('#motion-grid');steps=grid.locator('[data-motion-step]');await grid.focus()
                    for _ in range(9):await page.keyboard.press('Tab')
                    await expect(steps.nth(8)).to_be_focused();await page.keyboard.press('Enter');await expect(page.locator('#motion-step')).to_have_value('9');await expect(steps.nth(8)).to_be_focused();await audit(page,'Enter step9',measurements,'[data-motion-step="8"]')
                    await page.keyboard.press('Tab');await page.keyboard.press('Space');await expect(page.locator('#motion-step')).to_have_value('10');await expect(steps.nth(9)).to_be_focused();await audit(page,'Space step10',measurements,'[data-motion-step="9"]')
                    for _ in range(8):await page.keyboard.press('Tab')
                    await expect(page.locator('#motion-value')).to_be_focused();await audit(page,'focused Value',measurements,'#motion-value');await page.keyboard.type('77');await page.keyboard.press('Tab')
                    expected=[None]*16;expected[9]=77;saved=await f.draft_state(page);assert saved['motion']['values']==expected and saved['notes']==notes
                    await page.screenshot(path=str(out/f'{width}x{height}-point10-77.png'))
                    await page.locator('#undo').click();assert (await f.draft_state(page))['motion']['values']==[None]*16
                    await page.locator('#redo').click();assert (await f.draft_state(page))['motion']['values']==expected
                    # Existing sequence and thin lane remain actual independent Draft editors.
                    note=page.locator('#roll-grid [data-note]').first;await note.press('ArrowUp');state=await f.draft_state(page);assert state['notes']!=notes and state['motion']['values']==expected
                    await page.locator('#undo').click();state=await f.draft_state(page);assert state['notes']==notes and state['motion']['values']==expected
                    lane=page.locator('#velocity [data-lane-step]:not(:disabled)').first;await lane.press('ArrowUp');state=await f.draft_state(page);assert state['notes']!=notes and state['motion']['values']==expected
                    await page.locator('#undo').click();assert (await f.draft_state(page))['notes']==notes
                    client=await context.new_cdp_session(page);touchProof=await touch_study(page,client,expected);crossProof=await cross_surfaces(page,client,expected);await client.detach()
                    await page.locator('#motion-step').fill('10');await page.locator('#motion-step').press('Tab');await page.locator('#motion-clear').click();assert (await f.draft_state(page))['motion']['values']==[None]*16
                    await page.locator('#undo').click();assert (await f.draft_state(page))['motion']['values']==expected
                    await feedback_resize(page,out,width,height,measurements)
                    saved=await f.draft_state(page);await f.load_draft(page,saved);assert await f.draft_state(page)==saved
                    for part,label in [('miami','Bass B / MIAMI'),('drum909','909'),('drum808','808'),('breaks','BREAK'),('chicago','Bass A / CHICAGO')]:
                        await page.locator('[data-engine="'+part+'"]').click();await expect(page.locator('#motion-sequence-context')).to_have_text('Sequence · '+label+' · Draft');await expect(page.locator('#part-title')).to_have_text('MIAMI Wave');assert (await f.draft_state(page))['motion']['values']==expected
                        await audit(page,'selected-part '+part,measurements,'#motion-value')
                    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert await page.evaluate('motionMidiCalls===0&&motionNativeWrites===0');assert not errors,errors
                    receipt={'viewport':[width,height],'geometry':initial,'selectedContext':await page.locator('#motion-sequence-context').text_content(),'motionValues':expected,'notesSha256':hashlib.sha256(json.dumps(notes,sort_keys=True).encode()).hexdigest(),'midiCalls':0,'instrumentedNativeRequestTypes':['controls','sound-controls','buttons','keys','turn'],'instrumentedNativeRequestCount':0,'trafficScope':'only five frozen4758 request/input message types plus MIDI; not all traffic','effectiveVisibility':measurements,'realTouch':touchProof,'crossSurface':crossProof,'pageErrors':errors}
                    (out/f'{width}x{height}.json').write_text(json.dumps(receipt,indent=2)+'\n');await page.screenshot(path=str(out/f'{width}x{height}-selected-bass-b.png'));print(f'PASS actual Motion+sequence/thinlane/context/keyboard/pointer/history/exact roundtrip/MIDI0 {width}x{height}',flush=True)
                except BaseException as error:
                    (out/f'{width}x{height}-failure.json').write_text(json.dumps({'exception':str(error),'geometry':await geometry(page),'effectiveVisibility':measurements,'pageErrors':errors},indent=2)+'\n');await page.screenshot(path=str(out/f'{width}x{height}-failure.png'));raise
                finally:await context.close()
        finally:await browser.close()
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--site',type=Path);parser.add_argument('--capture-baseline',action='store_true');parser.add_argument('--evidence-dir',type=Path,default=ROOT/'.output/motion-composition');args=parser.parse_args();args.evidence_dir.mkdir(parents=True,exist_ok=True)
    if args.site:
        with core.server(args.site.resolve()) as origin:asyncio.run(run(origin,args.evidence_dir,args.capture_baseline))
    else:
        (ROOT/'.output').mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='motion-composition-',dir=ROOT/'.output') as site:
            subprocess.run(['node','scripts/build-product-site.mjs','--output',site],cwd=ROOT,check=True)
            with core.server(site) as origin:asyncio.run(run(origin,args.evidence_dir,args.capture_baseline))
