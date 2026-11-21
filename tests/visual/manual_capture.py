# SPDX-License-Identifier: GPL-3.0-only
"""Capture the static original manual in document-coordinate Chromium bands."""
import io
import json
import struct
import time
import zlib

from PIL import Image


def manual_state(page, timeout):
    # A primitive JSON value transfers without a second renderer evaluation.
    handle = page.wait_for_function("""() => {
        const root = document.documentElement, body = document.body;
        return JSON.stringify({
            width: Math.max(root.clientWidth, root.offsetWidth, root.scrollWidth,
                            body.clientWidth, body.offsetWidth, body.scrollWidth),
            height: Math.max(root.clientHeight, root.offsetHeight, root.scrollHeight,
                             body.clientHeight, body.offsetHeight, body.scrollHeight),
            viewport: [innerWidth, innerHeight, devicePixelRatio, scrollX, scrollY],
            fonts: document.fonts.status,
            images: [...document.images].map(im => [im.currentSrc, im.complete, im.naturalWidth, im.naturalHeight])
        });
    }""", timeout=timeout)
    try:
        return json.loads(handle.json_value())
    finally:
        handle.dispose()


def capture_original_manual(page):
    deadline = time.monotonic() + 30

    def remaining_ms():
        remaining = int((deadline - time.monotonic()) * 1000)
        if remaining < 1:
            raise TimeoutError("Original manual full-page capture exceeded 30 seconds")
        return remaining

    state = manual_state(page, remaining_ms())
    width, height = state['width'], state['height']
    if width < 1 or height < 1:
        raise ValueError("Original manual has no document extent")
    output = io.BytesIO()
    output.write(b'\x89PNG\r\n\x1a\n')

    def write_chunk(kind, payload):
        output.write(struct.pack('>I', len(payload)))
        output.write(kind)
        output.write(payload)
        output.write(struct.pack('>I', zlib.crc32(payload, zlib.crc32(kind))))

    write_chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
    pixels = zlib.compressobj(level=3)
    for top in range(0, height, 1024):
        rows = min(1024, height - top)
        png = page.screenshot(full_page=True, clip={'x': 0, 'y': top, 'width': width, 'height': rows},
                              timeout=remaining_ms())
        with Image.open(io.BytesIO(png)) as image:
            if image.format != 'PNG' or image.mode != 'RGB' or image.size != (width, rows):
                raise ValueError(f"Unexpected native original manual band at y={top}")
            image.verify()
        with Image.open(io.BytesIO(png)) as image:
            # PNG filter zero for each complete scanline keeps memory bounded to one band.
            rgb = memoryview(image.tobytes())
            stride = width * 3
            for start in range(0, len(rgb), stride):
                data = pixels.compress(b'\x00' + rgb[start:start + stride].tobytes())
                if data:
                    write_chunk(b'IDAT', data)
    write_chunk(b'IDAT', pixels.flush())
    write_chunk(b'IEND', b'')
    rest = manual_state(page, remaining_ms())
    # Native full-page capture can change the document's subsequent height.
    # Its output still covers the extent measured before the first capture.
    if any(rest[key] != state[key] for key in ('width', 'viewport', 'fonts', 'images')):
        raise ValueError("Original manual width, viewport, fonts or images changed during capture")
    remaining_ms()
    return output.getvalue()
