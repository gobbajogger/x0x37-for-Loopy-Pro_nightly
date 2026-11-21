# SPDX-License-Identifier: GPL-3.0-only
"""Optional real-engine replay for firmware-browser.py, using the archived stdio pilot."""
import asyncio
import hashlib
import json
import subprocess
from time import monotonic
from playwright.async_api import expect

SOURCE = '246ea3718c6c72ba80bbd1aafcd5356f871c78c8'
CODEC = '2ba77fa371114c978dc00d25f2205ff69593a9ab4f24a3a406c262426bdf50d2'
SCALAR_REVIEW = 'fe9bf3af5902214abf311df5da2f5d231871bbcb3e7ae32f749f69fab4a6f35c'


async def verify_queued_cutoff(browser, origin, checkout, attach):
    # Build this pinned checkout with tests/host/remote_actual_core_test.sh first.
    source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=checkout, text=True).strip()
    assert source == SOURCE
    subprocess.run(['git', 'diff', '--quiet', 'HEAD', '--'], cwd=checkout, check=True)
    assert hashlib.sha256((checkout / 'tests/host/dnr2_reference/browser_codec.mjs').read_bytes()).hexdigest() == CODEC
    review = subprocess.check_output(['git', 'show', 'HEAD:docs/lanes/evidence/integ-remote-scalar-review.json'], cwd=checkout)
    assert hashlib.sha256(review).hexdigest() == SCALAR_REVIEW
    binary = checkout / 'build/host/remote-actual-core/test'
    catalog = json.loads(subprocess.check_output([binary, '--catalog'], timeout=30))
    assert catalog['testOnly'] and not catalog['admitted'] and not catalog['nativeAdmitted']
    assert catalog['count'] == 326 and catalog['crc'] == 0xeec38bc1
    cutoff, = [c for c in catalog['controls'] if c['bank'] == 0 and c['voice'] == 0 and c['label'] == 'CUTOFF']
    # This copy exists only in this isolated browser context. Preserve the host's
    # actual IDs, count and CRC, and explicitly select the simulator UI. The
    # archived scalar review covers the primitive only and grants no admission.
    bundle = {'catalog': {**catalog, 'admitted': True}, 'admission': {
        'catalogCrc': catalog['crc'], 'sourceSha': SOURCE, 'reviewSha': SCALAR_REVIEW, 'testOnly': True}}
    host = await asyncio.create_subprocess_exec(binary, '--serve', stdin=asyncio.subprocess.PIPE,
                                                stdout=asyncio.subprocess.PIPE)
    frames = []

    async def exchange(_page, wire_hex):
        host.stdin.write((wire_hex + '\n').encode())
        await host.stdin.drain()
        response = json.loads(await asyncio.wait_for(host.stdout.readline(), 5))
        command = bytes.fromhex(wire_hex)
        reply = bytes.fromhex(response['hex'])
        assert len(command) == len(reply) == 51 and not response['admitted']
        # DNR2 replies carry 7-bit little-endian control, revision and value fields.
        def unpack(offset, count):
            return sum(reply[offset + i] << (7 * i) for i in range(count))
        frames.append((command[5], reply[6], unpack(28, 2), unpack(24, 4), unpack(30, 5)))
        return response

    page = await browser.new_page(viewport={'width': 1280, 'height': 900}, has_touch=True)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    phase, started = 'open Remote', monotonic()
    try:
        # The test adapter crosses Playwright and a subprocess for every MIDI
        # packet. Match the bridge's five-second response deadline.
        await page.add_init_script('window.__DNBOX_MIDI_TIMEOUT=5000;')
        await attach(page, json.dumps(bundle), exchange)
        response = await page.goto(origin + '/remote/', wait_until='networkidle')
        assert response and response.ok, (page.url, response.status if response else None)
        phase, started = 'connect', monotonic()
        await page.locator('#connect').click()
        await expect(page.locator('#conn-state')).to_have_text('Connected. 294 controls confirmed.', timeout=60000)
        field = page.locator('#fw-' + str(cutoff['id']))
        original = int(await field.input_value())
        changed = original + 1 if original < cutoff['max'] else original - 1
        assert changed != original
        menu = page.locator('details.overflow')
        if not await menu.evaluate('node => node.open'):
            await menu.locator('summary').click()
        await field.click(timeout=8000)
        await field.tap(timeout=8000)
        await field.fill(str(changed), timeout=8000)
        phase, started = 'cutoff Apply', monotonic()
        await page.locator('#apply').click()
        state = page.locator('#conn-state')
        await expect(state).to_have_text(f'Stored {changed}. Update queued.', timeout=60000)
        assert await state.get_attribute('data-session') == 'ready', await state.inner_text()
        await expect(field).to_have_value(str(changed))
        phase, started = 'cutoff Undo', monotonic()
        await page.locator('#firmware-undo').click()
        await expect(state).to_have_text(f'Restored stored value {original}. Update queued.', timeout=60000)
        await expect(field).to_have_value(str(original))
        assert await page.locator('#firmware-undo').count() == 0
        assert not errors, errors
        addressed = [r for r in frames if r[2] == cutoff['id'] and r[0] in (2, 3)]
        assert [r[:2] for r in addressed] == [(2,0),(3,1),(2,0),(2,0),(3,1),(2,0)], addressed
        assert [r[4] for r in addressed] == [original,changed,changed,changed,original,original], addressed
        assert [r[3] for r in addressed] == [1,2,2,2,3,3], addressed
        print(json.dumps({'test': 'Chicago stored cutoff through Remote Apply and Undo', 'source': SOURCE,
                          'control': cutoff['id'], 'browser': browser.version, 'wire': addressed}), flush=True)

        # The real macro recalculates Threshold and Makeup asymmetrically. A
        # second explicit Apply demonstrates the result of setting it back on
        # this disposable host. The first write must offer no scalar Undo.
        comp = page.locator('#fw-253')
        makeup = page.locator('#fw-245')
        threshold = page.locator('#fw-241')
        await expect(comp).to_have_value('95')
        await expect(makeup).to_have_value('85')
        await expect(threshold).to_have_value('64')
        for value, threshold_value, makeup_value, affected in [('96', '60', '85', 'THRESH'), ('95', '61', '84', 'THRESH, MAKEUP')]:
            await comp.fill(value)
            phase, started = f'COMP Apply {value}', monotonic()
            await page.locator('#apply').click()
            await expect(state).to_have_text(f'Stored {value}. Update queued. Other control values changed ({affected}).', timeout=60000)
            await expect(comp).to_have_value(value)
            await expect(threshold).to_have_value(threshold_value)
            await expect(makeup).to_have_value(makeup_value)
            assert await page.locator('#firmware-undo').count() == 0
        snapshots = [{r[2]: (r[1], r[4]) for r in frames if r[0] == 2 and r[3] == revision}
                     for revision in (3, 4, 5)]
        assert all(len(snapshot) == catalog['count'] for snapshot in snapshots)
        changed_controls = {c['id']: [snapshot[c['id']] for snapshot in snapshots] for c in catalog['controls']
                            if len({snapshot[c['id']] for snapshot in snapshots}) > 1}
        assert changed_controls == {241: [(0, 64), (0, 60), (0, 61)],
                                    245: [(0, 85), (0, 85), (0, 84)],
                                    253: [(0, 95), (0, 96), (0, 95)]}, changed_controls
        assert not errors, errors
        print(json.dumps({'test': 'Coupled COMP uses explicit Apply in both directions; scalar Undo withheld',
                          'THRESH': changed_controls[241], 'MAKEUP': changed_controls[245],
                          'COMP': changed_controls[253]}), flush=True)
    except Exception:
        last_read = next(({'control': control, 'status': status, 'revision': revision, 'value': value}
                          for op, status, control, revision, value in reversed(frames) if op == 2), None)
        print(json.dumps({'url': page.url, 'phase': phase, 'phaseElapsedMs': round((monotonic() - started) * 1000),
                          'frames': len(frames), 'lastRead': last_read, 'lastFrames': frames[-6:],
                          'pageErrors': errors}), flush=True)
        raise
    finally:
        await page.close()
        host.stdin.close()
        try:
            await asyncio.wait_for(host.wait(), 5)
        except asyncio.TimeoutError:
            host.kill()
            await host.wait()
