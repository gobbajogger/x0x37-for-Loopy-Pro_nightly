# Drum kit summary glyphs

On top of the 21 tuning-fork changes, the 11 captured 909 velocity-sensitivity summaries and 11 captured 808 accent summaries now use the firmware's four strokes. All 22 were static and already carried the native high-value drawing. Only the two kit parameter IDs with the inactive-bank summary marker are eligible. The selected enlarged 808 KIT view can use a two-peak drawing. Compiling the pinned native branch confirmed that exception and the distinct clap route. [Firmware role selection](https://github.com/gobbajogger/DnBOX/blob/9dd6f2df020340f7a82ab241ef07c6ec16195ebc/firmware/src/app/ui.c#L8497) · [Native slot selection and ticks](https://github.com/gobbajogger/DnBOX/blob/9dd6f2df020340f7a82ab241ef07c6ec16195ebc/firmware/src/app/ui_drum_voice.inc#L446)

50 of 83 drum control occurrences change between their endpoints, up from 28. For these 22 additions, all 45,056 SVG coordinates across both kits and 128 raw values matched the native C emitter within 0.000051 source units. In sandboxed Chromium 151 the compact strip and desktop editor each traversed all 22 voices. Every control was edited to both endpoints and undone twice. Every archived Original in the compact view retained the entire source SVG and four-tick donor. The web test uses reduced motion to sample the settled shape. [Measurements and individual results](results.json)

## Remaining 33

| Occurrences | Captured field | Outstanding source dependency |
|---:|---|---|
| 3 | 909 kick Tune, pitch depth and Pitch | The native pitch-sweep and carrier share all three settings. Tune also uses a slot-sized pixel raster. A faithful preview needs the three captured raw values together, their physical-unit mapping and the native pitch law. |
| 10 | 909 Decay on nine voices and clap Tail | The retained cubic is a falling-tail symbol. The native idle trace uses the exact physical unit and duration from `engine_param_si` and a fixed 2 s axis. Verify those per voice before mapping the trace. Live ghost/marker behavior additionally uses telemetry. |
| 10 | 808 Decay, excluding clap | Standard `dv_glyph` distinguishes physical durations and uncalibrated raw controls. It uses a voice-specific duration, raw fallback, and reach. The current rounded display strings alone cannot establish its geometry. |
| 1 | 808 clap Decay | The dedicated clap/maracas stage page consults the Sound choice and actual stage-owner preview before selecting its stage diagram. |
| 2 | 909 and 808 snare Tone | The retained single filter-shaped stroke differs from the 909 noise-tail trace (including 24 ms hold) and the 808 two-shell blend. Neither is an existing matching stroke group. |
| 2 | 909 and 808 snare Snappy | The donor shows a jagged burst. Native idle geometry is a 17-point exponential with amplitude set by the parameter. Its live version additionally uses the measured envelope. A same-picture substitution has not been established. |
| 5 | 808 Sound selectors | The retained stepped pictogram names a discrete choice. The dedicated drum role has no separate choice-art branch in this version of `dv_glyph`; the general fallback is an arc. The clap's sound choice also changes stage ownership. |

The measurements cover the candidate's current projections. Mapping the owner's complete 17:00 selection still requires separate evidence. [Native drawing code](https://github.com/gobbajogger/DnBOX/blob/9dd6f2df020340f7a82ab241ef07c6ec16195ebc/firmware/src/app/ui_drum_voice.inc#L264) · [Clap stage routing](https://github.com/gobbajogger/DnBOX/blob/9dd6f2df020340f7a82ab241ef07c6ec16195ebc/firmware/src/app/ui_drum_voice.inc#L656)

## Reproduce

Supply the candidate source root in `NIGHTLY`, its built product root in `PRODUCT`, and either the public firmware checkout or the pinned C file in `FIRMWARE`. The C11 oracle builds just the native branch. The browser test uses Python Playwright and sandboxed Chromium.

```sh
python3 source-oracle.py "$FIRMWARE" /tmp/dnbox-kit-points.txt
node scan.mjs "$NIGHTLY" /tmp/dnbox-kit-points.txt
python3 browser.py "$PRODUCT" /tmp/dnbox-kit-points.txt /tmp/dnbox-kit-browser.json
```
