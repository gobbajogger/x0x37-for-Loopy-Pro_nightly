# SPDX-License-Identifier: GPL-3.0-only
# Synthetic local audition checks; no hardware or MIDI operations.
import asyncio,threading,json,wave,math,struct,os
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from playwright.async_api import async_playwright
root=Path(__file__).resolve().parents[1];out=Path(os.environ.get('UI_EVIDENCE_DIR','/tmp/nightly-installer-ui-evidence'));out.mkdir(parents=True,exist_ok=True)
fixture=out/'synthetic-loop.wav'
with wave.open(str(fixture),'wb') as f:
 f.setnchannels(1);f.setsampwidth(2);f.setframerate(44100);f.writeframes(b''.join(struct.pack('<h',int(16000*math.exp(-18*((i/44100)%0.25))*(.7*math.sin(2*math.pi*220*i/44100)+.3*math.sin(2*math.pi*730*i/44100)))) for i in range(88200)))
class H(SimpleHTTPRequestHandler):
 def __init__(self,*a,**k):super().__init__(*a,directory=str(root/'docs'),**k)
 def log_message(self,*a):pass
checks=[]
def check(ok,label):
 assert ok,label
 checks.append(label);print('PASS '+label,flush=True)
async def main():
 s=ThreadingHTTPServer(('127.0.0.1',0),H);threading.Thread(target=s.serve_forever,daemon=True).start()
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless=True)
  page=await b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.add_init_script('''window.probe={midi:0,plays:[],stops:0};navigator.requestMIDIAccess=()=>{probe.midi++;throw Error("MIDI forbidden in local audition test")};const orig=AudioContext.prototype.createBufferSource;AudioContext.prototype.createBufferSource=function(){const n=orig.call(this),start=n.start.bind(n),stop=n.stop.bind(n);n.start=(...a)=>{probe.plays.push({rate:n.playbackRate.value,samples:n.buffer.length,duration:n.buffer.duration/n.playbackRate.value});return start(...a)};n.stop=(...a)=>{probe.stops++;return stop(...a)};return n};''')
  for width in [1440,390,320]:
   await page.set_viewport_size({'width':width,'height':1000 if width==1440 else 1000})
   await page.goto(f'http://127.0.0.1:{s.server_port}/install/')
   check(await page.locator('#prep-file').is_visible(),f'{width}: upload visible on installer without changing tab')
   check(await page.locator('#prepare-samples').evaluate('(e)=>e.closest("#firmware-panel")!==null && e.getBoundingClientRect().top>=document.querySelector(".connection-help").getBoundingClientRect().bottom'),f'{width}: single preparation block below installer controls')
   check(await page.locator('#prepare-samples').count()==1,f'{width}: no duplicate preparation block')
   check(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'{width}: no horizontal overflow')
   check(await page.locator('#prep-reference').is_disabled(),f'{width}: playback disabled without audio')
   await page.screenshot(path=str(out/f'empty-{width}.png'))
   await page.locator('#prep-bars').uncheck();await page.locator('#prep-file').set_input_files(str(fixture));await page.wait_for_function('!document.getElementById("prep-reference").disabled')
   check('44,100 Hz' in await page.locator('#prep-technical').text_content(),f'{width}: decoded upload prepared at 44.1 kHz')
   await page.locator('#prep-reference').click();check(await page.locator('#prep-reference').get_attribute('aria-pressed')=='true',f'{width}: active reference playback is visible and accessible');await page.locator('#prep-encoded').click();await page.locator('#prep-stop').click()
   check(await page.locator('#prep-encoded').get_attribute('aria-pressed')=='false',f'{width}: stop clears playback state')
   await page.locator('#prep-rate').select_option('22050');await page.locator('#prep-encoded').click();await page.locator('#prep-stop').click()
   probe=await page.evaluate('probe');plays=probe['plays'];check(len(plays)==3,f'{width}: reference and both encoded rates start actual AudioBufferSources')
   check(plays[0]['samples']==88200 and plays[1]['samples']==88200 and plays[2]['samples']==44100 and plays[2]['rate']==.5,f'{width}: half samples and compensated playback rate')
   check(all(abs(x['duration']-2)<.001 for x in plays),f'{width}: source duration retained by all previews')
   await page.locator('#prep-grit').select_option('2');await page.locator('#prep-encoded').click();await page.locator('#prep-stop').click()
   newest=await page.evaluate('probe.plays.at(-1)');check(newest['samples']==22050 and newest['rate']==.25 and abs(newest['duration']-2)<.001,f'{width}: oldschool further reduction keeps duration')
   check(not await page.locator('#prep-details').evaluate('(e)=>e.open'),f'{width}: technical explanation collapsed by default')
   summary=await page.locator('#prep-status').inner_text()+' '+await page.locator('#prep-facts').inner_text()
   check('synthetic-loop.wav' in summary and '2.00 s' in summary and '75% space saved' in summary and 'ADPCM' not in summary and 'Hz' not in summary,f'{width}: visible summary uses filename duration and space saved')
   check(await page.locator('#prep-wave').get_attribute('aria-label')!='No audio loaded',f'{width}: real selected-loop waveform rendered')
   await page.screenshot(path=str(out/f'after-{width}.png'),full_page=False)
   await page.locator('#prepare-samples').screenshot(path=str(out/f'preparation-{width}.png'))
   await page.locator('#firmware-panel').screenshot(path=str(out/f'installer-with-preview-{width}.png'))
   await page.locator('#prep-file').set_input_files({'name':'broken.wav','mimeType':'audio/wav','buffer':b'not audio'});await page.wait_for_function('document.getElementById("prep-status").textContent.includes("Could not read")')
   check(await page.locator('#prep-reference').is_disabled() and await page.locator('#prep-encoded').is_disabled(),f'{width}: invalid replacement clears previous audio')
   check(await page.evaluate('probe.midi==0'),f'{width}: upload/settings/playback never request MIDI')
   check(await page.locator('#go').is_disabled(),f'{width}: local audition cannot enable firmware install')
   check(await page.locator('#prep-manage').get_attribute('href')=='#samples',f'{width}: import link targets same-page hash')
   await page.locator('#prep-manage').click();await page.wait_for_function('document.getElementById("sample-frame").contentWindow.sampleWorkspace')
   await page.locator('#samples-panel').wait_for(state='visible')
   check(not await page.locator('#prepare-samples').is_visible(),f'{width}: preparation hidden outside firmware task')
   check('/install/#samples' in page.url and await page.locator('#samples-panel').is_visible(),f'{width}: import opens embedded on same installer URL')
   frame=page.frame_locator('#sample-frame');check(await frame.locator('#send').is_disabled(),f'{width}: device send remains gated before read')
   await page.locator('#projects-tab').click();await page.locator('#projects-panel').wait_for(state='visible');check(not await page.locator('#prepare-samples').is_visible(),f'{width}: Songs and projects has no sample preparation block')
   await page.screenshot(path=str(out/f'projects-{width}.png'),full_page=True)
   await page.locator('#firmware-tab').click();await page.locator('#firmware-panel').wait_for(state='visible');check(await page.locator('#prepare-samples').is_visible(),f'{width}: returning to installer restores the single block')
   await page.screenshot(path=str(out/f'placement-{width}.png'),full_page=True)
  check(not errors,'no browser script errors')
  (out/'browser-results.json').write_text(json.dumps({'checks':checks,'count':len(checks),'errors':errors,'deviceTested':False},indent=2)+'\n')
  await b.close()
 s.shutdown()
asyncio.run(main())
