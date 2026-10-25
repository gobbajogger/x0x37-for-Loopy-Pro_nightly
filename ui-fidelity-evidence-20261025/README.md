# PR18 native-layout correction

Corrects the wide, approximate HOME/MIX/SMC illustrations at PR18 head `c778be046753101e1fab0c7004c479a07f3e00ff` (tree `37da7a066701781ff9e1f4e78e86d234e60a4bc3`). Installer layout, typography, Install firmware / Manage samples navigation and all device operations are preserved.

The new inline SVGs retain the native 240×240 screen composition, labels, values, states and RGB565 colors. They come from actual production drawing commands with original Barlow Semi Condensed font outlines and the firmware's individual glyph advances. They contain no embedded raster. Smooth vector curves and font outlines replace the device renderer's quantized antialiasing; native pixels are therefore not byte-identical. This is a faithful reconstruction of the shown synthetic states, not a promise of every runtime state or hardware verification.

## Exact references

- HOME/MIX: public DEV `54f2ffbc3124f7449a69067dc8215a2d91a2e675`, tree `3b5cadafba33f4c1b116660bc9d19a27a892337c`. The current `gh-pages/versions.json` was re-read during this correction and still offers that two-model DEV source. The package URLs/hashes and DEVICE NOT TESTED status are unchanged.
- SMC: historical accepted `3862175d5815d2bd505ab04ca1c8e1868761a2e7`, tree `87819bd7af981f8a7315875233f69ff720bc13ce`; this earlier F1 909-level pickup screen is not in offered builds. The pending SMC redesign has no verified final reference available to this task. The visible caption and reference disclosure say so. Do not substitute or claim its pending output.
- Original captures, commands, source blob identities and native image hashes: `../workspace-evidence-20261025/renderer.json` and `renderer.md`; originals remain at `../assets/firmware-ui/{home,mixer,smc}.png`.
- Exact original `ui.c`, `gfx.c`, `smc_mixer.c` and `gen_font.py` snapshot Git blob identities were checked against that receipt before tracing. Firmware source was copied into isolated host-only evidence directories; no firmware checkout was edited or built for a device.

## Reproduction

`trace-renderer.py ISOLATED_COPY` intercepts drawing primitives, text and canvas commits in an isolated copy. It preserves firmware layout/state/metrics and emits commands instead of pixels. It bypasses dirty-region hashing because intercepted draws do not populate the framebuffer. Original unmodified PNGs are the independent reference, not the instrumented framebuffer.

Use the original `catalog_capture.c` / `.sh` from the earlier evidence for the public baseline. For the accepted source, run the same harness infrastructure with `historical-smc-main.c` as the main body in `renderer_capture.c`. This reproduces the first `test_restore` capture state without running framebuffer assertions against the substituted backend. The baseline captures HOME/MIX/FX; the accepted capture supplies only historical SMC. Retained traces are `public-draw-trace.log` and `historical-smc-draw-trace.log`.

Run `python3 vectorize.py TRACE ORIGINAL_FONT_DIRECTORY OUTPUT_DIRECTORY` with fontTools/Pillow. Fonts are the pinned source's `assets/fonts/BarlowSemiCondensed-{Medium,SemiBold,Bold}.ttf`. Output uses native glyph advances and tnum outlines, the original font role sizes/vertical offsets, original lowercase folding, production clipping bands, rounded rectangles, lines and 270-degree knob arcs. Original Barlow OFL text accompanies the reusable standalone vectors. Inline vector clip IDs are prefixed uniquely per screen; no external font request is needed.

## Validation and rollout

`npm run build`, `npm test`, 66 presentation checks, 29 workspace browser checks and 26 unchanged populated-catalog fixture checks pass. The focused presentation checks cover native square vectors, original glyph outlines, unique clipping IDs, visible source/pending-design context, overflow at 320/390/768/1280, keyboard task return, sample prerequisite and disabled install. The original 677 admission, 34 history and 61 bundled-browser cases are reused from the previous exact operation inputs: all shipping scripts, controls, catalogs and package libraries are byte-identical. The 29 workspace cases were rerun for the changed surrounding page. Logs are attached in this directory; independent review is separate.

The screenshot fixture calls the unchanged `renderInstaller` with the same already-published two-model catalog; it is a local visual/negative-test fixture, not a newly qualified deployment. Package responses are invalid in populated negative checks, no hardware or real download bytes are involved. The committed source-generated installer retains its empty preview catalog. Parent owns owner check-in, final qualified generation with the unchanged public catalog and changed presentation fingerprint, integration and publication. Do not deploy the empty source preview over the live catalog. No merges, deployment, firmware changes or hardware claim occurred.
