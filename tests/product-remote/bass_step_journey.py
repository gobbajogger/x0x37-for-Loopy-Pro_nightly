# SPDX-License-Identifier: GPL-3.0-only
from playwright.async_api import expect


async def exercise(page, draft_state, load_draft):
    old = await draft_state(page)
    assert 'stepLanes' not in old
    lane = page.locator('#lane-kind')
    cycle = page.locator('#lane-param')
    cells = page.locator('#velocity [data-lane-step]')

    async def choose(kind):
        for _ in range(8):
            if await lane.input_value() == kind:
                return
            await cycle.click()
        assert await lane.input_value() == kind

    await choose('gate')
    await expect(cells.nth(0)).to_have_attribute('aria-valuetext', 'Unset')
    await cells.nth(0).press('ArrowUp')
    await expect(cells.nth(0)).to_have_attribute('aria-valuetext','Rest')
    await cells.nth(0).press('ArrowUp')
    await expect(cells.nth(0)).to_have_attribute('aria-valuetext','Note')
    await cells.nth(0).press('ArrowUp')
    await expect(cells.nth(0)).to_have_attribute('aria-valuetext','Tie')
    await choose('release')
    await expect(cells.nth(0)).to_have_attribute('aria-valuetext','Legacy')
    await expect(cells.nth(1)).to_be_disabled()
    await cells.nth(0).press('ArrowUp')
    await expect(cells.nth(0)).to_have_attribute('aria-valuetext','1/15')
    await choose('slide')
    a, b = await cells.nth(0).bounding_box(), await cells.nth(3).bounding_box()
    await page.mouse.move(a['x']+a['width']/2,a['y']+2); await page.mouse.down()
    await page.mouse.move(b['x']+b['width']/2,b['y']+2,steps=3); await page.mouse.up()
    after = await draft_state(page)
    assert after['stepLanes']['chicago']['slide'][:4] == [1]*4
    assert after['notes'] == old['notes']
    await page.locator('#undo').click()
    assert 'slide' not in (await draft_state(page))['stepLanes']['chicago']
    await page.locator('#redo').click()
    assert (await draft_state(page))['stepLanes'] == after['stepLanes']
    await choose('gate')
    await cells.nth(0).press('ArrowDown')
    assert (await draft_state(page))['stepLanes']['chicago']['release'][0] == 0
    await page.locator('#undo').click()
    assert (await draft_state(page))['stepLanes']['chicago']['release'][0] == 1
    await page.locator('[data-engine=miami]').click()
    await choose('accent')
    await cells.nth(0).press('ArrowUp')
    await expect(cells.nth(0)).to_have_attribute('aria-valuetext','Off')
    await cells.nth(0).press('ArrowUp')
    saved = await draft_state(page)
    assert saved['stepLanes']['miami']['accent'][0] == 1
    assert saved['stepLanes']['chicago'] == after['stepLanes']['chicago']
    await cells.nth(0).press('Delete')
    assert 'miami' not in (await draft_state(page))['stepLanes']
    await load_draft(page,saved)
    assert await draft_state(page) == saved
    await load_draft(page,old)
    assert await draft_state(page) == old
    assert await page.locator('#apply').is_disabled()
