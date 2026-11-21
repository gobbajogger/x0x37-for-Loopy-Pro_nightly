# SPDX-License-Identifier: GPL-3.0-only
"""Drive a locally selected bank through the ordinary Remote Sound and Draft controls."""
import json
import os
import re
from pathlib import Path
import zipfile

from playwright.async_api import expect


def fixture():
    original = os.environ.get("DNBOX_SUPERJ6_ARCHIVE")
    if original:
        with zipfile.ZipFile(original) as archive:
            filename = "J6presets/The GarageBand Guide.superj6.bank.json"
            return filename.split("/")[-1], archive.read(filename)
    values = {"neonlayer1Waveform": 1, "neonsubVolume": 0.5}
    records = [
        {"uid": f"99BBC8C7-A074-4848-81DC-{i:012X}", "name": f"Local <{i}>",
         "parameterValues": [{"identifier": key, "value": value} for key, value in values.items()]}
        for i in (1, 2)
    ]
    bank = {"uuid": "48C49B8C-8680-4366-8507-0A7D33E5CBDF", "name": "Local & Bank",
            "midiBankChangeNumber": 0, "canDelete": True, "presets": records}
    return "Local.superj6.bank.json", json.dumps(bank).encode()


def expected_waves(data, edits):
    """Independent byte oracle for the original flat identifier/value records."""
    pattern = rb'\{[^{}]*"identifier"\s*:\s*"neonlayer1Waveform"[^{}]*\}'
    value = rb'("value"\s*:\s*)-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?'
    records = list(re.finditer(pattern, data))
    assert len(records) == len(json.loads(data)["presets"])
    pieces = []
    end = 0
    for index, record in enumerate(records):
        if index not in edits:
            continue
        replacement, count = re.subn(value, lambda m: m.group(1) + edits[index].encode(), record.group())
        assert count == 1
        pieces.extend([data[end:record.start()], replacement])
        end = record.end()
    return b"".join(pieces) + data[end:]


async def exercise(page, core):
    part_a = page.locator('[data-engine="chicago"]')
    part_b = page.locator('[data-engine="miami"]')
    engine = page.locator("#sound-bank")
    panel = page.locator("[data-superj6]")
    programs = panel.locator("[data-sj6-program]")
    await part_a.click()
    await engine.select_option("SuperJ6")
    previous = await core.draft_state(page)
    name, data = fixture()
    original = json.loads(data)
    first, second = original["presets"][:2]

    async def open_file(payload, action="[data-sj6-open]"):
        async with page.expect_file_chooser() as waiting:
            await panel.locator(action).click()
        chooser = await waiting.value
        await chooser.set_files({"name": name, "mimeType": "application/json", "buffer": payload})

    async def download(reopen=False):
        async with page.expect_download() as pending:
            if reopen:
                await open_file(data, "[data-sj6-save]")
            else:
                await panel.locator("[data-sj6-save]").click()
        result = await pending.value
        assert result.suggested_filename == name
        return Path(await result.path()).read_bytes()

    await open_file(data)
    await expect(panel.locator("h3")).to_have_text(first["name"])
    assert await programs.locator("option").count() == len(original["presets"])
    assert await download() == data
    wave = panel.locator('[data-sj6-field="82"]')
    first_target = "0" if await wave.input_value() != "0" else "1"
    await wave.select_option(first_target)
    await programs.select_option(second["uid"])
    await expect(panel.locator("h3")).to_have_text(second["name"])
    await expect(panel.locator('[data-sj6-absent="78"]')).to_have_text("WidthNot stored")
    await expect(panel.locator('[data-sj6-field="78"]')).to_have_count(0)
    wave = panel.locator('[data-sj6-field="82"]')
    before = await wave.input_value()
    target = "0" if before != "0" else "1"
    async def project_count():
        await page.locator('[data-view="files"]').click()
        summary = await page.locator(".project-summary p").inner_text()
        count = int(summary.split(" notes · ")[1].split(" sound edits")[0])
        await page.locator('[data-view="sound"]').click()
        return count

    prior_count = await project_count()
    await wave.select_option(target)
    assert await project_count() == prior_count + 1
    await page.locator("#undo").click()
    assert await project_count() == prior_count
    await expect(wave).to_have_value(before)
    assert await download() == expected_waves(data, {0:first_target})
    await page.locator("#redo").click()
    await expect(wave).to_have_value(target)
    expected_a = expected_waves(data, {0:first_target, 1:target})
    assert await download() == expected_a

    await part_b.click()
    await engine.select_option("SuperJ6")
    await expect(panel.locator("h3")).to_have_text("PWM String Pad")
    bank = panel.locator("[data-sj6-bank]")
    await bank.select_option(index=1)
    await programs.select_option(second["uid"])
    await expect(wave).to_have_value(before)
    assert await download() == data  # Exact bytes cached on Bass A, with Bass B’s independent values.
    await wave.select_option(target)
    assert await download() == expected_waves(data, {1:target})
    await expect(page.locator('[data-sound-source="emulator"]')).to_be_disabled()

    await part_a.click()
    assert await download() == expected_a
    saved = await core.draft_state(page)
    await expect(wave).to_have_value(target)
    await open_file(b'{"presets":[]}')
    await expect(page.locator("#status")).to_contain_text("Required")
    assert await core.draft_state(page) == saved
    await programs.select_option(first["uid"])
    await core.load_draft(page, saved)
    await expect(panel.locator("h3")).to_have_text(second["name"])
    await expect(wave).to_have_value(target)
    assert await core.draft_state(page) == saved
    await open_file(data+b" ", "[data-sj6-save]")
    await expect(page.locator("#status")).to_contain_text("same original")
    assert await core.draft_state(page) == saved
    assert await download(reopen=True) == expected_a
    await expect(programs).to_have_value(second["uid"])
    assert await core.draft_state(page) == saved
    # The copy is independently accepted as a new original, including both edits.
    await open_file(expected_a)
    await expect(panel.locator("h3")).to_have_text(first["name"])
    await expect(wave).to_have_value(first_target)
    await programs.select_option(second["uid"])
    await expect(wave).to_have_value(target)
    assert await download() == expected_a
    await core.load_draft(page, previous)
    await expect(programs).to_have_count(0)
    long_names = dict(original, name="W" * 160, presets=[dict(first, name="M" * 160)])
    await open_file(json.dumps(long_names).encode())
    await expect(panel.locator("h3")).to_have_text(long_names["presets"][0]["name"])
    await expect(panel.locator("header span")).to_contain_text(long_names["name"])
    assert await page.locator("#other-view").evaluate("e => e.scrollWidth <= e.clientWidth + 1"), (
        "Long SuperJ6 titles overflow the Sound panel", page.viewport_size)
    await core.load_draft(page, previous)

    print(f"LOCAL_SUPERJ6_BANK {len(original['presets'])} programs, absent fields, both owners, original-byte exports, per-program edits, Undo/Redo, digest reattachment, copy reimport and Draft recovery PASS", flush=True)
