# Production renderer evidence

Four native 240×240 PNGs in `images/`, rendered at accepted PR144 `3862175d5815d2bd505ab04ca1c8e1868761a2e7`, root `87819bd7af981f8a7315875233f69ff720bc13ce`:

- `home.png`: pattern overview, tempo, swing, filter and performance controls.
- `mixer.png`: part levels, compressor/pump and selected 909 level/pan/reverb/delay.
- `effects.png`: per-part reverb/delay sends and effect settings.
- `smc-control-preview.png`: **newer accepted-source preview only**; full-screen temporary SMC control and pickup indication.

HOME, MIX and FX were separately compiled/rendered from offered catalog source `54f2ffbc3124f7449a69067dc8215a2d91a2e675`. All three corresponding PNGs are byte-identical in these synthetic states. They can illustrate shared screens in that DEV build; this is not hardware qualification. Do not promise the newer SMC full control screen in the offered download. No Pause lock claim.

`receipt.json` records exact commands, source blobs, hashes and limitations. `capture.log` records 191 passing original harness checks. Generic drivers are `source/tests/host/catalog_capture.c` and its matching baseline copy. `renderer_capture.c` preserves the accepted test with two extra capture calls. Firmware sources are unchanged.

Images use production ui.c/gfx.c through the host framebuffer and PNG serializer. Hardware/flash are simulated; clip grid/storage stubs are not visible. No GUI, personal media/names, sample-library titles, proprietary image asset, AI image generation or hand-painted screenshot. Internal build dependencies use bundled OFL fonts, pinned GPL repository drum inputs and procedural default break synthesis.

Initial archive omissions of font and drum generation inputs were corrected from exact pinned repository assets. No denied, pending or uncertain action remains.
