# Supplemental browser suite results for 944e99d8

**16 of 30 suites passed. 14 exited with failures.** Each row records the terminal result of an individual command from the browser suite at `944e99d87125e60aff9e3020ead7212fb47687d6`. The original fail-fast npm invocation retains its recorded failure. The sandbox contract and landscape traversal have separate evidence.

| Browser suite | Exit | First failure or verified result |
| --- | ---: | --- |
| product-remote/mix-family-browser.py | 1 | Chromium launch timed out after 180 s, before the Mix checks began. |
| browser-admission.py | 1 | The installer readiness predicate timed out after 268 checks. The top frame had no QA state at the timeout. |
| history-response.py | 1 | Navigation to the local /builds/ route timed out waiting for DOMContentLoaded. |
| bundled-browser.py | 1 | Navigation to the intercepted installer route timed out waiting for DOMContentLoaded. |
| workspace-browser.py | 0 | 29 workspace checks passed. |
| presentation-browser.py | 0 | 106 presentation checks passed. |
| project-workspace-browser.py | 1 | 63 UI assertions passed. Writing the final receipt failed because the hard-coded /tmp directory was absent. |
| product-remote/firmware-browser.py | 1 | Clicking Connect timed out before the firmware-routing assertions. |
| product-remote/envelope-browser.py | 1 | The initial Draft status on /remote/ did not become ready within 30 s. |
| product-remote/native-mix-browser.py | 1 | The initial click on Mix timed out before the native Mix edit checks. |
| product-remote/native-master-output.py | 1 | Chromium timed out waiting for the output element to stabilize for its screenshot. |
| product-remote/glyph-domain-browser.py | 0 | Both bass slots passed the Miami glyph and Undo/Redo checks. Sound and Mix raw-domain checks passed at all three viewports. |
| installer-deadline-browser.py | 0 | New selection, normal operation and timeout each passed verified retry and selection with zero MIDI requests. |
| presets-browser.py | 0 | Preset and project imports, exports, invalid-file retention, keyboard navigation and no-MIDI checks passed at all three sizes. |
| manual-browser.py | 0 | Manual keyboard, URL fragment, print, legacy route and fit checks passed at all three sizes. |
| product-workspace/recovery-browser.py | 1 | The recovery alert was hidden at the five-second deadline. A separate 944 replay showed the injected 503 arrived after that deadline and the alert then appeared. |
| product-remote/native-sound-browser.py | 1 | Undo restored the visible Bass B value and removed its previously absent override. The test indexed that absent key and raised KeyError. |
| product-remote/r22-panels-browser.py | 0 | All Mix modes, Connect results, startup failure and panel bounds passed at three sizes. |
| product-remote/drum-controls-browser.py | 0 | 66 states, 249 tab targets and 180 visible names passed, along with source SVG hit checks. |
| product-remote/song-browser.py | 0 | Song row selection, editing, history, atomic invalid-file handling, focus and file round-trips passed at all four sizes. |
| product-remote/playing-browser.py | 0 | Play/stop observations, expiry, restart, cancel, Draft history, geometry and zero MIDI requests passed at four sizes. |
| product-remote/motion-composition-browser.py | 0 | Motion and sequence edits, lane context, keyboard/pointer input, history and exact file round-trips passed at three sizes. |
| product-remote/composition-browser.py | 0 | Composition layouts and real 909 bass-drum/snare observer packets passed across three sizes. |
| product-remote/master-more-browser.py | 0 | All 12 units passed geometry, hit, keyboard, detail and touch checks at three sizes, along with observed cancel, legacy import and history. |
| product-remote/navigation-state-browser.py | 0 | Unique navigation actions, repeated current-view selection, Motion and the original step-drum cases passed. |
| product-remote/source-banks-browser.py | 0 | Both-owner source-bank editing, SuperJ6 imports/exports, Undo/Redo and draft-file round-trip checks passed. |
| emulator-lcd-browser.py | 1 | The first nine states matched every RGB565 pixel. Global differed at 4,442 of 57,600 pixels. An independent replay matched all 11 current fixtures. |
| admin-browser.py | 0 | Pinned CSP, catalog counts, mocked owner login, stale-controller rejection, ledger-only updates and narrow layout passed. |
| firmware-reference-browser.py | 1 | The initial Home Playing image matched the native oracle. The selected LCD state then failed to render within 30 s during the held-lookup test, before the 1,838-state sweep. |
| product-remote/funkybeats-browser.py | 1 | 22 case groups passed. Projects Undo restored the pre-edit file to Attack 14 only, with Tune 34 visible and one sound edit. The test incorrectly expected a stored Tune 34 entry. |

The archive contains all 30 terminal logs, the original process results, the continuation log and 2 interrupted logs. The hash manifest covers every member except the manifest itself. Each terminal log also matches the SHA-256 recorded by the sequential runner. Browser and action timeouts record the point at which a test stopped. Product repeatability requires a separate observation.

The Project Workspace assertions finished before its receipt-write error. The Recovery replay distinguished response timing from recovery behavior. The Native Sound replay exercised Undo and Redo with both absent and present parameter overrides, including a stored baseline value. A separate controlled LCD replay reproduced the Global mismatch count with an AUTOSAVED banner confined to the 240×20 header. The original failed canvas was unavailable for a byte-level comparison. The table preserves the original suite exits alongside the separate diagnostics.
