#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Check the emulator LCD and the four historical HTML screens against their native frames."""
import base64
import hashlib
import io
import json
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from struct import iter_unpack
from threading import Thread

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests/fixtures/emulator-lcd-61827a"
PREVIOUS = ROOT / "tests/fixtures/emulator-lcd-06bd40"
# Each state names its native frame, accessible control and minimum simulated delay.
# Capture SAVE while its banner is up. Wait for it to expire on HOME.
STATES = (
    ("boot", None, 500),
    ("fx", "FX", 500),
    ("save", "SAVE", 250),
    ("home", "HOME", 3000),
    ("mix", "LFO", 1700),
    ("mix-level", "K1 up", 1700),
    ("kick-909", "EDIT", 1700),
    ("kick-808", "Algorithm up", 1700),
    ("seq-808", "SEQ", 1700),
    ("global", "GLOBE", 1700),
    ("midi-clock", "SEL", 1700),
)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def rgb565(image, *, browser):
    """The host's PNG uses floor, while the canvas's Uint8ClampedArray rounds."""
    if image.size != (240, 240):
        raise AssertionError(f"LCD dimensions {image.size}")
    if image.mode == "RGBA" and image.getchannel("A").getextrema() != (255, 255):
        raise AssertionError("Nonopaque LCD pixel")
    def levels(maximum):
        return {round(i * 255 / maximum) if browser else i * 255 // maximum: i
                for i in range(maximum + 1)}
    rb, green = levels(31), levels(63)
    packed = bytearray()
    for r, g, b in iter_unpack("BBB", image.convert("RGB").tobytes()):
        word = (rb[r] << 11) | (green[g] << 5) | rb[b]
        packed.extend(word.to_bytes(2, "big"))
    return packed


@contextmanager
def capture_lcd_clock(page):
    # Observe just the context created by Start, including an inherited resume().
    page.evaluate("""() => {
        const proto = AudioContext.prototype;
        const resume = proto.resume;
        const original = Object.getOwnPropertyDescriptor(proto, 'resume');
        function restore() {
            if (proto.resume !== observe) return;
            if (original) Object.defineProperty(proto, 'resume', original);
            else delete proto.resume;
        }
        function observe(...args) {
            restore();
            clock.audio = this;
            return resume.apply(this, args);
        }
        const clock = {audio: null, pause: null, restore};
        window.lcdTestClock = clock;
        proto.resume = observe;
    }""")
    try:
        yield
    finally:
        primary_error = sys.exc_info()[1]
        try:
            page.evaluate("""async () => {
                const clock = window.lcdTestClock;
                if (!clock) return;
                delete window.lcdTestClock;
                clock.restore();
                if (clock.pause) {
                    await clock.pause;
                    if (clock.audio.state === 'suspended') await clock.audio.resume();
                }
            }""")
        except Exception as cleanup_error:
            if primary_error is None:
                raise
            print(f"LCD clock cleanup also failed: {cleanup_error}", file=sys.stderr)


def advance_lcd(page, delay_ms):
    # Keep test-runner latency outside the native input scenario. Four seconds
    # without input legitimately autosaves the edited mix and changes the LCD.
    start = page.evaluate("""async () => {
        const clock = window.lcdTestClock;
        const start = [clock.audio.currentTime, Number(document.querySelector('#lcd').dataset.time) || 0];
        await clock.audio.resume();
        clock.pause = null;
        return start;
    }""")
    page.wait_for_function("""([audio, frame, delay]) => {
        const clock = window.lcdTestClock;
        if ((clock.audio.currentTime - audio) * 1000 < delay ||
            Number(document.querySelector('#lcd').dataset.time) <= frame + delay) return false;
        if (clock.audio.state !== 'running') return false;
        clock.pause = clock.audio.suspend();
        return clock.pause.then(() => true);
    }""", arg=[*start, delay_ms])


def press_lcd_control(page, name):
    # Preserve real pointer delivery while the worker samples the held input.
    page.get_by_role("button", name=name, exact=True).hover()
    page.mouse.down()
    try:
        advance_lcd(page, 80)
    finally:
        page.mouse.up()
    page.wait_for_function("() => !document.querySelector('button.held')")


def store_mismatch(fixtures, name, native, actual, expected_pixels, actual_pixels, stamp):
    output_root = ROOT / '.output'
    output_root.mkdir(exist_ok=True)
    output = Path(tempfile.mkdtemp(prefix=f'lcd-{name}-mismatch-', dir=output_root))
    (output / 'actual.png').write_bytes(actual)
    (output / 'expected.png').write_bytes(native)
    mask = Image.frombytes('L', (240, 240), bytes(
        255 if actual_pixels[i:i+2] != expected_pixels[i:i+2] else 0
        for i in range(0, len(actual_pixels), 2)))
    mask.save(output / 'difference.png')
    (output / 'frame.json').write_text(json.dumps({
        'fixture': fixtures.name, 'state': name, 'simulated_ms': stamp,
        'rgb565_actual': hashlib.sha256(actual_pixels).hexdigest(),
        'rgb565_expected': hashlib.sha256(expected_pixels).hexdigest(),
        'changed_pixels': mask.histogram()[255], 'bounds': mask.getbbox()
    }, indent=2) + '\n')
    return output


