# SPDX-License-Identifier: GPL-3.0-only
"""Check every Remote page at 844×390 with the pinned emulator running locally."""
import argparse
from contextlib import suppress
import hashlib
import json
import os
import runpy
import subprocess
import tempfile
import zipfile
from pathlib import Path

from playwright.sync_api import Error as PlaywrightError, expect, sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PARTS = ('chicago', 'miami', 'drum909', 'drum808', 'breaks')


def expected_states():
    return {
        'drums-accent-drum909', 'drums-accent-drum808',
        'drums-voices-7-11-drum909', 'drums-voices-7-11-drum808',
        'pattern-lock-bass-a-cutoff', 'pattern-lock-bass-b-cutoff', 'pattern-lock-break-level',
        'pattern-lock-bass-a-fx-type', 'pattern-lock-bass-b-arp', 'break-generator', 'break-sound-pattern-chance',
        *(f'{view}-{part}' for view in ('roll', 'patterns', 'locks', 'drums') for part in PARTS),
        *(f'{view}-{kit}-{voice}' for view in ('sound', 'original')
          for kit in ('drum909', 'drum808') for voice in range(11)),
        *(f'sound-{part}-{bank}' for part in ('miami', 'chicago') for bank in ('MIAMI', 'CHICAGO', 'Synth One', 'SuperJ6', 'JUNO')),
        *(f'sound-{part}-{state}' for part in ('chicago', 'miami')
          for state in ('synth-one-file', 'superj6-import-partial', 'superj6-import-complete')),
        *(f'native-sound-{part}' for part in ('miami', 'chicago', 'choice-unavailable')),
        *(f'{source}-mix-{mode}' for source in ('draft', 'native') for mode in ('levels', 'pan', 'sends', 'fx', 'master')),
        *(f'bass-{part}-{field}' for part in ('chicago','miami') for field in ('gate','slide','accent','release')),
        'break-notes', 'break-chance-authored', 'sound-breaks', 'projects', 'projects-original-empty', 'projects-original-invalid', 'projects-original-editor', 'projects-original-kept', 'song-empty', 'song-row', 'all-part-patterns',
        'review-dialog', 'review-discard-confirm', 'more-menu', 'connect-feedback', 'draft-invalid', 'draft-import', 'device', 'identity',
    }


def author_break_chance(page):
    lane = page.locator('#velocity')
    cells = lane.locator('[data-lane-step]')
    page.locator('#lane-param').click()
    assert page.locator('#lane-kind').input_value() == 'chance'
    assert cells.count() == 16 and lane.locator('[data-lane-step]:enabled').count() == 16
    assert cells.evaluate_all("items => items.every(item => item.getAttribute('aria-valuetext') === '100%')")

    target = cells.nth(2)
    assert '0 notes' in target.get_attribute('aria-label')
    box = target.bounding_box()
    target.click(position={'x': box['width'] / 2, 'y': box['height'] - 2})
    values = cells.evaluate_all("items => items.map(item => item.getAttribute('aria-valuetext'))")
    assert values == ['100%', '100%', '8:8'] + ['100%'] * 13
    assert page.locator('#lane-param output').inner_text() == '8:8'

    lane_box = lane.bounding_box()
    roll_box = page.locator('#roll-scroll').bounding_box()
    viewport = page.viewport_size
    assert 0 <= lane_box['x'] and lane_box['x'] + lane_box['width'] <= viewport['width'] + 1
    assert abs(roll_box['y'] + roll_box['height'] - lane_box['y']) <= 2
    assert 0 < lane_box['height'] and lane_box['y'] + lane_box['height'] <= viewport['height'] + 1
    return {'enabledSteps': 16, 'values': values, 'lane': lane_box, 'roll': roll_box, 'authoredCell': box}


