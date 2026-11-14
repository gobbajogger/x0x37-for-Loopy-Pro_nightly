# DnBOX website v3 — authentic asset investigation

Read-only investigation, 2026-11-14. Website implementation remains with `/root`; incumbent #899 ownership is unchanged. No emulator execution/build, shared source change, device action, external message, publication, TLS workaround or public Git export occurred.

## Decision for this prototype

Exact authentic static firmware captures are usable now. Four actual rendered firmware WAV excerpts also exist with matched scene and byte provenance, and a separately retained owner authorization explicitly covers CRAMEN/TASTY/HOTPANT in the public download. That is owner authorization, **not independent legal clearance or a transferable sample license**. The supplied sample NOTICE covers the former generated 909 loops and must not be misrepresented as the license for CRAMEN.

For the present private owner-review prototype, a recording player may use an exact WAV with its original scene explanation and owner-authorization provenance retained. If the stage's “rights established” requirement means independently documented third-party clearance rather than the owner's explicit authorization, that further evidence is unavailable here: leave sound unavailable instead of substituting other sound or calling CRAMEN GPL-licensed. Root retains this presentation decision. No public publication approval follows from this report.

The strongest pairing is an opt-in **recorded multi-part example**, visibly separate from the teaching controls. Do not pair the combined WAV with the first-kick lesson as if that lesson caused or reproduced it. No kick-only WAV or continuous first-beat film exists. Controls that advance teaching hints must say they advance the guide; they do not perform an instrument action, start a sequencer, update the captured LCD or change the recording. Avoid sound-reactive claims and arbitrary waveform animation. A measured waveform derived from the exact file would be a recording visualization, not firmware feedback.

## Exact incumbent artifact and fresh checks

Library `libfile_fde3_f-d3bfdf5ce2588191a9587d372b83fcaf_2021479872048191acbfdca1f870a539`, file `file_0000000083e8822fa0ffb0cecf9c5cc4`, version `0`, name `PR899-runtime-431d0db8-handoff.tar.gz`, 8,401,838 bytes, archive SHA256 `5822db14472ca701db3c17289e5d305e5daeba971223a5cf4de86a56af4d8c57`.

Parent materialized and verified the archive at `/workspace/dnbox-v3/runtime-input/PR899-runtime-431d0db8-handoff`. This investigator independently rehashed all **123/123** manifest entries: zero mismatches. Full audit is `asset-receipts/runtime-byte-audit.json`. The first download-helper attempt failed before transfer with `hosted apps tools/list request failed with HTTP status 401`; it was not retried by this investigator. Parent supplied an independently materialized exact local path, after which this task consumed local bytes. No uncertain transfer outcome remains.

