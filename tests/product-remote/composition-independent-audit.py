"""Independent R1 composition controller. Prepared only until explicit root release.

Uses actual product HTTP/files, native inputs/media and optional pinned WASM. No mocks
of model replies, fake observer packets, screenshot promotion or automatic retries.
"""
import argparse,asyncio,copy,hashlib,importlib.util,json,math,os,time,traceback
from pathlib import Path
from playwright.async_api import async_playwright,expect
SIZES=((1440,900),(390,844),(844,390))
PARTS=('drum909','drum808','chicago','miami','breaks');NAMES=('909','808','Bass A','Bass B','BREAK')
VOICES={'909':(36,38,41,45,50,37,39,42,46,49,51),'808':(36,38,41,45,50,37,39,56,49,46,42)}
PROTECTED=('remote/frame.mjs','remote/components.json','remote/catalog.json','remote/source-sounds.json','remote/sequence.mjs','remote/workspace.mjs','remote/draft-file.mjs','remote/vendor/funkybeats-core.mjs','sample-contract.json','sample-pin.mjs','starting-break-preview.mjs','components/break-panel/panel.mjs','components/break-panel/panel.css','components/break-audition/audition.mjs','components/break-picker/picker.mjs')
NATIVE_TRACE="""window.nativePackets=[];window.nativeFrames=[];window.nativeNodes=[];window.contexts=[];window.midiCalls=0;navigator.requestMIDIAccess=()=>{midiCalls++;throw Error('No devices')};const AC=AudioContext;window.AudioContext=class extends AC{constructor(...a){super(...a);contexts.push(this)}};const AW=AudioWorkletNode;window.AudioWorkletNode=class extends AW{constructor(...a){super(...a);nativeNodes.push(this);this.port.addEventListener('message',e=>{if(e.data?.type==='envelopes')nativePackets.push(e.data);if(e.data?.type==='frame')nativeFrames.push(e.data)});this.port.start()}};"""
def load_module(name,path):
 spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def other_domains(doc,*omit):return {k:v for k,v in doc.items()if k not in omit}
async def box(target,child=None):
 return await target.evaluate('''(host,child)=>{const e=child?host.querySelector(child):host;if(!e||!e.isConnected)throw Error('Measured target is not connected: '+child);const r=e.getBoundingClientRect(),s=getComputedStyle(e),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);let c={left:0,top:0,right:innerWidth,bottom:innerHeight};for(let a=e.parentElement;a;a=a.parentElement){const t=getComputedStyle(a),b=a.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(t.overflowX)){c.left=Math.max(c.left,b.left);c.right=Math.min(c.right,b.right)}if(/auto|scroll|hidden|clip/.test(t.overflowY)){c.top=Math.max(c.top,b.top);c.bottom=Math.min(c.bottom,b.bottom)}}return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,clip:c,fullVisible:r.left>=c.left-1&&r.right<=c.right+1&&r.top>=c.top-1&&r.bottom<=c.bottom+1,hit:hit===e||e.contains(hit),focused:e===document.activeElement,focusVisible:e.matches(':focus-visible'),outline:s.outlineWidth}}''',child)
async def menu_action(p,selector):
 if not await p.locator('.overflow').evaluate('e=>e.open'):await p.locator('.overflow summary').press('Enter')
 await p.locator(selector).press('Enter')
 if not await p.locator('dialog[open]').count()and await p.locator('.overflow').evaluate('e=>e.open'):await p.locator('.overflow summary').press('Enter')
def descendants():
 rows=[]
 for proc in Path('/proc').iterdir():
  if not proc.name.isdigit():continue
  try:
   raw=(proc/'stat').read_text();bits=raw[raw.rfind(')')+2:].split();rows.append({'pid':int(proc.name),'ppid':int(bits[1]),'state':bits[0],'start':bits[19],'cmd':(proc/'cmdline').read_bytes().replace(b'\0',b' ').decode(errors='replace')})
  except(OSError,ValueError,IndexError):pass
 owned={os.getpid()}
 for _ in range(16):owned.update(r['pid']for r in rows if r['ppid']in owned)
 return [r for r in rows if r['pid']in owned and r['pid']!=os.getpid()]
def remaining(children):
 alive=[]
 for row in children:
  try:
   raw=Path('/proc',str(row['pid']),'stat').read_text();bits=raw[raw.rfind(')')+2:].split()
   if bits[19]==row['start']and bits[0]!='Z':alive.append(row)
  except(OSError,ValueError,IndexError):pass
 return alive
async def viewport_clear(p):assert await p.evaluate('document.documentElement.scrollWidth<=innerWidth')
async def actual_tab(p,target,previous=None):
 if previous is not None:await previous.focus();await p.keyboard.press('Tab')
 await expect(target).to_be_focused();b=await box(target);assert b['fullVisible']and b['hit']and b['focusVisible'],b;return b
async def physical_tap(p,target,minimum=0):
 b=await box(target);assert b['fullVisible']and b['hit']and b['width']+1e-6>=minimum and b['height']+1e-6>=minimum,b
 await p.touchscreen.tap(b['x']+b['width']/2,b['y']+b['height']/2);return b
async def scroll_chain(target):
 return await target.evaluate("e=>{const rows=[];for(let a=e;a;a=a.parentElement)rows.push({tag:a.tagName,id:a.id,cls:a.className,x:a.scrollLeft,y:a.scrollTop,sw:a.scrollWidth,sh:a.scrollHeight,cw:a.clientWidth,ch:a.clientHeight});return rows}")
async def workspace_stable(p,width,original):
 # This guard is intentionally for NO-observer cases only.
 current=await p.locator('#other-view').evaluate('e=>[e.scrollLeft,e.scrollTop]')
 if width>600:assert current==original,('Whole clipped drum workspace scrolled instead of its bounded columns',original,current)
 return current
async def outer_surface(p,forward):
 """Find a real finger-sized non-control surface whose first Y scroller is outer.
 No hit styles, scroll offsets or DOM structure are altered. Every candidate's
 actual ancestry/touch-action is retained, including the rejected inner scrollers.
 """
 diagnostic=await p.locator('#other-view').evaluate("""(outer,forward)=>{
 const r=outer.getBoundingClientRect(),left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom),candidates=[];
 function inspect(x,y){const hit=document.elementFromPoint(x,y),ancestors=[];let firstY=null,allowed=true,interactive=false;for(let a=hit;a;a=a.parentElement){const s=getComputedStyle(a);ancestors.push({tag:a.tagName,id:a.id,cls:typeof a.className==='string'?a.className:'',touchAction:s.touchAction,overflowY:s.overflowY,overscrollY:s.overscrollBehaviorY,scrollTop:a.scrollTop,clientHeight:a.clientHeight,scrollHeight:a.scrollHeight});if(a.matches('button,input,select,textarea,a,[role="slider"]'))interactive=true;if(s.touchAction==='none'||s.touchAction==='pan-x'||s.touchAction==='pan-left'||s.touchAction==='pan-right')allowed=false;if(!firstY&&/auto|scroll/.test(s.overflowY)&&a.scrollHeight>a.clientHeight+1)firstY=a;if(a===outer)break;}return{hit:hit?.outerHTML.slice(0,220),ancestors,eligible:!!hit&&outer.contains(hit)&&firstY===outer&&allowed&&!interactive};}
 const ys=[];for(let y=top+24;y<=bottom-24;y+=40)ys.push(y);if(forward)ys.reverse();
 for(const y of ys)for(let x=left+24;x<=right-24;x+=40){const endY=forward?Math.max(top+24,y-160):Math.min(bottom-24,y+160);if(Math.abs(endY-y)<40)continue;const center=inspect(x,y),patch=[];for(const dx of[-20,0,20])for(const dy of[-20,0,20])patch.push(inspect(x+dx,y+dy));const eligible=center.eligible&&patch.every(q=>q.eligible);candidates.push({x,y,endY,patchSize:40,eligible,center,patch});if(eligible)return{chosen:candidates.length-1,candidates,outer:{x:outer.scrollLeft,y:outer.scrollTop,rect:r.toJSON()}};}
 return{chosen:null,candidates,outer:{x:outer.scrollLeft,y:outer.scrollTop,rect:r.toJSON()}};
 }""",forward)
 assert diagnostic['chosen']is not None,('No usable40px outer-scroll surface; potential product touch usability defect',diagnostic)
 chosen=diagnostic['candidates'][diagnostic['chosen']];return (chosen['x'],chosen['y']),(chosen['x'],chosen['endY']),diagnostic

