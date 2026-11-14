# PR #899 runtime qualification — 2026-11-14

The exact candidate boots and renders real firmware audio for Elite and Pro in Chromium. Functional desktop-browser evidence is now available. Hard realtime qualification is **not passed**; observed worklet deadlines overrun. No merge, deployment, firmware rebuild, device action or working-trial publication occurred.

Source: `gobbajogger/X0X37-for-Loopy-Pro`, branch `emulator/dnbox-public-try-20261113`, head `431d0db82cbadca761fb32c6548ca4765875324f`. Existing draft [#899](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/pull/899). Runtime source and product files remain unchanged; all new files are local test/evidence artifacts. Current ROADMAP #887 at `c834b5b0f4d7f1a9a0f2f7eb6657d66b4e032a15` still named the completed Classic owner; no separate runtime successor appeared in current PR discussion. The parent delegation admitted this bounded runtime continuation. The live coordination/merge-queue ref was absent; no inaccessible coordinator chats were accessed.

## Immutable inputs

- WASM: **`8f053c488056eed4d3f71d77901ef796e42e055f64eb04fc71a476dd0b58c33d`**, 3,391,184 bytes. Built with the unchanged `web/build.sh`, Rust1.100.0 stable x86_64 Linux, wasm32-unknown-unknown, release/LTO/codegen-units1/inline-threshold2000/exported growable table. Exact command, source archive/Cargo.lock/Git blob hashes and raw build log retained.
- Published Elite0.0.25.1: **`5e24e0d4afccc30906b334fbe73bcad3621df8df3c325790b7af2f94accffb1a`**,651,721 bytes.
- Published Pro0.0.25.1: **`6f135a3d03bb1a2a4d09d63040c719313612b85590a6af69b293a928e22285bf`**,651,721 bytes.
- Firmware source identity remains `79280e763341d03ba43266d3e25dad66f12de860`; packages were downloaded unchanged from catalog URLs and rehashed after testing.
- Chromium154.0.8037.57 on Debian13, AMD EPYC9V74 cloud CPU,5 vCPUs. Headless Playwright default `--mute-audio`; audio evidence is the real worklet output tap, not speaker listening. AudioContext44,100Hz, interactive hint,512-frame queue allowance(11.61ms), measured baseLatency10ms/outputLatency32ms. These are separate quantities, not measured acoustic latency.
- Upstream MIT LICENSE/copyright retained. Pinned DnBOX firmware remains GPL-3.0 with third-party terms preserved. The compiled runtime and test state are local/handoff artifacts, not a release.

## Executed results

| Check | Elite | Pro |
|---|---:|---:|
| Package SHA/size; board1 boot; changing LCD | PASS | PASS |
| UI emits all37 key IDs,16pad IDs,8encoder IDs,4fader IDs | PASS | PASS |
| Pitch/MOD controls exercised; Miami preview releases to zero RMS | PASS | PASS |
| Edited tempo saved/reloaded/reset | 131→131→125BPM | 131→131→125BPM |
| Input-message turnaround,40samples,median/p95 |59.4/72.6ms|60.8/74.7ms|
| First nonzero rendered-signal observation after nearest actual input |87.7ms|152.1ms|
| Isolated BREAK mean RMS / peak |0.05724 /0.40057|0.05710 /0.40057|
| Combined scene steady short-quanta increase |0|0|
| Combined scene emulated/wall clock ratio |0.99961|0.99840|
| Combined scene median emulated-time/CPU-time speed |1.4×|1.25×|
| Combined scene worst reported worklet quantum |20ms|55ms|
| JIT compilation failures; page errors |0;0|0;0|
| WASM memory after first Miami preview /after save |98,697,216B /same|98,697,216B /same|

First-signal timing is the1024-frame observer callback after a909-mode F#3/keyID6 action; it is not a C4 pitch measurement or acoustic latency. The tap has23.22ms chunks and main-thread scheduling uncertainty. All37 UI IDs were emitted/released; this firmware mode does not turn all37 keys into37 pitched sounds.

Startup short counters reached13 and stayed there after10s, including the final heavy scene. This does **not** prove the OS output never glitches: measured quanta exceed128/44100=2.90249ms. Baseline control runs also reported43ms/53ms worst quanta after10s. The worklet falls back to integer-millisecond Date.now timing in this browser scope; counts refer to reported intervals, not a complete histogram of individual deadlines. No 2.5-second buffer or fabricated/synthetic audio was used.

Resource observations use a separate on-demand memory wrapper that imports the byte-identical original processor and adds only a diagnostic message handler, with no render/process override. Both models grow from96,010,240B at~10.5emulated seconds to98,697,216B after first Miami use and stay at that value through~24.6seconds. This is a short scoped plateau, not a long-run leak or firmware-pool acceptance. The request label `boot+6s` is stale; actual code waits10seconds and recorded emulatedMs is authoritative. CDP main-thread heap is~4.24MB with the light lifecycle observer; baseline PCM-array heap snapshots~85–90MB include the capture harness and are not product RAM measurements.

The tampered-package browser test PASSes: one in-memory response byte was flipped, and the page visibly rejected SHA verification before boot. The original fixture files remained unchanged. Existing41/41 held-input evidence was reused without rerun. Build exit0, final browser command exit0, heavy command exit0 and lifecycle command exit0.

## Exact supported scene

`heavy-observed.cjs` waits for the real909 LCD after>=12emulated seconds and verifies the actual RGB565 header before each part selection. Each hardware encoder event is separated by550ms and retried only while the observed part remains different. This resolves boot-ack/UI-ready and encoder-count assumptions without changing firmware or runtime.

Factory pattern1,125BPM,16steps,1/16rate. BREAK enables all16steps; Chicago B uses zero-based steps0,2,4,6,8,10,12,14 at A2/note45; Miami A uses all16steps at A1/note33; bass velocity100, factory bank/preset/source0 for each. 909 BD uses0,4,8,12.808 stays inactive. Mix/FX remain exactly the pinned engine_sound_defaults/pattern_init/original_sound_init. Factory mix/default excerpts and original source hashes are included. Actual ordered input events and emulated/wall timestamps are pinned separately for each model in `*-scene-events.json`, and rendered screenshots prove each part/pattern.

The unchanged published packages contain no appended stock-break pack. A separate **emulator-only saved sample state** loads the authorized CRAMEN ADPCM into user slot1. Sample SHA `9f8605587a8b04ca5ed6c5739cd09d69b307c57e496986cabc786ec547c1f4a8`,70,589frames at44.1kHz. Sparse-state SHA `dc063c02b8bda773d8ac9489e2f20966c13995061cd5ab530f1659533fefe9e5`,nine user-sample sectors0xC2000..0xCA000. No package or protected region changed; this is ordinary emulated sample storage. State/provenance/NOTICE accompany the handoff. A4-second BREAK-only run renders nonzero musical PCM before other parts are programmed; the combined scene runs20seconds. Playable WAV excerpts are actual output, converted to16-bit for listening. Human/speaker listening remains NOT_RUN.

This controlled saved-state scene qualifies the runtime workload. The public DnBOX page currently blocks arbitrary sample-state imports and its unchanged default package has no stock loops; it does not yet expose this test's BREAK workload to visitors. Do not advertise the default public page as a full populated BREAK demo.

## Failed investigations retained

- A TRS-MIDI script rendered silence. Exact source confirms SMK37 builds set X0X_TRS=0, while fm1_midi injects UART1 MIDI-IN. Scheduled MIDI bytes do not prove played notes. Optional public Web MIDI forwards through that same path and is unqualified for these fixtures; no firmware routing patch was made.
- Initial physical scripts assumed wraparound and accepted input before firmware UI readiness. Their LCDs showed the wrong part; no audio from those named phases is accepted as BREAK. Files retain `trs-failed`, `partial-no909` or `startup-offset-failed` names and compact FAIL receipts. The accepted scene is solely the observed-LCD setup.
- First control harness hit collapsed pad details; it was interrupted, corrected, and the full real-browser pass completed. An initial npm-cache path failed; workspace-local cache installation passed. No unchanged host suite was repeated.

## Remaining gates and handoff

Hard realtime/no-output-dropout acceptance is open because actual worklet deadline overruns remain. Acoustic latency, audible speaker/human listening, long-run resource soak, Firefox/Safari/mobile and physical hardware remain NOT_RUN. Browser evidence cannot replace #892 native tracing or device evidence. #890 website integration retains its owner; no installer/catalog/release/firmware/.github changes or publication occurred. Independent read-only browser QA consumed the exact evidence and completed a separate real Pro smoke:7/7 PASS,exit0. Its21ms worst quantum with a light Analyser and no PCM capture independently confirms the deadline gap. See independent-browser-qa.md/.json and independent-qa-smoke artifacts. This is scoped functional acceptance, not merge/deploy authority. Do not merge or publish a working-trial claim from these results.

A public #899 claim/plan comment was **denied by automatic approval review**, with reason: no trusted user authorization for that exact external communication/commitment. It did not post and was not retried or routed elsewhere. The earlier denied PR-description update also remains untouched. Parent/owner authorization is required before any public result comment. Local execution, evidence preservation and independent QA continued.
