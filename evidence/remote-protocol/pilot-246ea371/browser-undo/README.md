# Queued synth edits through Remote Apply and Undo

Chromium 151.0.7922.34 exercised the visible controls on the ordinary Remote page against the real DnBOX UI, project and engine from `246ea3718c6c72ba80bbd1aafcd5356f871c78c8`. The browser used a test-only MIDI bridge to the archived executable's stdio transport. Its catalog returned 326 descriptors, with 294 active on this host. The six source and test blobs match the [published Remote revision](https://github.com/gobbajogger/DnBOX-nightly/commit/71806ae202fc820df5ce2635a9e380d2b0a03e63). The original page disconnected immediately after its first queued SET. [Original failure](queued-browser-red-retry.log.gz) · [Passing ordinary-page trace](actual-browser.log) · [Reproduction and hashes](browser-receipt.json)

| Chicago Cutoff 257 | Reply revision | Stored or acknowledged value |
|---|---:|---:|
| Initial READ | 1 | 32 |
| Apply sends SET, which returns QUEUED | 2 | 33 |
| Fresh READ after Apply | 2 | 33 |
| Undo checks the last value and revision with READ | 2 | 33 |
| Undo sends inverse SET, which returns QUEUED | 3 | 32 |
| Fresh READ after Undo | 3 | 32 |

After each SET the page refreshes the entire catalog. It offers scalar Undo when the addressed target matches its acknowledgement and the rest of the observed state permits it. On this host, Cutoff was the only stored field that changed in either direction. The menu scrolls so the edit, Apply and Undo controls can be reached with a 326-row catalog. The status distinguishes a stored target from audio application.

The same browser explicitly applied Master COMP from 95 to 96 and then back to 95. Fresh snapshots compared the full catalog. Three controls account for every difference. Each Apply reported changes to other controls and withheld scalar Undo. The second Apply was a separate deliberate command on the disposable host.

| Control | Start | After setting COMP to 96 | After explicitly setting COMP to 95 |
|---|---:|---:|---:|
| COMP 253 | 95 | 96 | 95 |
| Threshold 241 | 64 | 60 | 61 |
| Makeup 245 | 85 | 85 | 84 |

The browser fixture exited 0. Two independent Node/C runs passed all 21 tests for queued, stale, normalized, unavailable and coupled settings. A separate observer verified the individual changes using the pinned native executable and all 326 descriptors. [Focused results](guard-tests.log) · [Independent focused run](independent-final.tap) · [Independent control comparison](independent-side-effects.json)

The stock keyboard is a separate acceptance item. The [stock dispatcher probe](../../../remote-qualification-944e99d8/stock-browser-result.json) obtained identity and zero reply bytes for DNR2 HELLO. The production page needs a reviewed stock catalog and dispatcher, and physical verification needs a connected instrument. This host run establishes the stored settings on the archived engine. Audio-applied values and a physical USB/BLE transaction remain open.
