# SPDX-License-Identifier: GPL-3.0-only
from playwright.async_api import expect


async def exercise(page, draft_state, load_draft):
    kind = page.locator('#lane-kind')
    cycle = page.locator('#lane-param')
    header = page.locator('#lane-value')
    cells = page.locator('#velocity [data-lane-step]')

    async def choose(name):
        for _ in range(10):
            if await kind.input_value() == name:
                return
            await cycle.click()
        raise AssertionError(name)

    async def metrics():
        return await cells.evaluate_all("""cells => cells.map(cell => {
            const out = cell.querySelector('output'), bounds = out.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(out);
            const ink = range.getBoundingClientRect();
            return {full:cell.getAttribute('aria-valuetext'), shown:out.innerText,
                width:bounds.width, fits:ink.width === 0 ||
                    (ink.left >= bounds.left - .05 && ink.right <= bounds.right + .05)};
        })""")

    await page.locator('[data-engine="chicago"]').click()
    await page.locator('[data-view="patterns"]').click()
    await page.locator('[data-launch-part="2"][data-pattern="0"]').click()
    await page.locator('[data-view="roll"]').click()
    doc = await draft_state(page)
    first = next(n for n in doc['notes'] if n['track'] == 'chicago')
    doc['notes'].append(dict(first,id='draft999',sourceOrder=None,note=first['note']+4,velocity=80))
    selector_rows = {
        4096:[0,64,127], 4107:[0,127], 4110:[0,64,127], 4111:[0,64,127],
        4113:list(range(12)),
    }
    doc['patternLocks'] = [
        {'catalogId':target,'pattern':0,'values':[*values,*([None]*(16-len(values)))]}
        for target,values in selector_rows.items()
    ]
    await load_draft(page,doc)

    for width,height in [(390,844),(844,390),(1024,640),(1440,900)]:
        await page.set_viewport_size({'width':width,'height':height})
        await page.evaluate('document.fonts.ready')
        await choose('gate')
        await cells.first.press('Delete')
        await cells.first.focus()
        await expect(header).to_have_text('Unset')
        await expect(cells.first).to_have_accessible_name('Step 1, Gate Unset')
        measured = await metrics()
        assert len(measured) == 16 and all(r['fits'] for r in measured), (width,'gate',measured)
        expected = '—' if measured[0]['width'] <= 32 else 'Unset'
        assert all(r['shown'] == expected for r in measured), (width,measured)
        for value in ['Rest','Note','Tie']:
            await cells.first.press('ArrowUp')
            await expect(header).to_have_text(value)
            await expect(cells.first).to_have_attribute('aria-valuetext',value)
            assert (await metrics())[0]['shown'] == value

        await choose('release')
        await cells.first.focus()
        await expect(header).to_have_text('Legacy')
        if (width,height) == (844,390):
            text_box = await header.evaluate("""out => {
                const range = document.createRange();
                range.selectNodeContents(out);
                const label = range.getBoundingClientRect();
                const button = out.closest('button').getBoundingClientRect();
                return {top:label.top-button.top, bottom:button.bottom-label.bottom};
            }""")
            assert min(text_box.values()) >= 0, ('Legacy readout clips',text_box)
        for _ in range(15):
            await cells.first.press('ArrowUp')
        await expect(header).to_have_text('15/15')
        await expect(cells.first).to_have_attribute('aria-valuetext','15/15')
        await choose('velocity')
        await cells.first.focus()
        await expect(cells.first).to_have_attribute('aria-valuetext','Mixed')
        await expect(header).to_have_text('Mixed')
        for field in ['velocity','chance','pitch','pan','gate','slide','accent','release','patternLock']:
            await choose(field)
            rows = await metrics()
            assert all(r['fits'] for r in rows), (width,field,rows)
            if field == 'chance':
                assert any(r['full'] == '100%' and r['shown'] in ('100','100%') for r in rows)
        picker = page.locator('#lock-target')
        await picker.select_option('4098')
        await cells.first.press('Delete')
        await cells.first.press('ArrowUp')
        await expect(cells.first).to_have_attribute('aria-valuetext','26%')
        await expect(header).to_have_text('P01 · 26%')
        row = (await metrics())[0]
        assert row['fits'] and row['shown'] in ('26','26%'), (width,'cutoff',row)
        await cells.first.press('ArrowDown')
        await expect(header).to_have_text('P01 · 25%')
        for target, values in selector_rows.items():
            await picker.select_option(str(target))
            labels = (await metrics())[:len(values)]
            assert all(r['fits'] and r['shown'] for r in labels), (width,target,labels)
            assert len({r['shown'] for r in labels}) == len(values), (width,target,labels)
        compressor = cells.nth(4)
        await compressor.focus()
        await expect(compressor).to_have_accessible_name('Step 5, FX type lock COMPRESSOR')
        await expect(header).to_have_text('P01 · COMPRESSOR')
        await picker.select_option('4098')
        print('STEP_LABELS PASS',width,height,'16 cell bounds, 9 lanes, mixed and complete selected readouts',flush=True)
