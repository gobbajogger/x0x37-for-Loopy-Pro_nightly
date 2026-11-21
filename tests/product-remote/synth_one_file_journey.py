# SPDX-License-Identifier: GPL-3.0-only
"""Open, edit and export original Synth One files through the regular Sound page."""
import json
from pathlib import Path

from playwright.async_api import expect


async def exercise_synth_one_files(page, slot, evidence=None):
    opener = page.locator(f'[data-open-synth-one-files="{slot}"]')
    await opener.click()
    dialog = page.get_by_role("dialog", name=f"Synth One preset files · Bass {'B' if slot else 'A'}")
    bank = dialog.locator("[data-bank]")
    await expect(bank.locator("option")).to_have_count(12)
    await bank.select_option("Starter Bank.json")
    preset = dialog.locator("[data-preset]")
    cutoff = dialog.locator('[data-s1-field="cutoff"]')
    await expect(preset.locator("option").first).to_have_text("Init")
    await expect(cutoff).to_have_value("2000")
    await expect(dialog.locator("[data-s1-field]")).to_have_count(21)
    await expect(dialog).to_be_visible()
    wave = dialog.locator('[data-s1-field="waveform1"]')
    control = wave.locator('..').locator('..')
    original_wave = await wave.input_value()
    for position,label in [("0","Triangle"),("50","Square ↔ Narrow pulse"),("100","Saw")]:
        await wave.fill(position)
        await wave.press("Tab")
        await expect(control.locator("span").first).to_have_text("Wave · "+label)
        assert await control.locator("svg path").get_attribute("d")
    while await dialog.locator("[data-undo]").is_enabled():
        await dialog.locator("[data-undo]").click()
    await expect(wave).to_have_value(original_wave)
    reach = await dialog.locator("input:not([hidden]), select, button:enabled").evaluate_all("""controls => {
      const clipped = [];
      for (const el of controls) {
        el.scrollIntoView({block:'nearest',inline:'nearest'});
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        if (r.width<1 || r.height<1 || r.left<0 || r.right>innerWidth+1 ||
            r.top<0 || r.bottom>innerHeight+1 || !el.contains(hit)) {
          clipped.push(el.dataset.s1Field || el.textContent || el.getAttribute('aria-label'));
        }
      }
      return clipped;
    }""")
    assert not reach, reach
    await dialog.locator("[data-fields]").evaluate("el => { el.scrollTop = 0; }")
    if slot == 0 and page.viewport_size['width'] == 1440:
        cases = (("Red Sky Lullaby.json", "1", "filterADSRMix", True),
                 ("Bonus.json", "2", "decayDuration", True),
                 ("BankA.json", "16", "filterDecay", True),
                 ("Bonus.json", "74", "noiseVolume", False))
        for filename, index, key, valid in cases:
            await bank.select_option(filename)
            await expect(preset).to_be_enabled()
            await preset.select_option(index)
            number = dialog.locator(f'[data-s1-field="{key}"]')
            await number.focus()
            assert await number.evaluate("e => e.validity.valid") == valid
            await number.press("Tab")
            await expect(dialog.locator("[data-undo]")).to_be_disabled()
        await bank.select_option("Red Sky Lullaby.json")
        await expect(preset).to_be_enabled()
        await preset.select_option("1")
        depth = dialog.locator('[data-s1-field="filterADSRMix"]')
        await depth.focus()
        exact = await depth.input_value()
        await depth.fill("121")
        assert not await depth.evaluate("e => e.validity.valid")
        await depth.press("Tab")
        await expect(dialog.locator("[data-undo]")).to_be_disabled()
        await depth.fill("119")
        await depth.press("Tab")
        await depth.fill(exact)
        await depth.press("Tab")
        async with page.expect_download() as result:
            await dialog.locator("[data-save]").click()
        copy = (await (await result.value).path()).read_bytes()
        root = Path(__file__).resolve().parents[2]
        assert copy == (root / "web/product-site/remote/synth-one-banks/Red Sky Lullaby.json").read_bytes()
        await bank.select_option("Starter Bank.json")
        await expect(cutoff).to_have_value("2000")
    if evidence:
        await page.screenshot(path=evidence)
    changed = "4321" if slot == 0 else "6789"
    await cutoff.fill(changed)
    await cutoff.press("Tab")
    await dialog.locator("[data-undo]").click()
    await expect(cutoff).to_have_value("2000")
    await dialog.locator("[data-redo]").click()
    await expect(cutoff).to_have_value(changed)
    await preset.select_option("1")
    await preset.select_option("0")
    await expect(cutoff).to_have_value(changed)
    async with page.expect_download() as ready:
        await dialog.locator("[data-save]").click()
    download = await ready.value
    assert download.suggested_filename.endswith(" - copy.json")
    exported = (await download.path()).read_bytes()
    original = (Path(__file__).resolve().parents[2] / "web/product-site/remote/synth-one-banks/Starter Bank.json").read_bytes()
    assert exported == original.replace(b'"cutoff": 2000,', f'"cutoff": {changed},'.encode(), 1)
    # Exercise a separate single-preset file, using names obtained from the real bank.
    record = json.loads(exported)[0]
    record["name"] = "<Bass & strings>"
    record["waveform1"] = 1.25
    opened = json.dumps(record, ensure_ascii=False).encode()
    upload = dialog.locator("[data-upload]")
    await upload.set_input_files({"name":"Custom.synth1","mimeType":"application/json","buffer":opened})
    await expect(preset.locator("option:checked")).to_have_text("<Bass & strings>")
    await expect(cutoff).to_have_value(changed)
    await expect(control.locator("span").first).to_have_text("Wave · Outside range")
    await expect(control.locator("svg")).to_have_count(0)
    assert ".synth1" in await upload.get_attribute("accept")
    async with page.expect_download() as copy_request:
        await dialog.locator("[data-save]").click()
    copy = await copy_request.value
    assert copy.suggested_filename == "Custom - copy.synth1"
    assert (await copy.path()).read_bytes() == opened
    await upload.set_input_files({"name":"Broken.json","mimeType":"application/json","buffer":b"{"})
    await expect(dialog.get_by_role("status")).to_contain_text("Could not open")
    await expect(preset.locator("option:checked")).to_have_text("<Bass & strings>")
    await dialog.locator("[data-close]").click()
    await expect(opener).to_be_focused()
