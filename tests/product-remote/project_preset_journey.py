# SPDX-License-Identifier: GPL-3.0-only
"""Round-trip real-format original files through the Projects card."""
import json
import re
from pathlib import Path
from playwright.async_api import expect
from superj6_bank_journey import fixture

ROOT = Path(__file__).resolve().parents[2]


async def exercise(page):
    card = page.locator('.destinations section').filter(has=page.get_by_role('heading', name='Original presets'))
    open_original = card.get_by_role('button', name='Open original')
    inspect = card.locator('[data-project-preset-inspect]')
    save = card.get_by_role('button', name='Save a copy')
    dialog = page.get_by_role('dialog', name='Original presets')
    keep = dialog.get_by_role('button', name='Keep', exact=True)
    back = dialog.get_by_role('button', name='Return')
    name = dialog.get_by_label('Name', exact=True)
    source = ROOT/'web/product-site/remote/synth-one-banks/Starter Bank.json'
    sj_name, sj_data = fixture()
    await expect(save).to_be_disabled()
    await expect(inspect).to_be_disabled()
    if page.viewport_size == {'width':844, 'height':390}:
        await expect(inspect).to_be_hidden()

    async def upload(filename, data):
        await dialog.get_by_label('Original file').set_input_files(
            {'name': filename, 'mimeType': 'application/json', 'buffer': data})

    async def download():
        async with page.expect_download() as request:
            await save.click()
        result = await request.value
        await expect(page.locator('#status')).to_have_text('Saved ' + result.suggested_filename)
        return result.suggested_filename, Path(await result.path()).read_bytes()

    for profile, filename, raw in [('synthone',source.name,source.read_bytes()),('superj6',sj_name,sj_data)]:
        records = json.loads(raw)
        if profile == 'superj6':
            records = records['presets']
        await open_original.click()
        await dialog.get_by_label('Format').select_option(profile)
        await upload(filename, raw)
        await expect(name).to_have_value(records[0]['name'])
        await keep.click()
        assert await download() == ('kept-' + filename, raw)

        if await inspect.is_visible():
            await inspect.click()
            await expect(dialog.get_by_label('Original file')).to_be_hidden()
            await expect(dialog.get_by_label('Preset', exact=True)).to_be_focused()
        else:
            await open_original.click()
            await expect(dialog.get_by_label('Original file')).to_be_focused()
        await name.fill('Remote copy A')
        await dialog.get_by_label('Preset', exact=True).select_option('1')
        await name.fill('Remote copy B')
        await back.click()
        await expect(save).to_be_disabled()
        await page.locator('[data-view="sound"]').click()
        original_part = await page.locator('#part').input_value()
        await page.locator('[data-engine="chicago"]').click()
        original_bank = await page.locator('#sound-bank').input_value()
        await page.locator('#sound-bank').select_option('Synth One')
        await page.locator('[data-open-synth-one-files="0"]').click()
        await page.locator('.s1-file-dialog [data-close]').click()
        await page.locator('#sound-bank').select_option('SuperJ6')
        await expect(page.locator('[data-sj6-save]')).to_be_visible()
        await page.locator('#sound-bank').select_option(original_bank)
        await page.locator(f'[data-engine="{original_part}"]').click()
        await page.locator('[data-view="files"]').click()
        await (inspect if await inspect.is_visible() else open_original).click()
        await expect(name).to_have_value('Remote copy B')
        await keep.click()

        expected = raw
        for i, replacement in enumerate(('Remote copy A', 'Remote copy B')):
            encoded = json.dumps(records[i]['name'], ensure_ascii=False).encode()
            pattern = rb'("name"\s*:\s*)' + re.escape(encoded)
            expected, count = re.subn(pattern, lambda match: match[1] + json.dumps(replacement).encode(), expected, count=1)
            assert count == 1
        copied_name, copied = await download()
        assert copied_name == 'kept-' + filename and copied == expected
        await open_original.click()
        await upload(copied_name, copied)
        await expect(name).to_have_value('Remote copy A')
        await dialog.get_by_label('Preset', exact=True).select_option('1')
        await expect(name).to_have_value('Remote copy B')
        await upload('invalid.json', b'{"other":1}')
        await expect(keep).to_be_disabled()
        await expect(dialog.locator('[data-preset-status]')).to_have_text(re.compile('Invalid'))
        await back.click()
        await expect(save).to_be_disabled()
    print('PASS Projects original preset copies: both formats, unchanged bytes, two isolated name edits, Sound navigation, reimport, invalidation', flush=True)
