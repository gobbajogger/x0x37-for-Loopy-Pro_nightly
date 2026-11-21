# Remote owner-page and control review

Exact revision `944e99d87125e60aff9e3020ead7212fb47687d6`. Chromium 151.0.7922.34, ordinary sandbox. I rendered the 24-page owner PDF at 72 dpi. Its SHA-256 is `db826c9cbeb84971f2d030c847043a21749ad4172e30739773494df0c9acca17`. Pages 1–23 are product drawings. Page 24 is an evidence appendix. The owner’s eight written corrections govern deviations including gesture-only editing, the single thin lane, Chicago’s raw list, SuperJ6 and shared phone components.

| Size | Captured states | Mounted control presentations | Center hits in current viewport |
|---|---:|---:|---:|
| 1440x900 | 61 | 2699 | 2171 |
| 844x390 | 15 | 1982 | 686 |
| 390x844 | 3 | 134 | 101 |

All screenshot dimensions and recorded SHA-256 hashes were checked. The retained passes have zero page errors and zero horizontal body overflows. A center hit measures a given viewport and scroll position. It does not establish complete reachability. Repeated mounts are counted again per state. The captures use local Draft states. Stock behavior and cross-surface design acceptance require separate evidence.

| PDF page | Rendered state | Mounted controls | Observed | Difference or dependency |
|---:|---|---:|---|---|
| 1 | notes | 41 | Bass A uses green notes, pitch rows, beat divisions and the thin editable lane. | The marker marks the start of the trace. No selected-part live position is displayed. |
| 2 | drum909-steps | 235 | Both kits show eleven voices, sixteen steps, kit Accent, a step lane and the adjacent Sound panel. The editable values for 909 BD include 13 ms and +0.1 st. | Kit page editing and the stock selected-step/lock data remain distinct. See the drum glyph endpoint comparison. |
| 3 | motion | 62 | The roll shares a workspace with sixteen Motion points. The capture shows an empty MIAMI Wave lane. | The staged sample was not an edit of the PDF’s chosen Cutoff point. Numeric Start/End and arbitrary live lock targets differ. |
| 4 | chicago-CHICAGO | 42 | The Chicago page includes SAW, Glide, Cutoff, Peak, Env, Bite, Gnaw and all four envelope controls without the duplicate raw list. | Firmware Chicago is available in a separately sourced 240-pixel frame. Its tempo and cutoff state differ. The full approved 17:00 glyph identity is unresolved. |
| 5 | miami-SuperJ6 | 37 | Both bass slots expose four actual engine choices. SuperJ6 displays independent layers and PWM, Sub and three LFOs. The captured LFO 2 tempo coordinate is 20.78%. | The PDF draws two engines side by side. The current panel shows one selected engine. The original UI’s literal tempo labels have no verified identity. |
| 6 | levels | 52 | Five part level faders and four Master controls are mounted. The Draft also mounts the twelve More controls. | Per-part live peaks, Mute and Solo are absent. |
| 7 | master | 42 | Master/More presents four macros and twelve additional controls in Draft. | The pictured gain-reduction history and twelve native More controls lack a qualified producer. The native stereo output has separate evidence. |
| 8 | fx | 66 | The eight Reverb/Delay values include 62% feedback, 149 Hz and −1.9 dB. Five Rev/Dly send pairs and Tape Wear are present. | The source-formatted decay differs from the PDF sample of 73. Tape activity has no measured producer. |
| 9 | patterns | 55 | The selected-part view has a 4 × 8 grid. All parts expands to five banks. The startup screen has no selected pad. | Native cue at wrap, content copy/paste/clear and chain bounds are absent. |
| 10 | song-row | 38 | A stored row exposes five pattern selectors, five On switches and one repeat control. Empty, authored and muted states were captured. | Rows require five valid patterns and one repeat count. The drawing also shows four unfilled Choose rows and action buttons below the table. |
| 11 | break-slices | 52 | The BREAK page shows two loop selectors, rate, sixteen slice selectors, All/None and five audition cards. Slices and Notes were captured. | The proposed generator and native sampler transactions remain open. |
| 12 | projects | 32 | Three Projects areas were captured along with original file open, invalid, loaded and kept variants. | Device backup transfer and execution of MIDI export depend on source providers. |
| 13 | review | 43 | Opening Review shows actual local changes. The independent Connect view is separately captured. | The drawing places both in one workspace. The stock keyboard lacks versioned parameter Read latest/Compare/Apply. |
| 14 | notes | 41 | The landscape roll and thin switchable step lane retain the corrected gesture-first layout. | The left-side start marker lacks qualified running musical position. |
| 15 | drum909-steps | 239 | Entry, lower voices and Accent were rendered on both 909 and 808. The adjacent editable Sound remains visible. | The first viewport shows 3 whole voices × 9 whole steps. The owner drawing shows 6 × 16; full content uses inner scrolling. |
| 16 | levels | 52 | Five level faders and four Master macros are mounted in the landscape workspace. | Live per-strip peaks, Mute and Solo are absent, and the full monitor area does not share the first viewport. |
| 17 | motion | 62 | Roll and Motion are side by side. Gate and Release are available under the single thin lane. | The drawing’s grouped timing inspector is replaced by the owner correction. Unrestricted native lock targets remain open. |
| 18 | drum909-sound-0 | 43 | The 909 BD landscape strip includes six labels, physical readouts, twelve adjustment buttons and access to the Original frame. | At this revision the last editable label reads ACCENT. Current stock semantics distinguish 909 Velocity sensitivity from actual 909 Accent gain. |
| 19 | patterns | 55 | All 32 selected-part pads, both scope controls, Review and Song fit in landscape. An additional frame selects Bass A P01, and All parts mounts 160 choices. | Wrap cue, content clipboard and chain bounds are absent. |
| 20 | projects | 31 | The three project cards and the Samples and Manual links appear in landscape. The current desktop capture also exercises the kept original-file path. | Physical backup/restore and provider-executed MIDI export remain open. |
| 21 | notes | 41 | The portrait roll uses the same components and gesture editing as desktop, following the owner correction. | No selected-part live position. |
| 22 | lane-gate | 41 | A separate Gate-lane portrait capture preserves note context and shows individual lane steps. | The owner correction removes the separate Step inspector. A verified musical playhead and additional native locks remain open. |
| 23 | levels | 52 | Five labelled faders and the Master area use the portrait display. | Peaks, Mute and Solo remain unavailable. The remainder of the control area scrolls. |
| 24 | Evidence appendix | — | Describes sources, proposed geometry and interaction boundaries. | No product screen. |

