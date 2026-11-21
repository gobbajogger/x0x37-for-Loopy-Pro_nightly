# Emulator LCD timing at 944e99d8

The immutable run stopped at GLOBAL after nine exact native LCD matches. Its log recorded 4,442 of 57,600 different RGB565 pixels and discarded the failing image. An independent reproduction on the same built emulator produced that exact count when the stopped firmware performed its documented deferred autosave. The historical run cannot establish the identity of its missing image.

## What was observed

| Run | Result |
| --- | --- |
| Immutable 944e99d8 qualification | First nine screens matched. GLOBAL differed by 4,442. See `original-944-failure.log`. |
| Unmodified timing replay | All eleven current frames matched once. Recorded pointer events and timestamps are in `second/result.json`. Another loaded repeat timed out at GLOBAL after nine matches. |
| Controlled real browser reproduction | After nine exact matches, 2,360 simulated ms of delayed GLOBE delivery let deferred autosave fire. The old pre-click capture deadline was already satisfied. GLOBAL differed in exactly 4,442 pixels in x=0…239, y=0…19. The actual rendered frame, expected frame and mask are under `controlled-red-replay/.output/`. |
| Independent native WASM scenario | 2,350 extra simulated idle ms before GLOBE, actual 80 ms button hold. The real engine produced the identical 4,442-pixel image at native time 15,813 ms. Once its banner expired, nine changed pixels remained at x=210…212, y=2…4. Both kinds of frame were also captured in the browser. |
| Candidate in sandboxed Chromium | All eleven current screens, all eleven previous emulator screens, and all four historical HTML rasters match every native pixel. The green driver injected three seconds of wall time before GLOBE. Once the check returned, normal clock progression brought up the native clean MIDI + CLOCK state, verified by its independent exact digest. See `controlled-green-final.log` and `controlled-green/result.json`. |
| Cleanup and negative controls | A single representable RGB565 bit changed on the real browser boot frame gave a one-pixel rejection. The context resumed and its native time advanced. A missing Start restored its inherited method descriptor. A second cleanup error during a closed-page exception preserved the primary exception. The separate reviewer repeated success, comparison error and startup failure. Its raw log, probe, and observations are in `independent-review/`. The green report also checks audio running, native clock advancing, restored prototype and deleted temporary reference after both full routes. |

The checked GLOBAL shows MIDI + CLOCK selected. The reproduced banner image and the reference differ only in the top 20 rows. Its SHA-256 over the 115,200 big-endian packed RGB565 bytes was `545806cdec92b9b263368b5d601915dad432ab94999551f8c486a390a7afd7af`. The native GLOBAL reference hashes to `3c1627db613edc6888d05e3952b07bc59c8350f1d930fcb1b1432802110d895c`. After the banner expired, the stable GLOBAL hash was `01663daec739c4e83cba5b34284b9108bb7f5e3ac7f37487b96dc5ceb318f6b1`. For MIDI + CLOCK, the post-autosave hash was `ea4ed289f833912c2d1e75f5da807af4bc7dcc3cdbbfc320be2648ca977e2d99`. The native replay observed this digest independently of the browser assertions.

## Why the timing matters

The source capture scenario edits the mix level, selects Kick 808, visits its sequencer, then opens GLOBAL. It uses 1,700 simulated ms following each of those actions. The native host's tap implementation holds 40 simulated ms and releases for 40 ms. Its three earlier holds are 78 ms, with separately specified waits. The browser had already used 80 ms pointer holds and intentionally conservative post-action delays. Each assertion is on the resulting native state. Earlier Python code recorded the wait origin before handing the click to Playwright. Meanwhile, the audio worklet advanced during actionability, PNG checks and test-runner scheduling.

Production firmware waits at least 4,000 native ms after recent activity before an eligible stopped, dirty project autosaves, with a 20,000 ms minimum gap after an earlier save. A successful save clears the dirty flag and calls `say("AUTOSAVED", 0)`, whose banner lasts 1,300 ms. An extra wait after the click cannot recreate an unsaved project.

