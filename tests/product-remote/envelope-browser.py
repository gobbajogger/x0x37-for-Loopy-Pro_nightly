# SPDX-License-Identifier: GPL-3.0-only
"""Built Remote + explicit qualified native runtime; no synthetic observations."""
import asyncio, hashlib, json, mimetypes, os, subprocess, tempfile, threading
from contextlib import contextmanager
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.async_api import async_playwright, expect
ROOT=Path(__file__).resolve().parents[2]
@contextmanager
def server(site):
 class Handler(SimpleHTTPRequestHandler):
  def __init__(self,*a,**k):super().__init__(*a,directory=str(site),**k)
  def log_message(self,*a):pass
 srv=ThreadingHTTPServer(('127.0.0.1',0),Handler);srv.daemon_threads=True
 thread=threading.Thread(target=srv.serve_forever,daemon=True);thread.start()
 try:yield f'http://127.0.0.1:{srv.server_port}'
 finally:srv.shutdown();srv.server_close();thread.join()
# The observer may replace or clear its section on any worklet packet or freshness tick.
# Sample the DOM and the actual worklet packet within one browser task.
OBSERVED_GRAPH = """([engine, slot, role, after, held]) => {
 const host = document.querySelector('#native-envelopes');
 const section = host?.querySelector(`[data-observed-engine="${engine}"][data-observed-slot="${slot}"][data-observed-role="${role}"]`);
 const graph = section?.querySelector('svg.envelope-graph');
 const path = graph?.querySelector('path');
 if (!host || host.hidden || !graph || getComputedStyle(graph).visibility !== 'visible') return false;
 const bounds = graph.getBoundingClientRect();
 if (!bounds.width || !bounds.height || !(path?.getTotalLength() > 0)) return false;
 const level = section.querySelector('[data-observed-level]')?.dataset.observedLevel;
 const packet = nativePackets.at(-1);
 if (!packet || packet.sequence <= after) return false;
 const voice = packet.voices.find(v => v.available && v.engine === engine && v.slot === slot && v.role === role);
 const raw = voice?.snapshot.level ?? voice?.snapshot.raw_level;
 if (!Number.isFinite(raw) || String(raw) !== level || (held && raw <= 0)) return false;
 return {sequence: packet.sequence, engine, slot, role, level: raw};
}"""

async def observed_graph(page, engine, slot, role, after=0, held=False):
 await expect(page.locator('#native-envelopes')).to_be_visible()
 observation = await page.wait_for_function(OBSERVED_GRAPH, arg=[engine, slot, role, after, held])
 return await observation.json_value()

