# SPDX-License-Identifier: GPL-3.0-only
from playwright.async_api import expect


async def exercise(page, draft_state, load_draft):
    saved = await draft_state(page)
    original = dict(saved, launch=[*saved['launch'][:4], None])
    await load_draft(page, original)
    await page.locator('[data-engine="breaks"]').click()
    await page.locator('[data-view="roll"]').click()
    generator = page.get_by_role('button', name='Generator', exact=True)
    await expect(generator).to_be_disabled()
    await page.locator('[data-view="sound"]').click()
    await expect(page.get_by_text('Select a BREAK pattern to edit.')).to_be_visible()

    async def choose(pattern):
        await page.locator('[data-view="patterns"]').click()
        await page.locator(f'[data-launch-part="4"][data-pattern="{pattern}"]').click()
        await page.locator('[data-view="roll"]').click()
        await generator.click()
        await expect(page.locator('#break-generator h2')).to_contain_text(f'P{pattern+1:02d}')

    panel = page.locator('#break-generator')
    await choose(0)
    await expect(panel.locator('[data-break-setting]')).to_have_count(11)
    complexity = panel.locator('[data-break-setting="0"]')
    await expect(complexity).to_have_value('50')
    await expect(complexity).to_have_accessible_name('Complexity, percent')
    glyph = panel.locator('[data-break-glyph="0"] rect').nth(1)
    original_ink = await glyph.evaluate("r=>r.style.getPropertyValue('--ink')")
    await complexity.fill('83')
    assert await glyph.evaluate("r=>r.style.getPropertyValue('--ink')") != original_ink
    await complexity.press('Escape')
    await expect(complexity).to_have_value('50')
    assert await glyph.evaluate("r=>r.style.getPropertyValue('--ink')") == original_ink
    await complexity.fill('101')
    await complexity.press('Tab')
    await expect(complexity).to_have_value('50')
    await complexity.fill('81')
    await complexity.press('Tab')
    await expect(complexity).to_have_value('81')
    await expect(panel.get_by_role('spinbutton',name='Anchor, percent')).to_be_focused()
    fill_base = panel.locator('[data-break-glyph="3"] rect').first
    assert await fill_base.evaluate("r=>r.style.getPropertyValue('--ink')") == '0%'
    await panel.get_by_role('combobox',name='Phrase').select_option(value='4')
    assert await fill_base.evaluate("r=>r.style.getPropertyValue('--ink')") == '100%'
    await expect(panel.get_by_role('combobox',name='Phrase')).to_have_value('4')
    await panel.locator('[data-break-setting="10"]').select_option(value='1')
    await page.locator('[data-view="sound"]').click()
    chance = page.locator('.break-sound-chance [data-break-setting="9"]')
    await chance.fill('75')
    await chance.press('Tab')
    await choose(31)
    await expect(complexity).to_have_value('50')
    await complexity.fill('17')
    await complexity.press('Tab')
    await page.locator('#undo').click()
    await expect(complexity).to_have_value('50')
    await page.locator('#redo').click()
    await expect(complexity).to_have_value('17')
    edited = await draft_state(page)
    assert edited['context']['breakView'] == 'generator'
    rows = edited['breakSequence']['generators']
    assert rows == [
        {'pattern': 0, 'settings': [81,0,0,0,0,0,0,0,4,75,1,2]},
        {'pattern': 31, 'settings': [17,0,0,0,0,0,0,0,0,0,2,2]},
    ], rows
    await load_draft(page, edited)
    await expect(complexity).to_have_value('17')
    await choose(0)
    await expect(complexity).to_have_value('81')
    await page.locator('[data-view="sound"]').click()
    await expect(chance).to_have_value('75')
    await page.locator('.overflow summary').click()
    await page.locator('#review').click()
    await expect(page.locator('#changes')).to_contain_text('BREAK · P01 · B chance · 0% → 75%')
    await expect(page.locator('#changes')).to_contain_text('BREAK · P32 · Complexity · 50% → 17%')
    await page.locator('#review-dialog').get_by_role('button',name='Return').click()
    if await page.locator('.overflow').evaluate('el=>el.open'):
        await page.locator('.overflow summary').click()
    await choose(0)
    before_discard = await draft_state(page)
    await page.locator('.overflow summary').click()
    await page.locator('#review').click()
    await page.locator('#review-discard').click()
    await page.locator('#review-reset').click()
    await expect(generator).to_be_disabled()
    await page.locator('#undo').click()
    await expect(generator).to_have_attribute('aria-pressed', 'true')
    await expect(complexity).to_have_value('81')
    restored = await draft_state(page)
    assert restored['context'] == before_discard['context']
    assert restored['breakSequence'] == before_discard['breakSequence']
    await page.locator('#redo').click()
    await expect(generator).to_be_disabled()
    await load_draft(page, saved)