def inspect_pattern_locks(page,snap):
    for engine,part,pattern,name,step,expected in [
        ('chicago',2,0,'pattern-lock-bass-a-cutoff',3,'26%'),
        ('miami',3,15,'pattern-lock-bass-b-cutoff',6,'26%'),
        ('breaks',4,31,'pattern-lock-break-level',9,'-0.1dB'),
    ]:
        page.locator(f'[data-engine="{engine}"]').click()
        if engine == 'miami':
            page.locator('[data-view="sound"]').click()
            page.locator('#sound-bank').select_option('CHICAGO')
        page.locator('[data-view="patterns"]').click()
        page.locator(f'[data-launch-part="{part}"][data-pattern="{pattern}"]').click()
        page.locator('[data-view="roll"]').click()
        if engine == 'breaks':
            page.locator('[data-break-view="notes"]').click()
        for _ in range(10):
            if page.locator('#lane-kind').input_value() == 'patternLock':
                break
            page.locator('#lane-param').click()
        assert page.locator('#lane-kind').input_value() == 'patternLock'
        cells=page.locator('#velocity [role="slider"][data-lane-step]:enabled')
        expect(cells).to_have_count(16)
        target=cells.nth(step)
        expect(target).to_be_visible()
        expect(target).to_have_attribute('aria-valuetext','Unset')
        target.press('ArrowDown' if engine=='breaks' else 'ArrowUp')
        expect(target).to_be_focused()
        expect(target).to_have_attribute('aria-valuetext',expected)
        expect(page.locator('#lane-value')).to_have_text(f'P{pattern+1:02d} · {expected}')
        geometry=target.evaluate("e=>{const b=e.getBoundingClientRect(),l=document.querySelector('#velocity').getBoundingClientRect();const h=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return {hit:h===e||e.contains(h),visible:b.left>=l.left-1&&b.right<=l.right+1&&b.top>=0&&b.bottom<=innerHeight+1}}")
        assert geometry['hit'] and geometry['visible'],(name,geometry)
        snap(name,[11,15] if engine=='breaks' else [3,17,22])
        if engine == 'breaks':
            page.get_by_role('button', name='Generator', exact=True).click()
            panel = page.locator('#break-generator')
            expect(panel.locator('[data-break-setting]')).to_have_count(11)
            complexity = panel.locator('[data-break-setting="0"]')
            complexity.fill('81')
            complexity.press('Tab')
            expect(complexity).to_have_value('81')
            snap('break-generator', [11])
            page.locator('[data-view="sound"]').click()
            chance = page.locator('.break-sound-chance [data-break-setting="9"]')
            expect(chance).to_have_attribute('data-break-pattern', str(pattern))
            snap('break-sound-pattern-chance', [11])
        else:
            picker = page.get_by_role('combobox', name='Choose lock target')
            expect(picker.locator('option:not([disabled])')).to_have_count(20)
            is_bass_a = engine == 'chicago'
            picker.select_option('4113' if is_bass_a else '4141')
            cell = cells.nth(2)
            expect(cell).to_have_attribute('aria-valuetext', 'Unset')
            cell.press('ArrowUp')
            expect(cell).not_to_have_attribute('aria-valuetext', 'Unset')
            snap('pattern-lock-bass-a-fx-type' if is_bass_a else 'pattern-lock-bass-b-arp', [3, 17])


def inspect_bass_steps(page, part, snap):
    menu = page.locator('.overflow')
    menu.locator('summary').click()
    with page.expect_download() as saved:
        page.locator('#draft-save').click()
    old = Path(saved.value.path()).read_bytes()
    menu.locator('summary').click()
    cells = page.locator('#velocity [data-lane-step]')
    for field in ('gate','slide','accent','release'):
        for _ in range(8):
            if page.locator('#lane-kind').input_value() == field:
                break
            page.locator('#lane-param').click()
        assert page.locator('#lane-kind').input_value() == field
        if field == 'gate':
            for cell in cells.all():
                cell.press('ArrowUp')
                cell.press('ArrowUp')
        assert cells.count() == 16 and page.locator('#velocity [data-lane-step]:enabled').count() == 16
        cells.first.focus()
        snap('bass-'+part+'-'+field,[3,22])
    page.locator('#draft-file').set_input_files({'name':'prior.json','mimeType':'application/json','buffer':old})
    page.locator('#draft-replace').click()


