# #899 firmware capture selection

Read-only consumption of the incumbent emulator owner's supplied runtime handoff. No website implementation or prior website reviews were read. No emulation, compilation, source editing, audio qualification, device action or external communication was performed. All work in this research task is confined to this directory.

## Exact inputs

Archive `/workspace/dnbox-revision/emulator-input/runtime.tar.gz` SHA256 `5822db14472ca701db3c17289e5d305e5daeba971223a5cf4de86a56af4d8c57` verified before safe extraction. The archive's `MANIFEST.json` verifies **123/123 listed files**, with zero size/hash mismatches. `consumption.json` records the exact documents/scripts/receipts read and images visually inspected; `capture-index.json` records all PNG hashes, dimensions and inclusion class.

Emulator source identity: `gobbajogger/X0X37-for-Loopy-Pro` #899, head `431d0db82cbadca761fb32c6548ca4765875324f`. WASM SHA256 `8f053c488056eed4d3f71d77901ef796e42e055f64eb04fc71a476dd0b58c33d`, 3,391,184 bytes. Runtime MIT license retained in the bundle. This is an exact incumbent runtime artifact, not a newly built emulator.

Pinned actual firmware is **0.0.25.1**, source commit `79280e763341d03ba43266d3e25dad66f12de860`, model **SMK-37 Elite_900** or **SMK-37 Pro_900**. Package hashes: Elite `5e24e0d4afccc30906b334fbe73bcad3621df8df3c325790b7af2f94accffb1a`; Pro `6f135a3d03bb1a2a4d09d63040c719313612b85590a6af69b293a928e22285bf`; each 651,721 bytes. Firmware packages are deliberately absent from this handoff; its catalog pins their published URLs and hashes. Firmware/third-party license and provenance requirements remain applicable. 0.0.26 is excluded. Catalog text claiming exact boot NOT_RUN is stale compared with the later captured qualification; do not copy that text into the revised product UI.

## Recommended static first-beat lesson

Use exact images as recorded, with a brief musician-facing label such as “Recorded from DnBOX 0.0.25.1. These controls step through the example.” Keep hashes and diagnostic language in evidence, not ordinary UI.

1. **Start with the 909 screen.** `pro-reset-panel.png` (882×405) shows the real rendered keyboard panel, empty 909 BD sequencer, stopped, pattern 1, 125 BPM, length 16 and rate 1/16. It was captured after the browser-only reset test. SHA256 `db93085e6ca96bc22e7ec95fb6d983aca6d7692a48c88a4e7fc0dff5d8deb605`.
2. **Tap Pad 1, then Play.** `independent-qa-pro-playing.png` (882×405) shows the real panel with a single BD step, an active playhead and orange transport arrow at 125 BPM. SHA256 `7236b2080365a1e3e4eb9c2d5a93556a47fb606be3964e27ebb39cf21c5bbbef`. `independent-qa-smoke.cjs/.json` proves this exact action: boot Pro; wait for at least 12,000 emulated ms; accessible Pad 1 pointer down/up; SEQ PLAY down/up; observe nonzero output within 40 RMS observations over about 3 seconds; capture panel; press SEQ PLAY again; wait 3 seconds. Actual input events: pad id 0 down/up; button id 53 down/up; button id 53 down/up. Maximum observed RMS 0.0645736, no page errors, no halt. Do not claim this task listened to it.
3. **Show a fuller kick pattern as a second recorded example.** `pro-909-lcd.png` / `elite-909-lcd.png` (481×480) shows 909 BD steps 1, 5, 9, 13 enabled, stopped, 125 BPM, 16 steps at 1/16, with UNSAVED displayed. SHA256 `fef772cb92a8c347ff0dcec8a04de1a21d40cfcf39cda6fb6599a69c5f9b2973`. Exact accepted scene used analog pad indices 0, 4, 8, 12, value 700 then 0 per pad, with 100 ms hold / 150 ms release gap. Part selector is encoder index 2 (accessible K3), and the script waits for the actual 909 RGB565 header before programming it. The frame is the completed pattern, not intermediate edits.

The empty/reset panel, independent first-beat playing panel and four-on-floor LCD come from **separate recorded runs**. They illustrate verified states and actions; do not present them as a continuous recorded session. No accepted screenshot shows the single-step state before Play, each incremental four-on-floor edit, or the four-on-floor pattern playing. A static walkthrough must not synthesize those missing LCD states. Highlighting pads or the matching hardware Play control is an illustrative action hint; clearly distinguish it from live firmware response.

The saved first-beat panel is especially useful because it retains the real display and physical control arrangement. It can be shown directly at desktop and mobile widths. If the implementation owner crops the display, preserve the original in evidence and record the derivation. The native LCD is 240×240; qualification-only LCD images are rendered at a CSS 480×480 and captured as **481×480**, not 480×480.

## Other valid screens

All files below are under `PR899-runtime-431d0db8-handoff/`; all exact hashes/dimensions are in `capture-index.json`.

