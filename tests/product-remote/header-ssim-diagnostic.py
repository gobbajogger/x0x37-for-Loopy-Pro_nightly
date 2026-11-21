"""Prepared header SSIM diagnosis; execute only on explicit authorized browser allocation.
No approved image, threshold, source file or required playing contract is changed.
"""
import argparse,contextlib,hashlib,importlib.util,importlib.metadata,io,json,os,socket,subprocess,sys,time,traceback
from pathlib import Path
import numpy as np
from PIL import Image,ImageFilter
from playwright.sync_api import sync_playwright
# Imports of the exact gate/helper must not create cache files in frozen sources.
sys.dont_write_bytecode=True

REFS={'cb29':'cb29d66c15c7dda3cdabddcfb0dffebd62332b31','ce0d':'ce0d629bd0e575aabc18f30a71f1f4f52e6f6a05'}
KNOWN={'cb29':0.8973681065066039,'ce0d':0.905927401190831}
FLAGS=['--font-render-hinting=none','--disable-lcd-text','--force-color-profile=srgb']
REQUIRED={'tests/visual/visual_gate.py':'fc93551ac3255252e369393f69ba73acc8b560c8a3a35e86830dd121975efc8e','tests/visual/fixtures/page-01.png':'c9f6c4fc91543ac8f3659fd6a48956234a36ee48c781532e2b2623b1fe0a6a72','web/product-site/remote/assets/BarlowSemiCondensed-Medium.ttf':'4998b693a190b76f2b11315844345a8546c1e2e6a320905507a9eed04edf8b48','web/product-site/remote/assets/BarlowSemiCondensed-Bold.ttf':'5bd6757e459a110da81b44532f0f43058e2dab2401688abca84f2fdbde193cbb'}
RECTS_JS="""()=>{const selectors=['header.top','.hdr','.brand','.project-name','.project-name>span','#native-playing','.pattern-readout','#connect','#conn-state','.hdr-actions','nav.tabs','.engines','#part-title','#play','#stop','#rec','#undo','#redo','#workspace-main','#roll-scroll','#roll-grid'];return{viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},fontStatus:document.fonts.status,fonts:[...document.fonts].map(f=>({family:f.family,weight:f.weight,status:f.status})),targets:selectors.flatMap(selector=>[...document.querySelectorAll(selector)].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect(),texts=[],walk=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);while(walk.nextNode()){const n=walk.currentNode;if(!n.nodeValue.trim())continue;const rg=document.createRange();rg.selectNodeContents(n);texts.push({text:n.nodeValue,rects:[...rg.getClientRects()].map(x=>x.toJSON())});}let clip={left:0,top:0,right:innerWidth,bottom:innerHeight};for(let a=e.parentElement;a;a=a.parentElement){const t=getComputedStyle(a),b=a.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(t.overflowX)){clip.left=Math.max(clip.left,b.left);clip.right=Math.min(clip.right,b.right);}if(/auto|scroll|hidden|clip/.test(t.overflowY)){clip.top=Math.max(clip.top,b.top);clip.bottom=Math.min(clip.bottom,b.bottom);}}return{selector,html:e.outerHTML.slice(0,1200),text:e.textContent,rect:r.toJSON(),texts,clip,display:s.display,visibility:s.visibility,fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,color:s.color,background:s.backgroundColor,alignItems:s.alignItems,gap:s.gap,width:s.width,height:s.height,flex:s.flex,overflowX:s.overflowX,overflowY:s.overflowY,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,ariaLabel:e.getAttribute('aria-label'),ariaLive:e.getAttribute('aria-live'),ariaAtomic:e.getAttribute('aria-atomic')};}))};}"""

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def module(root,label):
 # Compile only the already-verified tracked source, never an ignored bytecode cache.
 for name,path in [('grid_continuity',root/'tests/visual/grid_continuity.py'),('header_gate_'+label,root/'tests/visual/visual_gate.py')]:
  spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);sys.modules[name]=m;exec(compile(path.read_bytes(),str(path),'exec'),m.__dict__)
 return m