async def cases(origin,meta):
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(chromium_sandbox=True)
  try:
   for w,h in [(1440,900),(390,844),(844,390)]:
    c=await browser.new_context(viewport={'width':w,'height':h});page=await c.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    await page.add_init_script("window.nativePackets=[];window.nativePlaying=null;window.nativeNodes=[];window.contexts=[];window.midiCalls=0;navigator.requestMIDIAccess=()=>{midiCalls++;throw Error('No devices')};const AC=AudioContext;window.AudioContext=class extends AC{constructor(o){super(o);contexts.push(this)}};const AW=AudioWorkletNode;window.AudioWorkletNode=class extends AW{constructor(...a){super(...a);nativeNodes.push(this);this.port.addEventListener('message',e=>{if(e.data?.type==='envelopes')nativePackets.push(e.data);if(e.data?.type==='frame')nativePlaying=e.data.playing});this.port.start()}};")
    try:
     await page.goto(origin+'/remote/',wait_until='networkidle');await page.wait_for_function("document.querySelector('#status').textContent.includes('Draft')")
     note=page.locator('#roll-grid [data-note]').first;note_id=await note.get_attribute('data-note');before=await note.get_attribute('aria-label');await note.press('ArrowUp');edited=await note.get_attribute('aria-label');assert edited!=before
     await page.locator('.overflow summary').click();await page.locator('#emulator-start').click();await expect(page.locator('#status')).to_contain_text('Emulator running',timeout=20000);await page.locator('.overflow summary').click()
     await page.wait_for_function('nativePackets.length>2')
     packet=await page.evaluate('nativePackets.at(-1)');assert packet['firmware']==meta['firmware_source'] and packet['kernel']==meta['wasm_sha256'] and len(packet['voices'])==17
     async def pulse(kind,bits):
      at=await page.evaluate('nativePackets.at(-1).timeMs')
      await page.evaluate('([type,bits])=>nativeNodes.at(-1).port.postMessage({type,bits})',[kind,bits])
      await page.wait_for_function('t=>nativePackets.at(-1).timeMs>=t+90',arg=at)
      await page.evaluate('type=>nativeNodes.at(-1).port.postMessage({type,bits:0})',kind)
      await page.wait_for_function('t=>nativePackets.at(-1).timeMs>=t+180',arg=at)
     for key in [2,1,15]:await pulse('keys',1<<key)
     await pulse('buttons',1<<10)
     await page.wait_for_function('nativePlaying===1')
     await page.wait_for_function("nativePackets.some(p=>p.voices.some(v=>v.available&&(v.snapshot.level??v.snapshot.raw_level??0)>0))")
     voice=await page.evaluate("nativePackets.flatMap(p=>p.voices).find(v=>v.available&&['amp','amp-filter'].includes(v.role)&&(v.snapshot.level??v.snapshot.raw_level??0)>0)")
     if voice['engine']=='909':
      await page.locator('[data-engine="drum909"]').click();await page.locator('[data-view="sound"]').click();await page.locator('#sound-voice').select_option(str(voice['slot']))
     else:
      await page.locator('[data-engine="'+('chicago' if voice['slot']==0 else 'miami')+'"]').click();await page.locator('[data-view="sound"]').click()
      if voice['engine']=='JUNO':await page.locator('[data-sound-source="emulator"]').click()
      else:await page.locator('#sound-bank').select_option(voice['engine'])
     await observed_graph(page, voice['engine'], voice['slot'], voice['role'])
     assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
     out=ROOT/'test-results/native-envelopes';out.mkdir(parents=True,exist_ok=True);await page.screenshot(path=str(out/f'{w}x{h}.png'))
     # Drive the real native panel, not invented observer packets. Boot is 909/V_SEQ.
     await pulse('buttons',1<<10) # Stop the native sequencer before changing engines.
     async def turn(role,delta):
      at=await page.evaluate('nativePackets.at(-1).timeMs')
      await page.evaluate('([role,delta])=>nativeNodes.at(-1).port.postMessage({type:"turn",role,delta})',[role,delta])
      await page.wait_for_function('t=>nativePackets.at(-1).timeMs>=t+220',arg=at)
     for _ in range(3):await turn(1,1) # Algorithm: 808, BREAK, BASS B.
     await pulse('buttons',1<<4) # EDIT enters actual native part page.
     for engine,role in [('CHICAGO','amp'),('JUNO','amp-filter')]:
      if engine=='JUNO':
       await turn(0,-1) # Select wraps page zero to SOUND.
       for _ in range(3):await turn(3,1) # Chicago -> Miami -> Synth One -> Juno.
      await page.wait_for_function('engine=>nativePackets.at(-1).voices.some(v=>v.engine===engine&&v.slot===1&&v.role===(engine==="JUNO"?"amp-filter":"amp")&&v.available)',arg=engine)
      start=await page.evaluate('nativePackets.at(-1).sequence')
      await page.evaluate('nativeNodes.at(-1).port.postMessage({type:"keys",bits:1<<1})')
      await page.wait_for_function('([engine,start])=>nativePackets.some(p=>p.sequence>start&&p.voices.some(v=>v.engine===engine&&v.slot===1&&v.available&&(v.snapshot.level??0)>0))',arg=[engine,start])
      await page.locator('[data-engine="miami"]').click();await page.locator('[data-view="sound"]').click()
      await page.locator('[data-sound-source="draft"]').click()
      picker=page.locator('#sound-bank')
      if engine=='JUNO':
       assert await picker.locator('option').evaluate_all('es=>es.map(e=>e.value)')==['CHICAGO','MIAMI','Synth One','SuperJ6']
       assert await page.locator('[data-restore-legacy-juno]').count()==0
       await page.locator('[data-sound-source="emulator"]').click()
       await expect(page.locator('#part-title')).to_have_text('Sound / Emulator')
       await expect(page.locator('#other-view [role=status]')).to_have_text('Emulator Sound controls unavailable')
       await expect(page.locator('[data-native-param]:enabled')).to_have_count(0)
      else:
       await picker.select_option(engine)
       await expect(page.locator('#part-title')).to_have_text(engine+' / P01')
      observed = await observed_graph(page, engine, 1, role, after=start, held=True)
      if w == 1440 and engine == 'CHICAGO':
       await page.evaluate('contexts.at(-1).suspend()')
       await expect(page.locator('#native-envelopes')).to_be_hidden()
       assert await page.locator('#native-envelopes .envelope-graph').count() == 0
       assert not await page.evaluate(OBSERVED_GRAPH, [engine, 1, role, start, True])
       last = await page.evaluate('nativePackets.at(-1).sequence')
       await page.evaluate('contexts.at(-1).resume()')
       resumed = await observed_graph(page, engine, 1, role, after=last, held=True)
       print('PASS native observer expiry and resume', json.dumps({'observed':observed, 'last':last, 'resumed':resumed}), flush=True)
      assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
      await page.screenshot(path=str(out/f'{engine.lower()}-{w}x{h}.png'))
      await page.evaluate('nativeNodes.at(-1).port.postMessage({type:"keys",bits:0})')
      print(f'PASS actual native {engine} slot1 observed level/curve {w}x{h}',flush=True)
     assert await page.evaluate('midiCalls')==0;assert await page.locator('#apply').is_disabled();assert not errors,errors
     await page.locator('.overflow summary').click();await page.locator('#emulator-stop').click();await page.wait_for_function("contexts.every(c=>c.state==='closed')");await expect(page.locator('#native-envelopes')).to_be_hidden();await page.locator('.overflow summary').click()
     await page.locator('[data-engine="chicago"]').click();await page.locator('[data-view="roll"]').click();await expect(page.locator('[data-note="'+note_id+'"]')).to_have_attribute('aria-label',edited);await page.locator('#undo').click();await expect(page.locator('[data-note="'+note_id+'"]')).to_have_attribute('aria-label',before)
     print(f'PASS actual native envelope {w}x{h}: source={meta["firmware_source"]} role={voice["engine"]}/{voice["slot"]}/{voice["role"]} draft-preserved MIDI=0',flush=True)
    finally:await c.close()
  finally:await browser.close()
def main():
 value=os.environ.get('DNBOX_EMULATOR_RUNTIME');assert value,'DNBOX_EMULATOR_RUNTIME must name the explicit qualified runtime artifact'
 runtime=Path(value).resolve();meta=json.loads((runtime/'runtime.json').read_text());binary=(runtime/'kernel.wasm').read_bytes();assert len(binary)==meta['wasm_bytes'] and hashlib.sha256(binary).hexdigest()==meta['wasm_sha256'];assert meta['device_control'] is False
 out=ROOT/'.output';out.mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='native-envelope-',dir=out) as temp:
  subprocess.run(['node','scripts/build-product-site.mjs','--output',temp],cwd=ROOT,check=True)
  assert (Path(temp)/'emu/kernel.wasm').read_bytes()==binary
  assert not (Path(temp)/'emu/native.pcm').exists()
  with server(temp) as origin:asyncio.run(cases(origin,meta))
if __name__=='__main__':main()