async def drag(p,container,axis,forward=True):
 """Real touch on the visible gutter/header; never assigns scrollTop/scrollLeft."""
 b=await box(container)
 if min(b['right'],b['clip']['right'])-max(b['x'],b['clip']['left'])<=8 or min(b['bottom'],b['clip']['bottom'])-max(b['y'],b['clip']['top'])<=8:container=p.locator('#other-view');b=await box(container)
 c=b['clip'];left=max(b['x'],c['left']);right=min(b['right'],c['right']);top=max(b['y'],c['top']);bottom=min(b['bottom'],c['bottom']);assert right>left+8 and bottom>top+8,b
 if axis=='x':a=(right-4,top+4);z=(left+4,top+4)
 else:a=(left+3,bottom-4);z=(left+3,top+4)
 if not forward:a,z=z,a
 surface=None
 if await container.get_attribute('id')=='other-view'and axis=='y':a,z,surface=await outer_surface(p,forward)
 hit=await p.evaluate('([x,y])=>document.elementFromPoint(x,y)?.outerHTML.slice(0,180)',a)
 before=await container.evaluate('e=>({x:e.scrollLeft,y:e.scrollTop,sw:e.scrollWidth,sh:e.scrollHeight,cw:e.clientWidth,ch:e.clientHeight})');before_chain=await scroll_chain(container);client=await p.context.new_cdp_session(p);base=time.time()
 try:
  await client.send('Input.dispatchTouchEvent',{'type':'touchStart','timestamp':base,'touchPoints':[{'id':1,'x':a[0],'y':a[1]}]})
  for fraction in [.25,.5,.75,1]:await client.send('Input.dispatchTouchEvent',{'type':'touchMove','timestamp':base+fraction*.4,'touchPoints':[{'id':1,'x':a[0]+(z[0]-a[0])*fraction,'y':a[1]+(z[1]-a[1])*fraction}]})
  await client.send('Input.dispatchTouchEvent',{'type':'touchMove','timestamp':base+.8,'touchPoints':[{'id':1,'x':z[0],'y':z[1]}]});await client.send('Input.dispatchTouchEvent',{'type':'touchEnd','timestamp':base+.82,'touchPoints':[]});await p.wait_for_timeout(100)
 finally:await client.detach()
 after=await container.evaluate('e=>({x:e.scrollLeft,y:e.scrollTop})');after_chain=await scroll_chain(container);return {'axis':axis,'before':before,'after':after,'beforeAncestors':before_chain,'afterAncestors':after_chain,'anyNativeScroll':any(a[axis]!=b[axis]for a,b in zip(before_chain,after_chain)),'startHit':hit,'start':a,'end':z,'outerSurfaceDiagnostic':surface}
async def axis_wheel_roundtrip(p,container,axis):
 """Measured pure-axis motion and return; a previously inherited offset is not proof."""
 before=await container.evaluate('e=>({x:e.scrollLeft,y:e.scrollTop,maxX:e.scrollWidth-e.clientWidth,maxY:e.scrollHeight-e.clientHeight})');maximum=before['maxX'if axis=='x'else'maxY'];chains_before=await scroll_chain(container)
 if maximum<=1:return {'axis':axis,'needed':False,'before':before,'ancestorsBefore':chains_before}
 b=await box(container);x=max(b['x'],b['clip']['left'])+3;y=max(b['y'],b['clip']['top'])+3;assert x<min(b['right'],b['clip']['right'])and y<min(b['bottom'],b['clip']['bottom']),b
 start=before[axis];direction=1 if maximum-start>1 else-1;surface=None
 if await container.get_attribute('id')=='other-view'and axis=='y':
  a,_,surface=await outer_surface(p,direction>0);x,y=a
 amount=min(300,maximum-start if direction>0 else start);goal=start+direction*amount;node=await container.element_handle();await p.mouse.move(x,y);await p.mouse.wheel(direction*amount if axis=='x'else 0,direction*amount if axis=='y'else 0)
 await p.wait_for_function("o=>{const v=o.node[o.axis==='x'?'scrollLeft':'scrollTop'];return Math.abs(v-o.goal)<=.5&&o.direction*(v-o.start)>.5}",arg={'node':node,'axis':axis,'goal':goal,'direction':direction,'start':start})
 forward=await container.evaluate('e=>({x:e.scrollLeft,y:e.scrollTop})');chains_forward=await scroll_chain(container);other='y'if axis=='x'else'x';assert abs(forward[other]-before[other])<=1,(axis,'Cross-axis movement',before,forward)
 await p.mouse.wheel(start-forward[axis]if axis=='x'else 0,start-forward[axis]if axis=='y'else 0);await p.wait_for_function("o=>Math.abs(o.node[o.axis==='x'?'scrollLeft':'scrollTop']-o.start)<=.5",arg={'node':node,'axis':axis,'start':start});returned=await container.evaluate('e=>({x:e.scrollLeft,y:e.scrollTop})');assert abs(returned[other]-before[other])<=1
 return {'axis':axis,'needed':True,'before':before,'forward':forward,'measuredDelta':forward[axis]-start,'returned':returned,'ancestorsBefore':chains_before,'ancestorsForward':chains_forward,'ancestorsReturn':await scroll_chain(container),'inputDelta':[direction*amount if axis=='x'else 0,direction*amount if axis=='y'else 0],'outerSurfaceDiagnostic':surface}
async def keyboard_grid(p):
 cells=p.locator('[data-drum-note]');await expect(cells).to_have_count(176);await cells.nth(1).focus();await p.keyboard.press('Shift+Tab');visited=set();proof=[];limit=await p.locator('.drum-layout button,.drum-layout input,.drum-layout select').count()+1
 for _ in range(limit):
  active=await p.evaluate("()=>{const e=document.activeElement;return e.matches('[data-drum-note]')?{track:e.dataset.drumTrack,note:e.dataset.drumNote,start:e.dataset.drumStart}:null}")
  if active:
   key=tuple(active.values());target=p.locator(f'[data-drum-track="{active["track"]}"][data-drum-note="{active["note"]}"][data-drum-start="{active["start"]}"]');g=await actual_tab(p,target);assert g['width']+1e-6>=40 and g['height']+1e-6>=40;visited.add(key);proof.append(g)
   if len(visited)==176:break
  await p.keyboard.press('Tab')
 assert len(visited)==176,('Not all grid steps keyboard reachable',len(visited));return proof