def check_frame(name, fixtures, manifest, stamp, actual_png):
    with Image.open(io.BytesIO(actual_png)) as actual:
        pixels = rgb565(actual, browser=True)
    with Image.open(fixtures / f"{name}.png") as native:
        expected = rgb565(native, browser=False)
    assert hashlib.sha256(expected).hexdigest() == manifest["frames"][name], name
    if pixels != expected:
        changed = sum(pixels[i:i+2] != expected[i:i+2] for i in range(0, len(pixels), 2))
        output = store_mismatch(fixtures, name, (fixtures / f"{name}.png").read_bytes(),
                                actual_png, expected, pixels, stamp)
        raise AssertionError(f"{name}: {changed}/57600 RGB565 pixels differ from native; frames at {output}")
    print(f"PASS {name}: 57600/57600 RGB565 pixels match {manifest['frames'][name]}")


def check_page(page, url, manifest, fixtures=FIXTURES):
    page.goto(url)
    with capture_lcd_clock(page):
        page.locator("#start").click()
        page.wait_for_function("() => window.lcdTestClock.audio && Number(document.querySelector('#lcd').dataset.time) > 0")
        lcd = page.locator("#lcd")
        for name, button, delay_ms in STATES:
            if button:
                press_lcd_control(page, button)
            advance_lcd(page, delay_ms)
            source = page.locator("#source").text_content()
            assert source == f"Firmware source {manifest['firmware']} · kernel {manifest['kernel']}", source
            assert page.locator("#transport").text_content() == "Stopped"
            stamp, png = lcd.evaluate("c => [Number(c.dataset.time), c.toDataURL('image/png').split(',')[1]]")
            actual_png = base64.b64decode(png)
            check_frame(name, fixtures, manifest, stamp, actual_png)


def check_historical_reference(page, origin, presentation):
    source = "3c41ef4bedf9701f549ce2752b73306e2fab1eb8"
    assert presentation["native_source"] == source
    names = ["Voice", "Pattern", "Miami", "Juno"]
    first_frames = {frame["id"]: frame["proof"]["native_sha256"] for frame in presentation["frames"]}
    page.set_viewport_size({"width": 1440, "height": 900})
    response = page.goto(f"{origin}/reference/current-ui.html")
    assert response and response.ok, "Historical HTML reference failed to load"
    assert page.get_by_role("heading", level=1).inner_text() == "Firmware UI at 3c41ef4b"
    tools_link = page.get_by_role("link", name="Tools", exact=True)
    assert tools_link.get_attribute("href") == "../tools/"
    assert tools_link.evaluate("(a) => getComputedStyle(a).color === getComputedStyle(document.body).color")
    articles = page.locator("article")
    assert articles.locator("h2").all_text_contents() == names
    for article, name in zip(articles.all(), names):
        panel = article.locator(".native-screen")
        panel.scroll_into_view_if_needed()
        box = panel.bounding_box()
        assert box and (box["width"], box["height"]) == (240, 240), (name, box)
        # CSS text flow may place the panel origin between physical pixels.
        # At device scale 1 the browser paints its integer runs at the nearest pixel.
        clip = {"x": round(box["x"]), "y": round(box["y"]), "width": 240, "height": 240}
        with Image.open(io.BytesIO(page.screenshot(clip=clip))) as image:
            digest = hashlib.sha256(rgb565(image, browser=False)).hexdigest()
        expected = first_frames[f"{name.lower()}-0"]
        assert digest == expected, f"{name} HTML raster {digest} differs from {source} {expected}"
        print(f"PASS historical {name}: 57600/57600 RGB565 pixels match {expected}")


def main():
    manifest = json.loads((FIXTURES / "frames.json").read_text())
    output_root = ROOT / '.output'
    output_root.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='lcd-', dir=output_root) as output:
        site = Path(output) / "site"
        subprocess.run(["node", "scripts/build-product-site.mjs", "--output", str(site)],
                       cwd=ROOT, check=True)
        runtime = site / "emu"
        metadata = json.loads((runtime / "runtime.json").read_text())
        assert metadata["firmware_source"] == manifest["firmware"]
        assert metadata["kernel_source"] == manifest["kernel"]
        assert hashlib.sha256((runtime / "kernel.wasm").read_bytes()).hexdigest() == manifest["wasm_sha256"]
        with ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(site))) as server:
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                with sync_playwright() as pw:
                    browser = pw.chromium.launch(chromium_sandbox=True)
                    try:
                        page = browser.new_page(viewport={"width": 844, "height": 390}, device_scale_factor=1)
                        errors = []
                        page.on("pageerror", lambda error: errors.append(str(error)))
                        origin = f"http://127.0.0.1:{server.server_port}"
                        page.goto(f"{origin}/tools/")
                        page.get_by_role("link", name="Play the browser instrument").click()
                        assert page.url == f"{origin}/emu/"
                        check_page(page, page.url, manifest)
                        previous = json.loads((PREVIOUS / "frames.json").read_text())
                        previous_files = runtime / "previous"
                        assert hashlib.sha256((previous_files / "kernel.wasm").read_bytes()).hexdigest() == previous["wasm_sha256"]
                        page.get_by_text("What this development build includes", exact=True).click()
                        previous_link = page.get_by_role("link", name="Open the previous emulator for sessions saved at 06bd40c5")
                        assert previous_link.get_attribute("href") == "previous/"
                        previous_link.click()
                        assert page.url == f"{origin}/emu/previous/"
                        check_page(page, page.url, previous, PREVIOUS)
                        presentation = json.loads((site / "APPROVED-PRESENTATION.json").read_text())
                        check_historical_reference(page, origin, presentation)
                        assert not errors, errors
                    finally:
                        browser.close()
            finally:
                server.shutdown()
                thread.join()


if __name__ == "__main__":
    main()
