# Oldschool importer implementation and verification

Candidate `7828b564c7f24b3c6e2d6616ef1df597aef286ee`, tree `001b61dcdc81dd566b4653da9e7fcb2e8de846b3`, branch `codex/sample-oldschool-import-20261026`, clean isolated website lane atop EC010 `cd6a4b9`. Source review pending with a different worker. No push/merge/publication.

Current website source had only ordinary 22.05 kHz option; merged firmware PR362/364's oldschool implementation had never reached these website importer controls/helpers. This lane selectively reuses that known downsampling/IMA method without replacing archive restoration, MIDI correlation, project compatibility or OTA source. No web/fm1ota.js change. The website's existing source generator builds both the embedded and standalone importer and all library copies consistently.

The new default-Off Oldschool space saver has Light 1.5× / Medium 2× / Heavy 3× / Max 4× choices. Fewer stored samples plus a proportionally lower per-zone playback rate preserve the intended loop timing/pitch at the source loop tempo, with reduced bandwidth and ADPCM texture. BREAK tempo, pitch and performance controls can change playback; no pitch-independent stretch or bit-identical physical rendering is promised. Actual sample data bytes, odd final nibble padding and fixed 512-byte occupied-slot header overhead are shown separately; physical slot capacities remain fixed.

2-second 44.1 kHz synthetic example (512-byte header additional in every one-loop image):
- Off: 88200 samples, 44100 Hz, 44100 B ADPCM.
- Light: 58800 samples, 29400 Hz, 29400 B.
- Medium: 44100 samples, 22050 Hz, 22050 B.
- Heavy: 29400 samples, 14700 Hz, 14700 B.
- Max: 22050 samples, 11025 Hz, 11025 B.

Original file audio and actual encoded/decoded prepared ADPCM can be compared before device writes. Preview uses a supported 44.1 kHz AudioBuffer with the true saved-rate ratio, including low rates. Original decoded arrays remain intact for every recut; returning Off reconstructs from them. Setting changes commit atomically, restoring previous controls on failure/cancel. Cancel/escape before adding/replacing/sending leaves device bytes unchanged. Stop, source switch and preview-generation tokens prevent stale asynchronous AudioContext resume from starting obsolete audio.

Implementation-stage checks passed on exact candidate: full npm test including 102 edge tests,33 existing project and13 project-page contracts, plus 8 new sample-page event contracts; generated parity, provenance/syntax and diff checks passed. New library/bank/codec checks cover exact serialized n/rate/data bytes, all five factors, odd samples,22 kHz + Max rounding, preserved source hashes, default-Off byte identity and rejection before serialization. Actual page handlers use controlled DOM/audio/MIDI sinks in Node; no browser execution is claimed.

The actual JS-generated 4-second/two-bar bank images were passed to the real BREAK C renderer and exact engine loop_bars function from pinned clean firmware d633833a/tree442b8e3d. Off / 1.5× / 2× / 3× / 4× builds and renders all exit 0, 20 musical/gate/live checks each at 90/120/170 BPM. This is host playback contract proof, not a native package or hardware result. host/receipt.json retains source blobs, compiler, exact commands and log hashes. Synthetic local .bin files and executables are excluded from text evidence/delivery.

Actual compiled-source UI/audio preview for owner-open: task6/previews/sample-oldschool-import.html. It seeds synthetic audio and Medium 2× to make the tradeoff audible; product default remains Off. Device actions are disabled. The module was syntax-checked, but no GUI/headless/browser tool ran and no denied action was retried. Owner UI/audio review is still required before rollout; no visual/hardware success is inferred from Node tests. Firmware-side UI mirror parity remains a separately coordinated follow-up.

Exact logs and text artifact hashes: receipt.json, host/receipt.json and manifest.json. No device, recovery, probe, native build, publication or external workflow execution occurred in this lane.