def lexical_path(value,must_exist=False):
 path=Path(value).expanduser()
 if not path.is_absolute():path=Path.cwd()/path
 assert '..'not in path.parts,('Parent aliases are not allowed',str(path))
 for ancestor in [path,*path.parents]:assert not ancestor.is_symlink(),('Lexical symlink rejected before resolution or writes',str(ancestor))
 if must_exist:assert path.exists(),('Required path does not exist',str(path))
 return path

def git_read(root,*args):return subprocess.check_output(['git',*args],cwd=root,env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'}).decode()
def source_check(root,entry,mode):
 expected=entry['files'];extra_info={'classification':'archive file map; no extras allowed'};identity={}
 if mode=='checkout':
  head=git_read(root,'rev-parse','HEAD').strip();tree=git_read(root,'rev-parse','HEAD^{tree}').strip();assert head==entry['ref']and tree==entry['tree'],('Frozen checkout identity differs',head,tree,entry['ref'],entry['tree'])
  names=[n for n in git_read(root,'ls-files','-z').split('\0')if n];assert len(names)==len(set(names))and set(names)==set(expected),{'trackedSetChanged':True,'missing':sorted(set(expected)-set(names)),'extra':sorted(set(names)-set(expected))}
  status=git_read(root,'status','--porcelain=v1','--untracked-files=no');assert not status,('Tracked status must be clean',status)
  extras={}
  for label,args in [('untracked',('ls-files','--others','--exclude-standard','-z')),('ignored',('ls-files','--others','--ignored','--exclude-standard','-z'))]:
   paths=[n for n in git_read(root,*args).split('\0')if n];groups={}
   for name in paths:top=name.split('/')[0];groups[top]=groups.get(top,0)+1
   extras[label]={'count':len(paths),'topLevelCounts':groups,'payloadsReadOrHashed':False}
  extra_info={'classification':'Git metadata excluded; ignored/untracked extras classified by Git path metadata only, not asserted equal or read/hashed',**extras};identity={'head':head,'tree':tree,'trackedStatus':status}
 else:
  assert mode=='archive';names=[str(p.relative_to(root))for p in root.rglob('*')if p.is_file()];assert set(names)==set(expected),{'archiveSetChanged':True,'missing':sorted(set(expected)-set(names)),'extra':sorted(set(names)-set(expected))}
 actual={}
 for name in names:
  relative=Path(name);assert not relative.is_absolute()and'..'not in relative.parts
  file=root/relative;lexical_path(file,must_exist=True);assert file.is_file(),('Tracked source must be a regular non-symlink file',name);actual[name]={'bytes':file.stat().st_size,'sha256':sha(file)}
 assert actual==expected,{'missingOrChanged':[n for n,v in expected.items()if actual.get(n)!=v]}
 for name,digest in REQUIRED.items():assert actual[name]['sha256']==digest,(name,actual[name])
 return {'mode':mode,'verifiedTrackedOrArchiveFiles':len(actual),**identity,'extras':extra_info,'sourceManifestSHA256':hashlib.sha256(json.dumps(actual,sort_keys=True).encode()).hexdigest(),'critical':{n:actual[n]for n in [*REQUIRED,'web/product-site/remote/index.html','web/product-site/remote/style.css','web/product-site/remote/app.mjs']}}

def processes():
 rows=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   f=(p/'stat').read_text().rsplit(')',1)[1].split();rows.append({'pid':int(p.name),'ppid':int(f[1]),'start':f[19],'state':f[0]})
  except(OSError,ValueError,IndexError):pass
 owned={os.getpid()}
 for _ in range(16):owned.update(r['pid']for r in rows if r['ppid']in owned)
 result=[]
 for row in rows:
  if row['pid']not in owned or row['pid']==os.getpid():continue
  try:
   proc=Path('/proc',str(row['pid']));cmd=(proc/'cmdline').read_bytes().replace(b'\0',b' ').decode(errors='replace');row['command']=cmd
   if any(name in cmd for name in ['chrome-headless-shell','headless_shell'])and'--type='not in cmd:
    exe=(proc/'exe').resolve();row.update({'executable':str(exe),'executableSHA256':sha(exe)})
  except OSError:row['command']='process exited during own-only sample'
  result.append(row)
 return result

def remaining(rows):
 live=[]
 for r in rows:
  try:
   f=Path('/proc',str(r['pid']),'stat').read_text().rsplit(')',1)[1].split()
   if f[19]==r['start']and f[0]!='Z':live.append(r)
  except(OSError,IndexError):pass
 return live

@contextlib.contextmanager
def servers(roots,out,record):
 children=[];logs=[];origins={}
 try:
  for label,root in roots.items():
   origins[label]={}
   # Same web/docs server roots as the existing gate, with separate ports.
   for name in ['web','docs']:
    with socket.socket()as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    log=(out/(label+'-'+name+'-server.log')).open('w');logs.append(log);p=subprocess.Popen([sys.executable,'-m','http.server',str(port),'-d',str(root/name)],stdout=log,stderr=log);children.append(p);origins[label][name]='http://127.0.0.1:'+str(port)
  time.sleep(.8)
  yield origins
 finally:
  pending_exception=sys.exc_info()[0]is not None;cleanup=[];before_cleanup=processes()
  for p in children:
   try:
    if p.poll()is None:p.terminate()
   except BaseException as error:cleanup.append({'pid':p.pid,'operation':'terminate','error':repr(error)})
  for p in children:
   try:p.wait(timeout=10)
   except BaseException as error:
    cleanup.append({'pid':p.pid,'operation':'wait','error':repr(error)})
    try:
     if p.poll()is None:p.kill()
     p.wait(timeout=5)
    except BaseException as final_error:cleanup.append({'pid':p.pid,'operation':'kill/wait own HTTP server','error':repr(final_error)})
  for log in logs:
   try:log.close()
   except BaseException as error:cleanup.append({'operation':'close server log','error':repr(error)})
  record({'stage':'server-cleanup','observedOwnBeforeCleanup':before_cleanup,'serverReturnCodes':{str(p.pid):p.poll()for p in children},'errors':cleanup})
  if cleanup and not pending_exception:raise RuntimeError('HTTP cleanup errors: '+repr(cleanup))

def ssim_map(a,b):
 # Identical 11x11 Gaussian-window arithmetic to visual_gate.ssim; retain map.
 a=a.astype(np.float64);b=b.astype(np.float64);C1,C2=(.01*255)**2,(.03*255)**2;k=np.exp(-.5*(np.arange(11)-5)**2/1.5**2);k/=k.sum()
 def blur(x):
  x=np.apply_along_axis(lambda r:np.convolve(r,k,'valid'),1,x);return np.apply_along_axis(lambda c:np.convolve(c,k,'valid'),0,x)
 mu1,mu2=blur(a),blur(b);s11,s22,s12=blur(a*a)-mu1**2,blur(b*b)-mu2**2,blur(a*b)-mu1*mu2
 return((2*mu1*mu2+C1)*(2*s12+C2))/((mu1**2+mu2**2+C1)*(s11+s22+C2))

def score_clip(png,root,out,name,gate):
 shot=Image.open(io.BytesIO(png)).convert('L');ref=Image.open(root/'tests/visual/fixtures/page-01.png').convert('L');scale=ref.width/1024;ref=ref.crop((0,0,ref.width,round(148*scale))).resize((1024,148),Image.LANCZOS)
 ref.save(out/'reference-scaled-1024x148-L.png');prep=lambda im:np.asarray(im.crop((0,0,720,148)).filter(ImageFilter.GaussianBlur(2)));a,b=prep(shot),prep(ref);score=gate.ssim(a,b);m=ssim_map(a,b);assert abs(float(m.mean())-score)<=1e-14
 np.save(out/(name+'-ssim-map.npy'),m);np.save(out/(name+'-prepared-actual.npy'),a);Image.fromarray(np.uint8(np.clip(1-m,0,1)*255)).save(out/(name+'-ssim-loss.png'));Image.fromarray(np.uint8(np.abs(a.astype(np.int16)-b.astype(np.int16)))).save(out/(name+'-blurred-gray-difference.png'))
 return score,m

def geometric_signature(rects):return [(r['selector'],r['rect'])for r in rects['targets']]

def main(a):
 assert a.execute,'Preparation only; explicit authorized allocation is required'
 # Validate every lexical ancestor and resolved overlap before creating anything.
 out_lexical=lexical_path(a.out);roots_lexical={'cb29':lexical_path(a.current,True),'ce0d':lexical_path(a.baseline,True)};manifest_path=lexical_path(a.manifest,True)
 roots={label:root.resolve(strict=True)for label,root in roots_lexical.items()};out=out_lexical.resolve(strict=False)
 assert roots['cb29']!=roots['ce0d'],'Two distinct frozen source trees required'
 for root in roots.values():assert not out.is_relative_to(root)and not root.is_relative_to(out),'Artifacts must be outside frozen source trees and cannot contain them'
 assert not out_lexical.exists(),'Fresh output path required'
 manifest=json.loads(manifest_path.read_text());assert set(manifest)==set(roots)
 for label,entry in manifest.items():assert entry['ref']==REFS[label]
 out_lexical.mkdir(parents=True,exist_ok=False)
 rows=[];errors=[];closed=False;started_browser=False;owned=[];start=time.monotonic();maps={};rectangles={};results={};gates={};executed=sha(__file__);primary_error=None
 def record(r):rows.append(r);(out/'proof.json').write_text(json.dumps(rows,indent=2));print(json.dumps(r),flush=True)
 def capture(browser,label,name,variant=None):
  gate=gates[label];context=browser.new_context(viewport={'width':1024,'height':640},device_scale_factor=1,has_touch=False,reduced_motion='reduce',locale='en-US',timezone_id='UTC');context.add_init_script(gate.FREEZE_JS);pg=context.new_page();page_errors=[];request_errors=[];pg.on('pageerror',lambda e:page_errors.append(str(e)));pg.on('requestfailed',lambda r:request_errors.append({'url':r.url,'failure':r.failure}))
  try:
   pg.goto(origins[label]['web']+'/product-site/remote/index.html');pg.add_style_tag(content=gate.FREEZE_CSS);pg.evaluate('document.fonts.ready');pg.wait_for_load_state('networkidle');pg.wait_for_timeout(250)
   # No selection, Draft import, native frame, native start or variant before this settle.
   before=pg.evaluate(RECTS_JS)
   if variant=='ink-only':
    pg.add_style_tag(content='#native-playing{visibility:hidden!important}')
   elif variant=='historical-project':
    old=next(r for r in rectangles['ce0d']['targets']if r['selector']=='.project-name');pg.evaluate("old=>{const el=document.querySelector('.project-name'),box=document.createElement('template');box.innerHTML=old.html;el.replaceWith(box.content.firstElementChild);const next=document.querySelector('.project-name');for(const [key,value]of Object.entries({display:old.display,alignItems:old.alignItems,gap:old.gap}))next.style[key]=value;}",old)
   if variant:pg.evaluate('document.fonts.ready');pg.wait_for_load_state('networkidle');pg.wait_for_timeout(250)
   rects=pg.evaluate(RECTS_JS);header=pg.evaluate(gate.HEADER_JS);header_fails=[];gate.header_checks(header,'1024x640',header_fails);png=pg.screenshot(clip={'x':0,'y':0,'width':1024,'height':148});(out/(name+'-actual-1024x148.png')).write_bytes(png);pg.screenshot(path=str(out/(name+'-full-1024x640.png')));score,m=score_clip(png,roots[label],out,name,gate);geometry_equal=geometric_signature(before)==geometric_signature(rects)
   result={'capture':name,'sourceLabel':label,'ref':REFS[label],'variant':variant,'diagnosticOnly':True,'score':score,'originalMinimum':.90,'headerChecks':header_fails,'rects':rects,'beforeVariantRects':before if variant else None,'variantGeometryUnchanged':geometry_equal if variant else None,'pageErrors':page_errors,'requestErrors':request_errors,'fontReadyStatus':rects['fontStatus']}
   if not variant:result.update({'knownScore':KNOWN[label],'knownScoreDelta':score-KNOWN[label],'originalThresholdResult':'PASS'if score>=.90 else'FAIL'})
   record(result);errors.extend(page_errors)
   if variant=='ink-only':assert geometry_equal,'Ink-only runtime variant changed geometry; cannot interpret as ink isolation'
   assert not page_errors,page_errors
   return score,m,rects
  except BaseException as error:
   errors.extend(page_errors);record({'capture':name,'stage':'capture-failure','type':type(error).__name__,'failure':str(error),'traceback':traceback.format_exc(),'pageErrors':page_errors,'requestErrors':request_errors});raise
  finally:context.close()
 try:
  for label,root in roots.items():record({'stage':'source-before','label':label,**source_check(root,manifest[label],a.source_mode)})
  temp_path=lexical_path(os.environ['TMPDIR'],True);assert temp_path.is_dir();assert os.environ.get('HOME')=='/home/agent','Existing authorized cloud HOME required'
  record({'stage':'qualified-environment','HOME':os.environ['HOME'],'TMPDIR':str(temp_path),'browserBundle':os.environ.get('PLAYWRIGHT_BROWSERS_PATH'),'runtimePath':os.environ.get('DNBOX_EMULATOR_RUNTIME'),'loopbackProxyExclusions':{key:{name:name in os.environ.get(key,'').split(',')for name in ['127.0.0.1','localhost','::1']}for key in ['NO_PROXY','no_proxy']},'credentialsReadOrCopied':False})
  # Both complete source checks precede importing any gate/helper code.
  gates={label:module(root,label)for label,root in roots.items()}
  record({'stage':'execution-input','auditSHA256':executed,'manifestSHA256':sha(a.manifest),'flags':FLAGS,'context':{'viewport':[1024,640],'device_scale_factor':1,'has_touch':False,'reduced_motion':'reduce','locale':'en-US','timezone_id':'UTC'},'freezeJS':gates['cb29'].FREEZE_JS,'freezeCSS':gates['cb29'].FREEZE_CSS,'settle':'add freeze CSS; document.fonts.ready; networkidle;250ms','dependencies':{'python':sys.version,'numpy':np.__version__,'Pillow':importlib.metadata.version('Pillow'),'playwright':importlib.metadata.version('playwright')},'browserVersionPending':True,'variantAcceptanceClaim':False})
  with servers(roots,out,record)as origins:
   with sync_playwright()as pw:
    browser=pw.chromium.launch(chromium_sandbox=True,args=FLAGS);started_browser=True
    try:
     record({'stage':'browser-version','version':browser.version})
     for label in ['cb29','ce0d']:
      results[label],maps[label],rectangles[label]=capture(browser,label,label)
     delta=maps['cb29']-maps['ce0d'];np.save(out/'cb29-minus-ce0d-ssim-map.npy',delta);rgb=np.zeros((*delta.shape,3),dtype=np.uint8);rgb[:,:,0]=np.uint8(np.clip(-delta,0,1)*255);rgb[:,:,1]=np.uint8(np.clip(delta,0,1)*255);Image.fromarray(rgb).save(out/'cb29-minus-ce0d-ssim-map.png')
     tiles=[]
     for y in range(0,delta.shape[0],23):
      for x in range(0,delta.shape[1],71):
       d=delta[y:y+23,x:x+71];tiles.append({'windowCenterBounds':[x+5,y+5,min(x+71,delta.shape[1])+5,min(y+23,delta.shape[0])+5],'meanDelta':float(d.mean()),'sumDelta':float(d.sum()),'windows':int(d.size)})
     reproduced=all(abs(results[k]-KNOWN[k])<=1e-12 for k in KNOWN);record({'stage':'unchanged-pair-comparison','scores':results,'delta':results['cb29']-results['ce0d'],'spatialMapShape':list(delta.shape),'spatialCoordinates':'11px-window centers in scored0..720x148 region, offset+5','tiles':tiles,'reproducedBothKnownScores':reproduced,'numericReproductionTolerance':1e-12,'note':'Floating arithmetic tolerance only; unchanged original minimum remains0.90'})
     assert reproduced,'Unchanged scores did not reproduce; no variant interpretation or retry is allowed'
     for variant in a.variants.split(',')if a.variants else[]:
      assert variant in['ink-only','historical-project'],variant
      capture(browser,'cb29','runtime-'+variant,variant)
    finally:owned=processes();browser.close();closed=True
 except BaseException as error:
  primary_error=error;record({'stage':'primary-failure','type':type(error).__name__,'failure':str(error),'traceback':traceback.format_exc()});raise
 finally:
  # Guard failures must never suppress browser/driver/server closure evidence.
  guard_errors=[]
  try:assert sha(__file__)==executed,'Executed diagnostic changed'
  except BaseException as error:guard_errors.append({'stage':'audit-after','error':repr(error)})
  for label,root in roots.items():
   try:record({'stage':'source-after','label':label,**source_check(root,manifest[label],a.source_mode)})
   except BaseException as error:guard_errors.append({'stage':'source-after','label':label,'error':repr(error),'traceback':traceback.format_exc()})
  known={(r['pid'],r['start']):r for r in [*owned,*processes()]};owned=list(known.values())
  for _ in range(20):
   if not remaining(owned):break
   time.sleep(.1)
  live=remaining(owned);qualified=[r for r in processes()if any(name in r.get('command','')for name in ['chrome-headless-shell','headless_shell','playwright/driver'])]
  record({'stage':'terminal','seconds':time.monotonic()-start,'browserStarted':started_browser,'browserClosed':closed,'remainingOwnedChildren':live,'finalQualifiedOwnedBrowserDriverScan':qualified,'observedOwnedChildren':owned,'guardErrors':guard_errors,'primaryFailure':repr(primary_error)if primary_error else None,'pageErrors':errors,'diagnosticOnly':True,'noGateOrProductAcceptanceClaim':True})
  try:
   artifacts={str(p.relative_to(out)):{'bytes':p.stat().st_size,'sha256':sha(p)}for p in out.rglob('*')if p.is_file()and p.name!='artifacts.json'};(out/'artifacts.json').write_text(json.dumps(artifacts,indent=2))
  except BaseException as error:guard_errors.append({'stage':'artifact-manifest','error':repr(error)});print('ARTIFACT_MANIFEST_ERROR',repr(error),file=sys.stderr)
  if primary_error is None:assert (closed or not started_browser)and not live and not qualified and not guard_errors,{'closureOrGuardsFailed':guard_errors,'remainingOwned':live,'qualified':qualified}

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--execute',action='store_true');parser.add_argument('--current',required=True);parser.add_argument('--baseline',required=True);parser.add_argument('--manifest',required=True);parser.add_argument('--source-mode',choices=['checkout','archive'],default='checkout');parser.add_argument('--out',required=True);parser.add_argument('--variants',default='ink-only',help='Runtime diagnostic only, after both unchanged scores reproduce; ink-only,historical-project or empty');args=parser.parse_args();main(args)