The patch confines runner idle time to pauses in the application's real AudioContext. Actual pointer down and up, the native worklet, LCD canvas and published firmware clock all remain in the tested path. Playback continues during every original hold and post-action delay. The test captures each scheduled frame once and compares all 57,600 pixels. Its finally block restores normal clock operation after success and failure. A failed pixel assertion now preserves its actual PNG, native PNG, mask, digests, time and bounding box. This patch covers the browser qualification harness; its recorded run used an existing authenticated local build.

## Source identity

| Input | Pinned identity |
| --- | --- |
| DnBOX-nightly checkout | `944e99d87125e60aff9e3020ead7212fb47687d6` |
| Patch preimage and later apply check | `tests/emulator-lcd-browser.py` blob `001e6907951b940a61161955873b85717d6ffbac` at 944e99d8 and `7c59dad5df087994c0d344ffb190be4121cc76d4` |
| Original native manifest and GLOBAL PNG | Git blobs `51978d64007347f3ed3a9efa68a395100fc3b4d0` and `f24fc1bbd69d4871f3a35a77a45845cefafe4a58` |
| Firmware and runtime kernel | `61827a714ca7b240c01a55ed347b5fd7b847c7c2` and `4758a9573e0a2a95e73cb054a74e0aad39d5741e` |
| Mounted current kernel.wasm SHA-256 | `9ad1ab9c533ccda4b506a0b0cc281de50af3dcd57370ffa916a5174277cbdbd0` |
| Production `firmware/src/app/ui.c` SHA-256 | `b8f62007b7ad72b5c0f1a665777bd5e0a54adf14756e8d9efeb10a9508f09365`, lines 426, 2381 and 9108–9140 |
| Production `host/x0x_host.c` SHA-256 | `b3bcf5a880c674db759a414a18680a9cbaba4e66d9ffcac0d66040bc243ba27e` |
| Published Nightly change | `a2824b530dd48e151b4c9a6f7f3377c9f2be1562`, final test blob `6eb570944991147cb1f59abe50f9c3de5bc111ce`, SHA-256 `09f8cacb89461f7ab5d271bf6277756fc594c50dd75e65b802b70d62576dde7e` |
| Browser and viewport | Chromium `151.0.7922.34`, normal sandbox, 844×390, device scale 1 |
| One-file source patch SHA-256 | `ae764dd65e3cf85a555f06f510a80847bba1397137fdb3794e67e43db8cfc9cd` |

## Reproduction

Use the qualification environment and its pinned Chromium, standard Node, Python, Pillow and Playwright. The methods below reuse a build at `$CHECKOUT/.output/product-site`. For the normal end-to-end entry point on a disposable checkout, apply the single-file patch and run `python tests/emulator-lcd-browser.py` from the checkout. That path includes the site-build and normal Tools and previous-runtime links. The focused packet driver mounts the same verified runtime directly and retains evidence for each assertion.

From the extracted packet, set `CHECKOUT` to the absolute path to the pinned Nightly checkout.

```sh
sha256sum -c SHA256SUMS
python prepare-native.py "$CHECKOUT"
node native-route.mjs "$CHECKOUT" 80 2350
python controlled.py "$CHECKOUT" red-replay
python controlled.py "$CHECKOUT" green
python cleanup-failures.py "$CHECKOUT"
python corruption.py "$CHECKOUT"
```

The red-replay command exits 1 on purpose. It stages the old wait threshold with a known pre-click delay and real pointer delivery on the paced prefix. Under different scheduling a later post-banner read can show the documented nine-pixel dirty-marker difference. The independently clocked WASM replay is deterministic. All diagnostics use existing firmware and native goldens. The original failed suite remains recorded as a failure in `original-944-failure.log`.

The retained logs contain their original workspace paths. The case and artifact names under each packet subdirectory identify the corresponding files after extraction. The independent reviewer’s probe uses original workspace paths and is retained as source provenance. The listed packet commands accept a checkout argument and work from a relocated packet. The original pointer log contained two undefined native timestamps on Start, before a framebuffer existed. Its raw text is retained alongside a strict JSON transcription using null for those entries.

[All measurements, images, failure records and replay scripts](lcd-evidence.tar.gz)