async def physical_reveal(p,target,scroll,axis,child=None):
 """Bound gestures from actual content span, fail if a clipped target cannot be panned."""
 def axis_visible(b):return (b['x']>=b['clip']['left']-1 and b['right']<=b['clip']['right']+1)if axis=='x'else(b['y']>=b['clip']['top']-1 and b['bottom']<=b['clip']['bottom']+1)
 attempts=[];b=await box(target,child)
 if axis_visible(b):return attempts
 chain=await scroll_chain(scroll);s=await box(scroll);span=max((r['sw']-r['cw']if axis=='x'else r['sh']-r['ch'])for r in chain);visible=(min(s['right'],s['clip']['right'])-max(s['x'],s['clip']['left']))if axis=='x'else(min(s['bottom'],s['clip']['bottom'])-max(s['y'],s['clip']['top']))
 if visible<=8:
  v=await box(p.locator('#other-view'));visible=(min(v['right'],v['clip']['right'])-max(v['x'],v['clip']['left']))if axis=='x'else(min(v['bottom'],v['clip']['bottom'])-max(v['y'],v['clip']['top']))
 limit=max(1,math.ceil(max(0,span)/max(1,visible-8))+2)
 for _ in range(limit):
  forward=b['right']>b['clip']['right']+1 if axis=='x'else b['bottom']>b['clip']['bottom']+1
  d=await drag(p,scroll,axis,forward);attempts.append(d);b=await box(target,child)
  if axis_visible(b):return attempts
  if not d['anyNativeScroll']:break
 raise AssertionError(('Physical pan cannot reach clipped target',b,attempts))
async def activate_inspector(p,sound):
 """Select a real parameter with keyboard; selection itself must not edit Draft."""
 select=sound.locator('#sound-voice');await select.focus();await p.keyboard.press('Tab');hits=sound.locator('.source-hit');source=await actual_tab(p,hits.first);await p.keyboard.press('Enter');value=sound.locator('#parameter-value');await expect(value).to_be_enabled();await expect(sound.locator('#parameter-inspector')).to_be_visible()
 # Return to source target so physical reach isn't satisfied by focusing the field.
 await hits.first.focus();return {'sourceKeyboardActivation':source,'parameterId':await hits.first.get_attribute('data-param')}

async def lane_reach(p):
 """Whole lane may exceed viewport; actual controls must each fit and be reachable."""
 lane=p.locator('.drum-step-lane');scroll=p.locator('.funkybeats-sequencer');outer=p.locator('#other-view');b=await box(lane);assert 48-1e-6<=b['height']<=49,('Thin lane height changed',b)
 cycle=lane.locator('[data-lane-cycle]');steps=lane.locator('[data-lane-step]');await expect(steps).to_have_count(16);await expect(steps.last).to_be_enabled();targets=[cycle,steps.last,cycle];samples=[];offsets=[]
 for target in targets:
  vertical=await physical_reveal(p,target,outer,'y');horizontal=await physical_reveal(p,target,scroll,'x');g=await box(target);assert g['fullVisible']and g['hit']and g['width']+1e-6>=40 and g['height']+1e-6>=40,('Lane control clipped/small',g);offsets.append(await scroll.evaluate('e=>e.scrollLeft'));samples.append({'target':await target.get_attribute('data-lane-step'),'physicalY':vertical,'physicalX':horizontal,'box':g})
 maximum=await scroll.evaluate('e=>e.scrollWidth-e.clientWidth')
 if maximum>1:assert offsets[1]-offsets[0]>.5 and abs(offsets[2]-offsets[0])<=1,('Lane real horizontal forward/return missing',offsets,maximum)
 await cycle.focus();await p.keyboard.press('Shift+Tab');await p.keyboard.press('Tab');keyboard=[await actual_tab(p,cycle)];enabled=lane.locator('[data-lane-step]:not(:disabled)')
 for index in range(await enabled.count()):
  await p.keyboard.press('Tab');target=enabled.nth(index);g=await actual_tab(p,target);assert g['width']+1e-6>=40 and g['height']+1e-6>=40,('Lane keyboard target budget',g);keyboard.append(g)
 return {'intentionalWholeWidth':b['width'],'thinHeight':b['height'],'samples':samples,'actualXOffsets':offsets,'enabledKeyboardControls':keyboard}