## Capture provenance

The unmodified checked-in capture completed all 61 desktop states. Its later 844×390 Notes sequence timed out during a screenshot and its navigation recovery timed out. Both failures are retained in the original log. The landscape and portrait rows above come from a separate targeted capture using the same inventory function, with each result saved after the screenshot. No failed attempt contributes a passing row.

The PDF, source notes and historical evidence are under `docs/design/` and `evidence/remote-owner-pages-20261121/1f6d7602-review/` in the PR. The six current `page-comparison-*.webp` sheets and the full per-control inventory accompany this report. The original reference page uses vector outlines for many labels; PDF text runs alone do not enumerate its controls.

## Control coverage

| Owner controls | Exercised or observed at this revision | Unobserved or unavailable |
|---|---|---|
| Sequence, Motion and step lanes | Selected the bass part and cycled Velocity, Chance, Pitch, Pan, Gate, Slide, Accent and Release. Both note views and the separate Gate view have retained frames. Motion mounted all sixteen points. | The screen walk did not actuate every point or measure a provider-supplied position. Numeric endpoint editing, a live playhead and arbitrary firmware lock targets require separate evidence. |
| 909 and 808 | Opened all eleven voices per kit on desktop. On landscape, selected each kit’s entry bank, lower bank and Accent lane, plus the 909 kick’s compact and Original views. The separate source-level endpoint comparison drew all 83 occurrences at both catalogue bounds. All 83 formatted values differed; none of the captured glyph paths varied with the value in this revision. | The separate Chromium endpoint scan subsequently edited all 83 drum-control occurrences. The 384 voice-step/Accent cells were not all toggled in this walk. |
| Bass Sound | Selected Chicago, Miami, Synth One and SuperJ6 on both bass parts. The captures preserve labels, displayed values and bounds. | Each factory program, every absent-field combination, every scalar edit, the original engine’s tempo label strings and identity of the approved 17:00 artwork were not observed in this walk. |
| Levels, Pan, Sends, FX and Master | Selected five Mix modes. Captured five level faders, ten sends, eight physical FX readouts, four Master macros and twelve More controls. The Draft Master sample is Drive 41, Comp 75%, Pump 4.0 dB and Filter off. The drawing shows Drive 41, Comp off, Pump 0.0 dB and Filter off. | The capture did not sweep each Mix encoder, attach the stock instrument or observe the five per-part meters, Mute, Solo, gain reduction or actual tape activity. |
| Patterns and Song | Opened selected-part (32 choices) and all-parts (160 choices) views; selected P01 for each part, added a five-part Song row, and toggled its first On switch. Landscape includes the Bass A P01 selection. | Pattern content copy/paste/clear, a stock cue at wrap, chain bounds, arrangement playback and stock persistence do not follow from locally authored references. |
| BREAK, Projects and Review | Changed Slices to Notes; opened and rejected an invalid file; loaded and kept the real Starter Bank fixture; opened the local change review, discard confirmation and Connect dialog. | The walk did not play every audition, issue a stock sampler transaction, generate new slices, transfer a device backup or execute a connected MIDI export. |
| Shared visual identity | The Chicago 240×240 firmware donor shows SAW, Glide 14%, Peak 75%, Env +56%, Bite 83%, Gnaw 0% and the corresponding four envelope values. The donor shows 125 BPM and cutoff 100%; the browser and PDF show 120 BPM and cutoff 25%. | No exact parameter-state match across all three surfaces, owner-confirmed inventory of the 17:00 glyphs, or joint design acceptance. |

