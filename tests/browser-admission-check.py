#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Real Chromium DOM checks; synthetic in-memory catalog, approval and package only.
# Requires Python Playwright + Chromium. Never requests Web MIDI or clicks Install.
import hashlib
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "docs/install/index.html").read_text()
raw = bytearray(960)
product = "SMK-37 Pro_900"
for i in range(20):
    raw[48 * i + 47] = (ord(product[i]) + i + 1) & 255 if i < len(product) else 0x7D
sha = hashlib.sha256(raw).hexdigest()
pkg = {"product": product, "pkg": "https://packages.example.test/sha256/pro.fwsc", "size": len(raw),
       "sha256": sha, "controller_sha256": "b" * 64}
v = {"version": "synthetic", "status": "dev-checked", "source_commit": "1" * 40,
     "firmware_tree_sha": "2" * 40, "source_tree": "3" * 40, "qa_pass": True, "source_licenses_approved": True,
     "hardware_tested": False, "models": {"pro": pkg}}
a = {"prehardware_qa_pass": True, "license_and_source_ok": True, "backup_integrity_pass": True,
     "model_and_controller_pass": True, "immutable_http_pass": True, "model": "pro", "product": product,
     "source_commit": v["source_commit"], "source_tree": v["source_tree"], "firmware_tree_sha": v["firmware_tree_sha"],
     "package_url": pkg["pkg"], "package_sha256": sha, "controller_sha256": pkg["controller_sha256"], "host_sha256": sha}

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_port}/install/"
results = []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for width in (320, 390, 1280):
            for mode in ("empty", "approved", "revoked", "unapproved"):
                page = browser.new_page(viewport={"width": width, "height": 900})
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                candidate = json.loads(json.dumps(v))
                if mode == "revoked":
                    candidate["revoked"] = True
                catalog = {"latest": "synthetic", "versions": [candidate], "history": []}
                doc = html
                if mode != "empty":
                    original = (ROOT / "docs/versions.json").read_text().strip()
                    # Generated catalog serialization is compact at the inline marker.
                    compact = json.dumps(json.loads(original), separators=(",", ":"))
                    assert "const catalog = " + compact + ";" in doc
                    doc = doc.replace("const catalog = " + compact + ";",
                                      "const catalog = " + json.dumps(catalog) + ";", 1)
                    if mode != "unapproved":
                        doc = doc.replace("const NIGHTLY_PUBLISHER_APPROVALS = Object.freeze({});",
                                          "const NIGHTLY_PUBLISHER_APPROVALS = Object.freeze(" +
                                          json.dumps({"synthetic/pro": a}) + ");", 1)
                page.route("**/*", lambda route, _request, doc=doc: route.fulfill(
                    status=200, content_type="text/html", body=doc) if route.request.url == url else route.fulfill(
                    status=200, body=bytes(raw), headers={"Access-Control-Allow-Origin": "*"}) if route.request.url == pkg["pkg"] else route.abort())
                page.goto(url, wait_until="networkidle")
                if mode == "approved":
                    page.wait_for_function("document.querySelector('#download').getAttribute('href')?.startsWith('blob:')")
                    assert page.locator("#go").is_disabled()
                    page.locator("#devagree").check()
                    assert not page.locator("#go").is_disabled()
                    assert page.locator("#download").get_attribute("href").startswith("blob:")
                else:
                    assert page.locator("#go").is_disabled()
                    assert page.locator("#download").get_attribute("href") is None
                    assert not page.locator("#download").is_visible()
                assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
                assert page.locator('a[href*=".fwsc"]').count() == 0
                assert not errors, errors
                results.append({"width": width, "mode": mode, "pass": True})
                page.close()
        browser.close()
finally:
    server.shutdown()
print(json.dumps({"chromium_scenarios": results, "physical_device": "NOT TESTED", "bytes": "SYNTHETIC"}, indent=2))
