# SPDX-License-Identifier: GPL-3.0-only
"""Capture the long, settled Builds route without allocating one giant Chromium surface."""
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import struct
import time
import zlib

import numpy as np
from PIL import Image
from PIL.PngImagePlugin import putchunk


BAND_ROWS = 24_576
SINGLE_CAPTURE_PIXELS = 32 * 1024 * 1024
GEOMETRY = """() => {
  const elements = [document.documentElement, document.body];
  const size = axis => Math.max(...elements.flatMap(e =>
    ['client', 'scroll', 'offset'].map(key => e[key + axis])));
  return [size('Width'), size('Height'), scrollX, scrollY, innerWidth, innerHeight, devicePixelRatio];
}"""


def capture_full_page(page, route, name):
    try:
        if route == 'builds/index.html':
            deadline = time.monotonic() + 30
            geometry = page.evaluate(GEOMETRY)
            width, height = geometry[:2]
            if geometry[-1] == 1 and width * height > SINGLE_CAPTURE_PIXELS and height > BAND_ROWS:
                return capture_bands(page, geometry, deadline)
            # A native, single-shot Builds capture must also contain the entire document.
            png = page.screenshot(full_page=True)
            with Image.open(BytesIO(png)) as captured:
                if captured.format != 'PNG' or (geometry[-1] == 1 and captured.size != (width, height)):
                    raise ValueError(f'Expected full Builds PNG {width}x{height}, got {captured.format} {captured.size}')
                captured.verify()
            return png
        return page.screenshot(full_page=True)
    except Exception as error:
        raise RuntimeError(f'{name} full-page capture failed: {error}') from error


def capture_bands(page, geometry, deadline):
    width, height = geometry[:2]
    output = BytesIO()
    encoder = zlib.compressobj(1)
    mode = None
    last_row = None
    written_rows = 0

    def remaining_ms():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError('Complete full-page screenshot exceeded 30 seconds')
        return max(1, int(1_000 * remaining))

    def append_band(png, rows, overlap):
        nonlocal mode, last_row, written_rows
        with Image.open(BytesIO(png)) as tile:
            if tile.format != 'PNG' or tile.mode not in ('RGB', 'RGBA') or tile.size != (width, rows + overlap):
                raise ValueError(f'Unexpected screenshot band {tile.format} {tile.mode} {tile.size}')
            if mode is None:
                mode = tile.mode
                output.write(b'\x89PNG\r\n\x1a\n')
                color_type = 2 if mode == 'RGB' else 6
                putchunk(output, b'IHDR', struct.pack('>IIBBBBB', width, height, 8, color_type, 0, 0, 0))
            if mode != tile.mode or (overlap and tile.crop((0, 0, width, 1)).tobytes() != last_row):
                raise ValueError('Screenshot bands disagree at the seam')
            for top in range(overlap, tile.height, 128):
                bottom = min(tile.height, top + 128)
                pixels = np.asarray(tile.crop((0, top, width, bottom))).reshape(bottom - top, -1)
                # PNG scanlines each begin with their filter byte. Zero preserves every channel as captured.
                scanlines = np.empty((len(pixels), pixels.shape[1] + 1), dtype=np.uint8)
                scanlines[:, 0] = 0
                scanlines[:, 1:] = pixels
                chunk = encoder.compress(scanlines)
                if chunk:
                    putchunk(output, b'IDAT', chunk)
            last_row = tile.crop((0, tile.height - 1, width, tile.height)).tobytes()
            written_rows += rows

    # Only compression overlaps the next read. Chromium captures in order on the original viewport.
    with ThreadPoolExecutor(max_workers=1) as worker:
        pending = None
        for y in range(0, height, BAND_ROWS):
            rows = min(BAND_ROWS, height - y)
            overlap = int(y > 0)
            clip = dict(x=0, y=y - overlap, width=width, height=rows + overlap)
            png = page.screenshot(full_page=True, clip=clip, timeout=remaining_ms())
            if pending is not None:
                pending.result()
            pending = worker.submit(append_band, png, rows, overlap)
        pending.result()
    if written_rows != height or page.evaluate(GEOMETRY) != geometry:
        raise ValueError('Document geometry changed during the full-page capture')
    putchunk(output, b'IDAT', encoder.flush())
    putchunk(output, b'IEND', b'')
    remaining_ms()
    return output.getvalue()
