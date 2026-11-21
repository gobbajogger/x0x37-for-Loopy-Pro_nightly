# Owner controls and captured Remote controls

DnBOX Remote · `944e99d87125e60aff9e3020ead7212fb47687d6` · Chromium 151.0.7922.34, ordinary sandbox. All 23 product pages are covered. Page 24 is the evidence appendix.

357 page-specific control or control-group rows, plus seven shared navigation/transport rows. One reused control can answer more than one owner entry. Repeated controls are grouped by numbered range. These row counts measure the scope of this index.

[Owner PDF](https://github.com/gobbajogger/DnBOX-nightly/blob/944e99d87125e60aff9e3020ead7212fb47687d6/docs/design/OWNER-BASELINE-1836.pdf) · [Eight written owner corrections](https://github.com/gobbajogger/DnBOX-nightly/blob/944e99d87125e60aff9e3020ead7212fb47687d6/docs/design/OWNER-BASELINE-1836-NOTES.md) · [Native-size shots](https://github.com/gobbajogger/DnBOX-nightly/blob/7bc9b1a9840ff47ec49d098ed563a9c6f463d5cd/evidence/remote-qualification-944e99d8/original-size-screenshots.zip) · [Per-control measurements](https://github.com/gobbajogger/DnBOX-nightly/blob/7bc9b1a9840ff47ec49d098ed563a9c6f463d5cd/evidence/remote-qualification-944e99d8/control-inventories.json.gz) · [Song variants](https://github.com/gobbajogger/DnBOX-nightly/blob/7bc9b1a9840ff47ec49d098ed563a9c6f463d5cd/evidence/remote-qualification-944e99d8/song-pattern-variants.json.gz) · [Actual drum endpoints](https://github.com/gobbajogger/DnBOX-nightly/blob/7bc9b1a9840ff47ec49d098ed563a9c6f463d5cd/evidence/remote-qualification-944e99d8/browser-drum-endpoints.json.gz)

## Reading the entries

Each target gives the viewport, saved state and **zero-based** index into its ordered `entries` array. The JSON carries the recorded label, role, current value and field/ID when available. For large banks the Markdown prints sample labels. The index range resolves every cell in the original inventory. States prefixed `variant/` live under `states` in the Song variant receipt. Native select labels can include all available options. The screenshot and state are identified for every page in the JSON.

“Mapped” means an owner control has a corresponding captured control. “Partial” identifies a concrete difference. “Corrected” and “superseded” indicate a written owner revision. “Unmatched” means no corresponding presentation in the cited state. “Unverified” records a dependency or operation the evidence cannot settle. A mounted or enabled control can be offscreen. Interaction text identifies the actions actually observed.

## Written corrections

| # | Owner direction | Pages | 944 finding |
|---:|---|---|---|
| 1 | Replace the proposal JUNO with SuperJ6 | 5 | Both bass parts expose the two wave layers, their separate PWM flags and widths, Sub level, and three LFO mode/rate pairs. The 944 tempo field showed a normalized coordinate. Literal original tempo labels remain open. |
| 2 | Remove Chicago’s duplicate raw field list | 4 | Chicago’s 20 scalar fields are indexed individually. The duplicate list on the right was removed. |
| 3 | Show a discrete wave or blend; morph the glyph | 4, 5, 18 | Chicago shows SAW. The MIAMI carrier shows SQR and XMod SAW. Printed wave names are established. The original 17:00 artwork and value-dependent shape behavior across these fields remain unverified. Separately, all 83 editable drum fields had fixed endpoint SVG paths at 944. |
| 4 | Gesture-only roll without tool modes or a separate inspector; single switchable lane | 1, 3, 14, 17, 21, 22 | The mounted note buttons and lane controls are indexed. Eight desktop modes were visited. This walk supplies no gesture-by-gesture test. |
| 5 | Add a musical playhead and hierarchy for bar/beat divisions | 1, 3, 14, 17, 21, 22 | Beat labels and the trace-start marker were captured. A moving selected-part playhead and exact bar/beat contrast remain unverified. |
| 6 | Use desktop components and type scale on portrait phones | 21–23 | The same named roll, lane and level controls render at 390×844. Matching components is observed; all font/weight/spacing values and design acceptance are not established. |
| 7 | Retain the owner’s 17:00 glyphs and standardize on the R22 radius/type scale | 2, 4–8, 15, 16, 18, 23 | The drawings identify candidate glyphs. The 944 captures preserve visual output. No approved 17:00 asset-key manifest or pixel-matched cross-surface collection establishes full retention. |
| 8 | Port the visual system to product site and firmware together | 1–23 | The receipts here cover the web Remote. The separate 240×240 Chicago firmware frame shows 125 BPM and Cutoff 100%, while the PDF/browser show 120 BPM and 25%. Joint visual acceptance remains open. |

## Shared header and session controls

The Notes capture at each viewport provides the common header. The source also displays project, pattern, tempo and connection as status text. The fixture reads “Example project”, “P01”, “120 BPM” and “Not connected”. Session summaries read “Draft” and show a change count. These captions have no independent control index. The primary tabs and part chooser change presentation with viewport.

| Owner control | Captured target on the Notes state | Interaction |
|---|---|---|
| DnBOX / REMOTE | `1440x900/notes [0]` · DnBOX REMOTE · same indices at the two phone sizes | Product wordmark link. No separate logo activation recorded. |
| Connect | `1440x900/notes [1]` · Connect · same indices at the two phone sizes | Desktop Connection dialog opened. No device was selected. |
| Sequence, Sound, Mix & FX, Patterns / Song, Projects | `1440x900/notes [2–6]` ×5 · Sequence / Projects · same indices at the two phone sizes | All five areas were visited across the capture. Separate activations of every responsive tab are not established. |
| 909, 808, Bass A, Bass B, BREAK; responsive Part picker | `1440x900/notes [7–12]` ×6 · 909 / Part · same indices at the two phone sizes | All five parts were selected in the main desktop walk. Mounted alternatives share the responsive header. |
| Play, Stop, REC | `1440x900/notes [13–15]` ×3 · Play / Stop / REC · same indices at the two phone sizes | Mounted transport controls. A connected playback or recording was not recorded. |
| Undo, Redo | `1440x900/notes [16–17]` ×2 · Undo (disabled) / Redo (disabled) · same indices at the two phone sizes | State-dependent affordances; initially disabled on the unedited Notes fixture. |
| Additional actions | `1440x900/notes [18]` · More actions · same indices at the two phone sizes | Desktop action menu was opened to reach Review. |

## Page 1 · Bass piano roll

`1440x900/notes` · 41 mounted presentations. The marker marks the start of the trace. No selected-part live position is displayed.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| Piano roll, pitch grid and authored notes | **mapped** · `1440x900/notes [19–22]` ×4 · C3, velocity 93, 0 to 8268 samples / C3, velocity 93, 88200 to 88200 samples | Four captured note-event buttons identify pitch, velocity and sample range. Beat divisions and pitch labels are drawn, not independent buttons. Rendered. No individual action recorded. |
| Velocity 93 and note edit | **corrected** · `1440x900/notes [23]` · VELOCITY 93 | Velocity uses the shared thin lane. No permanent selected-note panel. Rendered. No individual action recorded. |
| Per-step velocity or gate cells, steps 1–16 | **corrected** · `1440x900/notes [25–40]` ×16 · Step 1, 1 notes, velocity 93 / Step 9, 0 notes, velocity empty (disabled) / Step 16, 1 notes, velocity 93 | Snapshot lists disabled empty/unset cells as well as enabled cells; a center hit is not a tap. Rendered. No individual action recorded. |
| Select, Draw, Erase and Pan / zoom | **corrected** | Correction 4 replaces the mode buttons with gesture editing. These snapshots did not measure gesture responses. No corresponding action was demonstrated. |
| Time/pitch range − and + | **corrected** | The drawn zoom button pair is replaced by gestures under correction 4. No matching button pair on this screen. No corresponding action was demonstrated. |
| Step 01 pitch C3 and −/+ | **corrected** · `1440x900/notes [19]` · C3, velocity 93, 0 to 8268 samples | The note event carries pitch; its old inspector stepper is absent. Rendered. No individual action recorded. |
| Velocity −/+ controls | **corrected** · `1440x900/notes [25]` · Step 1, 1 notes, velocity 93 | One thin-lane slider for step 1 replaces the separate −/+ buttons. Rendered. No individual action recorded. |
| Note / Tie / Rest | **corrected** · `1440x900/lane-gate [23]` · GATE Unset | Alternate lane on the same component. The captured lane is unset. Lane selector was cycled to the named mode. No per-step value edit is established by this state. |
| Accent OFF | **corrected** · `1440x900/lane-accent [23]` · ACCENT Unset | Alternate lane on the same component. The captured lane is unset. Lane selector was cycled to the named mode. No per-step value edit is established by this state. |
| Slide OFF | **corrected** · `1440x900/lane-slide [23]` · SLIDE Unset | Alternate lane on the same component. The captured lane is unset. Lane selector was cycled to the named mode. No per-step value edit is established by this state. |
| Step details / Details, dedicated Step 01 inspector | **corrected** | Correction 4 substitutes the roll and one thin lane for the separate persistent inspector. No corresponding action was demonstrated. |
| Undo draft | **mapped** · `1440x900/notes [16]` · Undo (disabled) | Header action; it is disabled in this unedited capture. Rendered. No individual action recorded. |
| Review draft | **relocated** · `1440x900/review [19]` · Review | The recorded menu exposes Review. Only desktop captured this open menu. Desktop review dialog was opened. |
| Transport position or playhead | **unverified** | A fixed leading trace marker is visible; the exact capture supplies no selected-part live musical position. No corresponding action was demonstrated. |
| Bar-versus-beat subdivision contrast | **partial** | The drawing and captures show beat divisions. Relative line weights have no pixel-qualified match. Beat 1–4 are static labels in the captured roll. |
| Corrected thin-lane switch · Velocity, Chance, Pitch, Pan | **corrected** · `1440x900/notes [24]` · Velocity Chance Pitch Pan Gate Slide Accent Release Drum accent Patt… | The selector contains all four names and further options. The visible lane label is the companion button. Desktop captures document all four modes. The original desktop walk switched between all four lanes; individual slider action is not established. |

## Page 2 · 909 voice and step grid

`1440x900/drum909-steps` · 235 mounted presentations. Kit page editing and the stock selected-step/lock data remain distinct. See the drum glyph endpoint comparison.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| Bass drum (BD), steps 1–16 | **mapped** · `1440x900/drum909-steps [19–34]` ×16 · BD step 1 velocity 88, toggle local hit / BD step 9 empty, toggle local hit / BD step 16 empty, toggle local hit | The PDF contains this row. Each entry gives its step and local hit state.  Grid mounted. The 16 cells in this row were not individually toggled in the capture. |
| Snare (SD), steps 1–16 | **mapped** · `1440x900/drum909-steps [35–50]` ×16 · SD step 1 empty, toggle local hit / SD step 9 empty, toggle local hit / SD step 16 empty, toggle local hit | The PDF contains this row. Each entry gives its step and local hit state.  Grid mounted. The 16 cells in this row were not individually toggled in the capture. |
| Low tom (LT), steps 1–16 | **mapped** · `1440x900/drum909-steps [51–66]` ×16 · LT step 1 empty, toggle local hit / LT step 9 empty, toggle local hit / LT step 16 empty, toggle local hit | The PDF contains this row. Each entry gives its step and local hit state.  Grid mounted. The 16 cells in this row were not individually toggled in the capture. |
| Mid tom (MT), steps 1–16 | **mapped** · `1440x900/drum909-steps [67–82]` ×16 · MT step 1 empty, toggle local hit / MT step 9 empty, toggle local hit / MT step 16 empty, toggle local hit | The PDF contains this row. Each entry gives its step and local hit state.  Grid mounted. The 16 cells in this row were not individually toggled in the capture. |
| High tom (HT), steps 1–16 | **mapped** · `1440x900/drum909-steps [83–98]` ×16 · HT step 1 empty, toggle local hit / HT step 9 empty, toggle local hit / HT step 16 empty, toggle local hit | The PDF contains this row. Each entry gives its step and local hit state.  Grid mounted. The 16 cells in this row were not individually toggled in the capture. |
| Rim shot (RS), steps 1–16 | **mapped** · `1440x900/drum909-steps [99–114]` ×16 · RS step 1 empty, toggle local hit / RS step 9 empty, toggle local hit / RS step 16 empty, toggle local hit | The PDF contains this row. Each entry gives its step and local hit state.  Grid mounted. The 16 cells in this row were not individually toggled in the capture. |
| Clap (CP), steps 1–16 | **mapped** · `1440x900/drum909-steps [115–130]` ×16 · CP step 1 empty, toggle local hit / CP step 9 empty, toggle local hit / CP step 16 empty, toggle local hit | The PDF contains this row. Each entry gives its step and local hit state.  Grid mounted. The 16 cells in this row were not individually toggled in the capture. |
| Closed hat (CH), steps 1–16 | **mapped** · `1440x900/drum909-steps [131–146]` ×16 · CH step 1 empty, toggle local hit / CH step 9 empty, toggle local hit / CH step 16 empty, toggle local hit | The PDF contains this row. Each entry gives its step and local hit state.  Grid mounted. The 16 cells in this row were not individually toggled in the capture. |
| Open hat (OH), steps 1–16 | **mapped** · `1440x900/drum909-steps [147–162]` ×16 · OH step 1 empty, toggle local hit / OH step 9 empty, toggle local hit / OH step 16 empty, toggle local hit | The PDF contains this row. Each entry gives its step and local hit state.  Grid mounted. The 16 cells in this row were not individually toggled in the capture. |
| Crash (CR), steps 1–16 | **mapped** · `1440x900/drum909-steps [163–178]` ×16 · CR step 1 empty, toggle local hit / CR step 9 empty, toggle local hit / CR step 16 empty, toggle local hit | The PDF contains this row. Each entry gives its step and local hit state.  Grid mounted. The 16 cells in this row were not individually toggled in the capture. |
| Ride (RD), steps 1–16 | **mapped** · `1440x900/drum909-steps [179–194]` ×16 · RD step 1 empty, toggle local hit / RD step 9 empty, toggle local hit / RD step 16 empty, toggle local hit | The PDF contains this row. Each entry gives its step and local hit state.  Grid mounted. The 16 cells in this row were not individually toggled in the capture. |
| Accent steps 1–16 | **mapped** · `1440x900/drum909-steps [195–210]` ×16 · 909 Accent step 1, Not set / 909 Accent step 9, Not set / 909 Accent step 16, Not set | Per-kit 16-step Accent row. Separate from the Sound-panel parameter. Accent navigation visited on landscape; individual Accent toggles were not exhaustively exercised. |
| Selected drum / voice Sound | **mapped** · `1440x900/drum909-steps [228]` · Sound voice BD SD LT MT HT RS CP CH OH CR RD | Selected voice BD in the reference state. All eleven Sound voices per kit were selected in desktop variants. |
| Tune and −/+ adjustment · 34 | **partial** · `1440x900/drum909-steps [229]` · Tune, 13ms, local draft | Adjacent Sound uses one editable control instead of the depicted minus/plus pair. The numeric formatting follows the captured source. Its compact 844px Sound counterpart was taken to both legal endpoints in the separate drum scan. Adjacent-grid steppers were not exercised. |
| Attack and −/+ adjustment · 10% | **partial** · `1440x900/drum909-steps [230]` · Attack, 10%, local draft | Adjacent Sound uses one editable control instead of the depicted minus/plus pair. The numeric formatting follows the captured source. Its compact 844px Sound counterpart was taken to both legal endpoints in the separate drum scan. Adjacent-grid steppers were not exercised. |
| Decay and −/+ adjustment · 1.0 s | **partial** · `1440x900/drum909-steps [231]` · Decay, 1.0s, local draft | Adjacent Sound uses one editable control instead of the depicted minus/plus pair. The numeric formatting follows the captured source. Its compact 844px Sound counterpart was taken to both legal endpoints in the separate drum scan. Adjacent-grid steppers were not exercised. |
| P.DPTH / pitch depth and −/+ adjustment · 0% | **partial** · `1440x900/drum909-steps [232]` · Pitch depth, 0%, local draft | Adjacent Sound uses one editable control instead of the depicted minus/plus pair. The numeric formatting follows the captured source. Its compact 844px Sound counterpart was taken to both legal endpoints in the separate drum scan. Adjacent-grid steppers were not exercised. |
| Chance / 100% | **unmatched** | The displayed drum lane is Velocity. No chosen 100% chance control was identified in this exact grid state. No corresponding action was demonstrated. |
| Step locks | **unmatched** | The adjacent Sound panel is already mounted. No matching footer button in this page capture. No corresponding action was demonstrated. |
| Voice sound | **unmatched** | The adjacent Sound panel is already mounted. No matching footer button in this page capture. No corresponding action was demonstrated. |
| Selected step 01 / P01 context | **partial** · `1440x900/drum909-steps [19]` · BD step 1 velocity 88, toggle local hit | The indexed voice-step button describes the local note/hit state. A native selected-step lock transaction is not captured. Rendered. No individual action recorded. |

## Page 3 · Motion and note timing

`1440x900/motion` · 62 mounted presentations. The staged sample was not an edit of the PDF’s chosen Cutoff point. Numeric Start/End and arbitrary live lock targets differ.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| Piano roll / selected Step 01 | **mapped** · `1440x900/motion [19–22]` ×4 · C3, velocity 93, 0 to 8268 samples / C3, velocity 93, 88200 to 88200 samples | The old selected-note inspector is superseded by correction 4. Starting sample ranges are accessible on the notes. Rendered. No individual action recorded. |
| Start 0.0000s −/+ | **corrected** | The captured note exposes sample boundaries; no matching selected-note numeric editor or −/+ pair is mounted. No corresponding action was demonstrated. |
| End 0.1875s −/+ | **corrected** | The captured note exposes sample boundaries; no matching selected-note numeric editor or −/+ pair is mounted. No corresponding action was demonstrated. |
| Release endpoint 1–15 −/+ | **corrected** · `1440x900/lane-release [23]` · RELEASE Unset | Desktop Release lane is unset in the captured state; it is a separate surface from the drawn Inspector. Release mode was selected on the desktop roll; no individual endpoint edit established. |
| Locks / Motion / sixteen step points | **partial** · `1440x900/motion [41–56]` ×16 · Step 1, unset / Step 9, unset / Step 16, unset | Captured lane is MIAMI Wave, with 16 unset points. The drawing specifies a Chicago Cutoff override. Motion view opened; the pictured Cutoff override was not authored in this walk. |
| Chance / condition 100% −/+ | **partial** · `1440x900/lane-chance [23]` · CHANCE 100% | Desktop roll has a Chance lane; the drawn selected-note condition editor is not captured. Chance lane was selected; no pictured condition was applied. |
| Add lock | **unmatched** | No matching operation demonstrated in the 944 Motion capture; the visible lane was MIAMI Wave. No corresponding action was demonstrated. |
| Choose lane | **unmatched** | No matching operation demonstrated in the 944 Motion capture; the visible lane was MIAMI Wave. No corresponding action was demonstrated. |
| Cutoff / P01 | **unmatched** | No matching operation demonstrated in the 944 Motion capture; the visible lane was MIAMI Wave. No corresponding action was demonstrated. |
| Selected override 72 | **partial** · `1440x900/motion [58]` · Value | Value editor is mounted for the captured lane, with no observation of the selected Cutoff value 72. Rendered. No individual action recorded. |
| Clear override | **partial** · `1440x900/motion [59]` · Clear point | Clear point applies to the captured Motion lane, which is unset. Clearing the owner’s named override was not observed. Rendered. No individual action recorded. |
| Review draft | **relocated** · `1440x900/review [19]` · Review | Recorded via the shared menu instead of the drawn local footer. Desktop Review was opened. |
| Reference playhead and bar-versus-beat grid hierarchy | **unverified** | Beat 1–4 appear in the recorded roll. A trace-start marker does not establish a moving playhead. The relative bar/beat line weights have no pixel-qualified match. No corresponding action was demonstrated. |

## Page 4 · Chicago Sound

`1440x900/chicago-CHICAGO` · 42 mounted presentations. Firmware Chicago is available in a separately sourced 240-pixel frame. Its tempo and cutoff state differ. The full approved 17:00 glyph identity is unresolved.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| Wave · 0% | **corrected** · `1440x900/chicago-CHICAGO [22]` · WAVE | Owner raw-table duplicate is removed by correction 2. SAW replaces the drawn 0% under correction 3. Chicago view selected. This field was mounted; the capture did not sweep each scalar. |
| Glide · 14% | **mapped** · `1440x900/chicago-CHICAGO [23]` · BASS A / CHICAGO / OSCILLATOR · GLIDE, 14 %, local draft | Owner raw-table duplicate is removed by correction 2.  Chicago view selected. This field was mounted; the capture did not sweep each scalar. |
| Cutoff · 25% | **mapped** · `1440x900/chicago-CHICAGO [24]` · BASS A / CHICAGO / FILTER 1 · CUTOFF, 25 %, local draft | Owner raw-table duplicate is removed by correction 2.  Chicago view selected. This field was mounted; the capture did not sweep each scalar. |
| Peak · 75% | **mapped** · `1440x900/chicago-CHICAGO [25]` · BASS A / CHICAGO / FILTER 1 · PEAK, 75 %, local draft | Owner raw-table duplicate is removed by correction 2.  Chicago view selected. This field was mounted; the capture did not sweep each scalar. |
| EnvAmt / Env · +56% | **mapped** · `1440x900/chicago-CHICAGO [26]` · BASS A / CHICAGO / FILTER 1 · ENV, +56 %, local draft | Owner raw-table duplicate is removed by correction 2.  Chicago view selected. This field was mounted; the capture did not sweep each scalar. |
| Bite · 83% | **mapped** · `1440x900/chicago-CHICAGO [27]` · BASS A / CHICAGO / FILTER 2 · BITE, 83 %, local draft | Owner raw-table duplicate is removed by correction 2.  Chicago view selected. This field was mounted; the capture did not sweep each scalar. |
| Gnaw · 0% | **mapped** · `1440x900/chicago-CHICAGO [28]` · BASS A / CHICAGO / FILTER 2 · GNAW, 0 %, local draft | Owner raw-table duplicate is removed by correction 2.  Chicago view selected. This field was mounted; the capture did not sweep each scalar. |
| Attack · 27% | **mapped** · `1440x900/chicago-CHICAGO [29]` · ATTACK 27% | Owner raw-table duplicate is removed by correction 2.  Chicago view selected. This field was mounted; the capture did not sweep each scalar. |
| Decay · 40% | **mapped** · `1440x900/chicago-CHICAGO [30]` · DECAY 40% | Owner raw-table duplicate is removed by correction 2.  Chicago view selected. This field was mounted; the capture did not sweep each scalar. |
| Sust / Sustain · 57% | **mapped** · `1440x900/chicago-CHICAGO [31]` · SUSTAIN 57% | Owner raw-table duplicate is removed by correction 2.  Chicago view selected. This field was mounted; the capture did not sweep each scalar. |
| Rel / Release · 17% | **mapped** · `1440x900/chicago-CHICAGO [32]` · RELEASE 17% | Owner raw-table duplicate is removed by correction 2.  Chicago view selected. This field was mounted; the capture did not sweep each scalar. |
| AmpMod / Env-Gate | **mapped** · `1440x900/chicago-CHICAGO [33]` · BASS A / CHICAGO / AMPLIFIER · ENV/GATE, GATE, local draft | Owner raw-table duplicate is removed by correction 2.  Chicago view selected. This field was mounted; the capture did not sweep each scalar. |
| Level | **mapped** · `1440x900/chicago-CHICAGO [34]` · BASS A / CHICAGO / AMPLIFIER · LEVEL, 80 %, local draft | Owner raw-table duplicate is removed by correction 2.  Chicago view selected. This field was mounted; the capture did not sweep each scalar. |
| ArpOn | **mapped** · `1440x900/chicago-CHICAGO [35]` · BASS A / CHICAGO / ARPEGGIATOR · ON, ON, local draft | Owner raw-table duplicate is removed by correction 2.  Chicago view selected. This field was mounted; the capture did not sweep each scalar. |
| ArpRng | **mapped** · `1440x900/chicago-CHICAGO [36]` · BASS A / CHICAGO / ARPEGGIATOR · RANGE, 2 OCT, local draft | Owner raw-table duplicate is removed by correction 2.  Chicago view selected. This field was mounted; the capture did not sweep each scalar. |
| ArpMod | **mapped** · `1440x900/chicago-CHICAGO [37]` · BASS A / CHICAGO / ARPEGGIATOR · MODE, UP, local draft | Owner raw-table duplicate is removed by correction 2.  Chicago view selected. This field was mounted; the capture did not sweep each scalar. |
| ArpSpd | **mapped** · `1440x900/chicago-CHICAGO [38]` · BASS A / CHICAGO / ARPEGGIATOR · SPEED, 1/16, local draft | Owner raw-table duplicate is removed by correction 2.  Chicago view selected. This field was mounted; the capture did not sweep each scalar. |
| FxType | **mapped** · `1440x900/chicago-CHICAGO [39]` · BASS A / CHICAGO / EFFECT · TYPE, OFF, local draft | Owner raw-table duplicate is removed by correction 2.  Chicago view selected. This field was mounted; the capture did not sweep each scalar. |
| FxEd1 | **mapped** · `1440x900/chicago-CHICAGO [40]` · BASS A / CHICAGO / EFFECT · EDIT 1, 43 %, local draft | Owner raw-table duplicate is removed by correction 2.  Chicago view selected. This field was mounted; the capture did not sweep each scalar. |
| FxEd2 | **mapped** · `1440x900/chicago-CHICAGO [41]` · BASS A / CHICAGO / EFFECT · EDIT 2, 0 %, local draft | Owner raw-table duplicate is removed by correction 2.  Chicago view selected. This field was mounted; the capture did not sweep each scalar. |
| Open original | **unmatched** | No matching Chicago file button in this selected Sound state. The original-file lifecycle exercised elsewhere used a different engine. No corresponding action was demonstrated. |
| Save a copy | **unmatched** | No matching Chicago file button in this selected Sound state. The original-file lifecycle exercised elsewhere used a different engine. No corresponding action was demonstrated. |
| Engine / page | **partial** · `1440x900/chicago-CHICAGO [21]` · Engine CHICAGO MIAMI Synth One SuperJ6 | One engine selector; no separate paged footer button. Engine choices were selected on both bass slots. |

## Page 5 · MIAMI and corrected SuperJ6 Sound

`1440x900/miami-SuperJ6` · 37 mounted presentations. The PDF draws two engines side by side. The current panel shows one selected engine. The original UI’s literal tempo labels have no verified identity.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| MIAMI · Carrier Wave · SQR | **mapped** · `1440x900/chicago-MIAMI [22]` · BASS A / MIAMI / CARRIER · WAVE, SQR, local draft | Numbered glyph group in the PDF. Captured on Bass A; the Bass B version also exists. MIAMI selected on both bass owners; no per-field sweep in this walk. |
| MIAMI · Carrier Level · 91% | **mapped** · `1440x900/chicago-MIAMI [23]` · BASS A / MIAMI / CARRIER · LEVEL, 91 %, local draft | Numbered glyph group in the PDF. Captured on Bass A; the Bass B version also exists. MIAMI selected on both bass owners; no per-field sweep in this walk. |
| MIAMI · Carrier Sub · 100% | **mapped** · `1440x900/chicago-MIAMI [24]` · BASS A / MIAMI / CARRIER · SUB, 100 %, local draft | Numbered glyph group in the PDF. Captured on Bass A; the Bass B version also exists. MIAMI selected on both bass owners; no per-field sweep in this walk. |
| MIAMI · Carrier Pitch · 0 st | **mapped** · `1440x900/chicago-MIAMI [25]` · BASS A / MIAMI / CARRIER · PITCH, 0 st, local draft | Numbered glyph group in the PDF. Captured on Bass A; the Bass B version also exists. MIAMI selected on both bass owners; no per-field sweep in this walk. |
| MIAMI · XMod Wave · SAW | **mapped** · `1440x900/chicago-MIAMI [26]` · BASS A / MIAMI / XMOD · WAVE, SAW, local draft | Numbered glyph group in the PDF. Captured on Bass A; the Bass B version also exists. MIAMI selected on both bass owners; no per-field sweep in this walk. |
| MIAMI · XMod Level · 77% | **mapped** · `1440x900/chicago-MIAMI [27]` · BASS A / MIAMI / XMOD · LEVEL, 77 %, local draft | Numbered glyph group in the PDF. Captured on Bass A; the Bass B version also exists. MIAMI selected on both bass owners; no per-field sweep in this walk. |
| MIAMI · XMod Tune · +0.91 | **mapped** · `1440x900/chicago-MIAMI [28]` · BASS A / MIAMI / XMOD · TUNE, +0.91, local draft | Numbered glyph group in the PDF. Captured on Bass A; the Bass B version also exists. MIAMI selected on both bass owners; no per-field sweep in this walk. |
| MIAMI · XMod Depth · 55% | **mapped** · `1440x900/chicago-MIAMI [29]` · BASS A / MIAMI / XMOD · DEPTH, 55 %, local draft | Numbered glyph group in the PDF. Captured on Bass A; the Bass B version also exists. MIAMI selected on both bass owners; no per-field sweep in this walk. |
| MIAMI · Filter Cutoff · 60% | **mapped** · `1440x900/chicago-MIAMI [30]` · BASS A / MIAMI / FILTER · CUTOFF, 60 %, local draft | Numbered glyph group in the PDF. Captured on Bass A; the Bass B version also exists. MIAMI selected on both bass owners; no per-field sweep in this walk. |
| MIAMI · Filter Crush · 17% | **mapped** · `1440x900/chicago-MIAMI [31]` · BASS A / MIAMI / FILTER · CRUSH, 17 %, local draft | Numbered glyph group in the PDF. Captured on Bass A; the Bass B version also exists. MIAMI selected on both bass owners; no per-field sweep in this walk. |
| MIAMI · Filter Wobble · 65% | **mapped** · `1440x900/chicago-MIAMI [32]` · BASS A / MIAMI / FILTER · WOBBLE, 65 %, local draft | Numbered glyph group in the PDF. Captured on Bass A; the Bass B version also exists. MIAMI selected on both bass owners; no per-field sweep in this walk. |
| MIAMI · Wobble Shape · SQR | **mapped** · `1440x900/chicago-MIAMI [33]` · BASS A / MIAMI / WOBBLE · SHAPE, SQR, local draft | Numbered glyph group in the PDF. Captured on Bass A; the Bass B version also exists. MIAMI selected on both bass owners; no per-field sweep in this walk. |
| MIAMI · Wobble Rate · 1/16 | **mapped** · `1440x900/chicago-MIAMI [34]` · BASS A / MIAMI / WOBBLE · RATE, 1/16, local draft | Numbered glyph group in the PDF. Captured on Bass A; the Bass B version also exists. MIAMI selected on both bass owners; no per-field sweep in this walk. |
| Proposal JUNO · Oscillator · Wave, Sub, P Width, Level | **superseded** | Correction 1 calls for the real SuperJ6. No one-to-one identification of these older JUNO controls with the replacement is justified. No corresponding action was demonstrated. |
| Proposal JUNO · Filter · Cutoff, Res, Env, HPF | **superseded** | Correction 1 calls for the real SuperJ6. No one-to-one identification of these older JUNO controls with the replacement is justified. No corresponding action was demonstrated. |
| Proposal JUNO · Envelope · Attack, Decay, Sustain, Release | **superseded** | Correction 1 calls for the real SuperJ6. No one-to-one identification of these older JUNO controls with the replacement is justified. No corresponding action was demonstrated. |
| Proposal JUNO · LFO/Chorus · LFO Rate, PWM Depth, CHO Rate, Chorus | **superseded** | Correction 1 calls for the real SuperJ6. No one-to-one identification of these older JUNO controls with the replacement is justified. No corresponding action was demonstrated. |
| Corrected SuperJ6 · Layer 1 Wave | **corrected** · `1440x900/miami-SuperJ6 [22]` · Layer 1 Wave | Original field identity, separate for each bass part. SuperJ6 was selected on both bass parts; these scalar values were not individually edited in the recorded page walk. |
| Corrected SuperJ6 · Layer 1 PWM | **corrected** · `1440x900/miami-SuperJ6 [23]` · Layer 1 PWM | Original field identity, separate for each bass part. SuperJ6 was selected on both bass parts; these scalar values were not individually edited in the recorded page walk. |
| Corrected SuperJ6 · Layer 1 Width | **corrected** · `1440x900/miami-SuperJ6 [24]` · Layer 1 Width | Original field identity, separate for each bass part. SuperJ6 was selected on both bass parts; these scalar values were not individually edited in the recorded page walk. |
| Corrected SuperJ6 · Layer 2 Wave | **corrected** · `1440x900/miami-SuperJ6 [25]` · Layer 2 Wave | Original field identity, separate for each bass part. SuperJ6 was selected on both bass parts; these scalar values were not individually edited in the recorded page walk. |
| Corrected SuperJ6 · Layer 2 PWM | **corrected** · `1440x900/miami-SuperJ6 [26]` · Layer 2 PWM | Original field identity, separate for each bass part. SuperJ6 was selected on both bass parts; these scalar values were not individually edited in the recorded page walk. |
| Corrected SuperJ6 · Layer 2 Width | **corrected** · `1440x900/miami-SuperJ6 [27]` · Layer 2 Width | Original field identity, separate for each bass part. SuperJ6 was selected on both bass parts; these scalar values were not individually edited in the recorded page walk. |
| Corrected SuperJ6 · Sub Level | **corrected** · `1440x900/miami-SuperJ6 [28]` · Sub Level | Original field identity, separate for each bass part. SuperJ6 was selected on both bass parts; these scalar values were not individually edited in the recorded page walk. |
| Corrected SuperJ6 · LFO 1 Mode | **corrected** · `1440x900/miami-SuperJ6 [29]` · LFO 1 Mode | Two layers, continuous SUB and independent mode/rate pairs. The 944 tempo-mode field shows its normalized position; literal division labels remain unverified. SuperJ6 was selected on both bass parts; these scalar values were not individually edited in the recorded page walk. |
| Corrected SuperJ6 · LFO 1 Rate | **corrected** · `1440x900/miami-SuperJ6 [30]` · LFO 1 Rate | Two layers, continuous SUB and independent mode/rate pairs. The 944 tempo-mode field shows its normalized position; literal division labels remain unverified. SuperJ6 was selected on both bass parts; these scalar values were not individually edited in the recorded page walk. |
| Corrected SuperJ6 · LFO 2 Mode | **corrected** · `1440x900/miami-SuperJ6 [31]` · LFO 2 Mode | Two layers, continuous SUB and independent mode/rate pairs. The 944 tempo-mode field shows its normalized position; literal division labels remain unverified. SuperJ6 was selected on both bass parts; these scalar values were not individually edited in the recorded page walk. |
| Corrected SuperJ6 · LFO 2 Rate | **corrected** · `1440x900/miami-SuperJ6 [32]` · LFO 2 Rate | Two layers, continuous SUB and independent mode/rate pairs. The 944 tempo-mode field shows its normalized position; literal division labels remain unverified. SuperJ6 was selected on both bass parts; these scalar values were not individually edited in the recorded page walk. |
| Corrected SuperJ6 · LFO 3 Mode | **corrected** · `1440x900/miami-SuperJ6 [33]` · LFO 3 Mode | Two layers, continuous SUB and independent mode/rate pairs. The 944 tempo-mode field shows its normalized position; literal division labels remain unverified. SuperJ6 was selected on both bass parts; these scalar values were not individually edited in the recorded page walk. |
| Corrected SuperJ6 · LFO 3 Rate | **corrected** · `1440x900/miami-SuperJ6 [34]` · LFO 3 Rate | Two layers, continuous SUB and independent mode/rate pairs. The 944 tempo-mode field shows its normalized position; literal division labels remain unverified. SuperJ6 was selected on both bass parts; these scalar values were not individually edited in the recorded page walk. |
| JUNO replacement · Open original | **partial** · `1440x900/miami-SuperJ6 [35]` · Open original | SuperJ6 source-file action; no equivalent original MIAMI file action captured. Rendered. No individual action recorded. |
| MIAMI · Open original | **unmatched** | No matching button in the captured MIAMI Sound view. No corresponding action was demonstrated. |
| JUNO replacement · Save a copy | **partial** · `1440x900/miami-SuperJ6 [36]` · Choose the matching original bank file to save a copy | SuperJ6 source-file action; no equivalent original MIAMI file action captured. Rendered. No individual action recorded. |
| MIAMI · Save a copy | **unmatched** | No matching button in the captured MIAMI Sound view. No corresponding action was demonstrated. |
| Parameter pages, shared by both depicted engines | **partial** · `1440x900/miami-SuperJ6 [21]` · Engine CHICAGO MIAMI Synth One SuperJ6 | One selected engine at a time; the drawing shows MIAMI and JUNO side-by-side. All four engines selected on each of two bass parts. |

## Page 6 · Mixer levels

`1440x900/levels` · 52 mounted presentations. Per-part live peaks, Mute and Solo are absent.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| 909 · channel level/fader | **mapped** · `1440x900/levels [27]` · 909 | The channel input records its current draft value. A live meter or peak is a distinct observation. Rendered. No individual action recorded. |
| 909 · Part controls | **mapped** · `1440x900/levels [26]` · Open 909 sound controls | Part-specific Sound navigation. Navigation button mounted. This capture does not establish an individual press here. |
| 808 · channel level/fader | **mapped** · `1440x900/levels [29]` · 808 | The channel input records its current draft value. A live meter or peak is a distinct observation. Rendered. No individual action recorded. |
| 808 · Part controls | **mapped** · `1440x900/levels [28]` · Open 808 sound controls | Part-specific Sound navigation. Navigation button mounted. This capture does not establish an individual press here. |
| Bass A · channel level/fader | **mapped** · `1440x900/levels [31]` · BASS A | The channel input records its current draft value. A live meter or peak is a distinct observation. Rendered. No individual action recorded. |
| Bass A · Part controls | **mapped** · `1440x900/levels [30]` · Open BASS A sound controls | Part-specific Sound navigation. Navigation button mounted. This capture does not establish an individual press here. |
| Bass B · channel level/fader | **mapped** · `1440x900/levels [33]` · BASS B | The channel input records its current draft value. A live meter or peak is a distinct observation. Rendered. No individual action recorded. |
| Bass B · Part controls | **mapped** · `1440x900/levels [32]` · Open BASS B sound controls | Part-specific Sound navigation. Navigation button mounted. This capture does not establish an individual press here. |
| BREAK · channel level/fader | **mapped** · `1440x900/levels [35]` · BREAK | The channel input records its current draft value. A live meter or peak is a distinct observation. Rendered. No individual action recorded. |
| BREAK · Part controls | **mapped** · `1440x900/levels [34]` · Open BREAK sound controls | Part-specific Sound navigation. Navigation button mounted. This capture does not establish an individual press here. |
| Master macro · Drive · 41 | **mapped** · `1440x900/levels [36]` · Master Drive 41 | Captured control identifies the macro and its draft value. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Master macro · Comp · OFF | **partial** · `1440x900/levels [37]` · Master COMP 75% | Current draft readout is captured in the field label. The owner illustration marks Comp OFF and Pump 0.0dB. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Master macro · Pump · 0.0 dB | **partial** · `1440x900/levels [38]` · Master PUMP 4.0dB | Current draft readout is captured in the field label. The owner illustration marks Comp OFF and Pump 0.0dB. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Master macro · Filter · OFF | **mapped** · `1440x900/levels [39]` · Master FILTER OFF | Captured control identifies the macro and its draft value. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Peak / signal level for the five parts | **unverified** | The level controls expose draft gain. This disconnected capture supplies no live level/peak history for the five channels. No corresponding action was demonstrated. |
| Mute / Solo for each of five parts | **unmatched** | No matching Mute or Solo control appears among the captured Levels entries. No corresponding action was demonstrated. |
| Master more | **partial** · `1440x900/levels [25]` · Master / More | The More control group is behind the combined Master / More tab. The desktop Master / More view was visited. |
| Peak history and Wave / GR | **unverified** | No live peak-history/waveform/gain-reduction trace established by the captured draft. No corresponding action was demonstrated. |

## Page 7 · Master and More

`1440x900/master` · 42 mounted presentations. The pictured gain-reduction history and twelve native More controls lack a qualified producer. The native stereo output has separate evidence.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| Master macro · Drive · 41 | **mapped** · `1440x900/master [26]` · Master Drive 41 | Field label records this draft’s value. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Master macro · Comp · OFF | **partial** · `1440x900/master [27]` · Master COMP 75% | Field label records this draft’s value. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Master macro · Pump · 0.0 dB | **partial** · `1440x900/master [28]` · Master PUMP 4.0dB | Field label records this draft’s value. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Master macro · Filter · OFF | **mapped** · `1440x900/master [29]` · Master FILTER OFF | Field label records this draft’s value. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| More · Threshold | **mapped** · `1440x900/master [30]` · Master Threshold -24dB | Outlined original abbreviation is expanded. Snapshot associates the numeric/enum readout with the original master field. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| More · Ratio | **mapped** · `1440x900/master [31]` · Master Ratio 4:1 | Outlined original abbreviation is expanded. Snapshot associates the numeric/enum readout with the original master field. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| More · Attack | **mapped** · `1440x900/master [32]` · Master Attack 10ms | Outlined original abbreviation is expanded. Snapshot associates the numeric/enum readout with the original master field. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| More · Release | **mapped** · `1440x900/master [33]` · Master Release 99ms | Outlined original abbreviation is expanded. Snapshot associates the numeric/enum readout with the original master field. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| More · Makeup | **mapped** · `1440x900/master [34]` · Master Makeup 16.1dB | Outlined original abbreviation is expanded. Snapshot associates the numeric/enum readout with the original master field. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| More · Mix | **mapped** · `1440x900/master [35]` · Master Mix 100% | Outlined original abbreviation is expanded. Snapshot associates the numeric/enum readout with the original master field. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| More · Pump By | **mapped** · `1440x900/master [36]` · Master Pump source 909 | Outlined original abbreviation is expanded. Snapshot associates the numeric/enum readout with the original master field. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| More · Resonance | **mapped** · `1440x900/master [37]` · Master Resonance 20 | Outlined original abbreviation is expanded. Snapshot associates the numeric/enum readout with the original master field. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| More · Limit | **mapped** · `1440x900/master [38]` · Master Limiter ON | Outlined original abbreviation is expanded. Snapshot associates the numeric/enum readout with the original master field. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| More · Distortion | **mapped** · `1440x900/master [39]` · Master Distortion Off | Outlined original abbreviation is expanded. Snapshot associates the numeric/enum readout with the original master field. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| More · Glue | **mapped** · `1440x900/master [40]` · Master Glue 0% | Outlined original abbreviation is expanded. Snapshot associates the numeric/enum readout with the original master field. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| More · Volume | **mapped** · `1440x900/master [41]` · Master Volume -9.2dB | Outlined original abbreviation is expanded. Snapshot associates the numeric/enum readout with the original master field. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Master / More section | **partial** · `1440x900/master [25]` · Master / More | The source draws a separate More group; the tab exposes both macro and detailed controls. Master / More was opened. |
| Peak history, waveform, gain reduction | **unverified** | No recorded live meter or history from the original device in this browser fixture. No corresponding action was demonstrated. |

## Page 8 · Reverb and Delay

`1440x900/fx` · 66 mounted presentations. The source-formatted decay differs from the PDF sample of 73. Tape activity has no measured producer.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| Reverb Decay · 73 | **partial** · `1440x900/fx [26]` · Reverb DECAY 62% | The drawing prints Reverb Decay as 73; the captured field reads 62%. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Reverb Tone · 45% | **mapped** · `1440x900/fx [27]` · Reverb TONE 45% | Snapshot provides this draft field’s current display. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Reverb Low Cut · 149 Hz | **mapped** · `1440x900/fx [28]` · Reverb REV LOW CUT 149Hz | Snapshot provides this draft field’s current display. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Reverb Return · −1.9 dB | **mapped** · `1440x900/fx [29]` · Reverb REV RETURN -1.9dB | Snapshot provides this draft field’s current display. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Delay Time · 1/8. | **mapped** · `1440x900/fx [30]` · Delay TIME 1/8. | Snapshot provides this draft field’s current display. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Delay Feedback · 35% | **mapped** · `1440x900/fx [31]` · Delay FEEDBACK 35% | Snapshot provides this draft field’s current display. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Delay Tone · 40% | **mapped** · `1440x900/fx [32]` · Delay TONE 40% | Snapshot provides this draft field’s current display. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Delay Return · −1.9 dB | **mapped** · `1440x900/fx [33]` · Delay DLY RETURN -1.9dB | Snapshot provides this draft field’s current display. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| 909 · Reverb send | **mapped** · `1440x900/fx [35]` · REV | The PDF abbreviates the two send amounts REV and DLY. Rendered. No individual action recorded. |
| 909 · Delay send | **mapped** · `1440x900/fx [36]` · DLY | The PDF abbreviates the two send amounts REV and DLY. Rendered. No individual action recorded. |
| 808 · Reverb send | **mapped** · `1440x900/fx [38]` · REV | The PDF abbreviates the two send amounts REV and DLY. Rendered. No individual action recorded. |
| 808 · Delay send | **mapped** · `1440x900/fx [39]` · DLY | The PDF abbreviates the two send amounts REV and DLY. Rendered. No individual action recorded. |
| Bass A · Reverb send | **mapped** · `1440x900/fx [41]` · REV | The PDF abbreviates the two send amounts REV and DLY. Rendered. No individual action recorded. |
| Bass A · Delay send | **mapped** · `1440x900/fx [42]` · DLY | The PDF abbreviates the two send amounts REV and DLY. Rendered. No individual action recorded. |
| Bass B · Reverb send | **mapped** · `1440x900/fx [44]` · REV | The PDF abbreviates the two send amounts REV and DLY. Rendered. No individual action recorded. |
| Bass B · Delay send | **mapped** · `1440x900/fx [45]` · DLY | The PDF abbreviates the two send amounts REV and DLY. Rendered. No individual action recorded. |
| BREAK · Reverb send | **mapped** · `1440x900/fx [47]` · REV | The PDF abbreviates the two send amounts REV and DLY. Rendered. No individual action recorded. |
| BREAK · Delay send | **mapped** · `1440x900/fx [48]` · DLY | The PDF abbreviates the two send amounts REV and DLY. Rendered. No individual action recorded. |
| Tape | **partial** · `1440x900/fx [49]` · Tape Wear 50% | Tape Wear is adjustable; tape activity was not observed. Rendered. No individual action recorded. |
| Delay type | **unmatched** | No independently labelled delay-type control in the captured FX entry list. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. No corresponding action was demonstrated. |

## Page 9 · Patterns

`1440x900/patterns` · 55 mounted presentations. Native cue at wrap, content copy/paste/clear and chain bounds are absent.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| Selected part / All parts | **additional** · `1440x900/patterns [19–20]` ×2 · Selected part / All parts | The scoped and all-parts views were captured. The selected part was Bass A. |
| Selected-part pattern pads P01–P32 | **mapped** · `1440x900/patterns [22–53]` ×32 · Bass A P1, not loaded / Bass A P17, not loaded / Bass A P32, not loaded · `1440x900/variant/p9-selected-bass-a-p01 [22]` · Bass A P1, not loaded | One indexed bank of 32. The owner’s drawn pattern identities/content are illustrative; native fixture distinguishes loaded and unavailable pads. Bass A P01 was selected. Pads P02–P32 were not individually selected. |
| All parts · five banks × P01–P32 | **additional** · `1440x900/patterns-all [19–178]` ×160 · 909 P1, not loaded / Bass A P17, not loaded / BREAK P32, not loaded | All five banks are addressed in capture order using the zero-based indices below; local pattern numbers restart at 1 per part. All-parts scope opened, with 160 indexed pad presentations. No exhaustive pad actuation. |
| Cue at 909 wrap | **unmatched** | No corresponding selected-part content/chain command in this state. Captured scope switches and pad selection do not establish this operation. No corresponding action was demonstrated. |
| Copy selected part | **unmatched** | No corresponding selected-part content/chain command in this state. Captured scope switches and pad selection do not establish this operation. No corresponding action was demonstrated. |
| Paste into selected part | **unmatched** | No corresponding selected-part content/chain command in this state. Captured scope switches and pad selection do not establish this operation. No corresponding action was demonstrated. |
| Chain bounds | **unmatched** | No corresponding selected-part content/chain command in this state. Captured scope switches and pad selection do not establish this operation. No corresponding action was demonstrated. |
| Clear selected part | **unmatched** | No corresponding selected-part content/chain command in this state. Captured scope switches and pad selection do not establish this operation. No corresponding action was demonstrated. |
| Open Song arrangement | **mapped** · `1440x900/patterns [54]` · Song arrangement | The arrangement view and its first added row are present in the capture. |
| Review draft | **additional** · `1440x900/patterns [21]` · Review draft | This button was mounted. Desktop review was opened elsewhere in the walk. |

## Page 10 · Song arrangement

`1440x900/song-row` · 38 mounted presentations. Rows require five valid patterns and one repeat count. The drawing also shows four unfilled Choose rows and action buttons below the table.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| Add from launch selection | **mapped** · `1440x900/song-row [19]` · Add launch selection | Five rows were added in the supplemental walk. |
| Move earlier | **mapped** · `1440x900/song-row [20]` · Move row up (disabled) | Control mounted; no individual activation of this button is documented. |
| Move later | **mapped** · `1440x900/song-row [21]` · Move row down (disabled) | Control mounted; no individual activation of this button is documented. |
| Remove | **mapped** · `1440x900/song-row [22]` · Remove selected row | Control mounted; no individual activation of this button is documented. |
| Review draft | **mapped** · `1440x900/song-row [23]` · Review draft | Control mounted; no individual activation of this button is documented. |
| Undo | **additional** · `1440x900/song-row [24]` · Undo | Control mounted; no individual activation of this button is documented. |
| Redo | **additional** · `1440x900/song-row [25]` · Redo (disabled) | Control mounted; no individual activation of this button is documented. |
| Arrangement row 1 / selection | **mapped** · `1440x900/song-row [26]` · Select song row 1 · `1440x900/variant/p10-five-rows-edited [26,38,50,62,74]` ×5 · Select song row 1 / Select song row 5 | A selected arrangement row was captured. |
| 909 · pattern choice / rows 1–5 | **partial** · `1440x900/song-row [27]` · Song row 1 909 pattern · `1440x900/variant/p10-five-rows-edited [27,39,51,63,75]` ×5 · Song row 1 909 pattern / Song row 5 909 pattern | Pointer is the row-1 selector. In the supplemental five-row matrix the five parts each have a pattern select per row; see the observed values below. The 909 diagonal entry in row 1 was changed to P32. Other per-part selectors in the 25-cell matrix were mounted. |
| 909 · enabled / rows 1–5 | **partial** · `1440x900/song-row [28]` · Song row 1 909 on · `1440x900/variant/p10-five-rows-edited [28,40,52,64,76]` ×5 · Song row 1 909 on / Song row 5 909 on | The base pointer is the row-1 on/off control. Supplemental matrix confirms five rows. The 909 diagonal enable switch on row 1 was switched off; the other four remained on. |
| 808 · pattern choice / rows 1–5 | **partial** · `1440x900/song-row [29]` · Song row 1 808 pattern · `1440x900/variant/p10-five-rows-edited [29,41,53,65,77]` ×5 · Song row 1 808 pattern / Song row 5 808 pattern | Pointer is the row-1 selector. In the supplemental five-row matrix the five parts each have a pattern select per row; see the observed values below. The 808 diagonal entry in row 2 was changed to P31. Other per-part selectors in the 25-cell matrix were mounted. |
| 808 · enabled / rows 1–5 | **partial** · `1440x900/song-row [30]` · Song row 1 808 on · `1440x900/variant/p10-five-rows-edited [30,42,54,66,78]` ×5 · Song row 1 808 on / Song row 5 808 on | The base pointer is the row-1 on/off control. Supplemental matrix confirms five rows. The 808 diagonal enable switch on row 2 was switched off; the other four remained on. |
| Bass A · pattern choice / rows 1–5 | **partial** · `1440x900/song-row [31]` · Song row 1 Bass A pattern · `1440x900/variant/p10-five-rows-edited [31,43,55,67,79]` ×5 · Song row 1 Bass A pattern / Song row 5 Bass A pattern | Pointer is the row-1 selector. In the supplemental five-row matrix the five parts each have a pattern select per row; see the observed values below. The Bass A diagonal entry in row 3 was changed to P30. Other per-part selectors in the 25-cell matrix were mounted. |
| Bass A · enabled / rows 1–5 | **partial** · `1440x900/song-row [32]` · Song row 1 Bass A on · `1440x900/variant/p10-five-rows-edited [32,44,56,68,80]` ×5 · Song row 1 Bass A on / Song row 5 Bass A on | The base pointer is the row-1 on/off control. Supplemental matrix confirms five rows. The Bass A diagonal enable switch on row 3 was switched off; the other four remained on. |
| Bass B · pattern choice / rows 1–5 | **partial** · `1440x900/song-row [33]` · Song row 1 Bass B pattern · `1440x900/variant/p10-five-rows-edited [33,45,57,69,81]` ×5 · Song row 1 Bass B pattern / Song row 5 Bass B pattern | Pointer is the row-1 selector. In the supplemental five-row matrix the five parts each have a pattern select per row; see the observed values below. The Bass B diagonal entry in row 4 was changed to P29. Other per-part selectors in the 25-cell matrix were mounted. |
| Bass B · enabled / rows 1–5 | **partial** · `1440x900/song-row [34]` · Song row 1 Bass B on · `1440x900/variant/p10-five-rows-edited [34,46,58,70,82]` ×5 · Song row 1 Bass B on / Song row 5 Bass B on | The base pointer is the row-1 on/off control. Supplemental matrix confirms five rows. The Bass B diagonal enable switch on row 4 was switched off; the other four remained on. |
| BREAK · pattern choice / rows 1–5 | **partial** · `1440x900/song-row [35]` · Song row 1 BREAK pattern · `1440x900/variant/p10-five-rows-edited [35,47,59,71,83]` ×5 · Song row 1 BREAK pattern / Song row 5 BREAK pattern | Pointer is the row-1 selector. In the supplemental five-row matrix the five parts each have a pattern select per row; see the observed values below. The BREAK diagonal entry in row 5 was changed to P28. Other per-part selectors in the 25-cell matrix were mounted. |
| BREAK · enabled / rows 1–5 | **partial** · `1440x900/song-row [36]` · Song row 1 BREAK on · `1440x900/variant/p10-five-rows-edited [36,48,60,72,84]` ×5 · Song row 1 BREAK on / Song row 5 BREAK on | The base pointer is the row-1 on/off control. Supplemental matrix confirms five rows. The BREAK diagonal enable switch on row 5 was switched off; the other four remained on. |
| Repeats / rows 1–5 | **mapped** · `1440x900/song-row [37]` · Song row 1 repeats · `1440x900/variant/p10-five-rows-edited [37,49,61,73,85]` ×5 · Song row 1 repeats / Song row 5 repeats | Row 1 reference is in the base inventory; the supplemental capture records all five row values. Repeats were set to 8, 7, 6, 5, 4 on rows 1–5. |
| Live song row / pattern boundary status | **unverified** | Editable disconnected arrangement state is captured. Native playback position or a queued row transition was not observed. No corresponding action was demonstrated. |

## Page 11 · BREAK clips and slices

`1440x900/break-slices` · 52 mounted presentations. The proposed generator and native sampler transactions remain open.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| Slices / Notes | **mapped** · `1440x900/break-slices [19–20]` ×2 · Slices / Notes | The BREAK route opened in Slices, then the capture selected Notes. |
| Loop A | **mapped** · `1440x900/break-slices [21]` · Loop A None BR1 1 BR1 2 BR1 3 BR2 1 BR2 2 | The native select inventory provides the captured choices/value. Rendered. No individual action recorded. |
| Loop B | **mapped** · `1440x900/break-slices [22]` · Loop B None BR1 1 BR1 2 BR1 3 BR2 1 BR2 2 | The native select inventory provides the captured choices/value. Rendered. No individual action recorded. |
| Rate | **mapped** · `1440x900/break-slices [23]` · Rate 1/16 1/8 1/4 | The native select inventory provides the captured choices/value. Rendered. No individual action recorded. |
| Step 01–16 · automatic or slice number | **mapped** · `1440x900/break-slices [24–39]` ×16 · Step 1 Auto 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22… / Step 9 Auto 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22… / Step 16 Auto 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 2… | Each step owns an assignment select. The global 1–32 drawing is represented by per-step choices. Sixteen controls inventoried. Individual slice assignment/playback was not exercised. |
| Preview sample inclusion · All / None | **partial** · `1440x900/break-slices [40–41]` ×2 · All / None | Group controls for the preview exports; no command to add every sample to the live BREAK instrument is established. Rendered. No individual action recorded. |
| BR1 1 preview · Listen | **partial** · `1440x900/break-slices [43]` · Play BR1 1 | Captured Play control for this named item. No measured audio result. Rendered. No individual action recorded. |
| BR1 1 preview · + | **partial** · `1440x900/break-slices [42]` · BR1 1 | Captured input includes the sample in an export. A live “add to pool” transaction is unverified. Rendered. No individual action recorded. |
| BR1 2 preview · Listen | **partial** · `1440x900/break-slices [45]` · Play BR1 2 | Captured Play control for this named item. No measured audio result. Rendered. No individual action recorded. |
| BR1 2 preview · + | **partial** · `1440x900/break-slices [44]` · BR1 2 | Captured input includes the sample in an export. A live “add to pool” transaction is unverified. Rendered. No individual action recorded. |
| BR1 3 preview · Listen | **partial** · `1440x900/break-slices [47]` · Play BR1 3 | Captured Play control for this named item. No measured audio result. Rendered. No individual action recorded. |
| BR1 3 preview · + | **partial** · `1440x900/break-slices [46]` · BR1 3 | Captured input includes the sample in an export. A live “add to pool” transaction is unverified. Rendered. No individual action recorded. |
| BR2 1 preview · Listen | **partial** · `1440x900/break-slices [49]` · Play BR2 1 | Captured Play control for this named item. No measured audio result. Rendered. No individual action recorded. |
| BR2 1 preview · + | **partial** · `1440x900/break-slices [48]` · BR2 1 | Captured input includes the sample in an export. A live “add to pool” transaction is unverified. Rendered. No individual action recorded. |
| BR2 2 preview · Listen | **partial** · `1440x900/break-slices [51]` · Play BR2 2 | Captured Play control for this named item. No measured audio result. Rendered. No individual action recorded. |
| BR2 2 preview · + | **partial** · `1440x900/break-slices [50]` · BR2 2 | Captured input includes the sample in an export. A live “add to pool” transaction is unverified. Rendered. No individual action recorded. |
| Generator | **unmatched** | No matching button on the captured BREAK Slices page. No corresponding action was demonstrated. |
| Step locks | **unmatched** | No matching button on the captured BREAK Slices page. No corresponding action was demonstrated. |
| Motion | **unmatched** | No matching button on the captured BREAK Slices page. No corresponding action was demonstrated. |
| Review draft | **relocated** · `1440x900/review [19]` · Review | The shared action menu contains Review; the drawn BREAK-footer button is absent. Desktop review dialog opened from the shared menu. |

## Page 12 · Projects

`1440x900/projects` · 32 mounted presentations. Device backup transfer and execution of MIDI export depend on source providers.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| Export backup | **mapped** · `1440x900/projects [19]` · Export backup | Original backup workflow boundary. Link was rendered. A device backup download is not in this capture. |
| Inspect restore | **mapped** · `1440x900/projects [20]` · Inspect restore | Source restore inspection boundary. Link was rendered. No physical restore was applied. |
| Open original | **mapped** · `1440x900/projects [21]` · Open original | Original-file lifecycle. Desktop opened the chooser, rejected invalid input, loaded the original-file fixture, then kept the draft. |
| Inspect contents | **mapped** · `1440x900/projects [22]` · Inspect contents (disabled) · `1440x900/project-kept [22]` · Inspect contents | The unloaded desktop supplies the disabled state. Once the 15-preset Synth One Starter Bank was kept, the desktop button became enabled. Availability was captured. An independent Inspect press is not established. |
| Save original copy | **mapped** · `1440x900/projects [23]` · Save a copy (disabled) · `1440x900/project-kept [23]` · Save a copy | Initially unavailable before a matching original is loaded. Once the 15-preset Synth One Starter Bank was kept, the desktop button became enabled. Mount/availability observed. A downloaded original copy is not attested. |
| Choose range | **mapped** · `1440x900/projects [24]` · Choose range | Performance export scope. Range control mounted; the capture did not invoke this link. |
| Export MIDI | **partial** · `1440x900/projects [25]` · Export availability | The captured action describes availability; no generated original hardware MIDI file. Availability link mounted; the capture did not invoke this link. |
| Open DAW guide | **mapped** · `1440x900/projects [28]` · Open DAW guide | Expandable local guidance. Control inventoried. |
| Read project / stock transfer | **unverified** | No native project read/transfer was produced by this disconnected draft. No corresponding action was demonstrated. |

## Page 13 · Connect and Review

`1440x900/review` · 43 mounted presentations. The drawing places both in one workspace. The stock keyboard lacks versioned parameter Read latest/Compare/Apply.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| Connect | **mapped** · `1440x900/connect [1]` · Connect | Connection dialog opened without a hardware endpoint. |
| USB MIDI · Choose | **unverified** | No matching enabled device-selection/read/compare operation was established by the disconnected capture. No corresponding action was demonstrated. |
| Bluetooth MIDI · Choose | **unverified** | No matching enabled device-selection/read/compare operation was established by the disconnected capture. No corresponding action was demonstrated. |
| Instrument · Read state | **unverified** | No matching enabled device-selection/read/compare operation was established by the disconnected capture. No corresponding action was demonstrated. |
| Read latest | **unverified** | No matching enabled device-selection/read/compare operation was established by the disconnected capture. No corresponding action was demonstrated. |
| Compare changes | **unverified** | No matching enabled device-selection/read/compare operation was established by the disconnected capture. No corresponding action was demonstrated. |
| Discard draft | **partial** · `1440x900/review [42]` · Discard draft | Review-discard control opens its confirmation boundary. Discard confirmation was captured. This row does not establish a physical write. |
| Apply to DnBOX | **additional** · `1440x900/review [24]` · Apply to instrument (disabled) | Disabled in this disconnected fixture. Disabled apply state captured. |
| Keep editing | **partial** · `1440x900/review [41]` · Return | Return route from the reviewed draft. After cancelling discard, the capture selected Return. |
| Selected note pitch C3 → D3 and velocity 93 → 100 | **unverified** | The exact Review state has no evidence for the two particular note changes shown in the owner illustration. The reviewed diff read “Song row 1: P1 (off) / P1 / P1 / P1 / P1 · 1 repeats”. No corresponding action was demonstrated. |

## Page 14 · Landscape roll

`844x390/notes` · 41 mounted presentations. The left-side start marker lacks qualified running musical position.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| Piano roll, pitch grid and authored notes | **mapped** · `844x390/notes [19–22]` ×4 · C3, velocity 93, 0 to 8268 samples / C3, velocity 93, 88200 to 88200 samples | Four captured note-event buttons identify pitch, velocity and sample range. Beat divisions and pitch labels are drawn, not independent buttons. Rendered. No individual action recorded. |
| Velocity 93 and note edit | **corrected** · `844x390/notes [23]` · VELOCITY 93 | Velocity uses the shared thin lane. No permanent selected-note panel. Rendered. No individual action recorded. |
| Per-step velocity or gate cells, steps 1–16 | **corrected** · `844x390/notes [25–40]` ×16 · Step 1, 1 notes, velocity 93 / Step 9, 0 notes, velocity empty (disabled) / Step 16, 1 notes, velocity 93 | Snapshot lists disabled empty/unset cells as well as enabled cells; a center hit is not a tap. Rendered. No individual action recorded. |
| Select, Draw, Erase and Pan / zoom | **corrected** | Correction 4 replaces the mode buttons with gesture editing. These snapshots did not measure gesture responses. No corresponding action was demonstrated. |
| Time/pitch range − and + | **corrected** | The drawn zoom button pair is replaced by gestures under correction 4. No matching button pair on this screen. No corresponding action was demonstrated. |
| Step 01 pitch C3 and −/+ | **corrected** · `844x390/notes [19]` · C3, velocity 93, 0 to 8268 samples | The note event carries pitch; its old inspector stepper is absent. Rendered. No individual action recorded. |
| Velocity −/+ controls | **corrected** · `844x390/notes [25]` · Step 1, 1 notes, velocity 93 | One thin-lane slider for step 1 replaces the separate −/+ buttons. Rendered. No individual action recorded. |
| Note / Tie / Rest | **corrected** · `1440x900/lane-gate [23]` · GATE Unset | Alternate lane on the same component. This mode has a desktop capture only. Lane selector was cycled to the named mode. No per-step value edit is established by this state. |
| Accent OFF | **corrected** · `1440x900/lane-accent [23]` · ACCENT Unset | Alternate lane on the same component. This mode has a desktop capture only. Lane selector was cycled to the named mode. No per-step value edit is established by this state. |
| Slide OFF | **corrected** · `1440x900/lane-slide [23]` · SLIDE Unset | Alternate lane on the same component. This mode has a desktop capture only. Lane selector was cycled to the named mode. No per-step value edit is established by this state. |
| Step details / Details, dedicated Step 01 inspector | **corrected** | Correction 4 substitutes the roll and one thin lane for the separate persistent inspector. No corresponding action was demonstrated. |
| Review draft | **relocated** · `1440x900/review [19]` · Review | The recorded menu exposes Review. Only desktop captured this open menu. Desktop review dialog was opened. |
| Transport position or playhead | **unverified** | A fixed leading trace marker is visible; the exact capture supplies no selected-part live musical position. No corresponding action was demonstrated. |
| Bar-versus-beat subdivision contrast | **partial** | The drawing and captures show beat divisions. Relative line weights have no pixel-qualified match. Beat 1–4 are static labels in the captured roll. |
| Corrected thin-lane switch · Velocity, Chance, Pitch, Pan | **corrected** · `844x390/notes [24]` · Velocity Chance Pitch Pan Gate Slide Accent Release Drum accent Patt… | The selector contains all four names and further options. The visible lane label is the companion button. Desktop captures document all four modes. The original desktop walk switched between all four lanes; individual slider action is not established. |

## Page 15 · Landscape 909 steps and Sound

`844x390/drum909-steps` · 239 mounted presentations. The first viewport shows 3 whole voices × 9 whole steps. The owner drawing shows 6 × 16; full content uses inner scrolling.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| Bass drum (BD), steps 1–16 | **partial** · `844x390/drum909-steps [23–38]` ×16 · BD step 1 velocity 88, toggle local hit / BD step 9 empty, toggle local hit / BD step 16 empty, toggle local hit | The PDF contains this row. Each entry gives its step and local hit state. The PDF shows six rows and 16 steps together. Scrolling is required in the capture. The drawn kick lights steps 1 and 5. The recorded draft labels steps 1 and 16 with velocity 88. Grid mounted. Upper/lower banks were visited. The 16 cells in this row were not individually toggled in the capture. |
| Snare (SD), steps 1–16 | **partial** · `844x390/drum909-steps [39–54]` ×16 · SD step 1 empty, toggle local hit / SD step 9 empty, toggle local hit / SD step 16 empty, toggle local hit | The PDF contains this row. Each entry gives its step and local hit state. The PDF shows six rows and 16 steps together. Scrolling is required in the capture. Grid mounted. Upper/lower banks were visited. The 16 cells in this row were not individually toggled in the capture. |
| Low tom (LT), steps 1–16 | **partial** · `844x390/drum909-steps [55–70]` ×16 · LT step 1 empty, toggle local hit / LT step 9 empty, toggle local hit / LT step 16 empty, toggle local hit | The PDF contains this row. Each entry gives its step and local hit state. The PDF shows six rows and 16 steps together. Scrolling is required in the capture. Grid mounted. Upper/lower banks were visited. The 16 cells in this row were not individually toggled in the capture. |
| Mid tom (MT), steps 1–16 | **partial** · `844x390/drum909-steps [71–86]` ×16 · MT step 1 empty, toggle local hit / MT step 9 empty, toggle local hit / MT step 16 empty, toggle local hit | The PDF contains this row. Each entry gives its step and local hit state. The PDF shows six rows and 16 steps together. Scrolling is required in the capture. Grid mounted. Upper/lower banks were visited. The 16 cells in this row were not individually toggled in the capture. |
| High tom (HT), steps 1–16 | **partial** · `844x390/drum909-steps [87–102]` ×16 · HT step 1 empty, toggle local hit / HT step 9 empty, toggle local hit / HT step 16 empty, toggle local hit | The PDF contains this row. Each entry gives its step and local hit state. The PDF shows six rows and 16 steps together. Scrolling is required in the capture. Grid mounted. Upper/lower banks were visited. The 16 cells in this row were not individually toggled in the capture. |
| Rim shot (RS), steps 1–16 | **partial** · `844x390/drum909-steps [103–118]` ×16 · RS step 1 empty, toggle local hit / RS step 9 empty, toggle local hit / RS step 16 empty, toggle local hit | The PDF contains this row. Each entry gives its step and local hit state. The PDF shows six rows and 16 steps together. Scrolling is required in the capture. Grid mounted. Upper/lower banks were visited. The 16 cells in this row were not individually toggled in the capture. |
| Clap (CP), steps 1–16 | **additional** · `844x390/drum909-steps [119–134]` ×16 · CP step 1 empty, toggle local hit / CP step 9 empty, toggle local hit / CP step 16 empty, toggle local hit | The lower group is available through Voices 7–11. Each entry gives its step and local hit state. The PDF shows six rows and 16 steps together. Scrolling is required in the capture. Grid mounted. Upper/lower banks were visited. The 16 cells in this row were not individually toggled in the capture. |
| Closed hat (CH), steps 1–16 | **additional** · `844x390/drum909-steps [135–150]` ×16 · CH step 1 empty, toggle local hit / CH step 9 empty, toggle local hit / CH step 16 empty, toggle local hit | The lower group is available through Voices 7–11. Each entry gives its step and local hit state. The PDF shows six rows and 16 steps together. Scrolling is required in the capture. Grid mounted. Upper/lower banks were visited. The 16 cells in this row were not individually toggled in the capture. |
| Open hat (OH), steps 1–16 | **additional** · `844x390/drum909-steps [151–166]` ×16 · OH step 1 empty, toggle local hit / OH step 9 empty, toggle local hit / OH step 16 empty, toggle local hit | The lower group is available through Voices 7–11. Each entry gives its step and local hit state. The PDF shows six rows and 16 steps together. Scrolling is required in the capture. Grid mounted. Upper/lower banks were visited. The 16 cells in this row were not individually toggled in the capture. |
| Crash (CR), steps 1–16 | **additional** · `844x390/drum909-steps [167–182]` ×16 · CR step 1 empty, toggle local hit / CR step 9 empty, toggle local hit / CR step 16 empty, toggle local hit | The lower group is available through Voices 7–11. Each entry gives its step and local hit state. The PDF shows six rows and 16 steps together. Scrolling is required in the capture. Grid mounted. Upper/lower banks were visited. The 16 cells in this row were not individually toggled in the capture. |
| Ride (RD), steps 1–16 | **additional** · `844x390/drum909-steps [183–198]` ×16 · RD step 1 empty, toggle local hit / RD step 9 empty, toggle local hit / RD step 16 empty, toggle local hit | The lower group is available through Voices 7–11. Each entry gives its step and local hit state. The PDF shows six rows and 16 steps together. Scrolling is required in the capture. Grid mounted. Upper/lower banks were visited. The 16 cells in this row were not individually toggled in the capture. |
| Accent steps 1–16 | **mapped** · `844x390/drum909-steps [199–214]` ×16 · 909 Accent step 1, Not set / 909 Accent step 9, Not set / 909 Accent step 16, Not set | Per-kit 16-step Accent row. Separate from the Sound-panel parameter. Accent navigation visited on landscape; individual Accent toggles were not exhaustively exercised. |
| Selected drum / voice Sound | **mapped** · `844x390/drum909-steps [232]` · Sound voice BD SD LT MT HT RS CP CH OH CR RD | Selected voice BD in the reference state. All eleven Sound voices per kit were selected in desktop variants. |
| Tune and −/+ adjustment · 34 | **partial** · `844x390/drum909-steps [233]` · Tune, 13ms, local draft | Adjacent Sound uses one editable control instead of the depicted minus/plus pair. The numeric formatting follows the captured source. Its compact 844px Sound counterpart was taken to both legal endpoints in the separate drum scan. Adjacent-grid steppers were not exercised. |
| Attack and −/+ adjustment · 10% | **partial** · `844x390/drum909-steps [234]` · Attack, 10%, local draft | Adjacent Sound uses one editable control instead of the depicted minus/plus pair. The numeric formatting follows the captured source. Its compact 844px Sound counterpart was taken to both legal endpoints in the separate drum scan. Adjacent-grid steppers were not exercised. |
| Step locks | **unmatched** | The adjacent Sound panel is already mounted. No matching footer button in this page capture. No corresponding action was demonstrated. |
| Voice sound | **unmatched** | The adjacent Sound panel is already mounted. No matching footer button in this page capture. No corresponding action was demonstrated. |
| Voices 1–6 | **mapped** · `844x390/drum909-steps [19]` · Voices 1–6 | Initial bank captured. |
| Voices 7–11 | **mapped** · `844x390/drum909-steps [20]` · Voices 7–11 | Lower bank selected in both kit traces. |
| Accent lane | **mapped** · `844x390/drum909-steps [21]` · Accent lane | Accent navigation selected in both kits. |
| Review draft | **mapped** · `844x390/drum909-steps [22]` · Review draft | Button rendered; the generic Review dialog was exercised separately on desktop. |
| Selected step 01 / P01 context | **partial** · `844x390/drum909-steps [23]` · BD step 1 velocity 88, toggle local hit | The indexed voice-step button describes the local note/hit state. A native selected-step lock transaction is not captured. Rendered. No individual action recorded. |

## Page 16 · Landscape levels

`844x390/levels` · 52 mounted presentations. Live per-strip peaks, Mute and Solo are absent, and the full monitor area does not share the first viewport.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| 909 · channel level/fader | **mapped** · `844x390/levels [27]` · 909 | The channel input records its current draft value. A live meter or peak is a distinct observation. Rendered. No individual action recorded. |
| 808 · channel level/fader | **mapped** · `844x390/levels [29]` · 808 | The channel input records its current draft value. A live meter or peak is a distinct observation. Rendered. No individual action recorded. |
| Bass A · channel level/fader | **mapped** · `844x390/levels [31]` · BASS A | The channel input records its current draft value. A live meter or peak is a distinct observation. Rendered. No individual action recorded. |
| Bass B · channel level/fader | **mapped** · `844x390/levels [33]` · BASS B | The channel input records its current draft value. A live meter or peak is a distinct observation. Rendered. No individual action recorded. |
| BREAK · channel level/fader | **mapped** · `844x390/levels [35]` · BREAK | The channel input records its current draft value. A live meter or peak is a distinct observation. Rendered. No individual action recorded. |
| Master macro · Drive · 41 | **mapped** · `844x390/levels [36]` · Master Drive 41 | Captured control identifies the macro and its draft value. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Master macro · Comp · OFF | **partial** · `844x390/levels [37]` · Master COMP 75% | Current draft readout is captured in the field label. The owner illustration marks Comp OFF and Pump 0.0dB. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Master macro · Pump · 0.0 dB | **partial** · `844x390/levels [38]` · Master PUMP 4.0dB | Current draft readout is captured in the field label. The owner illustration marks Comp OFF and Pump 0.0dB. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Master macro · Filter · OFF | **mapped** · `844x390/levels [39]` · Master FILTER OFF | Captured control identifies the macro and its draft value. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Peak / signal level for the five parts | **unverified** | The level controls expose draft gain. This disconnected capture supplies no live level/peak history for the five channels. No corresponding action was demonstrated. |
| Mute / Solo for the selected part | **unmatched** | No matching Mute or Solo control appears among the captured Levels entries. No corresponding action was demonstrated. |
| Master more | **partial** · `844x390/levels [25]` · Master / More | The More control group is behind the combined Master / More tab. The desktop Master / More view was visited. |
| Master / FX | **partial** · `844x390/levels [24–25]` ×2 · FX / Master / More | FX and Master / More are separate tab targets. Rendered. No individual action recorded. |
| Review draft | **relocated** · `1440x900/review [19]` · Review | Shared action menu. Review was captured on desktop. Desktop review dialog was opened. |

## Page 17 · Landscape note timing and Motion

`844x390/motion` · 62 mounted presentations. The drawing’s grouped timing inspector is replaced by the owner correction. Unrestricted native lock targets remain open.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| Piano roll / selected Step 01 | **mapped** · `844x390/motion [19–22]` ×4 · C3, velocity 93, 0 to 8268 samples / C3, velocity 93, 88200 to 88200 samples | The old selected-note inspector is superseded by correction 4. Starting sample ranges are accessible on the notes. Rendered. No individual action recorded. |
| Start 0.0000s −/+ | **corrected** | The captured note exposes sample boundaries; no matching selected-note numeric editor or −/+ pair is mounted. No corresponding action was demonstrated. |
| End 0.1875s −/+ | **corrected** | The captured note exposes sample boundaries; no matching selected-note numeric editor or −/+ pair is mounted. No corresponding action was demonstrated. |
| Release endpoint 1–15 −/+ | **corrected** · `1440x900/lane-release [23]` · RELEASE Unset | Desktop Release lane is unset in the captured state; it is a separate surface from the drawn Inspector. Release mode was selected on the desktop roll; no individual endpoint edit established. |
| Locks / Motion / sixteen step points | **partial** · `844x390/motion [41–56]` ×16 · Step 1, unset / Step 9, unset / Step 16, unset | Captured lane is MIAMI Wave, with 16 unset points. The drawing specifies a Chicago Cutoff override. Motion view opened; the pictured Cutoff override was not authored in this walk. |
| Select and Pan / zoom | **corrected** | The gesture-first correction removes these mode buttons. No corresponding action was demonstrated. |
| Back to note | **partial** · `844x390/motion [2]` · Sequence | The primary Sequence route is available; no specific back-to-note footer control. Rendered. No individual action recorded. |
| Review draft | **relocated** · `1440x900/review [19]` · Review | Recorded via the shared menu instead of the drawn local footer. Desktop Review was opened. |
| Reference playhead and bar-versus-beat grid hierarchy | **unverified** | Beat 1–4 appear in the recorded roll. A trace-start marker does not establish a moving playhead. The relative bar/beat line weights have no pixel-qualified match. No corresponding action was demonstrated. |

## Page 18 · Landscape 909 Sound

`844x390/drum909-sound-0` · 43 mounted presentations. At this revision the last editable label reads ACCENT. Current stock semantics distinguish 909 Velocity sensitivity from actual 909 Accent gain.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| Tune · value and −/+ · 34 | **partial** · `844x390/drum909-sound-0 [22–24]` ×3 · Tune 13ms / Decrease Tune / Increase Tune · `844x390/drum909-original [23]` · Tune, source example 34, local draft | A glyph control plus separate decrement/increment buttons. The compact field’s own accessible text carries the value. Field identities/labels refer to this exact 944 revision. The 844×390 scan clicked the parameter, set its input to each legal endpoint and dispatched change. The display read 6ms and 32ms. The SVG path stayed fixed. Separate −/+ presses were not measured. |
| Attack · value and −/+ · 10% | **partial** · `844x390/drum909-sound-0 [25–27]` ×3 · Attack 10% / Decrease Attack / Increase Attack · `844x390/drum909-original [24]` · Attack, source example 10%, local draft | A glyph control plus separate decrement/increment buttons. The compact field’s own accessible text carries the value. Field identities/labels refer to this exact 944 revision. The 844×390 scan clicked the parameter, set its input to each legal endpoint and dispatched change. The display read 0% and 100%. The SVG path stayed fixed. Separate −/+ presses were not measured. |
| Decay · value and −/+ · 1.0 s | **partial** · `844x390/drum909-sound-0 [28–30]` ×3 · Decay 1.0s / Decrease Decay / Increase Decay · `844x390/drum909-original [25]` · Decay, source example 1.0s, local draft | A glyph control plus separate decrement/increment buttons. The compact field’s own accessible text carries the value. Field identities/labels refer to this exact 944 revision. The 844×390 scan clicked the parameter, set its input to each legal endpoint and dispatched change. The display read 100ms and 4.0s. The SVG path stayed fixed. Separate −/+ presses were not measured. |
| P.DPTH / Pitch depth · value and −/+ · 0% | **partial** · `844x390/drum909-sound-0 [31–33]` ×3 · Pitch depth 0% / Decrease Pitch depth / Increase Pitch depth · `844x390/drum909-original [26]` · Pitch depth, source example 0%, local draft | A glyph control plus separate decrement/increment buttons. The compact field’s own accessible text carries the value. Field identities/labels refer to this exact 944 revision. The 844×390 scan clicked the parameter, set its input to each legal endpoint and dispatched change. The display read 0% and 100%. The SVG path stayed fixed. Separate −/+ presses were not measured. |
| Pitch · value and −/+ · 45 | **partial** · `844x390/drum909-sound-0 [34–36]` ×3 · Pitch +0.1st / Decrease Pitch / Increase Pitch · `844x390/drum909-original [27]` · Pitch, source example 45, local draft | A glyph control plus separate decrement/increment buttons. The compact field’s own accessible text carries the value. Field identities/labels refer to this exact 944 revision. The 844×390 scan clicked the parameter, set its input to each legal endpoint and dispatched change. The display read -15st and +27st. The SVG path stayed fixed. Separate −/+ presses were not measured. |
| Accent · value and −/+ · 127 | **partial** · `844x390/drum909-sound-0 [37–39]` ×3 · ACCENT 100% / Decrease ACCENT / Increase ACCENT · `844x390/drum909-original [28]` · ACCENT, source example 127, local draft | A glyph control plus separate decrement/increment buttons. The compact field’s own accessible text carries the value. Field identities/labels refer to this exact 944 revision. The 844×390 scan clicked the parameter, set its input to each legal endpoint and dispatched change. The display read 0% and 100%. The SVG path stayed fixed. Separate −/+ presses were not measured. |
| Engine / page | **partial** · `844x390/drum909-sound-0 [21]` · Sound voice BD SD LT MT HT RS CP CH OH CR RD | Voice selector is available. No separate footer button for engine/page. All eleven voices were selected per kit. |
| Open original | **mapped** · `844x390/drum909-sound-0 [40]` · Open original | The landscape capture opened the Original drum reference frame, which shows the six source-example controls. |
| Save a copy | **partial** · `844x390/drum909-sound-0 [41]` · Save a copy | Save a copy is enabled in the compact view. A downloaded copy was not verified. Rendered. No individual action recorded. |
| Review draft | **mapped** · `844x390/drum909-sound-0 [42]` · Review draft | Dedicated button in the compact Sound strip. Mounted here. Review was opened separately from the shared desktop menu. |

## Page 19 · Landscape patterns

`844x390/patterns` · 55 mounted presentations. Wrap cue, content clipboard and chain bounds are absent.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| Selected part / All parts | **mapped** · `844x390/patterns [51–52]` ×2 · Selected part / All parts | The scoped and all-parts views were captured. The selected part was Bass A. |
| Selected-part pattern pads P01–P32 | **mapped** · `844x390/patterns [19–50]` ×32 · Bass A P1, not loaded / Bass A P17, not loaded / Bass A P32, not loaded · `844x390/patterns-selected [19]` · Bass A P1, not loaded | One indexed bank of 32. The owner’s drawn pattern identities/content are illustrative; native fixture distinguishes loaded and unavailable pads. Bass A P01 was selected. Pads P02–P32 were not individually selected. |
| All parts · five banks × P01–P32 | **additional** · `844x390/patterns-all [19–178]` ×160 · 909 P1, not loaded / Bass A P17, not loaded / BREAK P32, not loaded | All five banks are addressed in capture order using the zero-based indices below; local pattern numbers restart at 1 per part. All-parts scope opened, with 160 indexed pad presentations. No exhaustive pad actuation. |
| Cue at wrap | **unmatched** | No corresponding selected-part content/chain command in this state. Captured scope switches and pad selection do not establish this operation. No corresponding action was demonstrated. |
| Copy selected part | **unmatched** | No corresponding selected-part content/chain command in this state. Captured scope switches and pad selection do not establish this operation. No corresponding action was demonstrated. |
| Paste into selected part | **unmatched** | No corresponding selected-part content/chain command in this state. Captured scope switches and pad selection do not establish this operation. No corresponding action was demonstrated. |
| Chain bounds | **unmatched** | No corresponding selected-part content/chain command in this state. Captured scope switches and pad selection do not establish this operation. No corresponding action was demonstrated. |
| Open Song arrangement | **mapped** · `844x390/patterns [54]` · Song arrangement | The arrangement view and its first added row are present in the capture. |
| Review draft | **mapped** · `844x390/patterns [53]` · Review draft | This button was mounted. Desktop review was opened elsewhere in the walk. |

## Page 20 · Landscape projects

`844x390/projects` · 31 mounted presentations. Physical backup/restore and provider-executed MIDI export remain open.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| Export backup | **mapped** · `844x390/projects [19]` · Export backup | Original backup workflow boundary. Link was rendered. A device backup download is not in this capture. |
| Inspect restore | **mapped** · `844x390/projects [20]` · Inspect restore | Source restore inspection boundary. Link was rendered. No physical restore was applied. |
| Open original | **mapped** · `844x390/projects [21]` · Open original | Original-file lifecycle. Desktop opened the chooser, rejected invalid input, loaded the original-file fixture, then kept the draft. |
| Save a copy | **mapped** · `844x390/projects [22]` · Save a copy (disabled) · `1440x900/project-kept [23]` · Save a copy | Initially unavailable before a matching original is loaded. Once the 15-preset Synth One Starter Bank was kept, the desktop button became enabled. Mount/availability observed. A downloaded original copy is not attested. |
| Choose range | **mapped** · `844x390/projects [23]` · Choose range | Performance export scope. Range control mounted; the capture did not invoke this link. |
| Export MIDI | **partial** · `844x390/projects [24]` · Export availability | The captured action describes availability; no generated original hardware MIDI file. Availability link mounted; the capture did not invoke this link. |
| Samples | **mapped** · `844x390/projects [25]` · Samples | Rendered. No individual action recorded. |
| Manual | **mapped** · `844x390/projects [26]` · Manual | Rendered. No individual action recorded. |

## Page 21 · Portrait roll

`390x844/notes` · 41 mounted presentations. No selected-part live position.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| Piano roll, pitch grid and authored notes | **mapped** · `390x844/notes [19–22]` ×4 · C3, velocity 93, 0 to 8268 samples / C3, velocity 93, 88200 to 88200 samples | Four captured note-event buttons identify pitch, velocity and sample range. Beat divisions and pitch labels are drawn, not independent buttons. Rendered. No individual action recorded. |
| Velocity 93 and note edit | **corrected** · `390x844/notes [23]` · VELOCITY 93 | Velocity uses the shared thin lane. No permanent selected-note panel. Rendered. No individual action recorded. |
| Per-step velocity or gate cells, steps 1–16 | **corrected** · `390x844/notes [25–40]` ×16 · Step 1, 1 notes, velocity 93 / Step 9, 0 notes, velocity empty (disabled) / Step 16, 1 notes, velocity 93 | Snapshot lists disabled empty/unset cells as well as enabled cells; a center hit is not a tap. Rendered. No individual action recorded. |
| Select, Draw, Pan and Zoom | **corrected** | Correction 4 replaces the mode buttons with gesture editing. These snapshots did not measure gesture responses. No corresponding action was demonstrated. |
| Edit note | **corrected** | The note itself is the edit surface under correction 4; no separate Edit note button. No corresponding action was demonstrated. |
| Undo draft | **mapped** · `390x844/notes [16]` · Undo (disabled) | Header action; it is disabled in this unedited capture. Rendered. No individual action recorded. |
| Review draft | **relocated** · `1440x900/review [19]` · Review | The recorded menu exposes Review. Only desktop captured this open menu. Desktop review dialog was opened. |
| Transport position or playhead | **unverified** | A fixed leading trace marker is visible; the exact capture supplies no selected-part live musical position. No corresponding action was demonstrated. |
| Bar-versus-beat subdivision contrast | **partial** | The drawing and captures show beat divisions. Relative line weights have no pixel-qualified match. Beat 1–4 are static labels in the captured roll. |
| Corrected thin-lane switch · Velocity, Chance, Pitch, Pan | **corrected** · `390x844/notes [24]` · Velocity Chance Pitch Pan Gate Slide Accent Release Drum accent Patt… | The selector contains all four names and further options. The visible lane label is the companion button. Desktop captures document all four modes. The original desktop walk switched between all four lanes; individual slider action is not established. |
| Bottom tabs · Sequence / Sound / Mix / Patterns / Files | **corrected** · `390x844/notes [2–6]` ×5 · Sequence / Projects | Responsive shared navigation exposes the five destinations, with Mix & FX, Patterns & Song and Projects labels. The owner had requested the desktop components and type scale on phones. All five areas were visited on desktop. The five portrait destinations were not all opened in this capture. |

## Page 22 · Portrait note detail / corrected lane

`390x844/lane-gate` · 41 mounted presentations. The owner correction removes the separate Step inspector. A verified musical playhead and additional native locks remain open.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| Piano roll, pitch grid and authored notes | **mapped** · `390x844/lane-gate [19–22]` ×4 · C3, velocity 93, 0 to 8268 samples / C3, velocity 93, 88200 to 88200 samples | Four captured note-event buttons identify pitch, velocity and sample range. Beat divisions and pitch labels are drawn, not independent buttons. Rendered. No individual action recorded. |
| Velocity 93 and note edit | **corrected** · `390x844/notes [23]` · VELOCITY 93 | Velocity uses the shared thin lane. No permanent selected-note panel. Rendered. No individual action recorded. |
| Per-step velocity or gate cells, steps 1–16 | **corrected** · `390x844/lane-gate [25–40]` ×16 · Step 1, Gate Unset / Step 9, Gate Unset / Step 16, Gate Unset | Snapshot lists disabled empty/unset cells as well as enabled cells; a center hit is not a tap. Rendered. No individual action recorded. |
| Step 01 pitch C3 and −/+ | **corrected** · `390x844/notes [19]` · C3, velocity 93, 0 to 8268 samples | The note event carries pitch; its old inspector stepper is absent. Rendered. No individual action recorded. |
| Velocity −/+ controls | **corrected** · `390x844/notes [25]` · Step 1, 1 notes, velocity 93 | One thin-lane slider for step 1 replaces the separate −/+ buttons. Rendered. No individual action recorded. |
| Note / Tie / Rest | **corrected** · `390x844/lane-gate [23]` · GATE Unset | Alternate lane on the same component. The captured lane is unset. Lane selector was cycled to the named mode. No per-step value edit is established by this state. |
| Accent OFF | **corrected** · `1440x900/lane-accent [23]` · ACCENT Unset | Alternate lane on the same component. This mode has a desktop capture only. Lane selector was cycled to the named mode. No per-step value edit is established by this state. |
| Slide OFF | **corrected** · `1440x900/lane-slide [23]` · SLIDE Unset | Alternate lane on the same component. This mode has a desktop capture only. Lane selector was cycled to the named mode. No per-step value edit is established by this state. |
| Step details / Details, dedicated Step 01 inspector | **corrected** | Correction 4 substitutes the roll and one thin lane for the separate persistent inspector. No corresponding action was demonstrated. |
| Back to roll | **partial** · `390x844/notes [2]` · Sequence | Sequence is a top-level route; a dedicated back-from-inspector button is absent. Rendered. No individual action recorded. |
| Review draft | **relocated** · `1440x900/review [19]` · Review | The recorded menu exposes Review. Only desktop captured this open menu. Desktop review dialog was opened. |
| Reference playhead and bar-versus-beat grid hierarchy | **unverified** | Beat 1–4 appear in the recorded roll. A trace-start marker does not establish a moving playhead. The relative bar/beat line weights have no pixel-qualified match. No corresponding action was demonstrated. |
| Corrected thin-lane switch · Velocity, Chance, Pitch, Pan | **corrected** · `390x844/notes [24]` · Velocity Chance Pitch Pan Gate Slide Accent Release Drum accent Patt… | The selector contains all four names and further options. The visible lane label is the companion button. Desktop captures document all four modes. The original desktop walk switched between all four lanes; individual slider action is not established. |
| Bottom tabs · Sequence / Sound / Mix / Patterns / Files | **corrected** · `390x844/lane-gate [2–6]` ×5 · Sequence / Projects | Responsive shared navigation exposes the five destinations, with Mix & FX, Patterns & Song and Projects labels. The owner had requested the desktop components and type scale on phones. All five areas were visited on desktop. The five portrait destinations were not all opened in this capture. |

## Page 23 · Portrait levels

`390x844/levels` · 52 mounted presentations. Peaks, Mute and Solo remain unavailable. The remainder of the control area scrolls.

| Owner label or indexed group | 944 target and status | Observed difference / action |
|---|---|---|
| 909 · channel level/fader | **mapped** · `390x844/levels [27]` · 909 | The channel input records its current draft value. A live meter or peak is a distinct observation. Rendered. No individual action recorded. |
| 808 · channel level/fader | **mapped** · `390x844/levels [29]` · 808 | The channel input records its current draft value. A live meter or peak is a distinct observation. Rendered. No individual action recorded. |
| Bass A · channel level/fader | **mapped** · `390x844/levels [31]` · BASS A | The channel input records its current draft value. A live meter or peak is a distinct observation. Rendered. No individual action recorded. |
| Bass B · channel level/fader | **mapped** · `390x844/levels [33]` · BASS B | The channel input records its current draft value. A live meter or peak is a distinct observation. Rendered. No individual action recorded. |
| BREAK · channel level/fader | **mapped** · `390x844/levels [35]` · BREAK | The channel input records its current draft value. A live meter or peak is a distinct observation. Rendered. No individual action recorded. |
| Master macro · Drive · 41 | **mapped** · `390x844/levels [36]` · Master Drive 41 | Captured control identifies the macro and its draft value. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Master macro · Comp · OFF | **partial** · `390x844/levels [37]` · Master COMP 75% | Current draft readout is captured in the field label. The owner illustration marks Comp OFF and Pump 0.0dB. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Master macro · Pump · 0.0 dB | **partial** · `390x844/levels [38]` · Master PUMP 4.0dB | Current draft readout is captured in the field label. The owner illustration marks Comp OFF and Pump 0.0dB. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Master macro · Filter · OFF | **mapped** · `390x844/levels [39]` · Master FILTER OFF | Captured control identifies the macro and its draft value. The PDF pairs −/+ buttons with this glyph; the capture mounts one parameter button for the pair. Rendered. No individual action recorded. |
| Peak / signal level for the five parts | **unverified** | The level controls expose draft gain. This disconnected capture supplies no live level/peak history for the five channels. No corresponding action was demonstrated. |
| Mute / Solo for the selected part | **unmatched** | No matching Mute or Solo control appears among the captured Levels entries. No corresponding action was demonstrated. |
| Bottom tabs · Sequence / Sound / Mix / Patterns / Files | **corrected** · `390x844/levels [2–6]` ×5 · Sequence / Projects | Responsive shared navigation exposes the five destinations, with Mix & FX, Patterns & Song and Projects labels. The owner had requested the desktop components and type scale on phones. All five areas were visited on desktop. The five portrait destinations were not all opened in this capture. |

## Evidence boundary

The 79 retained browser states have 4,815 mounted control presentations across three viewports. Three separate Song/Pattern states verify deliberate edits. The separate compact drum scan actuated 83 control occurrences spanning 63 field identities. These source-bound records cannot establish that every mounted control was pressed, that a device ran the operation, or that the owner approved the result.