def inspect_synth_files(page, snap):
    field_names = runpy.run_path(str(ROOT / 'tools/check-superj6-draft-source.py'))['FIELDS']
    field_ids = {'neon' + name: str(field) for field, name in field_names.items()}
    original = os.environ.get('DNBOX_SUPERJ6_ARCHIVE')
    if original:
        filename = 'Intro Bank.superj6.bank.json'
        with zipfile.ZipFile(original) as archive:
            data = archive.read('J6presets/' + filename)
    else:
        # A local UI fixture can exercise both control layouts without the bank archive.
        filename, data = runpy.run_path(str(HERE / 'superj6_bank_journey.py'))['fixture']()
        fixture = json.loads(data)
        fixture['presets'][0]['parameterValues'] = [
            {'identifier': key, 'value': 0} for key in field_ids]
        data = json.dumps(fixture).encode()
    bank = json.loads(data)
    programs = {}
    for record in bank['presets']:
        present = {field_ids[value['identifier']] for value in record['parameterValues']
                   if value['identifier'] in field_ids}
        state = 'complete' if len(present) == len(field_ids) else 'partial'
        programs.setdefault(state, (record, present))
    assert set(programs) == {'complete', 'partial'}

    page.locator('[data-view="sound"]').click()
    for slot, part in enumerate(('chicago', 'miami')):
        page.locator(f'[data-engine="{part}"]').click()
        engine = page.locator('#sound-bank')
        engine.select_option('Synth One')
        page.locator(f'[data-open-synth-one-files="{slot}"]').click()
        dialog = page.locator(f'dialog[open][data-s1-file-slot="{slot}"]')
        dialog.locator('[data-bank] option[value="Starter Bank.json"]').wait_for(state='attached')
        dialog.locator('[data-bank]').select_option('Starter Bank.json')
        cutoff = dialog.locator('[data-s1-field="cutoff"]')
        expect(dialog.locator('[data-preset] option:checked')).to_have_text('Init')
        expect(cutoff).to_be_enabled()
        assert dialog.locator('[data-s1-field]').count() == 21
        # Two real edits followed by Undo expose both history buttons to the hit test.
        for value in ('4321', '5432'):
            cutoff.fill(value)
            cutoff.press('Tab')
        dialog.locator('[data-undo]').click()
        assert cutoff.input_value() == '4321' and dialog.locator('[data-redo]').is_enabled()
        snap(f'sound-{part}-synth-one-file', [5])
        dialog.locator('[data-close]').click()

        engine.select_option('SuperJ6')
        panel = page.locator('[data-superj6]')
        if slot == 0:
            with page.expect_file_chooser() as chooser:
                panel.locator('[data-sj6-open]').click()
            chooser.value.set_files({'name': filename, 'mimeType': 'application/json', 'buffer': data})
        else:
            panel.locator('[data-sj6-bank]').select_option(hashlib.sha256(data).hexdigest())
        for state, (record, present) in programs.items():
            panel.locator('[data-sj6-program]').select_option(record['uid'].upper())
            assert panel.locator('h3').inner_text() == record['name']
            shown = panel.locator('[data-sj6-field]').evaluate_all('els=>els.map(e=>e.dataset.sj6Field)')
            absent = panel.locator('[data-sj6-absent]').evaluate_all('els=>els.map(e=>e.dataset.sj6Absent)')
            assert set(shown) == present and set(absent) == set(field_ids.values()) - present
            snap(f'sound-{part}-superj6-import-{state}', [5])