class Audit:
 def __init__(self,a):
  self.a=a;self.out=Path(a.out);self.out.mkdir(parents=True,exist_ok=True);self.root=Path(a.root);self.site=Path(a.site);self.base=Path(a.base_root);self.base_site=Path(a.base_site);self.rows=[];self.failures=[];self.manifest=json.loads(Path(a.manifest).read_text());self.core=load_module('composition_existing_browser',self.root/'tests/product-remote/funkybeats-browser.py');self.server=load_module('composition_actual_server',self.root/'tests/product-remote/envelope-browser.py');self.components=json.loads((self.site/'remote/components.json').read_text());self.contract=json.loads((self.site/'sample-contract.json').read_text());self.end_sample=json.loads((self.site/'remote/trace.json').read_text())['endSample']
 def record(self,row):self.rows.append(row);(self.out/'proof.json').write_text(json.dumps(self.rows,indent=2));print(json.dumps(row),flush=True)
 def freeze(self,stage):
  actual={name:digest(self.root/name)for name in self.manifest['files']};mismatch=[name for name,e in self.manifest['files'].items()if actual[name]!=(e.get('sha256')if isinstance(e,dict)else e)];self.record({'stage':stage,'sourceHashes':actual,'mismatches':mismatch});assert not mismatch
 def runtime_identity(self,stage):
  pin_path=self.root/'scripts/emulator-runtime-pin.json';pin=json.loads(pin_path.read_text());pin=pin.get('runtimePin',pin);assert len(pin['files'])==10,('Expected supplied4758ten-file pin',pin_path)
  runtime=Path(os.environ['DNBOX_EMULATOR_RUNTIME']);rows=[]
  for name,item in pin['files'].items():
   file=runtime/name;row={'name':name,'bytes':file.stat().st_size,'sha256':digest(file)};rows.append(row);assert row['bytes']==item['bytes']and row['sha256']==item['sha256'],('Frozen runtime input differs',row,item)
  self.record({'stage':'runtime-'+stage,'pinPath':str(pin_path),'pinSHA256':digest(pin_path),'runtimeRoot':str(runtime),'runtimeAll10FilesMatch':True,'files':rows})
 def protected(self):
  names=list(PROTECTED)+['assets/starting-breaks/'+asset['id']+'.wav'for asset in self.contract['assets']];rows=[]
  for name in names:
   b=self.base/'web/product-site'/name;c=self.root/'web/product-site'/name;rows.append({'path':name,'base':digest(b),'candidate':digest(c)});assert rows[-1]['base']==rows[-1]['candidate'],rows[-1]
  for asset in self.contract['assets']:
   p=self.site/'assets/starting-breaks'/f'{asset["id"]}.wav';assert p.stat().st_size==asset['preview_bytes']and digest(p)==asset['preview_sha256']
  self.record({'stage':'protected-source-and-authorized-assets','files':rows,'fiveAssets':len(self.contract['assets']),'baseGate':'not inferred from product checks'})
 async def picture(self,p,name):await p.screenshot(path=str(self.out/(name+'.png')))
 async def doc(self,p):return await self.core.draft_state(p)
 async def fresh(self,browser,origin,size,name,callback):
  c=await browser.new_context(viewport={'width':size[0],'height':size[1]},has_touch=True);p=await c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));await p.add_init_script(NATIVE_TRACE)
  try:
   await p.goto(origin+'/remote/');await expect(p.locator('main')).to_have_attribute('aria-busy','false');await callback(p,size);assert not errors,errors;await viewport_clear(p);assert await p.evaluate('midiCalls===0')
   if name!='native-909-envelope':assert await p.evaluate('contexts.length===0&&nativeNodes.length===0'),'Unexpected native/generated AudioContext in Draft/audition case'
   self.record({'case':name,'size':size,'complete':True,'pageErrors':errors,'midiCalls':0})
  except Exception as e:
   item={'case':name,'size':size,'failure':str(e),'traceback':traceback.format_exc(),'pageErrors':errors}
   try:
    item['failureDOM']=await p.evaluate("""()=>({focus:document.activeElement?.outerHTML.slice(0,500),targets:[...document.querySelectorAll('#other-view,.drum-layout,.drum-grid-panel,.funkybeats-sequencer,.sequencer-grid,.drum-step-lane,[data-lane-cycle],.drum-sound-panel,#parameter-inspector,#parameter-value,#native-envelopes,.envelope-graph,#part-title')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return{tag:e.tagName,id:e.id,cls:typeof e.className==='string'?e.className:'',rect:r.toJSON(),display:s.display,visibility:s.visibility,disabled:e.disabled,touchAction:s.touchAction,overflowX:s.overflowX,overflowY:s.overflowY,scrollLeft:e.scrollLeft,scrollTop:e.scrollTop,scrollWidth:e.scrollWidth,scrollHeight:e.scrollHeight,clientWidth:e.clientWidth,clientHeight:e.clientHeight}})})""")
   except Exception as diagnostic_error:item['failureDOMError']=str(diagnostic_error)
   self.failures.append(item);self.record(item)
   try:await self.picture(p,f'failure-{name}-{size[0]}x{size[1]}')
   except Exception as error:self.record({'case':name,'failureScreenshotError':str(error)})
  finally:
   # Real loader must be stopped before context closure, including failed native cases.
   if not p.is_closed()and await p.evaluate('window.contexts?.some(c=>c.state!=="closed")??false'):
    try:await menu_action(p,'#emulator-stop');await p.wait_for_function('contexts.every(c=>c.state==="closed")')
    except Exception as e:self.record({'case':name,'cleanupFailure':str(e)})
   await c.close()
 async def baseline(self,p,size):
  w,h=size;await p.locator('[data-engine="drum909"]').click();await menu_action(p,'[data-view="drums"]');grid=await box(p.locator('.funkybeats-sequencer'));sound=await box(p.locator('.source-scene'));adjacent=grid['right']<=sound['x']+1 and min(grid['bottom'],sound['bottom'])>max(grid['y'],sound['y']);await self.picture(p,f'baseline-drums-{w}x{h}')
  d=await self.doc(p);d['context']['part']='miami';d['context']['view']='patterns';d['soundBanks'][1]='JUNO';d['launch']=[None]*5;await self.core.load_draft(p,d);count=await p.locator('[data-launch-part]').count();first=await p.locator('[data-launch-part]').first.get_attribute('data-launch-part');await p.locator('[data-launch-part="3"][data-pattern="31"]').click();target=(await self.doc(p))['launch'][3];title=await p.locator('#part-title').inner_text();await self.picture(p,f'baseline-patterns-{w}x{h}')
  await p.locator('[data-engine="breaks"]').click();await p.locator('[data-view="roll"]').click();await expect(p.locator('#break-sequence .break-rows li')).to_have_count(5);rows=await p.locator('#break-sequence .break-rows li').evaluate_all('es=>es.map(e=>e.getBoundingClientRect().toJSON())');await self.picture(p,f'baseline-break-{w}x{h}');assert count==160 and first=='0'and target==31
  if w>600:assert not adjacent and len({r['y']for r in rows})==5
  self.record({'case':'baseline-observation','size':size,'drumAdjacent':adjacent,'grid':grid,'sound':sound,'choices':count,'firstPart':first,'BassBTarget':target,'title':title,'previewRows':rows,'portraitStackListIntentional':w<=600})
 async def header(self,p,size,phase):
  title=p.locator('#part-title');data=await title.evaluate('''e=>{const range=document.createRange();range.selectNodeContents(e);const r=e.getBoundingClientRect(),rects=[...range.getClientRects()].filter(x=>x.width&&x.height);return{text:e.textContent,box:r.toJSON(),textRects:rects.map(x=>x.toJSON()),textFits:rects.every(x=>x.left>=r.left-1&&x.right<=r.right+1&&x.top>=r.top-1&&x.bottom<=r.bottom+1),wrappedLines:new Set(rects.map(x=>x.top)).size,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}}''');controls={s:await box(p.locator(s))for s in ['#play','#stop','#rec','#part-title','#undo','#redo','.overflow summary']};result={'case':'patterns-header','size':size,'phase':phase,'title':data,'controls':controls,'engineRow':await box(p.locator('.engines')),'editor':await box(p.locator('main')),'partAndTransportOverlapY':min(controls['#part-title']['bottom'],controls['#play']['bottom'])>max(controls['#part-title']['y'],controls['#play']['y']),'partAndHistoryOverlapY':min(controls['#part-title']['bottom'],controls['#undo']['bottom'])>max(controls['#part-title']['y'],controls['#undo']['y']),'fit':data['textFits']and all(b['fullVisible']and b['hit']for b in controls.values())};self.record(result);return result
 async def author_right_edge_baseline(self,p,kit,voices,size):
  # Authentic setup before scenario baseline, not a claim that Undo empties history.
  assert await p.evaluate('contexts.length===0&&nativeNodes.length===0')
  await p.locator('[data-engine="drum'+kit+'"]').click();await menu_action(p,'[data-view="drums"]');rows=[]
  for voice in voices:
   select=p.locator('#sound-voice');await select.focus();await select.press('Home')
   for _ in range(voice):await select.press('ArrowDown')
   await expect(select).to_have_value(str(voice));last=p.locator('#drum-lane [data-lane-step]').last;disabled=await last.is_disabled();marker={'disabled':disabled,'box':await box(last),'pointerEvents':await last.evaluate('e=>getComputedStyle(e).pointerEvents')}
   if disabled:
    assert marker['pointerEvents']=='none',('Disabled-slot behavior changed',marker);hit=p.locator(f'[data-drum-note="{VOICES[kit][voice]}"]').last;await expect(hit).to_have_attribute('aria-pressed','false');await hit.focus();await hit.press('Space');await expect(hit).to_have_attribute('aria-pressed','true')
   await expect(p.locator('#drum-lane [data-lane-step]').last).to_be_enabled();rows.append({'voice':voice,'initialSlot':marker,'authoredOneRightmostNote':disabled})
  self.record({'case':'authored-right-edge-setup','size':size,'kit':kit,'beforeScenarioBaseline':True,'history':'Real setup edits may leave Undo; scenario edit/Undo checks use the subsequent authored baseline','voices':rows})

 async def drum(self,p,size,kit):
  w,h=size;await p.locator('[data-engine="drum'+kit+'"]').click();await menu_action(p,'[data-view="drums"]');cells=p.locator('[data-drum-note]');await expect(cells).to_have_count(176);identities=await cells.evaluate_all('es=>es.map(e=>{const r=e.getBoundingClientRect();return{track:e.dataset.drumTrack,note:Number(e.dataset.drumNote),start:Number(e.dataset.drumStart),width:r.width,height:r.height}})');assert len({(c['track'],c['note'],c['start'])for c in identities})==176;assert all(c['track']=='drum'+kit and c['note']in VOICES[kit]and c['width']+1e-6>=40 and c['height']+1e-6>=40 for c in identities);assert all(sum(c['note']==note for c in identities)==16 for note in VOICES[kit])
  grid=p.locator('.drum-grid-panel');sound=p.locator('.drum-sound-panel');g,s=await box(grid),await box(sound);outer_before=await p.locator('#other-view').evaluate('e=>[e.scrollLeft,e.scrollTop]');assert not await p.locator('#native-envelopes').is_visible();outer_policy=await p.locator('#other-view').evaluate('e=>({x:getComputedStyle(e).overflowX,y:getComputedStyle(e).overflowY})')
  if w>600:assert outer_policy['y']in ['hidden','clip'],('No-observer editor must not use native-observer outer scroll policy',outer_policy)
  if w>600:assert g['right']<=s['x']+1 and min(g['bottom'],s['bottom'])>max(g['y'],s['y'])
  else:assert g['bottom']<=s['y']+1
  # First prove native physical scrolling without scrollIntoView or focused-node rescue.
  scroll=p.locator('.funkybeats-sequencer');row_scroll=p.locator('.sequencer-grid');last=cells.last;horizontal=await physical_reveal(p,last,scroll,'x');vertical=await physical_reveal(p,last,row_scroll,'y');assert(await box(last))['fullVisible'];await workspace_stable(p,w,outer_before);wheel_x=await axis_wheel_roundtrip(p,scroll,'x');wheel_y=await axis_wheel_roundtrip(p,row_scroll,'y')
  if w>600:
   for wheel in [wheel_x,wheel_y]:
    for phase in ['ancestorsForward','ancestorsReturn']:
     for ancestor in wheel.get(phase,[]):
      if ancestor['id']=='other-view':assert [ancestor['x'],ancestor['y']]==outer_before,('No-observer wheel displaced whole workspace',wheel)
  await workspace_stable(p,w,outer_before);await physical_tap(p,last,40);await p.locator('#undo').click();await workspace_stable(p,w,outer_before)
  await self.author_right_edge_baseline(p,kit,[10],size);before=await self.doc(p);voice_proof=[]
  for voice in range(11):
   select=p.locator('#sound-voice');await select.focus();await select.press('Home'if voice==0 else'ArrowDown');await expect(select).to_be_focused();await expect(select).to_have_value(str(voice));frame=p.locator('.drum-sound-panel .source-scene');await expect(frame).to_have_attribute('data-source-frame',__import__('re').compile('/'+kit+'-voice-'+str(voice).zfill(2)+'.svg$'));frame_path=await frame.get_attribute('data-source-frame');screen=next(x for x in self.components['screens']if x['path']==frame_path);assert await frame.locator('svg').evaluate('(e,svg)=>e.isEqualNode(new DOMParser().parseFromString(svg,"image/svg+xml").documentElement)',screen['body_svg']);first=frame.locator('.source-hit').first;await p.keyboard.press('Tab');voice_proof.append({'voice':voice,'select':await box(select),'firstSource':await actual_tab(p,first)});assert(await self.doc(p))['notes']==before['notes'];await workspace_stable(p,w,outer_before)
  # Actual keyboard traversal reaches each grid step. Header/row labels may add valid Tab stops.
  await cells.nth(1).focus();await p.keyboard.press('Shift+Tab');visited=set();tab_proof=[];limit=await p.locator('.drum-layout button,.drum-layout input,.drum-layout select').count()+1
  for _ in range(limit):
   active=await p.evaluate('''()=>{const e=document.activeElement;return e.matches('[data-drum-note]')?{track:e.dataset.drumTrack,note:e.dataset.drumNote,start:e.dataset.drumStart}:null}''')
   if active:
    key=tuple(active.values());target=p.locator(f'[data-drum-track="{active["track"]}"][data-drum-note="{active["note"]}"][data-drum-start="{active["start"]}"]');b=await actual_tab(p,target);visited.add(key);tab_proof.append(b);await workspace_stable(p,w,outer_before)
    if len(visited)==176:break
   await p.keyboard.press('Tab')
  assert len(visited)==176,('Not all grid steps keyboard reachable',len(visited));assert(await self.doc(p))['notes']==before['notes']
  # Reach the Sound bottom/inspector physically, independently of focus rescue.
  activation=await activate_inspector(p,sound);bottom=p.locator('.drum-sound-panel #parameter-inspector');sound_pan=await physical_reveal(p,bottom,sound,'y');assert(await box(bottom))['fullVisible'];await workspace_stable(p,w,outer_before);assert other_domains(await self.doc(p),'context')==other_domains(before,'context'),('Parameter selection/reach edited Draft',activation)
  lane_reach_proof=await lane_reach(p);await workspace_stable(p,w,outer_before)
  # Ensure one local hit exists in the selected voice, then edit only one step's notes.
  note=VOICES[kit][10];hit=p.locator(f'[data-drum-note="{note}"]').first;await hit.focus();created=await hit.get_attribute('aria-pressed')=='false'
  if created:await hit.press('Space')
  working=(await self.doc(p))['notes'];lane_proof=[]
  for kind in ['velocity','chance','pitch','pan']:
   for _ in range(4):
    if await p.locator('#lane-kind').input_value()==kind:break
    await p.locator('[data-lane-cycle]').press('Space')
   lane=p.locator('#drum-lane [data-lane-step]:not(:disabled)').first;await lane.focus();b=await box(lane);assert b['fullVisible']and b['hit'];now=await lane.get_attribute('aria-valuenow');maximum=await lane.get_attribute('aria-valuemax');key='ArrowDown'if kind=='chance'or(now is not None and maximum is not None and float(now)>=float(maximum))else'ArrowUp';step=int(await lane.get_attribute('data-lane-step'));await lane.press(key);edited=(await self.doc(p))['notes'];old={n['id']:n for n in working};new={n['id']:n for n in edited};assert set(old)==set(new);changed=[(old[i],new[i])for i in old if old[i]!=new[i]];assert changed
   def group(n):
    span=self.end_sample/16;near=round(n['start']/span);return max(0,min(15,near if abs(n['start']-round(near*span))<2 else math.floor(n['start']/span)))
   assert all(a['track']=='drum'+kit and a['note']==note and group(a)==step and(a['id'],a['start'],a['end'],a['note'])==(z['id'],z['start'],z['end'],z['note'])for a,z in changed)
   await p.locator('#undo').press('Enter');assert(await self.doc(p))['notes']==working;lane_proof.append({'kind':kind,'step':step,'changed':changed,'target':b})
  if created:await p.locator('#undo').press('Enter')
  restored=await self.doc(p);assert restored['notes']==before['notes'];assert other_domains(restored,'context')==other_domains(before,'context');await expect(p.locator('.drum-step-lane')).to_have_count(1);assert(await box(p.locator('.drum-step-lane')))['height']<=49
  geometry=await p.locator('main,.drum-grid-panel,.drum-sound-panel,.drum-step-lane').evaluate_all('es=>es.map(e=>e.getBoundingClientRect().toJSON())');await p.locator('#stop').click();assert geometry==await p.locator('main,.drum-grid-panel,.drum-sound-panel,.drum-step-lane').evaluate_all('es=>es.map(e=>e.getBoundingClientRect().toJSON())')
  if kit=='909':await self.picture(p,f'candidate-drums-{w}x{h}')
  self.record({'case':'drums','size':size,'kit':kit,'identities':identities,'columns':[g,s],'observerMode':False,'outerPolicy':outer_policy,'physicalHorizontal':horizontal,'physicalVertical':vertical,'axisWheelX':wheel_x,'axisWheelY':wheel_y,'soundBottomPan':sound_pan,'inspectorActivation':activation,'laneReach':lane_reach_proof,'voiceProof':voice_proof,'realTabSteps':len(visited),'lanes':lane_proof,'feedbackGeometryStable':True,'wholeWorkspaceScroll':await workspace_stable(p,w,outer_before)})
 async def patterns(self,p,size):
  w,h=size;seed=await self.doc(p);seed['launch']=[None]*5;seed['song']=[{'patterns':[0,1,2,3,4],'repeats':2}];seed['context']['view']='patterns';await self.core.load_draft(p,seed);expected=[None]*5;headers=[]
  for i,part in enumerate(PARTS):
   await p.locator('[data-engine="'+part+'"]').click();await p.locator('[data-view="patterns"]').click();await expect(p.locator('[data-launch-part]')).to_have_count(32);assert set(await p.locator('[data-launch-part]').evaluate_all('es=>es.map(e=>Number(e.dataset.launchPart))'))=={i};await expect(p.locator('#pattern-target')).to_have_text('Not selected');headers.append(await self.header(p,size,'unset-'+part))
   if i==3:await self.picture(p,f'candidate-patterns-unset-{w}x{h}')
  targets_proof=[]
  for i,part in enumerate(PARTS):
   await p.locator('[data-engine="'+part+'"]').click();choices=p.locator('[data-launch-part]');await expect(choices).to_have_count(32);await choices.nth(1).focus();await p.keyboard.press('Shift+Tab');geometry=[]
   for n in range(32):
    b=await actual_tab(p,choices.nth(n));assert b['width']+1e-6>=44 and b['height']+1e-6>=44;geometry.append(b)
    if n<31:await p.keyboard.press('Tab')
   await p.keyboard.press('Space');expected[i]=31;await expect(p.locator('#pattern-target')).to_have_text('P32');headers.append(await self.header(p,size,'selected-'+part));assert(await self.doc(p))['launch']==expected
   other=(i+1)%5;await p.locator('[data-engine="'+PARTS[other]+'"]').click();await p.locator(f'[data-launch-part="{other}"][data-pattern="0"]').focus();await physical_tap(p,p.locator(f'[data-launch-part="{other}"][data-pattern="0"]'),44);expected[other]=0;await expect(p.locator('#pattern-target')).to_have_text('P01');await p.locator('[data-engine="'+part+'"]').click();await expect(p.locator(f'[data-launch-part="{i}"][data-pattern="31"]')).to_have_attribute('aria-pressed','true');await expect(p.locator('#pattern-target')).to_have_text('P32');assert(await self.doc(p))['launch']==expected;assert 'Not loaded'in await p.locator('.patterns-actions').inner_text();assert 'not loaded'in(await choices.nth(31).get_attribute('aria-label')).lower();targets_proof.append({'part':part,'other':PARTS[other],'targets':copy.deepcopy(expected),'choices':geometry})
   if i==3:await self.picture(p,f'candidate-patterns-selected-{w}x{h}')
  saved=await self.doc(p);assert len(saved['launch'])==5;await self.core.load_draft(p,saved);assert await self.doc(p)==saved
  before=await self.doc(p);await p.locator('#pattern-review').press('Enter');await expect(p.locator('#review-dialog')).to_be_visible();await p.locator('#review-dialog button').press('Space');await expect(p.locator('#pattern-review')).to_be_focused();assert await self.doc(p)==before;await p.locator('[data-pattern-action="song"]').press('Enter');await expect(p.locator('#song-add')).to_be_visible();await p.locator('#song-review').press('Enter');await expect(p.locator('#changes')).to_contain_text('Song row 1');await p.locator('#review-dialog button').press('Space');await expect(p.locator('#song-review')).to_be_focused();assert(await self.doc(p))['launch']==expected;await p.locator('[data-view="patterns"]').click();assert(await self.doc(p))['launch']==expected;await viewport_clear(p)
  self.record({'case':'patterns','size':size,'fiveTargets':expected,'partProof':targets_proof,'saveOpenExact':True,'reviewSongFocusPreserved':True,'nativeFlagsAdded':False,'headerChecks':len(headers),'headerWrapObservations':[r['phase']for r in headers if r['title']['wrappedLines']>1 or not r['partAndTransportOverlapY']or not r['partAndHistoryOverlapY']]});assert all(r['fit']for r in headers),('Actual pattern header clipping',headers)
 async def previews(self,p,size):
  w,h=size;await p.locator('[data-engine="breaks"]').click();await p.locator('[data-view="roll"]').click();root=p.locator('#break-sequence');rows=root.locator('.break-rows li');await expect(rows).to_have_count(5)
  positions=await rows.evaluate_all('es=>es.map(e=>e.getBoundingClientRect().toJSON())')
  if w>600:assert max(r['y']for r in positions)-min(r['y']for r in positions)<=1
  else:assert all(a['bottom']<=b['y']+1 for a,b in zip(positions,positions[1:]))
  geometry=[]
  for target in await root.locator('[data-action="play"],.break-actions button,.break-rows label').all():
   await target.scroll_into_view_if_needed();b=await box(target);assert b['width']+1e-6>=44 and b['height']+1e-6>=44 and b['fullVisible']and b['hit'];geometry.append(b)
  text_proof=await rows.locator('label span,.duration').evaluate_all('es=>es.map(e=>{const r=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e);return{text:e.textContent,box:r.toJSON(),fits:[...range.getClientRects()].every(x=>x.left>=r.left-1&&x.right<=r.right+1&&x.top>=r.top-1&&x.bottom<=r.bottom+1)}})');assert all(r['fits']for r in text_proof),('Preview name/duration clipped',text_proof)
  await root.locator('[data-action="none"]').press('Space');await expect(root.locator('[data-asset]:checked')).to_have_count(0);await root.locator('[data-action="all"]').press('Space');await expect(root.locator('[data-asset]:checked')).to_have_count(5);selection=await root.locator('[data-selection-export]').inner_text();first_label=root.locator('.break-rows label').first;await first_label.scroll_into_view_if_needed();await physical_tap(p,first_label,44);await expect(root.locator('[data-asset]:checked')).to_have_count(4);await physical_tap(p,first_label,44);await expect(root.locator('[data-asset]:checked')).to_have_count(5);assert await root.locator('[data-selection-export]').inner_text()==selection;draft_before=await self.doc(p);lifecycle=[]
  for index,asset in enumerate(self.contract['assets']):
   play=root.locator('[data-action="play"][data-id="'+asset['id']+'"]');await play.scroll_into_view_if_needed()
   if index%2:await physical_tap(p,play,44)
   else:await play.press('Enter')
   await expect(play).to_have_attribute('aria-pressed','true');await p.wait_for_function('document.querySelector("#break-sequence audio")?.currentTime>0');audio=await root.locator('audio').evaluate('e=>({duration:e.duration,rate:e.playbackRate,loop:e.loop,paused:e.paused,src:e.currentSrc})');assert abs(audio['duration']-asset['frames']/asset['sample_rate'])<=1/asset['sample_rate']and audio['rate']==1 and not audio['loop']
   if index==0:await expect(play).to_have_attribute('aria-pressed','false',timeout=7000);await expect(play).to_have_text('Play');ended=True
   else:await play.press('Space');await expect(play).to_have_attribute('aria-pressed','false');ended=False
   assert await root.locator('audio').evaluate('e=>e.paused&&!e.getAttribute("src")');assert await root.locator('[data-selection-export]').inner_text()==selection;lifecycle.append({'id':asset['id'],'audio':audio,'naturalEnd':ended,'explicitStop':not ended})
  first=root.locator('[data-action="play"]').first;await first.press('Enter');await expect(first).to_have_attribute('aria-pressed','true');await p.evaluate('window.auditLastAudio=document.querySelector("#break-sequence audio")');await p.locator('[data-engine="chicago"]').click();assert await p.evaluate('auditLastAudio.paused&&!auditLastAudio.getAttribute("src")');await p.locator('[data-engine="breaks"]').click();await expect(root.locator('[data-action="play"]')).to_have_count(5)
  asset=self.contract['assets'][0]
  async def fail(route):await route.fulfill(status=503,body='unavailable')
  pattern='**/assets/starting-breaks/'+asset['id']+'.wav';await p.route(pattern,fail);await root.locator('[data-action="play"]').first.press('Enter');await expect(root.locator('[data-audio-status]')).to_have_text('Could not load this preview. Please try again.');await expect(root.locator('[data-action="play"][aria-pressed="true"]')).to_have_count(0);await p.unroute(pattern,fail);await root.locator('[data-action="play"]').first.press('Enter');await expect(root.locator('[data-action="play"]').first).to_have_attribute('aria-pressed','true');await root.locator('[data-action="play"]').first.press('Space')
  assert other_domains(await self.doc(p),'context')==other_domains(draft_before,'context')
  await root.locator('.break-rows').scroll_into_view_if_needed();await self.picture(p,f'candidate-break-{w}x{h}');await viewport_clear(p);self.record({'case':'previews','size':size,'rows':positions,'actionGeometry':geometry,'textProof':text_proof,'lifecycle':lifecycle,'stopOnLeave':True,'actualHttpErrorRecovery':True,'selectionPreserved':True,'audibilityClaim':False})
 async def native_envelopes(self,p,size):
  runtime=Path(os.environ['DNBOX_EMULATOR_RUNTIME']);meta=json.loads((runtime/'runtime.json').read_text());assert digest(runtime/'kernel.wasm')==meta['wasm_sha256'];assert(self.site/'emu/kernel.wasm').read_bytes()==(runtime/'kernel.wasm').read_bytes();await self.author_right_edge_baseline(p,'909',[0,1],size);before=await self.doc(p);await menu_action(p,'#emulator-start');await expect(p.locator('#status')).to_contain_text('Emulator running',timeout=20000);await p.wait_for_function('nativePackets.length>2');packet=await p.evaluate('nativePackets.at(-1)');assert packet['firmware']==meta['firmware_source']and packet['kernel']==meta['wasm_sha256']
  async def pulse(kind,bits):
   at=await p.evaluate('nativePackets.at(-1).timeMs');await p.evaluate('([type,bits])=>nativeNodes.at(-1).port.postMessage({type,bits})',[kind,bits]);await p.wait_for_function('t=>nativePackets.at(-1).timeMs>=t+90',arg=at);await p.evaluate('type=>nativeNodes.at(-1).port.postMessage({type,bits:0})',kind);await p.wait_for_function('t=>nativePackets.at(-1).timeMs>=t+180',arg=at)
  for key in [2,1,15]:await pulse('keys',1<<key)
  await pulse('buttons',1<<10);await p.wait_for_function('nativeFrames.at(-1)?.playing===1');await p.wait_for_function('nativePackets.some(p=>p.voices.some(v=>v.engine==="909"&&v.available&&(v.snapshot.level??v.snapshot.raw_level??0)>0))');await p.locator('[data-engine="drum909"]').click();await menu_action(p,'[data-view="drums"]');observed=[]
  for voice in [0,1]:
   await p.locator('#sound-voice').select_option(str(voice));host=p.locator('#native-envelopes');await expect(host).to_be_visible();await p.wait_for_function("""slot=>{const n=document.querySelector('[data-observed-role="amp"] [data-observed-level]');return n&&nativePackets.slice(-10).some(p=>p.voices.some(v=>v.engine==='909'&&v.slot===slot&&v.role==='amp'&&v.available&&String(v.snapshot.level??v.snapshot.raw_level)===n.dataset.observedLevel))}""",arg=voice)
   outer=p.locator('#other-view');policy=await outer.evaluate('e=>({x:getComputedStyle(e).overflowX,y:getComputedStyle(e).overflowY,scrollX:e.scrollLeft,scrollY:e.scrollTop,clientHeight:e.clientHeight,scrollHeight:e.scrollHeight})');assert policy['y']in ['auto','scroll'],('Real observer must admit deliberate vertical editor scroll',policy);initial_x=policy['scrollX']
   graph=host.locator('.envelope-graph').first;await expect(graph).to_be_visible();graph_pan=await physical_reveal(p,host,outer,'y',child='.envelope-graph');graph_box=await box(host,'.envelope-graph');assert graph_box['height']+1e-6>=80 and graph_box['fullVisible']and graph_box['hit'],('Real available 80px graph clipped/shrunk',voice,graph_box)
   self.record({'case':'native-graph-stage','size':size,'voice':voice,'graph':graph_box,'physicalPan':graph_pan})
   await self.picture(p,f'actual-909-envelope-voice{voice}-{size[0]}x{size[1]}')
   # Native observer legitimately adds outer content. Test sections sequentially,
   # not an impossible graph+entire-grid+Sound simultaneous viewport condition.
   outer_wheel=await axis_wheel_roundtrip(p,outer,'y');layout=p.locator('.drum-layout'if size[0]>600 else'.drum-grid-panel');viewport_kind='whole side-by-side .drum-layout'if size[0]>600 else'grid viewport within intentionally stacked portrait';layout_pan=await physical_reveal(p,layout,outer,'y');layout_box=await box(layout);assert layout_box['height']+1e-6>=180 and layout_box['fullVisible'],('Native mode must expose its reserved180px drum viewport separately from graph and Sound',viewport_kind,layout_box)
   self.record({'case':'native-outer-stage','size':size,'voice':voice,'outerPolicy':policy,'axisWheel':outer_wheel,'physicalLayoutPan':layout_pan,'reservedViewport':layout_box})
   last=p.locator('[data-drum-note]').last;pan_x=await physical_reveal(p,last,p.locator('.funkybeats-sequencer'),'x');pan_y=await physical_reveal(p,last,p.locator('.sequencer-grid'),'y');last_box=await box(last);assert last_box['fullVisible']and last_box['hit']and last_box['width']+1e-6>=40 and last_box['height']+1e-6>=40
   tab_steps=await keyboard_grid(p);lane_proof=await lane_reach(p);lane_box=await box(p.locator('.drum-step-lane'));self.record({'case':'native-grid-lane-stage','size':size,'voice':voice,'physicalGridX':pan_x,'physicalGridY':pan_y,'lastStep':last_box,'realTabSteps':len(tab_steps),'lane':lane_proof})
   sound=p.locator('.drum-sound-panel');activation_before=await self.doc(p);activation=await activate_inspector(p,sound);inspector=sound.locator('#parameter-inspector');sound_pan=await physical_reveal(p,inspector,sound,'y');inspector_box=await box(inspector);assert inspector_box['fullVisible']and inspector_box['hit'];self.record({'case':'native-inspector-stage','size':size,'voice':voice,'activation':activation,'physicalPan':sound_pan,'inspector':inspector_box})
   await p.locator('#sound-voice').focus();await p.keyboard.press('Tab');hits=sound.locator('.source-hit');await actual_tab(p,hits.first);await p.keyboard.press('Enter');entered_value=await actual_tab(p,sound.locator('#parameter-value'));await hits.first.focus();await actual_tab(p,hits.first)
   for index in range(1,await hits.count()):await p.keyboard.press('Tab');await actual_tab(p,hits.nth(index))
   await p.keyboard.press('Tab');value=sound.locator('#parameter-value');value_box=await actual_tab(p,value)
   graph_return_pan=await physical_reveal(p,host,outer,'y',child='.envelope-graph');graph_return=await box(host,'.envelope-graph');assert graph_return['height']+1e-6>=80 and graph_return['fullVisible']and graph_return['hit'];assert await outer.evaluate('e=>e.scrollLeft')==initial_x;await viewport_clear(p);assert other_domains(await self.doc(p),'context')==other_domains(activation_before,'context'),('Native parameter selection/reach edited Draft',activation)
   observed.append({'engine':'909','voice':voice,'role':'amp','observerMode':True,'outerPolicy':policy,'full80Graph':graph_box,'graphPan':graph_pan,'pureOuterYWheel':outer_wheel,'reserved180ViewportKind':viewport_kind,'reserved180Viewport':layout_box,'layoutOuterPan':layout_pan,'physicalGridX':pan_x,'physicalGridY':pan_y,'lastStep':last_box,'realTabSteps':len(tab_steps),'lane':lane_box,'laneReach':lane_proof,'inspectorActivation':activation,'soundBottom':inspector_box,'soundBottomPan':sound_pan,'inspectorKeyboardTargetBeforeGraphReturn':value_box,'graphReturnPan':graph_return_pan,'graphReturn':graph_return,'DOMObservedLevel':await host.locator('[data-observed-level]').first.get_attribute('data-observed-level')})
  await menu_action(p,'#emulator-stop');await p.wait_for_function('contexts.every(c=>c.state==="closed")');await expect(p.locator('#native-envelopes')).to_be_hidden();after=await self.doc(p);assert other_domains(before,'context')==other_domains(after,'context');self.record({'case':'actual-4758-909-envelope','size':size,'observed':observed,'other909And808NotQualified':True,'packetSource':meta,'readOnlyDraftPreserved':True})
 async def run(self):
  executed_code=digest(__file__);self.record({'stage':'audit-code-identity','path':__file__,'sha256':executed_code,'preservedOriginal':'f504b32f2a553b40ae5d6501d2eda5f05d618206cd8289fbe7e9affb55359346','observerBudget':'Real observer only:180px viewport/full80px graph; sections independently reachable, not simultaneous'});self.freeze('before');self.runtime_identity('before');self.protected();self.core.ROOT=self.out/'existing-fixture-output';closed=False;children=[]
  try:
   with self.server.server(self.base_site)as base_origin,self.server.server(self.site)as origin:
    async with async_playwright()as pw:
     browser=await pw.chromium.launch(chromium_sandbox=True)
     try:
      for size in SIZES:await self.fresh(browser,base_origin,size,'baseline',self.baseline)
      for size in SIZES:
       for kit in ['909','808']:await self.fresh(browser,origin,size,'drums-'+kit,lambda p,s,k=kit:self.drum(p,s,k))
       await self.fresh(browser,origin,size,'patterns',self.patterns);await self.fresh(browser,origin,size,'previews',self.previews)
      # Preserve exact existing semantic functions, not replacement CSS-only checks.
      for name in ['sequencer','step_drums','thin_step_lanes','launcher','break_and_tape']:
       async def existing(p,s,n=name):await getattr(self.core,n)(p);self.record({'case':'preserved-existing-semantic','name':n})
       await self.fresh(browser,origin,(844,390),'existing-'+name,existing)
      for size in SIZES:await self.fresh(browser,origin,size,'native-909-envelope',self.native_envelopes)
     finally:children=descendants();await browser.close();closed=True
  finally:
   assert digest(__file__)==executed_code,'Audit source changed during execution'
   self.freeze('after');self.runtime_identity('after');images=[{'path':str(p),'sha256':digest(p),'bytes':p.stat().st_size}for p in sorted(self.out.rglob('*.png'))];(self.out/'screenshot-manifest.json').write_text(json.dumps(images,indent=2))
   for _ in range(20):
    if not remaining(children):break
    await asyncio.sleep(.1)
   alive=remaining(children);self.record({'stage':'terminal','browserClosed':closed,'remainingOwnedChildren':alive,'observedChildren':children,'failures':len(self.failures),'screenshotCount':len(images)});print('COMPOSITION INDEPENDENT BROWSER CLOSED',flush=True)
  assert closed and not alive and not self.failures,{'closed':closed,'remainingChildren':alive,'failures':self.failures}

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--execute',action='store_true',help='Only after explicit root release; never used during preparation');parser.add_argument('--root',required=True);parser.add_argument('--site',required=True);parser.add_argument('--base-root',required=True);parser.add_argument('--base-site',required=True);parser.add_argument('--manifest',required=True);parser.add_argument('--out',required=True);args=parser.parse_args()
 if not args.execute:parser.error('Prepared controller only: explicit root browser release and --execute required')
 for frozen in [args.root,args.site,args.base_root,args.base_site]:assert not Path(args.out).resolve().is_relative_to(Path(frozen).resolve()),'Evidence must not write frozen source/site'
 asyncio.run(Audit(args).run())
if __name__=='__main__':main()
