# SPDX-License-Identifier: GPL-3.0-only
from playwright.async_api import expect


async def exercise(page, kit, save):
    navigation = page.get_by_role('navigation', name=kit + ' step navigation')
    buttons = navigation.get_by_role('button')
    await expect(buttons).to_have_text(['Voices 1–6', 'Voices 7–11', 'Accent lane', 'Review draft'])
    cells = page.locator('.sequencer-grid [data-drum-note]')
    accents = page.locator('.sequencer-grid [data-drum-accent-step]')
    await expect(cells).to_have_count(176)
    await expect(accents).to_have_count(16)
    history = [await page.locator(id).is_enabled() for id in ('#undo', '#redo')]
    before = await save(page)

    for button in await buttons.all():
        box = await button.bounding_box()
        assert box and box['width'] >= 44 and box['height'] >= 44, box
        assert await button.evaluate("""el => {
            const r = el.getBoundingClientRect();
            return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight &&
                el.contains(document.elementFromPoint(r.left + r.width/2, r.top + r.height/2));
        }""")
    # Return from the bottom to the top and visit the second bank via the real keyboard.
    for index, target in [(2, accents.first), (0, cells.first), (1, cells.nth(6 * 16))]:
        button = buttons.nth(index)
        if index == 1:
            await button.press('Enter')
        else:
            await button.tap()
        await expect(target).to_be_focused()
        assert await target.evaluate("""el => {
            const r = el.getBoundingClientRect(), g = el.closest('.sequencer-grid').getBoundingClientRect();
            return r.top >= g.top - 1 && r.bottom <= g.bottom + 1 &&
                el.contains(document.elementFromPoint(r.left + r.width/2, r.top + r.height/2));
        }""")
        if index == 0 and page.viewport_size == {'width': 844, 'height': 390}:
            # The first bank exposes eleven editable steps alongside Sound at this size.
            steps = await cells.evaluate_all("""cells => {
                const clip = cells[0].closest('.funkybeats-sequencer').getBoundingClientRect();
                return cells.slice(0, 11).map(cell => {
                    const r = cell.getBoundingClientRect();
                    return r.width >= 40 && r.height >= 40 && r.left >= clip.left && r.right <= clip.right &&
                        cell.contains(document.elementFromPoint(r.left + r.width/2, r.top + r.height/2));
                });
            }""")
            assert all(steps), steps
    await buttons.last.tap()
    dialog = page.locator('#review-dialog')
    await expect(dialog).to_be_visible()
    await page.keyboard.press('Escape')
    await expect(buttons.last).to_be_focused()
    assert await save(page) == before
    assert [await page.locator(id).is_enabled() for id in ('#undo', '#redo')] == history