def inspect(origin, site, output):
    native_fixture = runpy.run_path(str(HERE / 'native-sound-browser.py'))
    probe = (HERE / 'landscape-reachability.js').read_text()
    state = []
    errors = []
    failures = []
    with sync_playwright() as pw:
        b = pw.chromium.launch(chromium_sandbox=True)
        browser_version = b.version
        ctx = b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=1, has_touch=True, accept_downloads=True)
        ctx.add_init_script(native_fixture['INSTRUMENT'])
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))

        def snap(name, ref):
            page.evaluate('document.fonts.ready')
            page.wait_for_timeout(50)
            page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
            shot = page.screenshot(path=output / (name + '.png'))
            row = page.evaluate(probe)
            row.update(name=name, pdfPages=ref, sha256=hashlib.sha256(shot).hexdigest())
            state.append(row)
            if row['body'][0] != 844 or row['body'][1] != 844 or row['blocked'] or row['horizontalClips']:
                failures.append([name, 'Horizontal overflow or unreachable interactive content', row['body'], row['blocked'], row['horizontalClips']])
            roll = row.get('roll')
            if roll and (roll['row'] < 16 or roll['completeRows'] < 16 or roll['clippedLabels']):
                failures.append([name, 'Pitch rows or labels clipped in landscape', roll])
            print(name, row['controlCount'], len(row['blocked']), row['body'], row.get('roll'), flush=True)

        def view(v):
            if v in ('drums', 'locks', 'song'):
                page.locator('.overflow summary').click()
            page.locator('[data-view="' + v + '"]').click()
            if page.locator('.overflow').evaluate('e=>e.open'):
                page.locator('.overflow summary').click()

        def part(q):
            page.locator('[data-engine="' + q + '"]').click()

        def menu(q):
            if not page.locator('.overflow').evaluate('e=>e.open'):
                page.locator('.overflow summary').click()
            page.locator(q).click()
            if not page.locator('dialog[open]').count() and page.locator('.overflow').evaluate('e=>e.open'):
                page.locator('.overflow summary').click()

        def case(name, fn):
            try:
                fn()
            except Exception as e:
                failures.append([name, str(e)])
                print('CASE ERROR', name, str(e)[:250], flush=True)
                with suppress(PlaywrightError):
                    page.screenshot(path=output / (name + '-error.png'))

        def inspect_part(q):
            part(q)
            view('roll')
            snap('roll-' + q, [1, 2, 14, 15, 21] if q != 'breaks' else [11])
            if q in ('chicago','miami'):
                inspect_bass_steps(page,q,snap)
            if q == 'breaks':
                page.locator('[data-break-view="notes"]').click()
                snap('break-notes', [11])
                page.locator('[data-break-view="slices"]').click()
            view('sound')
            if q.startswith('drum'):
                vals = page.locator('#sound-voice option').evaluate_all('es=>es.map(e=>e.value)')
                for v in vals:
                    page.locator('#sound-voice').select_option(v)
                    snap('sound-' + q + '-' + v, [18])
                    page.get_by_role('button', name='Open original', exact=True).click()
                    snap('original-' + q + '-' + v, [18])
                    page.get_by_role('button', name='Return to Sound', exact=True).click()
            elif q in ['chicago', 'miami']:
                vals = page.locator('#sound-bank option').evaluate_all('es=>es.map(e=>e.value)')
                assert vals == ['CHICAGO', 'MIAMI', 'Synth One', 'SuperJ6'], (q, vals)
                assert not page.locator('[data-restore-legacy-juno]').count()
                for v in vals:
                    page.locator('#sound-bank').select_option(v)
                    snap('sound-' + q + '-' + v, [4, 5, 24])
            else:
                snap('sound-breaks', [11])
            for v, ref in [('patterns', [9, 19]), ('locks', [3, 17]), ('drums', [2, 15])]:
                view(v)
                snap(v + '-' + q, ref)
                if v == 'drums' and q in ('drum909', 'drum808'):
                    navigation = page.get_by_role('navigation', name=q.removeprefix('drum') + ' step navigation')
                    navigation.get_by_role('button', name='Voices 7–11').tap()
                    seventh = page.locator('.sequencer-grid [data-drum-note]').nth(6 * 16)
                    assert seventh.evaluate('node => node === document.activeElement')
                    snap('drums-voices-7-11-' + q, ref)
                    navigation.get_by_role('button', name='Accent lane').tap()
                    accents = page.locator('.drum-accent-row [data-drum-accent-step]')
                    assert accents.count() == 16
                    assert accents.first.evaluate('node => node === document.activeElement')
                    accents.last.tap()
                    accents.first.tap()
                    accents.first.tap()
                    assert accents.first.get_attribute('aria-pressed') == 'false'
                    assert accents.last.get_attribute('aria-pressed') == 'true'
                    snap('drums-accent-' + q, ref)
                    for _ in range(3):
                        page.locator('#undo').tap()
                    assert accents.first.get_attribute('aria-pressed') == 'mixed'

        def legacy_basses():
            archived = HERE / 'fixtures/legacy-sound-banks/both-owners.json'
            page.locator('#draft-file').set_input_files(archived)
            page.locator('#draft-replace').click()
            for slot, q in enumerate(('chicago', 'miami')):
                part(q)
                view('sound')
                picker = page.locator('#sound-bank')
                assert picker.input_value() == 'JUNO' and picker.locator('option:checked').evaluate('option => option.disabled')
                picker.select_option('CHICAGO')
                assert picker.locator('option[value="JUNO"]').count() == 0
                page.locator('[data-restore-legacy-juno]').click()
                assert picker.input_value() == 'JUNO'
                controls = page.locator(f'.source-sound-list [data-param^="source-sound/JUNO/{slot}|"]')
                assert controls.count() == 16
                snap('sound-' + q + '-JUNO', [4, 5, 24])

        def mixes(native=False):
            view('mix')
            if native:
                page.locator('[data-mix-source="emulator"]').click()
                page.locator('[data-runtime-key]:enabled').first.wait_for()
            for v in ['levels', 'pan', 'sends', 'fx', 'master']:
                page.locator('[data-mix-mode="' + v + '"]').click()
                snap(('native-' if native else 'draft-') + 'mix-' + v, [6, 7, 8, 16, 23])

        def dialogs():
            part('chicago')
            view('files')
            snap('projects', [12, 20])
            opener = page.locator('[data-project-preset-open]')
            save_copy = page.locator('[data-project-preset-save]')
            assert save_copy.is_disabled()
            opener.click()
            editor = page.locator('#project-preset-dialog')
            snap('projects-original-empty', [12, 20])
            editor.locator('[data-preset-file]').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':b'{}'})
            expect(editor.locator('[data-preset-status]')).to_have_text('Invalid Synth One file')
            snap('projects-original-invalid', [12, 20])
            editor.locator('[data-preset-file]').set_input_files(ROOT / 'web/product-site/remote/synth-one-banks/Starter Bank.json')
            expect(editor.locator('[data-preset-keep]')).to_be_enabled()
            snap('projects-original-editor', [12, 20])
            editor.locator('[data-preset-keep]').click()
            assert save_copy.is_enabled()
            snap('projects-original-kept', [12, 20])
            view('song')
            snap('song-empty', [10])
            view('patterns')
            page.locator('[data-pattern-scope="all"]').click()
            snap('all-part-patterns', [9, 19])
            for i in range(5):
                page.locator('[data-launch-part="' + str(i) + '"]').first.click()
            view('song')
            page.locator('#song-add').click()
            page.locator('[data-song-pattern]').first.wait_for()
            snap('song-row', [10])
            view('patterns')
            menu('#review')
            snap('review-dialog', [13])
            page.locator('#review-discard').tap()
            assert page.locator('#review-keep').evaluate('b=>b===document.activeElement')
            snap('review-discard-confirm', [13])
            page.locator('#review-keep').tap()
            page.locator('#review-dialog button').click()
            page.locator('.overflow summary').click()
            snap('more-menu', [13])
            page.locator('.overflow summary').click()
            page.locator('#connect').click()
            snap('connect-feedback', [13])
            page.locator('#close-connection').click()
            page.locator('#draft-file').set_input_files({'name': 'invalid.json', 'mimeType': 'application/json', 'buffer': b'{}'})
            page.locator('#draft-dialog[open]').wait_for()
            snap('draft-invalid', [13])
            page.locator('#draft-cancel').click()
            with page.expect_download() as dl:
                menu('#draft-save')
            data = Path(dl.value.path()).read_bytes()
            page.locator('#draft-file').set_input_files({'name': 'session.json', 'mimeType': 'application/json', 'buffer': data})
            page.locator('#draft-dialog[open]').wait_for()
            snap('draft-import', [13])
            page.locator('#draft-cancel').click()

        def native():
            page.goto(origin + '/remote/', wait_until='networkidle')
            menu('#emulator-start')
            page.wait_for_function("document.querySelector('#native-playing').textContent.endsWith('off')", timeout=20000)
            for q in ('miami', 'chicago'):
                part(q)
                view('sound')
                page.locator('[data-sound-source="emulator"]').click()
                if q == 'chicago':
                    page.wait_for_function('soundErrors.length>0')
                    snap('native-sound-choice-unavailable', [5])
                    page.locator('[data-sound-source="draft"]').click()

                    def panel(msg, ms):
                        at = page.evaluate('nativeFrames.at(-1).time')
                        page.evaluate('m=>nativeNodes.at(-1).port.postMessage(m)', msg)
                        page.wait_for_function('t=>nativeFrames.at(-1).time>=t', arg=at + ms, timeout=5000)
                    for _ in range(4):
                        panel(dict(type='turn', role=1, delta=1), 240)
                    panel(dict(type='buttons', bits=16), 110)
                    panel(dict(type='buttons', bits=0), 110)
                    panel(dict(type='turn', role=0, delta=-1), 240)
                    panel(dict(type='turn', role=3, delta=-1), 240)
                    page.locator('[data-sound-source="emulator"]').click()
                page.locator('[data-native-param]:enabled').first.wait_for(timeout=10000)
                snap('native-sound-' + q, [4, 5, 24])
            mixes(True)
            menu('#emulator-stop')
        try:
            page.goto(origin + '/remote/', wait_until='networkidle')
            for q in PARTS:
                case(q, lambda q=q: inspect_part(q))
            case('mix', mixes)
            case('dialogs', dialogs)
            case('imported legacy basses', legacy_basses)
            case('native', native)
            for q in ('device', 'identity'):
                page.goto(origin + '/remote/' + q + '/', wait_until='networkidle')
                snap(q, [13])

            def break_chance():
                page.goto(origin + '/remote/', wait_until='networkidle')
                part('breaks')
                view('roll')
                page.locator('[data-break-view="notes"]').click()
                details = author_break_chance(page)
                snap('break-chance-authored', [11, 15])
                state[-1]['breakChance'] = details

            case('authored BREAK Chance', break_chance)

            def pattern_locks():
                page.goto(origin + '/remote/',wait_until='networkidle')
                inspect_pattern_locks(page,snap)

            case('authored pattern locks',pattern_locks)

            def synth_files():
                page.goto(origin + '/remote/', wait_until='networkidle')
                inspect_synth_files(page, snap)

            case('Synth One files and imported SuperJ6 programs', synth_files)
        finally:
            ctx.close()
            b.close()


    expected = expected_states()
    names = [row['name'] for row in state]
    if set(names) != expected or len(names) != len(expected):
        failures.append(['coverage', sorted(expected - set(names)), sorted(set(names) - expected)])
    report = {
        'browser': browser_version, 'count': len(state), 'failures': failures, 'pageErrors': errors,
        'enabledControlPresentations': sum(row['controlCount'] for row in state),
        'reachablePresentations': sum(row['reachable'] for row in state),
        'manifestSha256': hashlib.sha256((ROOT / 'web/product-site/SOURCE-MANIFEST.json').read_bytes()).hexdigest(),
        'kernelSha256': hashlib.sha256((site / 'emu/kernel.wasm').read_bytes()).hexdigest(),
    }
    (output / 'states.json').write_text(json.dumps(state, indent=2) + '\n')
    (output / 'execution.json').write_text(json.dumps(report, indent=2) + '\n')
    print('844×390 landscape', json.dumps(report), flush=True)
    return not failures and not errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, help='existing product build with the pinned emulator')
    parser.add_argument('--output', type=Path, help='fresh directory for per-state screenshots and geometry')
    args = parser.parse_args()
    build = ROOT / '.output'
    build.mkdir(exist_ok=True)
    if args.output:
        output = args.output.resolve()
        output.mkdir(parents=True, exist_ok=False)
    else:
        output = Path(tempfile.mkdtemp(prefix='landscape-evidence-', dir=build))
    print('Landscape evidence:', output, flush=True)
    server = runpy.run_path(str(HERE / 'envelope-browser.py'))['server']
    if args.site:
        site = args.site.resolve()
        with server(site) as origin:
            return inspect(origin, site, output)
    with tempfile.TemporaryDirectory(prefix='landscape-site-', dir=build) as tmp:
        site = Path(tmp)
        subprocess.run(['node', 'scripts/build-product-site.mjs', '--output', site], cwd=ROOT, check=True)
        with server(site) as origin:
            return inspect(origin, site, output)


if __name__ == '__main__':
    raise SystemExit(0 if main() else 1)
