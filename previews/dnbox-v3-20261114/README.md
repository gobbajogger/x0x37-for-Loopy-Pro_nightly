# DnBOX — Make room for a beat

Product prototype v3, owner review only. Buildless, self-contained HTML/CSS/JavaScript with unchanged authentic firmware screens and one exact opt-in audio recording. No deployment or firmware/emulator integration.

## Run

From this directory:

```sh
python3 -m http.server 8766 --bind 127.0.0.1
```

Open http://127.0.0.1:8766/. Start at Discover for captured examples or Make four kicks for visual teaching. No installation, device connection or file write is available. Python serves static files; the website has no backend or network requests beyond its own assets.

## Learn by looking

Ready → set the bar (K5 length16st, K6rate1/16, three separate OCTAVE− taps) → selectBD and place four kicks → hear on your instrument → request/check a save. Another-view branch illustrates the bounded LP/PATCH/SEQ/K3 return. Every teaching sequence starts paused; Play/Pause, Previous/Next, Repeat, Escape, keyboard access and reduced-motion manual steps are available. Route changes, menu opening and visibility loss stop the current guide; audio pauses on route/visibility/Escape.

Control atlas: physical two-row pads → one horizontal row of screen steps; source-backed mode comparison; selectable drum key → physical locator → outside-image target row; bassREC pad row reversal with physical-key equivalents. External annotations never alter captured LCD pixels. Missing intermediate/PARA/REC/HOME/four-kick-playing/SAVE captures remain disclosed.

The lesson assumes an editable pattern with an emptyBD row and suitable default musical settings. It performs no reset or clearing. K5/K6 edits change current pattern timing. Existing work should be saved before adjusting. Real save success means SAVED/AUTOSAVED; keep power on while waiting. Live chains and separate BREAK sample backups have explicit consequences.

## Exact provenance

Firmware0.0.25.1 source79280e763341d03ba43266d3e25dad66f12de860. Emulator#899 head431d0db82cbadca761fb32c6548ca4765875324f. Website#890 reference34c321466ca3ccb5b7f125c3513cebf4ec76640c is context only.

`assets/audio/pro-heavy.wav`: exact7.987664-second Pro multi-part recording, SHA256cf0925d92c647b0ea78686ddf2a9dad7eb1510b4bf0d2b0267e24313ca91eb9f. It contains909BD,Chicago,Miami and separately loadedCRAMEN. It is neither a kick-only lesson soundtrack nor a response to website controls. Owner sample authorization is retained; independent third-party clearance is not established. The stale generated-loop NOTICE is not used as CRAMEN rights evidence. This package supplies no publication authorization.

All seven PNG firmware assets match v2 exactly. Authentic captures are separate runs, not a continuous film. Runtime license attribution is retained in provenance/EMULATOR-MIT-LICENSE.txt. No runtime/WASM or firmware package is executed or distributed by this website.

## Verification and limits

See stage evidence for fresh viewport/interaction checks and the fresh blind review, initial findings and changed-only rechecks. Browser QA is headless Chromium with actual1440/768/390/320renders, not physical-device acceptance. Firmware runtime, human-musician/speaker listening, full screen-reader, real mobile/OS interruption and live realtime acceptance remain unqualified. Background visibility cleanup is handler-tested; true background-tab behavior was not established in headless mode. The live#899 realtime gate remains NOT_PASS.

No deployment, publication, Gitpush/PR, shared branch edit, emulator rebuild, stopped-worker restart, TLS bypass or denied public-Git-export retry occurred. The source and evidence packages are for owner review.