| Screen | Valid evidence and use |
|---|---|
| `elite/pro-break-setup-lcd.png` | Identical 481×480 image, all 16 BREAK steps enabled, stopped. SHA `0154563c7c6afdb692e25a3940d07d8eb430ab18908325fe5184bc6dc83c40fe`. |
| `elite/pro-break-only-lcd.png` | Valid playing BREAK-only phase after 4 seconds; differs by playhead. Elite SHA `2161f5178cd2c17c39a4499973829c846de8a17733f36b55d06477a817af3324`; Pro `1ad944805ca1fe31d3a912d7a67ded0dbff669c1cde3e6ef99f65f70eecc35aa`. |
| `elite/pro-chicago-lcd.png` | Identical 481×480 CHICAGO B sequence, alternating zero-based steps 0,2,…14, A2, factory sound, 125 BPM. SHA `a6d507d434f4a0dc81977c231ed0efe1aedb8b6cb5b6d3d6a12d54ed354f44a5`. |
| `elite/pro-miami-lcd.png` | Valid 481×480 MIAMI A sequence, all 16 steps, A1, factory sound, 125 BPM; cursor differs. Elite SHA `6161588b07b43ad8c197be6c8ab83fe23b37fb2ce84baf749fd4e7acc434e77b`; Pro `0eed756bed27a5181e912db4a8584029689024329662c3d0e5ba3b49137afe53`. |
| `elite/pro-heavy-break-lcd.png` | Identical 481×480 BREAK screen captured while the multi-part scene plays. SHA `2a9c7a9863a209fc77c7ebc7ac809be2267f6ecba427cd5b5048b6df09c23bb9`. |
| `elite/pro-saved-panel.png` | Identical 882×405 MIAMI screen at 131 BPM after browser-flash save. SHA `92ecb4e7404ce20cb34942d4204078f453107fbd727507ee1281c285b3f61a0d`. |
| `elite/pro-reloaded-panel.png` | Identical 882×405 screen retaining 131 BPM after browser reload. SHA `db9b07621bdfe38533e428ef254a73d9dbe9abefa6e2c7f6912cbc99d5e9bf9a`. |
| `elite/pro-reset-panel.png` | Identical 882×405 empty 909 at 125 BPM after confirmed browser-save reset. SHA `db93085e6ca96bc22e7ec95fb6d983aca6d7692a48c88a4e7fc0dff5d8deb605`. |
| `elite/pro-boot.png` | Valid full-page 1440×3409 originals showing the empty stopped 909 panel, but include the incumbent demo's dense surrounding UI and stale catalog copy. Prefer exact panel capture above. |
| `elite/pro-controls.png` | Valid full-page 1440×3691 screenshots after many keys, pads, encoders and faders. Complex diagonal drum state; unsuitable for a simple first-beat teaching sequence. |

**No HOME or mix screen is present.** Factory mix/FX excerpts are source evidence for defaults, not a visual HOME/mix state. Do not draw or claim an actual captured HOME/mix interface from this bundle.

## Limits that affect presentation

The BREAK examples use an **emulator-only loaded user sample**, CRAMEN, 70,589 frames at 44.1 kHz, ADPCM SHA `9f8605587a8b04ca5ed6c5739cd09d69b307c57e496986cabc786ec547c1f4a8`; sparse saved-state SHA `dc063c02b8bda773d8ac9489e2f20966c13995061cd5ab530f1659533fefe9e5`. Published firmware packages are unchanged and contain no appended stock-break pack. The default public demo blocks arbitrary sample imports. Therefore do not imply a visitor's fresh browser boot has the shown populated BREAK demo. The four-on-floor 909 and independent one-pad first beat avoid this dependency for their visible drum steps.

Browser-flash save/reload/reset is verified. The lifecycle script holds firmware button id 49, turns encoder index 1 seven times, releases, then uses the browser Save action; screenshots show 131→131→125 BPM across save/reload/reset. This is not evidence of an explicit firmware project SAVE workflow, transfer to hardware, physical-device persistence or installation. Avoid a hardware “save your beat” claim based on these screenshots.

Actual browser firmware audio was rendered in incumbent tests, but hard realtime acceptance **did not pass** because of worklet deadline overruns. Acoustic latency, human/speaker listening, long-run soak, Firefox/Safari/mobile runtime and physical hardware are NOT_RUN in the incumbent report. These are browser prototype captures, not device tests. The static route can accurately teach recorded states without presenting live realtime operation as accepted.

Exclude every `*-startup-offset-failed*`, `*-partial-no909*` and `*-trs-failed*` image/receipt from accepted teaching states. These retain genuine pixels from runs whose assumed selected parts, startup timing or MIDI pathway were invalid. The accepted 909 LCD happens to be byte-identical to its old failed-run counterpart; acceptance follows the final observed-header guarded action sequence in `heavy-observed.cjs`, `heavy-observed.log`, `*-scene-events.json` and the final scene receipt, not filename or unique pixels alone.

No remaining blocker to using the recommended static first-beat selection. Missing intermediate and HOME/mix captures constrain what may be illustrated as actual output; new captures would need the incumbent emulator owner. This task did not request or perform such work.