Fresh authenticated read of [#899](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/pull/899) confirms draft source `431d0db82cbadca761fb32c6548ca4765875324f` and its existing request for immutable website-consumption evidence. Runtime WASM is 3,391,184 bytes, SHA256 `8f053c488056eed4d3f71d77901ef796e42e055f64eb04fc71a476dd0b58c33d`. Firmware version is **0.0.25.1**, source `79280e763341d03ba43266d3e25dad66f12de860`; Elite package SHA256 `5e24e0d4afccc30906b334fbe73bcad3621df8df3c325790b7af2f94accffb1a`; Pro package `6f135a3d03bb1a2a4d09d63040c719313612b85590a6af69b293a928e22285bf`. Each package is 651,721 bytes. Firmware packages are absent from the handoff and were not fetched here. #890 reference remains `34c321466ca3ccb5b7f125c3513cebf4ec76640c`; this task does not alter it.

## Authentic recordings available now

All paths below are relative to the exact runtime handoff directory above. Each file is stereo PCM16, 44,100 Hz. These are already converted excerpts of real firmware/worklet output; no synthesis or new conversion was performed here.

| File | Bytes | Duration | SHA256 |
|---|---:|---:|---|
| `elite-break_only.wav` | 716844 | 4.063492 s | `2e8bd82fed60adbc13b0bf07aea2c79910e2bf2a053bc5bdd72714f9c788cc46` |
| `pro-break_only.wav` | 729132 | 4.133152 s | `52a142fb13e1404cffecc1435fca239fc00cbb216a580c58873176367fe55467` |
| `elite-heavy.wav` | 1409068 | 7.987664 s | `1915573a817300c6e859eafc4495b775aa3189534033d6bb677a93524fe10f73` |
| `pro-heavy.wav` | 1409068 | 7.987664 s | `cf0925d92c647b0ea78686ddf2a9dad7eb1510b4bf0d2b0267e24313ca91eb9f` |

`heavy-observed.cjs` records the observed-header-guarded setup and actual input messages. `summarize.py` selects audio chunks by the `break_only` or `heavy` phase, then writes clamped/rounded 16-bit output from recorded float PCM; the heavy file is the first `floor(8*44100/1024)` chunks of that phase. `elite/pro-scene-events.json`, `scene-receipt.json`, `qualification-summary.json` and compact captures pin model-specific events and timing. The full raw PCM is not in this handoff; `LOCAL_RAW_CAPTURE_HASHES.json` retains its original identities. This investigation verified current files and the retained derivation code, not an independent re-render or bit-for-bit regeneration from absent raw PCM.

Scene: factory pattern 1, 125 BPM, 16 steps, 1/16. BREAK all 16 steps; Chicago B zero-based steps 0,2,…14 at A2/note45; Miami A all 16 at A1/note33; 909 BD steps 0,4,8,12; 808 inactive. Mix/FX remain pinned defaults. Four seconds of BREAK-only runs before other parts are programmed; the full scene ran 20 wall seconds. The corresponding `*-heavy-break-lcd.png` is one static captured screen from the heavy run, not a synchronized video frame stream.

The BREAK state is **emulator-only loaded user slot 1**. CRAMEN is 70,589 frames, original 44.1 kHz mono PCM16 `crunchy amen.wav` (141,354 bytes), original SHA256 `f0177048f42719ea739a36f4618738f499cbbd5831c3b377b7b3add045384210`; encoded ADPCM SHA256 `9f8605587a8b04ca5ed6c5739cd09d69b307c57e496986cabc786ec547c1f4a8`. Original SHA is a retained provenance statement, not fresh original-WAV byte verification here. Sparse user-state SHA256 is `dc063c02b8bda773d8ac9489e2f20966c13995061cd5ab530f1659533fefe9e5`, 36,900 bytes, nine sectors 0xC2000–0xCA000. Default published packages contain no appended stock-break bank and default public demo blocks arbitrary sample-state import. Do not suggest a fresh visitor boot includes this scene.

PCM read-only statistics find nonzero content and no samples at -32768 or 32767 in these WAVs. This is neither musical-quality assessment nor listening acceptance. Human/speaker listening remains **NOT_RUN** here and in incumbent qualification.

## Authorization and licensing evidence

Fresh full Library read of `roadmap-row29-approval-evidence-20261104.json`, Library `libfile_9472e592ab98819182c23a177df2da91`, file `file_00000000da0481f58f5b271f11ef07e6`, 8,680 bytes, version unspecified by Library, confirms the retained owner confirmation: “yes they can” and “i give that approval. make it clear in roadmap”. Its explicit scope is the selected CRAMEN/TASTY/HOTPANT samples in public download and reviewed documentation work; no merge/publication/device/access operations. It records owner authorization, not independent legal analysis. Text reconstructed with its final newline matches 8,680 bytes, SHA256 `efc7aa3f7094f7a7974d0c458e86f3a4c693a7f984c34866dad5d3bd8a5b5745`.

Original receipt, exact Library response and retained inventory provenance are saved under `asset-receipts/row29-original-content.json`, `row29-original-library-read.json`, and `sample-inventory-content.json`. The latter's source is `DnBOX-sample-inventory-55-29-20261114.json`, Library `libfile_fde3_f-6b0c61984cfc8191b1364d6f09cc17ba_2021479872048191acbfdca1f870a539`, version0, 106,615 bytes. Its independent reconciliation also explicitly says the older `assets/factory-breaks/NOTICE` does not establish rights for newer personal loops. The original WAV Library identity is `libfile_c2da4a4479d88191b7fb472c0b9282b0`; this investigator did not fetch it.

Runtime `LICENSE` is MIT; catalog firmware is GPL-3.0 with third-party terms retained. These software licenses must not be substituted for sample rights. `DnBOX_J1_Jun60_host_audio_preview.wav`, Library `libfile_fde3_f-23df724c1d54819188e8f993b43a078f_2021479872048191acbfdca1f870a539`, version1, 1,587,644 bytes, was found by metadata but not downloaded or qualified. It is labelled a host/Juno preview, not 0.0.25.1 #899 output; exclude it from this prototype's 0.0.25.1 story.

## Captured-screen boundaries

Freshly visually inspected unchanged `pro-reset-panel.png`, `independent-qa-pro-playing.png`, `elite-909-lcd.png`, and `elite-heavy-break-lcd.png`. The first three exactly match v2 firmware assets. Relevant hashes:

- Empty 909 reset panel: `db93085e6ca96bc22e7ec95fb6d983aca6d7692a48c88a4e7fc0dff5d8deb605`.
- Independent Pad 1 then SEQ PLAY panel: `7236b2080365a1e3e4eb9c2d5a93556a47fb606be3964e27ebb39cf21c5bbbef`.
- Completed four-kick 909 LCD: `fef772cb92a8c347ff0dcec8a04de1a21d40cfcf39cda6fb6599a69c5f9b2973`.
- Heavy BREAK LCD: `2a9c7a9863a209fc77c7ebc7ac809be2267f6ecba427cd5b5048b6df09c23bb9`.

The reset panel, independent playing panel and four-kick LCD are **separate runs**, not frames of one performance. No actual image establishes intermediate step edits, four-kick playback, HOME/mix or firmware project SAVE. Teaching animation can illuminate real control locations and illustrate step order around these unchanged captures; it must not paint invented LCD states, move a captured playhead or imply the reader has performed a device action. Control truth is owned by `/root/control_truth`.

## Integration boundary and remaining limitations

Hard realtime acceptance remains **NOT_PASS**. Independent read-only diagnosis, Library `libfile_fde3_f-c64c8199ab048191a168fefe1059df10_2021479872048191acbfdca1f870a539`, version0, 8,378 bytes, preserves functional acceptance but documents 20/55 ms worst reported brackets and an independent light Pro 21 ms bracket against a 2.90249 ms quantum. This is not a qualified live instrument. No live iframe/runtime embedding should be activated by this stage.

Acoustic latency, human/speaker listening, OS underruns, long-run resource soak, Safari/Firefox/mobile runtime and physical hardware remain unverified. Browser flash save/reload/reset does not prove a physical project-save workflow. Retain a website integration contract for a future incumbent-supplied qualified runtime: exact immutable runtime/firmware hashes; capability and error states; opt-in audio start; obvious pause/mute; keyboard release/cancel/blur behavior; reduced motion; mobile/browser acceptance; and no new firmware or emulator source ownership. Current lesson controls remain website guidance only.

Fresh evidence responses are preserved in `asset-receipts/github-pr899.json`, `github-pr899-comments.json`, `library-asset-reads.json`, the original owner-approval read above, and `runtime-byte-audit.json`. No stopped worker was contacted or restarted.
