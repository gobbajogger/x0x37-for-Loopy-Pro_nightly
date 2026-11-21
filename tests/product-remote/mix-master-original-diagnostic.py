"""Original Mix-family failure diagnostic; observational instrumentation, no assertion correction."""
import argparse,asyncio,hashlib,importlib.util,json,os,subprocess,textwrap,time,traceback
from pathlib import Path
from playwright.async_api import async_playwright,expect

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def module(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def source_identity(root):
 head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip();assert head=='b378409fc57164e03533f89cf6af14fd16d04297',head
 names=subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0');return {'head':head,'files':{n:sha(root/n)for n in names if n and(root/n).is_file()}}
def runtime_identity(root):
 pin_path=root/'scripts/emulator-runtime-pin.json';pin=json.loads(pin_path.read_text());pin=pin.get('runtimePin',pin);runtime=Path(os.environ['DNBOX_EMULATOR_RUNTIME']);assert len(pin['files'])==10;rows={}
 for n,v in pin['files'].items():
  f=runtime/n;rows[n]={'bytes':f.stat().st_size,'sha256':sha(f)};assert rows[n]==v,(n,rows[n],v)
 return {'pinSHA256':sha(pin_path),'files':rows}

def children():
 rows=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   bits=(p/'stat').read_text().rsplit(')',1)[1].split();rows.append({'pid':int(p.name),'ppid':int(bits[1]),'start':bits[19]})
  except(OSError,ValueError,IndexError):pass
 owned={os.getpid()}
 for _ in range(16):owned.update(r['pid']for r in rows if r['ppid']in owned)
 return[r for r in rows if r['pid']in owned and r['pid']!=os.getpid()]
def remaining(rows):
 live=[]
 for r in rows:
  try:
   bits=Path('/proc',str(r['pid']),'stat').read_text().rsplit(')',1)[1].split()
   if bits[19]==r['start']and bits[0]!='Z':live.append(r)
  except(OSError,IndexError):pass
 return live

async def main(a):
 root=Path(a.root);site=Path(a.site);out=Path(a.out);out.mkdir(parents=True,exist_ok=False);assert not out.resolve().is_relative_to(root.resolve());rows=[]
 def record(r):rows.append(r);(out/'proof.json').write_text(json.dumps(rows,indent=2));print(json.dumps(r),flush=True)
 before=source_identity(root);runtime=runtime_identity(root);record({'stage':'before','codeSHA256':sha(__file__),'source':before,'runtime':runtime});original=root/'tests/product-remote/mix-family-browser.py';source=original.read_text();start=source.index('     before=await state(page)');end=source.index('     fresh=await state(page)',start);body=textwrap.dedent(source[start:end]);original_assert="assert values(restored).get(identity)==values(prior).get(identity,{'1:4:0:2':41,'1:6:0:12':95,'1:6:0:6':21,'1:6:0:13':64}[identity.split('|')[1]])";assert body.count(original_assert)==1
 body=body.replace('prior=await state(page);','prior=await state(page);await capture("prior",identity,prior,index,before);').replace('edited=await state(page);','edited=await state(page);await capture("edited",identity,edited,index,before);').replace('restored=await state(page);','restored=await state(page);await capture("restored",identity,restored,index,before);');assert original_assert in body
 (out/'original-body.py.txt').write_text(textwrap.dedent(source[start:end]));(out/'instrumented-body.py.txt').write_text(body);record({'stage':'original-fixture','path':str(original),'sha256':sha(original),'originalAssertion':original_assert,'instrumentation':'Only observational capture of already exported documents and existing DOM before original assertion; original preceding levels/sends/cancel sequence retained'})
 core=module('mix_diagnostic_core',root/'tests/product-remote/funkybeats-browser.py');core.SOURCE=site
 async def state(page):return await core.draft_state(page)
 async def mode(page,name):await page.locator('[data-mix-mode="'+name+'"]').click()
 def values(d):return {p['id']:p['value']for p in d['parameters']}
 namespace={};exec('async def journey(page,context,w,h,state,mode,values,ROOT,core,capture):\n'+textwrap.indent(body,' '),namespace)
 failed=False;observed=[];closed=False;last={};errors=[]
 async with async_playwright()as pw:
  browser=await pw.chromium.launch(chromium_sandbox=True)
  try:
   context=await browser.new_context(viewport={'width':1440,'height':900},has_touch=True);await context.route('**/*',core.serve);page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));await page.add_init_script('window.midiCalls=0;navigator.requestMIDIAccess=()=>{midiCalls++;throw Error("No devices")}');await page.goto(core.ORIGIN+'/remote/');await page.locator('[data-view="mix"]').click();await page.locator('.mixer-fader').first.wait_for()
   async def capture(stage,identity,document,index,initial):
    last.update({'identity':identity,'index':index});dom=await page.evaluate("""()=>({status:document.querySelector('#status')?.textContent,undo:!document.querySelector('#undo').disabled,redo:!document.querySelector('#redo').disabled,focus:document.activeElement?.outerHTML.slice(0,500),mode:[...document.querySelectorAll('[data-mix-mode]')].map(e=>({mode:e.dataset.mixMode,pressed:e.getAttribute('aria-pressed')})),inspector:{disabled:document.querySelector('#parameter-value')?.disabled,value:document.querySelector('#parameter-value')?.value,readout:document.querySelector('#parameter-readout')?.textContent},visibleControls:[...document.querySelectorAll('[data-param]')].filter(e=>e.getClientRects().length).map(e=>({id:e.dataset.param,label:e.getAttribute('aria-label'),output:e.querySelector('output')?.textContent}))})""")
    record({'stage':stage,'identity':identity,'index':index,'rawHasIdentity':identity in values(document),'rawValue':values(document).get(identity),'rawDocument':document,'initialDocument':initial,'DOM':dom})
   try:await namespace['journey'](page,context,1440,900,state,mode,values,out,core,capture)
   except Exception as e:
    failed=True;record({'stage':'original-failure','type':type(e).__name__,'failure':str(e),'traceback':traceback.format_exc()});await page.screenshot(path=str(out/'original-failure.png'))
    # Supplemental real UI evidence only AFTER the original assertion failed.
    if last:
     await mode(page,'levels');target=page.locator('[data-param="'+last['identity']+'"]');await target.press('Enter');record({'stage':'supplemental-effective-after-original-failure','identity':last['identity'],'fieldValue':await page.locator('#parameter-value').input_value(),'readout':await page.locator('#parameter-readout').text_content(),'targetOutput':await target.locator('output').text_content(),'undo':not await page.locator('#undo').is_disabled(),'redo':not await page.locator('#redo').is_disabled()})
     await page.locator('.overflow summary').click();await page.locator('#review').click();await expect(page.locator('#review-dialog')).to_be_visible();record({'stage':'supplemental-review-after-original-failure','text':await page.locator('#changes').text_content()});await page.keyboard.press('Escape')
     if await page.locator('.overflow').evaluate('e=>e.open'):await page.locator('.overflow summary').click()
     if not await page.locator('#redo').is_disabled():
      await page.locator('#redo').click();record({'stage':'supplemental-redo-after-original-failure','document':await state(page)});await page.locator('#undo').click();record({'stage':'supplemental-undo-after-redo','document':await state(page)})
   record({'stage':'browser-observations','pageErrors':errors,'midiCalls':await page.evaluate('midiCalls')});await context.close()
  finally:observed=children();await browser.close();closed=True
 after=source_identity(root);assert after==before;assert runtime_identity(root)==runtime;record({'stage':'after','sourceUnchanged':True,'runtimeAll10Unchanged':True})
 for _ in range(20):
  if not remaining(observed):break
  await asyncio.sleep(.1)
 live=remaining(observed);record({'stage':'terminal','originalAssertionFailed':failed,'browserClosed':closed,'remainingOwnedChildren':live});assert closed and not live
 if failed:raise AssertionError('Original Mix-family assertion reproduced; see exact captured values, no correction applied')

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--execute',action='store_true');p.add_argument('--root',required=True);p.add_argument('--site',required=True);p.add_argument('--out',required=True);a=p.parse_args();assert a.execute,'Explicit allocation required';asyncio.run(main(a))
