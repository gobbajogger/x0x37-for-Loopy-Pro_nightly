#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Visual-regression gate for the DnBOX website, Remote, emulator and offline edition.

  python3 tests/visual/visual_gate.py            # compare against approved baselines (fails on any diff)
  python3 tests/visual/visual_gate.py --update   # write baselines; committing them through a merged PR is the approval

Baselines: tests/visual/__snapshots__/<name>.png (approved reference, generated from the polished head).
Header conformance is anchored to tests/visual/fixtures/page-01.png (the user's chosen top section).
Deterministic: bundled Barlow, prefers-reduced-motion + animations/transitions off, fixed clock and random seed,
DPR 1, Chromium. Diff images for failures go to $VISUAL_OUT (default test-results/visual/).
"""
import os, sys, json, socket, subprocess, time, re, hashlib, shutil, io, stat, uuid
from contextlib import closing
from pathlib import Path
from urllib.parse import urlencode
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
from grid_continuity import assert_grid_continuity
from manual_capture import capture_original_manual
from full_page_capture import capture_full_page as capture_web_page

ROOT = Path(__file__).resolve().parents[2]
SNAP = ROOT / 'tests/visual/__snapshots__'
FIX = ROOT / 'tests/visual/fixtures/page-01.png'
OUT = Path(os.environ.get('VISUAL_OUT', ROOT / 'test-results/visual'))
UPDATE = '--update' in sys.argv
ONLY = os.environ.get('VISUAL_ONLY')  # regex filter
MAX_DIFF_RATIO = 0.001      # ~ toHaveScreenshot maxDiffPixelRatio
PIXEL_THRESHOLD = 0.1 * 255  # per-channel tolerance before a pixel counts as different (AA noise)
SIZES = [(1440, 900), (1024, 640), (844, 390), (390, 844)]
SITE = ['index.html', 'install/index.html', 'breaks/index.html', 'starting-breaks/index.html', 'projects/index.html',
        'presets/index.html', 'presets/legacy/index.html', 'manual/index.html', 'manual/original/index.html',
        'manual/legacy.html', 'manual/projects-guide.html', 'manual/protocol.html',
        'builds/index.html', 'tools/index.html', 'help/index.html', 'new/index.html', 'remote/identity/index.html']
OFFLINE = ['x0x_installer.html', 'x0x_breaks.html', 'x0x_projects.html']
# The web/x0x_*.html files are templates (/*LIB*/, /*CATALOG*/); npm run build compiles
# them into docs/. The offline edition is the compiled page, so that is what is captured.
OFFLINE_BUILT = {'x0x_installer.html': 'install/index.html', 'x0x_breaks.html': 'breaks/index.html',
                 'x0x_projects.html': 'projects/index.html'}
PAGE01 = {'bg': '#050a0d', 'panel': '#101a1f', 'line': '#293d43', 'ink': '#dde7de', 'muted': '#99aaa9', 'amber': '#ffb337'}
ENGINES = {'909': '#ff9529', '808': '#ff4841', 'BASS A': '#82f05a', 'BASS B': '#46cdff', 'BREAK': '#d678ff'}
FREEZE_JS = """
(()=>{const T=1794790800000;let n=0;const D=Date;class FD extends D{constructor(...a){super(...(a.length?a:[T]))}static now(){return T}}
globalThis.Date=FD;let s=42;Math.random=()=>{s=(s*1103515245+12345)%2147483648;return s/2147483648};})();
"""
FREEZE_CSS = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}"

def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

def wait_for_home_capture(page):
    # The homepage statically declares its artwork, fonts and replay. Only these
    # rendered assets determine the full-page screenshot.
    page.evaluate("""async () => {
        await document.fonts.ready;
        const require = (ok, message) => { if (!ok) throw Error('Homepage capture: ' + message); };
        require(document.readyState === 'complete', 'document has not loaded');
        const sheet = [...document.styleSheets].find(s => s.href === new URL('site.css',location.href).href);
        require(sheet?.cssRules.length, 'site.css did not load');
        for (const weight of ['normal','700']) {
            require([...document.fonts].some(f => f.family === 'Barlow' && f.weight === weight && f.status === 'loaded'),
                    'Barlow ' + weight + ' did not load');
        }
        for (const image of document.images) {
            await image.decode();
            require(image.naturalWidth && image.naturalHeight, 'empty image ' + image.currentSrc);
        }
        const stage = document.querySelector('#replay-display'), play = document.querySelector('#demo-play');
        const stop = document.querySelector('#demo-stop'), initial = document.querySelector('#frame-voice-0');
        require(stage?.firstElementChild?.isEqualNode(initial?.content.firstElementChild),
                'initial voice frame is missing or differs from source');
        require(play?.textContent === 'Next control' && document.querySelector('.demo-tabs [data-demo=voice]')?.getAttribute('aria-pressed') === 'true',
                'reduced-motion replay is not initialized');
        require([stage,play,stop].every(el => el?.checkVisibility() && el.getBoundingClientRect().width > 0),
                'replay display or controls are hidden');
    }""")
    frames = page.evaluate_handle("() => ({previous: null, stable: 0})")
    try:
        page.wait_for_function("""state => {
            const boxes = ['body','header','#replay-display','#demo-play','#demo-stop','footer'].flatMap(s => {
                const r=document.querySelector(s).getBoundingClientRect(); return [r.x,r.y,r.width,r.height];
            });
            const now = JSON.stringify(boxes);
            state.stable = now === state.previous ? state.stable + 1 : 0;
            state.previous = now;
            return state.stable >= 2;
        }""", arg=frames, polling='raf')
    finally:
        frames.dispose()



def capture_full_page(page, route, name):
    if route == 'manual/original/index.html':
        return capture_original_manual(page)
    return capture_web_page(page, route, name)


def remote_states():
    def lane(n):
        def f(pg):
            for _ in range(n): pg.click('#lane-param')
        return f
    def tab(name):
        def f(pg): pg.click(f'[data-view="{name}"]')
        return f
    st = [('sequence', None), ('lane-chance', lane(1)), ('lane-pitch', lane(2)), ('lane-pan', lane(3))]
    for t in ['sound', 'mix', 'patterns', 'files']:
        st.append((t, tab(t)))
    return st

def rgb(css):
    m = re.match(r'rgba?\((\d+),\s*(\d+),\s*(\d+)', css or '')
    return '#%02x%02x%02x' % tuple(int(x) for x in m.groups()) if m else css

def ssim(a, b):
    """Gaussian-window SSIM on grayscale float arrays (Wang et al. 2004)."""
    a = a.astype(np.float64); b = b.astype(np.float64)
    C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    k = np.exp(-0.5 * (np.arange(11) - 5) ** 2 / 1.5 ** 2); k /= k.sum()
    def blur(x):
        x = np.apply_along_axis(lambda r: np.convolve(r, k, 'valid'), 1, x)
        return np.apply_along_axis(lambda c: np.convolve(c, k, 'valid'), 0, x)
    mu1, mu2 = blur(a), blur(b)
    s11, s22, s12 = blur(a * a) - mu1 ** 2, blur(b * b) - mu2 ** 2, blur(a * b) - mu1 * mu2
    m = ((2 * mu1 * mu2 + C1) * (2 * s12 + C2)) / ((mu1 ** 2 + mu2 ** 2 + C1) * (s11 + s22 + C2))
    return float(m.mean())

def validate_capture_output():
    if any(p.is_symlink() for p in (OUT, *OUT.parents)):
        raise ValueError('capture output directory must not contain symlinks')
    target, baseline = OUT.resolve(), SNAP.resolve()
    if target == baseline or baseline in target.parents:
        raise ValueError('capture output must be outside the baseline directory')

def write_actual_output(filename, data):
    # Output artifacts must never follow a link into an approved reference.
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*', filename):
        raise ValueError('capture filename must be a simple basename')
    if any(p.is_symlink() for p in (OUT, *OUT.parents)):
        raise ValueError('capture output directory must not contain symlinks')
    OUT.mkdir(parents=True, exist_ok=True)
    directory = os.open(OUT, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    temporary = '.capture-' + uuid.uuid4().hex
    created = False
    try:
        try:
            existing = os.stat(filename, dir_fd=directory, follow_symlinks=False)
        except FileNotFoundError:
            existing = None
        if existing is not None and (not stat.S_ISREG(existing.st_mode) or existing.st_nlink != 1):
            raise ValueError('capture output must not be a link or special file')
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
        created = True
        with os.fdopen(fd, 'wb') as output:
            output.write(data)
        # Atomic replacement replaces a raced-in link itself, never its target.
        os.replace(temporary, filename, src_dir_fd=directory, dst_dir_fd=directory)
        created = False
    finally:
        if created:
            os.unlink(temporary, dir_fd=directory)
        os.close(directory)
    return OUT / filename

def compare(name, png_bytes, results):
    validate_capture_output()
    OUT.mkdir(parents=True, exist_ok=True)
    base = SNAP / f'{name}.png'
    tmp = write_actual_output(f'{name}-actual.png', png_bytes)
    if UPDATE:
        SNAP.mkdir(parents=True, exist_ok=True)
        base.write_bytes(png_bytes); results.append((name, 'BASELINE', 0.0)); return
    if not base.exists():
        # No committed baseline: the page still had to render with no errors, header or overflow
        # findings; only the pixel comparison is skipped and reported. Never written automatically.
        tmp.unlink(missing_ok=True)
        results.append((name, 'NOBASE', 0.0)); return
    a = np.asarray(Image.open(tmp).convert('RGB'), dtype=np.int16)
    b = np.asarray(Image.open(base).convert('RGB'), dtype=np.int16)
    if a.shape != b.shape:
        results.append((name, 'FAIL', 1.0)); print(f'FAIL {name}: size {a.shape} != baseline {b.shape}'); return
    diff = (np.abs(a - b).max(axis=2) > PIXEL_THRESHOLD)
    ratio = float(diff.mean())
    if ratio > MAX_DIFF_RATIO:
        vis = (np.asarray(Image.open(base).convert('RGB')) * 0.3).astype(np.uint8); vis[diff] = [255, 0, 255]
        diff_png = io.BytesIO(); Image.fromarray(vis).save(diff_png, format='PNG')
        write_actual_output(f'{name}-diff.png', diff_png.getvalue())
        results.append((name, 'FAIL', ratio)); print(f'FAIL {name}: {ratio:.5f} of pixels differ -> {OUT / (name + "-diff.png")}')
    else:
        tmp.unlink(missing_ok=True)
        results.append((name, 'PASS', ratio))

HEADER_JS = """
() => {
 const q=s=>document.querySelector(s), box=e=>e&&e.getBoundingClientRect(), cs=e=>e&&getComputedStyle(e);
 const vis=e=>{if(!e)return false;const r=box(e),s=cs(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
 const clipped=e=>{const r=box(e);return r.left<-0.5||r.right>innerWidth+0.5||e.scrollWidth>e.clientWidth+1};
 const lines=e=>{const tops=new Set(),tw=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);while(tw.nextNode()){if(!tw.currentNode.nodeValue.trim())continue;const rg=document.createRange();rg.selectNodeContents(tw.currentNode);for(const r of rg.getClientRects())if(r.width>0.5)tops.add(Math.round(r.top/4));}return tops.size};
 const tabs=[...document.querySelectorAll('nav.tabs [data-view]')].filter(vis);
 const engines=[...document.querySelectorAll('.engines [data-part], .engines .engine')].filter(vis);
 const active=tabs.find(t=>t.getAttribute('aria-current')||t.classList.contains('active')||t.getAttribute('aria-selected')==='true');
 return {
  brand:(q('.hdr .brand')?.innerText||'').replace(/\\s+/g,' ').trim(),
  project:vis(q('.hdr .project-name, #project-name'))?q('.hdr .project-name, #project-name').innerText.trim():'',
  readout:(q('.hdr .pattern-readout')?.innerText||'').replace(/\\s+/g,' ').trim(),
  connect:vis(q('#connect'))?q('#connect').innerText.trim():'',
  connState:vis(q('#conn-state'))?q('#conn-state').innerText.trim():'', connRow:box(q('#conn-state'))?.top, connectRow:box(q('#connect'))?.top,
  connWrapped:lines(q('#conn-state')||document.body)>1, rowOneOverflow:[...document.querySelectorAll('.hdr details, .hdr summary')].filter(vis).length+[...document.querySelectorAll('.hdr *')].filter(e=>vis(e)&&e.children.length===0&&e.textContent.trim()==='…').length,
  tabs:tabs.map(t=>t.innerText.trim()), tabClipped:tabs.filter(clipped).map(t=>t.innerText.trim()),
  tabWrapped:tabs.filter(t=>lines(t)>1).map(t=>t.innerText.trim()),
  activeTabUnderline: active? (cs(active).borderBottomColor||'')+'|'+(cs(active).textDecorationColor||'')+'|'+cs(active).boxShadow+'|'+(cs(active,'::after'),getComputedStyle(active,'::after').backgroundColor): '',
  engines:engines.map(e=>e.innerText.replace(/\\s+/g,' ').trim()), engWrapped:engines.filter(e=>lines(e)>1).map(e=>e.innerText.trim()),
  engClipped:engines.filter(clipped).map(e=>e.innerText.trim()),
  engineColors:Object.fromEntries(engines.map(e=>[e.innerText.trim(),getComputedStyle(e.querySelector('svg')||e).color])),
  partTitle:vis(q('#part-title'))?q('#part-title').innerText.trim():'',
  transport:['#play','#stop','#rec'].map(s=>vis(q(s))?q(s).innerText.trim():''),
  undoRedo:['#undo','#redo'].map(s=>vis(q(s))),
  rows:{hdr:box(q('.hdr'))?.top, tabs:box(q('nav.tabs'))?.top, eng:box(q('.engines'))?.top},
  font:cs(q('.hdr .brand')||document.body).fontFamily, fontsLoaded:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family+' '+f.weight),
  bodyBg:cs(document.body).backgroundColor, ink:cs(document.body).color, line:cs(q('.hdr')).borderBottomColor,
  connectBg:cs(q('#connect'))?.backgroundColor, connectBorder:cs(q('#connect'))?.borderTopColor,
  amber:cs(active)?.color, scrollW:document.documentElement.scrollWidth, innerW:innerWidth,
  pageScrollable:document.documentElement.scrollHeight>innerHeight+1
 };
}
"""

def header_checks(h, w, fails):
    def need(cond, msg):
        if not cond: fails.append(f'{w}: {msg}')
    need(h['brand'].upper().startswith('DNBOX') and 'REMOTE' in h['brand'].upper(), f"brand {h['brand']!r}")
    need(bool(h['project']), 'project name missing')
    need('P01' in h['readout'] and '120 BPM' in h['readout'], f"readout {h['readout']!r}")
    need(h['connect'] == 'Connect', f"connect {h['connect']!r}")
    need(h['connState'] == 'Not connected', f"connection state {h['connState']!r}")
    need(not h['connWrapped'], 'connection state wraps')
    need(h['connRow'] is not None and h['connectRow'] is not None and abs(h['connRow'] - h['connectRow']) < 24, f"connection state not in row 1 with Connect ({h['connRow']} vs {h['connectRow']})")
    need(h['rowOneOverflow'] == 0, "overflow '…' present in row 1")
    need(h['tabs'] == ['Sequence', 'Sound', 'Mix & FX', 'Patterns & Song', 'Projects'], f"tabs {h['tabs']}")
    need(not h['tabClipped'] and not h['tabWrapped'], f"tabs clipped {h['tabClipped']} wrapped {h['tabWrapped']}")
    need([e.replace(' ', '') for e in h['engines']] == ['909', '808', 'BASSA', 'BASSB', 'BREAK'], f"engines {h['engines']}")
    need(not h['engWrapped'] and not h['engClipped'], f"engines wrapped {h['engWrapped']} clipped {h['engClipped']}")
    for k, v in ENGINES.items():
        got = rgb(h['engineColors'].get(k, ''))
        need(got == v, f'engine {k} colour {got} != {v}')
    need(h['partTitle'] == 'CHICAGO / P01', f"part title {h['partTitle']!r}")
    need(h['transport'] == ['Play', 'Stop', 'REC'], f"transport {h['transport']}")
    need(all(h['undoRedo']), 'undo/redo not visible')
    r = h['rows']; need(r['hdr'] is not None and r['tabs'] is not None and r['eng'] is not None and r['hdr'] < r['tabs'] < r['eng'], f'row order {r}')
    need('Barlow' in h['font'], f"font {h['font']}")
    need(any(f.startswith('Barlow') for f in h['fontsLoaded']), f"Barlow not loaded {h['fontsLoaded']}")
    need(rgb(h['bodyBg']) == PAGE01['bg'], f"bg {rgb(h['bodyBg'])}")
    need(rgb(h['ink']) == PAGE01['ink'], f"ink {rgb(h['ink'])}")
    need(rgb(h['line']) == PAGE01['line'], f"divider {rgb(h['line'])}")
    need(rgb(h['connectBg']) == PAGE01['panel'] and rgb(h['connectBorder']) == PAGE01['line'], f"connect {rgb(h['connectBg'])}/{rgb(h['connectBorder'])}")
    need(rgb(h['amber']) == PAGE01['amber'], f"active tab {rgb(h['amber'])}")
    need(PAGE01['amber'] in [rgb(x) for x in h['activeTabUnderline'].split('|')] or 'rgb(255, 179, 55)' in h['activeTabUnderline'], f"underline {h['activeTabUnderline']}")
    need(h['scrollW'] <= h['innerW'], f"horizontal overflow {h['scrollW']}>{h['innerW']}")
    need(not h['pageScrollable'], 'page scrolls')

def exit_status(results, header_fails, errors):
    # Proposals, empty/filtered coverage, browser errors and any failed check are non-passing.
    return int(bool(ONLY) or not results or any(r[1] not in ('PASS', 'NOBASE') for r in results) or bool(header_fails) or bool(errors))

def installer_responses():
    # Match only the two public requests made by the installer's initial state.
    report_url = 'https://api.github.com/search/issues?' + urlencode({
        'q': 'repo:gobbajogger/DnBOX is:issue in:title "Install report"', 'per_page': 100, 'page': 1,
    })
    source = (ROOT / 'web/product-site/install/index.html').read_text()
    catalog = json.loads(re.search(r'^const catalog = (.+);$', source, re.M)[1])
    version = next((row for row in catalog['versions'] if row['version'] == catalog['latest']), None)
    models = version['models'] if version else {}
    default_model = 'pro' if 'pro' in models else 'elite'
    package = models.get(default_model)
    if package:
        digest = package['sha256']
        if not re.fullmatch(r'[a-f0-9]{64}', digest) or not package['pkg'].startswith(
            'https://gobbajogger.github.io/DnBOX-nightly/artifacts/nightly-dev/' + digest + '/'
        ):
            raise ValueError('Default installer package must have an immutable nightly URL')
    saved = os.environ.get('DNBOX_RELEASE_PACKAGES')
    data = None

    def respond(route):
        nonlocal data
        if route.request.method != 'GET':
            return route.fallback()
        if data is None:
            if saved:
                v = version['display_version']
                if not re.fullmatch(r'\d+(?:\.\d+){2,3}', v):
                    raise ValueError('Unexpected release package version')
                body = (Path(saved) / ('v' + v) / f'dnbox-x0x37-{v}-{default_model}.fwsc').read_bytes()
            else:
                response = route.fetch(max_redirects=0)
                if not response.ok:
                    raise ValueError(f'Default package returned HTTP {response.status}. Set DNBOX_RELEASE_PACKAGES for offline captures.')
                body = response.body()
            if len(body) != package['size'] or hashlib.sha256(body).hexdigest() != digest:
                raise ValueError('Default installer package does not match its committed size and SHA-256')
            data = body
        route.fulfill(body=data, content_type='application/octet-stream', headers={'Access-Control-Allow-Origin': '*'})

    def attach(page):
        def report(route):
            if route.request.method != 'GET':
                return route.fallback()
            route.fulfill(json={'total_count': 0, 'incomplete_results': False, 'items': []},
                          headers={'Access-Control-Allow-Origin': '*'})
        page.route(re.compile('^' + re.escape(report_url) + '$'), report)
        if package:
            page.route(re.compile('^' + re.escape(package['pkg']) + '$'), respond)

    return attach

def viewport_contexts(pw):
    # Reclaim Chromium's compositor and caches along with the context after each viewport.
    for w, h in SIZES:
        with pw.chromium.launch(chromium_sandbox=True, args=['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb']) as browser:
            with browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1,
                                     has_touch=w < 900, reduced_motion='reduce', locale='en-US',
                                     timezone_id='UTC') as context:
                context.add_init_script(FREEZE_JS)
                yield w, h, context


def main():
    validate_capture_output()  # reject unsafe output before any browser/server starts
    p = port()
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(p), '-d', str(ROOT / 'web')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    p2 = port()
    srv2 = subprocess.Popen([sys.executable, '-m', 'http.server', str(p2), '-d', str(ROOT / 'docs')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    built = f'http://127.0.0.1:{p2}'
    results, header_fails, errors = [], [], []
    base = f'http://127.0.0.1:{p}'
    try:
        with sync_playwright() as pw, closing(viewport_contexts(pw)) as viewports:
            attach_installer_responses = installer_responses()
            def settle(pg, url, name, site_route=None):
                try:
                    print(f'Loading {name}: {url}', flush=True)
                    pg.goto(url)
                    pg.add_style_tag(content=FREEZE_CSS)
                    if site_route == 'index.html':
                        wait_for_home_capture(pg)
                    else:
                        pg.evaluate('document.fonts.ready')
                        pg.wait_for_load_state('networkidle')
                    pg.wait_for_timeout(250)
                except Exception as error:
                    raise RuntimeError(f'{name} failed to settle at {url}: {error}') from error
            for w, h, c in viewports:
                tag = f'{w}x{h}'
                # Remote: header conformance + every tab/lane/overflow state
                for name, act in remote_states():
                    full = f'remote-{name}-{tag}'
                    if ONLY and not re.search(ONLY, full): continue
                    pg = c.new_page(); pg.on('pageerror', lambda e, n=full: errors.append(f'{n}: {e}'))
                    settle(pg, base + '/product-site/remote/index.html', full)
                    if name == 'sequence':
                        header_checks(pg.evaluate(HEADER_JS), tag, header_fails)
                        try:
                            coverage=assert_grid_continuity(pg);results.append((f'grid-continuity-{tag}', 'PASS', coverage['samples']))
                        except AssertionError as error:
                            header_fails.append(f'grid-continuity-{tag}: {error}')
                        if (w, h) == (1024, 640):
                            # Perceptual: Gaussian blur r=2 (viewing distance), page-01 scaled to 1024 css px, compared on
                            # x 0..720; connection status and Connect are asserted structurally on the right.
                            # Undo/Redo live in the engine row, not an overflow menu.
                            from PIL import ImageFilter
                            shot_png = pg.screenshot(clip={'x': 0, 'y': 0, 'width': 1024, 'height': 148})
                            shot = Image.open(__import__('io').BytesIO(shot_png)).convert('L')
                            ref = Image.open(FIX).convert('L'); s = ref.width / 1024
                            ref = ref.crop((0, 0, ref.width, round(148 * s))).resize((1024, 148), Image.LANCZOS)
                            prep = lambda im: np.asarray(im.crop((0, 0, 720, 148)).filter(ImageFilter.GaussianBlur(2)))
                            score = ssim(prep(shot), prep(ref)); results.append(('header-ssim-1024x640', 'PASS' if score >= 0.9 else 'FAIL', score))
                            if results[-1][1] == 'FAIL':
                                write_actual_output('header-ssim-1024x640-actual.png', shot_png)
                            print(f"header SSIM vs page-01 = {score:.4f} (gate >= 0.90)")
                    try:
                        if act: act(pg); pg.wait_for_timeout(150)
                        print(f'Capturing {full}', flush=True)
                        screenshot = pg.screenshot()
                    except Exception as error:
                        raise RuntimeError(f'{full} interaction or screenshot failed: {error}') from error
                    compare(full, screenshot, results); pg.close()
                for rel in SITE + ['remote/device/index.html']:
                    full = 'site-' + rel.replace('/index.html', '').replace('/', '-').replace('.html', '') + '-' + tag
                    if ONLY and not re.search(ONLY, full): continue
                    pg = c.new_page(); pg.on('pageerror', lambda e, n=full: errors.append(f'{n}: {e}'))
                    if rel == 'install/index.html':
                        attach_installer_responses(pg)
                    settle(pg, base + '/product-site/' + rel, full, site_route=rel)
                    scroll_width = pg.evaluate('document.documentElement.scrollWidth')
                    if scroll_width > w:
                        errors.append(f'{full}: page extends to {scroll_width}px in a {w}px viewport')
                    print(f'Capturing {full}', flush=True)
                    compare(full, capture_full_page(pg, rel, full), results); pg.close()
                for rel in OFFLINE:
                    full = 'offline-' + rel.replace('.html', '') + '-' + tag
                    if ONLY and not re.search(ONLY, full): continue
                    pg = c.new_page(); pg.on('pageerror', lambda e, n=full: errors.append(f'{n}: {e}'))
                    if OFFLINE_BUILT[rel] == 'install/index.html':
                        attach_installer_responses(pg)
                    settle(pg, built + '/' + OFFLINE_BUILT[rel], full)
                    print(f'Capturing {full}', flush=True)
                    compare(full, capture_full_page(pg, rel, full), results); pg.close()
    finally:
        srv.terminate(); srv2.terminate()
    passed = sum(1 for r in results if r[1] == 'PASS'); failed = sum(1 for r in results if r[1] == 'FAIL'); made = sum(1 for r in results if r[1] == 'BASELINE')
    for f in header_fails: print('FAIL header', f)
    for e in errors: print('PAGEERROR', e)
    nobase = sum(1 for r in results if r[1] == 'NOBASE')
    if nobase: print(f'NOTE {nobase} screens have no committed baseline (rendered and checked; pixel compare not run)')
    summary = {'screens': len(results), 'pass': passed, 'fail': failed, 'no_baseline': nobase, 'baseline_written': made, 'header_fail': len(header_fails), 'page_errors': len(errors)}
    write_actual_output('summary.json', json.dumps({'summary': summary, 'results': results, 'header_fails': header_fails, 'errors': errors}, indent=1).encode())
    print('VISUAL', json.dumps(summary))
    sys.exit(exit_status(results, header_fails, errors))

if __name__ == '__main__':
    main()
