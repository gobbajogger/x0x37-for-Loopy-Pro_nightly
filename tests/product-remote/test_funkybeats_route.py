"""Routing contract for the immutable product used by the FunkyBeats browser tests."""
import asyncio
import importlib.util
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('funky', Path(__file__).with_name('funkybeats-browser.py'))
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)


class FakeRoute:
    def __init__(self, url):
        self.request = SimpleNamespace(url=url)

    async def fulfill(self, **response):
        self.response = response

    async def abort(self):
        self.response = {'aborted': True}


class ProductRoutesTest(unittest.IsolatedAsyncioTestCase):
    async def test_build_bytes_are_read_off_loop_and_reused(self):
        async def request(path):
            route = FakeRoute(core.ORIGIN + path)
            await core.serve(route)
            return route.response

        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp)
            site = parent / 'site'
            root = site / 'remote'
            root.mkdir(parents=True)
            index = root / 'index.html'
            index.write_bytes(b'<main>Original</main>')
            (root / 'name with space.mjs').write_bytes(b'export default 3;')
            data = root / 'data.bin'
            data.write_bytes(b'index alias')
            alias = site / 'alias'
            alias.mkdir()
            (alias / 'index.html').symlink_to(data)
            outside = parent / 'outside.bin'
            outside.write_bytes(b'outside')
            (site / 'link').symlink_to(outside)
            linked_index = site / 'linked-index'
            linked_index.mkdir()
            (linked_index / 'index.html').symlink_to(outside)
            other = parent / 'other'
            other.mkdir()
            (other / 'index.html').write_bytes(b'Another build')
            self.addCleanup(core.product_reader.cache_clear)
            self.addCleanup(setattr, core, 'SOURCE', core.SOURCE)
            core.SOURCE = site
            loop_thread = threading.get_ident()
            reads = []
            read_bytes = Path.read_bytes

            def tracked_read(path):
                self.assertNotEqual(threading.get_ident(), loop_thread)
                reads.append(path)
                return read_bytes(path)

            with patch.object(Path, 'read_bytes', tracked_read):
                await asyncio.to_thread(core.preload_product, site)
                for url in ['/remote/', '/remote', '/remote/index.html?version=2']:
                    self.assertEqual(await request(url), {
                        'status': 200, 'content_type': 'text/html', 'body': b'<main>Original</main>',
                    })
                self.assertEqual(await request('/remote/name%20with%20space.mjs'), {
                    'status': 200, 'content_type': 'text/javascript', 'body': b'export default 3;',
                })
                self.assertEqual(await request('/alias/'), {
                    'status': 200, 'content_type': 'text/html', 'body': b'index alias',
                })
                self.assertEqual((await request('/alias/index.html'))['content_type'], 'application/octet-stream')
                self.assertEqual(reads.count(data), 1)
                self.assertEqual(reads.count(index), 1)
                self.assertEqual(reads.count(root / 'name with space.mjs'), 1)
                self.assertEqual(await request('/not-found'), {'status': 404, 'body': 'Not found'})
                for url in ['/%2e%2e/outside.bin', '/link', '/linked-index/']:
                    self.assertEqual(await request(url), {'status': 403, 'body': 'Forbidden'})
                self.assertNotIn(outside, reads)
                external = FakeRoute('https://other.test/remote/')
                await core.serve(external)
                self.assertEqual(external.response, {'aborted': True})
                core.SOURCE = other
                self.assertEqual((await request('/'))['body'], b'Another build')
                self.assertEqual(reads.count(other / 'index.html'), 1)


if __name__ == '__main__':
    unittest.main()
