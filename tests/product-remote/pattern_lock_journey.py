# SPDX-License-Identifier: GPL-3.0-only
from playwright.async_api import expect


async def check_slice_range(page, draft_state):
    before = await draft_state(page)
    button = page.get_by_role('button', name='Slice 1–32', exact=True)
    await button.focus()
    await button.press('Enter')
    step_eight = page.locator('[data-break-step="7"]')
    await expect(step_eight).to_be_focused()
    assert await step_eight.locator('option').all_text_contents() == ['Auto', *map(str, range(1, 33))]
    await step_eight.select_option('32')
    await button.click()
    await expect(step_eight).to_be_focused()
    after = await draft_state(page)
    expected = before.get('breakSequence', {}).get('slices', [0] * 16).copy()
    expected[7] = 32
    assert after['breakSequence']['slices'] == expected
    for name in ('launch', 'motion', 'patternLocks'):
        assert after.get(name) == before.get(name)


async def check_lock_target(page):
    result = await page.locator('#lock-target').evaluate('''picker => {
        const host=picker.closest('label'), box=picker.getBoundingClientRect();
        const hit=(element,x,y)=>element.contains(document.elementFromPoint(x,y));
        const corners=[[2,2],[box.width-2,2],[2,box.height-2],[box.width-2,box.height-2],
                       [box.width/2,box.height/2]];
        const protects=['#roll-scroll','#pitch-rail','#beat-ruler','#velocity','.tabs','.engines'];
        const geometry=()=>protects.map(q=>{
            const r=document.querySelector(q).getBoundingClientRect();
            return [r.x,r.y,r.width,r.height];
        });
        const placed=geometry();
        host.hidden=true;
        const original=geometry();
        host.hidden=false;
        const editable=['#roll-scroll','#pitch-rail','#beat-ruler','#velocity .step-slider',
                        '.tab[data-view="roll"]','.engine[aria-pressed="true"]','#connect'];
        const clear=editable.map(q=>{
            const e=document.querySelector(q),r=e.getBoundingClientRect();
            return [q,hit(e,r.x+r.width/2,r.y+r.height/2)];
        });
        return {box:[box.width,box.height],inside:box.left>=0&&box.top>=0&&
                    box.right<=innerWidth&&box.bottom<=innerHeight,
                hit:corners.every(([x,y])=>hit(picker,box.x+x,box.y+y)),clear,
                fixed:placed.every((r,i)=>r.every((v,j)=>Math.abs(v-original[i][j])<1))};
    }''')
    assert min(result['box']) >= 40 and result['inside'] and result['hit'], result
    assert result['fixed'] and all(ok for _,ok in result['clear']), result