Across the three viewports, 4,815 control presentations were mounted, including 4,355 enabled presentations. Of those enabled presentations, 2,755 had their center hit in the captured viewport. Off-viewport controls need scrolling, and disabled controls can still occupy a hittable screen position. The inventory lists each control’s label or value, role, bounds, disabled state and center-hit result. Three native input buttons expose their text through the value field. The measurement did not invoke all 4,355 enabled controls.

A separate 844×390 Chromium check actuated each of the 83 editable drum controls across all 22 voices, representing 63 different source identities. Each formatted readout differed between its two legal raw endpoints. All 83 SVG path geometries stayed fixed. The browser reported no page errors. [Actual browser endpoint values and path hashes](browser-drum-endpoints.json.gz)

An additional desktop interaction selected Bass A P01, added five all-on rows and changed five distinct row/part intersections. The five affected selections read P32, P31, P30, P29 and P28, their switches all read Off, and the five repeat fields read 8, 7, 6, 5 and 4. These three extra states are outside the 79-state capture totals. [Variant control inventory](song-pattern-variants.json.gz) · [Original-size variant images](song-pattern-screenshots.zip)

## Evidence and reproduction

[Original owner PDF](https://github.com/gobbajogger/DnBOX-nightly/blob/944e99d87125e60aff9e3020ead7212fb47687d6/docs/design/OWNER-BASELINE-1836.pdf) · [Eight owner corrections](https://github.com/gobbajogger/DnBOX-nightly/blob/944e99d87125e60aff9e3020ead7212fb47687d6/docs/design/OWNER-BASELINE-1836-NOTES.md) · [Indexed firmware donor](https://github.com/gobbajogger/DnBOX-nightly/blob/944e99d87125e60aff9e3020ead7212fb47687d6/evidence/remote-owner-pages-20261121/1f6d7602-review/fw240-chicago.png)

[Pages 1–4](page-comparison-01.webp) · [Pages 5–8](page-comparison-05.webp) · [Pages 9–12](page-comparison-09.webp) · [Pages 13–16](page-comparison-13.webp) · [Pages 17–20](page-comparison-17.webp) · [Pages 21–23](page-comparison-21.webp)

[Machine page matrix](page-results.json) · [Control-level inventory](control-inventories.json.gz) · [Original-size screenshots](original-size-screenshots.zip) · [Drum endpoint results](drum-curve-endpoints.json)

Run the [original capture](https://github.com/gobbajogger/DnBOX-nightly/blob/944e99d87125e60aff9e3020ead7212fb47687d6/evidence/remote-owner-pages-20261121/1f6d7602-review/capture.py) at this commit with the built product and pinned Chromium. The [original run log](original-capture.log) records the earlier timeout. The final landscape and portrait results used [the targeted capture](page_capture.py) with the same inventory routine. The [endpoint script](curve-matrix.mjs) accepts a checkout and an output filename. The [supplemental browser script](variants.py) regenerates the five-row Song capture with `--only-song` and the drum endpoint scan with `--only-drums`. All browser captures use Chromium’s normal sandbox.
