#!/usr/bin/env python3
"""Local gate contract tests; no browser, device or baseline approval is implied."""
import importlib.util
import io
import re
from unittest.mock import Mock, patch
import full_page_capture as capture
from pathlib import Path
import tempfile
import unittest
import json
from unittest.mock import Mock, patch
from PIL import Image

spec = importlib.util.spec_from_file_location('visual_gate', Path(__file__).with_name('visual_gate.py'))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

def png(color):
    out = io.BytesIO()
    Image.new('RGB', (30, 30), color).save(out, format='PNG')
    return out.getvalue()

class GateContract(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        gate.SNAP = Path(self.temp.name) / 'snapshots'
        gate.OUT = Path(self.temp.name) / 'actual'
        gate.UPDATE = False
        gate.ONLY = None
        self.image = png('black')

    def compare(self, image=None):
        result = []
        gate.compare('screen', self.image if image is None else image, result)
        return result

    def approve(self):
        gate.SNAP.mkdir(parents=True, exist_ok=True)
        (gate.SNAP / 'screen.png').write_bytes(self.image)

    def manual_page(self, *, rest=None, image=None):
        state = dict(width=4, height=1031, viewport=[3, 3, 1, 0, 0], fonts='loaded', images=[])
        page = Mock()
        page.wait_for_function.side_effect = [
            Mock(json_value=Mock(return_value=json.dumps(value)))
            for value in [state, state | (rest or {})]]

        def native_band(*, full_page, clip, timeout):
            self.assertTrue(full_page)
            self.assertGreater(timeout, 0)
            self.assertLessEqual(timeout, 30_000)
            x, y, width, height = (clip[k] for k in ('x', 'y', 'width', 'height'))
            self.assertEqual((x, width), (0, 4))
            if image is not None:
                return image
            data = io.BytesIO()
            band = Image.new('RGB', (width, height))
            band.putdata([(column, (y + row) % 251, (y + row) // 251)
                          for row in range(height) for column in range(width)])
            band.save(data, format='PNG')
            return data.getvalue()
        page.screenshot.side_effect = native_band
        return page

    def test_manual_joins_all_native_pixels_including_overhang_seam_and_last_row(self):
        page = self.manual_page(rest={'height': 1035})
        result = gate.capture_full_page(page, 'manual/original/index.html', 'manual')
        with Image.open(io.BytesIO(result)) as output:
            self.assertEqual((output.format, output.mode, output.size), ('PNG', 'RGB', (4, 1031)))
            self.assertEqual(output.tobytes(), bytes(c for y in range(1031) for x in range(4)
                for c in (x, y % 251, y // 251)))
        self.assertEqual([call.kwargs['clip'] for call in page.screenshot.call_args_list],
                         [{'x': 0, 'y': 0, 'width': 4, 'height': 1024},
                          {'x': 0, 'y': 1024, 'width': 4, 'height': 7}])
        for call in page.wait_for_function.call_args_list:
            self.assertGreater(call.kwargs['timeout'], 0)
            self.assertLessEqual(call.kwargs['timeout'], 30_000)

    def test_manual_native_band_size_crc_truncation_and_format_fail_closed(self):
        data = io.BytesIO()
        Image.new('RGB', (4, 1024)).save(data, format='PNG')
        damaged = bytearray(data.getvalue())
        damaged[damaged.index(b'IDAT') + 4] ^= 1
        wrong = io.BytesIO()
        Image.new('RGB', (4, 1024)).save(wrong, format='JPEG')
        for bad in [wrong.getvalue(), self.image, bytes(damaged), data.getvalue()[:-12]]:
            with self.subTest(length=len(bad)):
                page = self.manual_page(image=bad)
                with self.assertRaises((OSError, ValueError, SyntaxError)):
                    gate.capture_full_page(page, 'manual/original/index.html', 'manual')
                self.assertEqual(page.screenshot.call_count, 1)

    def test_manual_rejects_changed_width_viewport_scroll_fonts_or_lazy_images(self):
        for rest in [{'width': 3}, {'viewport': [3, 3, 1, 0, 1]}, {'fonts': 'loading'},
                     {'images': [['/a.png', True, 1, 1]]}]:
            with self.subTest(rest=rest), self.assertRaisesRegex(ValueError, 'changed during capture'):
                gate.capture_full_page(self.manual_page(rest=rest), 'manual/original/index.html', 'manual')

    def test_manual_shares_one_deadline_and_propagates_a_native_failure_once(self):
        page = self.manual_page()
        with patch('manual_capture.time.monotonic', side_effect=[0, 0, 1, 31]):
            with self.assertRaisesRegex(TimeoutError, 'exceeded 30 seconds'):
                gate.capture_full_page(page, 'manual/original/index.html', 'manual')
        self.assertEqual(page.screenshot.call_count, 1)
        self.assertEqual(page.screenshot.call_args.kwargs['timeout'], 29_000)
        page = self.manual_page()
        page.screenshot.side_effect = RuntimeError('renderer lost')
        with self.assertRaisesRegex(RuntimeError, 'renderer lost'):
            gate.capture_full_page(page, 'manual/original/index.html', 'manual')
        self.assertEqual(page.screenshot.call_count, 1)


    def test_full_page_routes_keep_native_capture_for_regular_sizes(self):
        for route in ('projects/index.html', 'builds/index.html'):
            page = Mock()
            page.screenshot.return_value = self.image
            page.evaluate.return_value = [30, 30, 0, 0, 30, 30, 1]
            self.assertEqual(capture.capture_full_page(page, route, 'fixture'), self.image)
            page.screenshot.assert_called_once_with(full_page=True)

    def test_bands_retain_every_row_and_reject_a_changed_seam(self):
        expected = Image.new('RGBA', (3, 7))
        expected.putdata([(x, y, 50, y + 17) for y in range(7) for x in range(3)])
        for mutate in (False, True):
            page = Mock()
            page.evaluate.return_value = [3, 7, 0, 0, 3, 2, 1]
            def clipped_png(full_page, clip, timeout):
                self.assertTrue(full_page)
                self.assertTrue(0 < timeout <= 30_000)
                y = clip['y']
                band = expected.crop((0, y, 3, y + clip['height']))
                if mutate and y > 0:
                    band.putpixel((0, 0), (1, 2, 3, 4))
                data = io.BytesIO()
                band.save(data, format='PNG')
                return data.getvalue()
            page.screenshot.side_effect = clipped_png
            with patch.object(capture, 'SINGLE_CAPTURE_PIXELS', 1), patch.object(capture, 'BAND_ROWS', 3):
                if mutate:
                    with self.assertRaisesRegex(RuntimeError, 'build-history.*seam'):
                        capture.capture_full_page(page, 'builds/index.html', 'build-history')
                else:
                    data = capture.capture_full_page(page, 'builds/index.html', 'build-history')
                    with Image.open(io.BytesIO(data)) as actual:
                        self.assertEqual((actual.size, actual.mode), (expected.size, expected.mode))
                        self.assertEqual(actual.tobytes(), expected.tobytes())

    def test_capture_rejects_a_complete_image_after_the_total_deadline(self):
        page = Mock()
        page.evaluate.return_value = [30, 30, 0, 0, 30, 10, 1]
        elapsed = [0]
        def capture_band(*, full_page, clip, timeout):
            self.assertTrue(full_page)
            self.assertEqual(timeout, 30_000 if clip['y'] == 0 else 2_000)
            elapsed[0] += 28 if clip['y'] == 0 else 3
            image = Image.new('RGB', (clip['width'], clip['height']))
            data = io.BytesIO()
            image.save(data, format='PNG')
            return data.getvalue()
        page.screenshot.side_effect = capture_band
        with patch.object(capture, 'SINGLE_CAPTURE_PIXELS', 1), patch.object(capture, 'BAND_ROWS', 15):
            with patch.object(capture.time, 'monotonic', side_effect=lambda: elapsed[0]):
                with self.assertRaisesRegex(RuntimeError, 'build-history.*exceeded 30 seconds'):
                    capture.capture_full_page(page, 'builds/index.html', 'build-history')
        self.assertEqual(page.screenshot.call_count, 2)

    def test_installer_routes_only_pause_the_two_public_requests(self):
        page = Mock()
        gate.installer_responses()(page)
        patterns = [call.args[0] for call in page.route.call_args_list]
        self.assertEqual(len(patterns), 2)
        # Playwright sends callable URL matchers to Chromium as a catch-all.
        for pattern in patterns:
            self.assertIsInstance(pattern, re.Pattern)
            self.assertIsNone(pattern.search('http://127.0.0.1:8000/product-site/index.html'))
        self.assertIsNotNone(patterns[0].fullmatch(
            'https://api.github.com/search/issues?q=repo%3Agobbajogger%2FDnBOX+is%3Aissue+in%3Atitle+%22Install+report%22&per_page=100&page=1'
        ))


    def test_history_capture_rejects_missing_rows_and_truncated_pngs(self):
        page = Mock()
        page.evaluate.return_value = [30, 31, 0, 0, 30, 31, 1]
        page.screenshot.return_value = self.image
        with self.assertRaisesRegex(RuntimeError, 'Expected full Builds PNG'):
            capture.capture_full_page(page, 'builds/index.html', 'history')
        page.evaluate.return_value = [30, 30, 0, 0, 30, 30, 1]
        page.screenshot.return_value = self.image[:-12]
        with self.assertRaisesRegex(RuntimeError, 'history full-page capture failed'):
            capture.capture_full_page(page, 'builds/index.html', 'history')

    def test_history_capture_rejects_wrong_format_and_corrupt_png_data(self):
        page = Mock()
        page.evaluate.return_value = [30, 30, 0, 0, 30, 30, 1]
        jpeg = io.BytesIO()
        Image.new('RGB', (30, 30)).save(jpeg, format='JPEG')
        page.screenshot.return_value = jpeg.getvalue()
        with self.assertRaisesRegex(RuntimeError, 'Expected full Builds PNG'):
            capture.capture_full_page(page, 'builds/index.html', 'history')
        damaged = bytearray(self.image)
        damaged[damaged.index(b'IDAT') + 4] ^= 1
        page.screenshot.return_value = bytes(damaged)
        with self.assertRaisesRegex(RuntimeError, 'checksum'):
            capture.capture_full_page(page, 'builds/index.html', 'history')

    def test_failed_history_capture_propagates_without_retry(self):
        page = Mock()
        page.evaluate.return_value = [1000, 70_000, 0, 0, 1000, 800, 1]
        page.screenshot.side_effect = TimeoutError('native capture exceeded its budget')
        with self.assertRaisesRegex(RuntimeError, 'exceeded its budget'):
            capture.capture_full_page(page, 'builds/index.html', 'history')
        page.screenshot.assert_called_once()
        first_band = page.screenshot.call_args.kwargs
        self.assertEqual(first_band['clip'], dict(x=0, y=0, width=1000, height=capture.BAND_ROWS))
        self.assertTrue(0 < first_band['timeout'] <= 30_000)


    def test_missing_baseline_is_reported_not_created(self):
        result = self.compare()
        self.assertEqual(result[0][1], 'NOBASE')
        self.assertFalse((gate.SNAP / 'screen.png').exists())
        self.assertEqual(gate.exit_status(result, ['clipped control'], []), 1)

    def test_proposal_is_not_a_pass(self):
        gate.UPDATE = True
        result = self.compare()
        self.assertEqual(result[0][1], 'BASELINE')
        self.assertEqual(gate.exit_status(result, [], []), 1)

    def test_approved_identical_pixels_pass_three_repeats(self):
        self.approve()
        for _ in range(3):
            result = self.compare()
            self.assertEqual(result[0][1], 'PASS')
            self.assertEqual(gate.exit_status(result, [], []), 0)

    def test_render_mutant_fails_and_corrected_render_passes(self):
        self.approve()
        self.assertEqual(self.compare(png('white'))[0][1], 'FAIL')
        self.assertEqual(self.compare()[0][1], 'PASS')

    def test_size_change_fails(self):
        self.approve()
        buf = io.BytesIO(); Image.new('RGB', (31, 30)).save(buf, format='PNG')
        self.assertEqual(self.compare(buf.getvalue())[0][1], 'FAIL')

    def test_filtered_passing_subset_cannot_qualify_publication(self):
        gate.ONLY = "remote-roll"
        self.assertEqual(gate.exit_status([("remote-roll", "PASS", 0)], [], []), 1)

    def test_browser_errors_empty_runs_and_header_errors_fail(self):
        passed = [('screen', 'PASS', 0)]
        self.assertEqual(gate.exit_status(passed, [], ['uncaught error']), 1)
        self.assertEqual(gate.exit_status(passed, ['clipped control'], []), 1)
        self.assertEqual(gate.exit_status([], [], []), 1)

if __name__ == '__main__':
    unittest.main()