async def exercise(page, draft_state, load_draft):
    old = await draft_state(page)
    lane = page.locator('#lane-kind')
    cycle = page.locator('#lane-param')
    cells = page.locator('#velocity [data-lane-step]')
    notes = old['notes']

    async def choose_lane():
        for _ in range(10):
            if await lane.input_value() == 'patternLock':
                return
            await cycle.click()
        raise AssertionError('Pattern lock missing from the thin lane')

    async def target(part, pattern):
        await page.locator('[data-view="patterns"]').click()
        await page.locator(f'[data-launch-part="{part}"][data-pattern="{pattern}"]').click()
        await page.locator('[data-view="roll"]').click()
        if part == 4:
            await page.get_by_role('button', name='Step locks',exact=True).click()
            await expect(cells.first).to_be_focused()
            await expect(lane).to_have_value('patternLock')
            axis = await page.locator('#velocity .lane-track').evaluate('''track => ({
                width:track.getBoundingClientRect().width,
                viewport:document.querySelector('#roll-scroll').clientWidth,
                zoom:Number(document.querySelector('#zoom').value)
            })''')
            assert abs(axis['width'] - axis['viewport'] * axis['zoom']) <= 1,axis
        else:
            await choose_lane()
        await expect(cycle).to_contain_text('P' + str(pattern + 1).zfill(2))

    async def rows():
        doc = await draft_state(page)
        assert doc['notes'] == notes and doc['motion'] == old['motion']
        return {(r['catalogId'],r['pattern']):r['values'] for r in doc.get('patternLocks',[])}

    await choose_lane()
    await expect(cycle).to_contain_text('Pick pattern')
    assert 'Pick in Patterns' in await cycle.get_attribute('aria-label')
    assert await cells.count() == 16 and await cells.locator('xpath=self::*[@disabled]').count() == 16
    await target(2, 0)
    await check_lock_target(page)
    await cells.nth(15).press('ArrowUp')
    await expect(cells.nth(15)).to_be_focused()
    await expect(cells.nth(15)).to_have_attribute('aria-valuetext','26%')
    await expect(page.locator('#lane-value .lock-display')).to_have_text('26%')
    assert (await rows())[4098,0][15] == 33
    await page.locator('#undo').click();assert await rows() == {}
    await page.locator('#redo').click();assert (await rows())[4098,0][15] == 33
    # Use the actual Motion route and choose another Chicago parameter.
    if not await page.locator('.overflow').evaluate('e=>e.open'):
        await page.locator('.overflow summary').click()
    await page.locator('[data-view="locks"]').click()
    if await page.locator('.overflow').evaluate('e=>e.open'):
        await page.locator('.overflow summary').click()
    picker=page.get_by_role('combobox',name='Choose lock target')
    await expect(picker).to_be_visible()
    await check_lock_target(page)
    await expect(picker.locator('option:not([disabled])')).to_have_count(20)
    await picker.select_option('4113')
    await expect(cycle).to_contain_text('FX TYPE')
    assert (await draft_state(page))['context']['lockTarget']==4113
    assert (4113,0) not in await rows()
    await cells.nth(2).press('ArrowUp')
    await expect(cells.nth(2)).to_have_attribute('aria-valuetext','CHO/FLG')
    await expect(page.locator('#lane-value .lock-display')).to_have_text('CHO/FLG')
    assert (await rows())[4113,0][2]==1
    await page.locator('#undo').click()
    assert (4113,0) not in await rows()
    await page.locator('#redo').click()
    saved_target=await draft_state(page)
    if not await page.locator('.overflow').evaluate('e=>e.open'):
        await page.locator('.overflow summary').click()
    await page.locator('#review').click()
    await expect(page.locator('#changes')).to_contain_text('Bass A / CHICAGO · P01 · Step 16 · Cutoff lock: 26%')
    await expect(page.locator('#changes')).to_contain_text('Bass A / CHICAGO · P01 · Step 3 · FX type lock: CHO/FLG')
    await page.locator('#review-dialog').get_by_role('button',name='Return').click()
    await picker.select_option('4099')
    await load_draft(page,saved_target)
    await expect(picker).to_have_value('4113')
    await expect(cells.nth(2)).to_have_attribute('aria-valuetext','CHO/FLG')
    await cells.nth(2).press('Delete')
    assert (4113,0) not in await rows()
    await picker.select_option('4098')
    await target(2,31)
    await expect(cells.nth(15)).to_have_attribute('aria-valuetext','Unset')
    await cells.nth(15).press('ArrowDown');assert (await rows())[4098,31][15] == 31
    await cells.nth(15).press('Delete');assert (4098,31) not in await rows()
    selected = (await draft_state(page))['context']['selected']
    await cells.nth(0).scroll_into_view_if_needed()
    a,b=await cells.nth(0).bounding_box(),await cells.nth(2).bounding_box()
    await page.mouse.move(a['x']+a['width']/2,a['y']+2);await page.mouse.down()
    await page.mouse.move(b['x']+b['width']/2,b['y']+2,steps=5)
    await page.mouse.move(b['x']+b['width']/2,b['y']+b['height']-2,steps=4);await page.mouse.up()
    points=(await rows())[4098,31]
    assert points[0]==127 and points[2]==0 and points[1] is not None,points
    assert (await draft_state(page))['context']['selected'] == selected
    await page.locator('#undo').click();assert (4098,31) not in await rows()
    await page.locator('#redo').click();assert (await rows())[4098,31]==points
    await page.locator('[data-engine="miami"]').click()
    await target(3, 0)
    await cells.nth(0).press('ArrowUp')
    assert (await rows())[4201, 0][0] == 77
    await page.locator('#undo').click()
    assert (4201, 0) not in await rows()
    await page.locator('#redo').click()
    assert (await rows())[4201, 0][0] == 77
    await expect(picker).to_be_hidden()
    await expect(cells.nth(0)).to_have_attribute('aria-valuetext','61 %')
    await page.locator('[data-view="sound"]').click();await page.locator('#sound-bank').select_option('CHICAGO')
    await target(3,0)
    await cells.nth(0).press('ArrowDown')
    assert (await rows())[4130,0][0] == 31
    assert (await rows())[4201,0][0] == 77
    await picker.select_option('4141')  # Bass B arp On has two q127 detents.
    await cells.nth(1).press('ArrowDown')
    assert (await rows())[4141,0][1]==0
    await cells.nth(1).press('ArrowUp')
    await expect(cells.nth(1)).to_have_attribute('aria-valuetext','ON')
    assert (await rows())[4141,0][1]==127
    await cells.nth(1).press('Delete')
    assert (4141,0) not in await rows()
    # Returning to MIAMI after selecting Chicago Arp must recover the existing cutoff.
    await page.locator('[data-view="sound"]').click()
    await page.locator('#sound-bank').select_option('MIAMI')
    await target(3,0)
    await expect(picker).to_be_hidden()
    await expect(cells.nth(0)).to_have_attribute('aria-valuetext','61 %')
    await page.locator('[data-engine="breaks"]').click()
    await target(4,2)
    await cells.nth(7).press('ArrowDown')
    assert (await rows())[1153,2][7] == 126
    review = page.get_by_role('button',name='Review draft',exact=True)
    await review.click()
    await expect(page.locator('#changes')).to_contain_text('Bass B / MIAMI · P01 · Step 1 · Cutoff lock: 61 %')
    await expect(page.locator('#changes')).to_contain_text('Bass B / CHICAGO · P01 · Step 1 · Cutoff lock: 24%')
    await expect(page.locator('#changes')).to_contain_text('BREAK · P03 · Step 8 · Level lock: -0.1dB')
    await page.locator('#review-dialog').get_by_role('button',name='Return').click()
    await expect(review).to_be_focused()
    saved = await draft_state(page)
    assert saved['context']['breakView'] == 'notes'
    await check_slice_range(page, draft_state)
    await load_draft(page,saved)
    await expect(page.locator('[data-break-view="notes"]')).to_have_attribute('aria-pressed','true')
    await expect(lane).to_have_value('patternLock')
    await expect(cells.nth(7)).to_have_attribute('aria-valuetext','-0.1dB')
    assert await rows() == {(r['catalogId'],r['pattern']):r['values'] for r in saved['patternLocks']}
    await load_draft(page,old);assert await rows() == {}
    print('PATTERN_LOCK_BROWSER PASS owners 2/3/4, separate P01/P32, explicit target, empty steps, multi-point 127-to-0 gesture, Undo/Redo, delete, review and round trip',flush=True)
