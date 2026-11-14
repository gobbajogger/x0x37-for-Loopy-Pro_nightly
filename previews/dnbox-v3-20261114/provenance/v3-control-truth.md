# DnBOX physical controls → screen truth

Read-only website research, 2026-11-14. This consumes the owner's criticism that the guides are dry and do not explain keybed/pad correspondence. The implementation should teach short musical gestures with a visible target, source-defined result and recovery. This document establishes the control contract; it is not a new firmware qualification.

## Exact identities and scope

Actual captured firmware: `gobbajogger/X0X37-for-Loopy-Pro` source `79280e763341d03ba43266d3e25dad66f12de860`, DnBOX 0.0.25.1, Elite_900 / Pro_900. Emulator #899 source `431d0db82cbadca761fb32c6548ca4765875324f`. Website #890 reference `34c321466ca3ccb5b7f125c3513cebf4ec76640c` is context, not firmware source.

The local firmware checkout HEAD is `035026fe70059af35e25c7c121b40f318b732fe3`, with no local copies of the two requested pinned commits. Therefore I fetched individual exact pinned files through the authorized GitHub connector, without network git, branch changes or builds. All nine file contents match the connector's Git blob identities after exact-byte reconstruction. See `control-evidence/retrieval-receipt.json` for blob/SHA256/byte verification. Firmware source was copied as evidence only; the shared checkout remains unchanged.

Cross-check manual: `97a88b44539110ded82257ebb20b0444ba4b8b8f`, **docs/MANUAL.md** blob `4c0ad13cfe7dd37fc41ed34859ed5c50a84acb29`, and web/MANUAL.md blob `a694abae0e77b7a82ec5f58a7774d73b97bcdcee`. This manual explicitly describes 0.0.26 candidate94197fc8, so 0.0.25.1 source controls every taught action. The same commit's docs/manual.html is an older FM-1 manual with statements that conflict with the current source (for example EDIT white keys still writing steps). **Do not use that HTML as the SMK teaching authority.**

Relevant pinned source copies (original repository paths):

| Evidence copy | Repository path | Git blob |
|---|---|---|
| ui-79280e76.c | firmware/src/app/ui.c | 9c435dc3475d6b8d6d1cfe109453995002f67055 |
| smk_input-79280e76.h | firmware/hal/smk_input.h | ab3ffe4551e7fe0c37522bd2b63d9a712838607e |
| main_fm1-79280e76.c | firmware/src/app/main_fm1.c | 166f3e57bb4a6c78f3074d9360c6bcfea87adc0d |
| panel-79280e76.c | firmware/src/app/panel.c | 60ca44f92557d8682227cdfe5d1ccd1e5c1bac54 |
| lcd-79280e76.c | firmware/src/lcd.c | 9d5381fb892f0503dd2cbab102b6b770a67454a7 |
| drum909-79280e76.h | firmware/src/dsp/drum909.h | ddaa4fc3e28e7b44108b2f99796f8e8d65a1ab60 |

## Diagram geometry and orientation

The v2 `provenance/panel_smk.rs` is the exact #899 renderer evidence already consumed by v2, blob `c35f93737f3fc2d892a3ad1e96e56cc418036f3c`, SHA256 `915f6169e8b225673f3826bba2dc85299296f5a6a005d97094f8057026a45632`. Its `pads()` (lines50–53) establishes hardware indices0–7 **top** row,8–15 **bottom**, each row left→right. The pinned firmware independently confirms this physical orientation in lcd.c194–197, and smk_input.h96–104 describes a unit pad test. Orientation is established, not guessed from generic keyboard art.

Renderer1920×880: pads `x=784+89*(p%8), y=236+98*floor(p/8), w=h=76`. Keyboard starts `x=47,y=584`, white pitch83px, white width79px and height272px; black width50px and height172px. Full physical keyboard IDs0–36 = C3..C6. F3 is physical ID5, the **fourth white key from the left**. Active sequencer keybed is F3..G5, not all37 keys. Grey out the outer10 keys on step diagrams.

The captured panel `pro-reset-panel.png`882×405 is a scaled rendering of that panel. I visually inspected it and the exact481×480 four-kick LCD. Do not label the panel a hardware photograph. Source coordinates scale by882/1920 and405/880 respectively if used as overlay guides.

## 909 SEQ: rows are tracks, columns are time

Prerequisite visible header: **909 SEQ**. Pads are a2×8 bank of **steps**, not drum-track selectors. A black key selects a drum row; the pad or white key then edits that selected row. ui.c73–83,3167–3187,3730–3738; drum909.h23; main_fm1.c1987–1994.

| Active black-key number (left→right from F#3) | Pitch | Full physical key ID | 909 screen row top→bottom |
|---|---|---|---|
| 1 | F#3 | 6 | BD — bass drum |
| 2 | G#3 | 8 | SD — snare |
| 3 | A#3 | 10 | LT — low tom |
| 4 | C#4 | 13 | MT — mid tom |
| 5 | D#4 | 15 | HT — high tom |
| 6 | F#4 | 18 | RS — rim shot |
| 7 | G#4 | 20 | CP — clap |
| 8 | A#4 | 22 | CH — closed hat |
| 9 | C#5 | 25 | OH — open hat |
| 10 | D#5 | 27 | CR — crash |
| 11 | F#5 | 30 | RD — ride |

The bottom AC row is the shared accent lane, not a twelfth black key. Hold **CHORD**, then tap a step to toggle that step's accent (ui.c3254–3259). Accent applies to every drum on that step. Do not depict AC as a separately selected drum.

| White step1–16 (active F3..G5) | Pitch | Full physical key ID | Hardware pad (human numbering1–16) | Pad position |
|---|---|---|---|---|
| 1 | F3 | 5 | 1 | top1 |
| 2 | G3 | 7 | 2 | top2 |
| 3 | A3 | 9 | 3 | top3 |
| 4 | B3 | 11 | 4 | top4 |
| 5 | C4 | 12 | 5 | top5 |
| 6 | D4 | 14 | 6 | top6 |
| 7 | E4 | 16 | 7 | top7 |
| 8 | F4 | 17 | 8 | top8 |
| 9 | G4 | 19 | 9 | bottom1 |
| 10 | A4 | 21 | 10 | bottom2 |
| 11 | B4 | 23 | 11 | bottom3 |
| 12 | C5 | 24 | 12 | bottom4 |
| 13 | D5 | 26 | 13 | bottom5 |
| 14 | E5 | 28 | 14 | bottom6 |
| 15 | F5 | 29 | 15 | bottom7 |
| 16 | G5 | 31 | 16 | bottom8 |

Source: smk_input.h56,96–104,121,476–493; ui.c73–83. The screen has **one horizontal16-column row**, so physical pad bottom-left (pad9) maps to screen column9, not screen row2. Every fourth column has a small visual beat gap (ui.c5435–5436). For native240px LCD the first column x27, each advance13px plus1px per4columns. Drum row rectangles start at native y21+11*v (ui.c4625,5438–5477); BD v0; CP v6; CH v7. Use outside-image annotation if highlighting the captured screen; keep the LCD pixels unchanged.

**Gesture semantics:** On an empty selected step, press turns it on immediately; release keeps it. On an existing step, press/release shorter than300ms turns it off on release. A hold300ms or longer keeps it for editing. This matters for animation: show a complete press→release, not a held highlight advertised as erase. ui.c3224–3270. Pressing a black key selects its row immediately and auditions while stopped (default KEY SOUND STOPPED); while playing, selecting is silent unless REC is on or KEY SOUND ALWAYS is configured. ui.c3167–3187. Selection is an orange-backed row label; hits on the selected row are brighter orange, others dim; white inset marks a hit at the playhead. ui.c5448–5477.

## Safe entry and musical event order

Fresh runtime initializes 909 SEQ (ui.c8530–8538). After a saved project, previous musical contents can be loaded; do not promise an empty hardware pattern every boot. A short honest task can use the supplied empty captured run as the example prerequisite.

1. If the left chip says **LP**, press KNOB BANK **once**, on press, to leave clip mode; source toast `LP OFF` (main_fm1.c2094–2118). No accepted LP capture exists.
2. If in a list, PATCH backs out; in a question PATCH cancels. Release held controls. Press/release SEQ to return to steps. Turn **K3 counterclockwise until909 is selected** (909 is clamped first in part order); this works without guessing current part or click count. If a list is still open, K3 edits its value, so close it first. ui.c3930–4005,4033–4038,4505–4530.
3. Verify **909 SEQ**, default page steps1–16. OCTAVE− returns toward the first16-step page; OCTAVE+ advances16–32,33–48,49–64; header shows range when length>16. (ui.c4085–4100,5400–5405). Do not claim page1 when the visible range says otherwise.
4. Press/release F#3 (active black1) to select **BD**; selected row label is the immediate source-defined feedback. No intermediate selection capture is supplied.
5. Tap/release Pad1, then5, then9, then13, or corresponding F3,C4,G4,D5. They map to **BD row columns1,5,9,13**. Existing hits may toggle off, so tell the musician to start with empty positions; tap again to remove an unwanted hit. The final four-hit captured LCD exists; intermediate captures do not.
6. Press SEQ PLAY to start; press again to stop. It acts on press, not release (ui.c3943–3955). Supplied independent capture demonstrates **one** kick at step1 playing, not the four-kick pattern playing.
7. Optional next musical layer: choose G#4 (black7) for CP, tap steps5+13; choose A#4 (black8) for CH, tap steps3,7,11,15. These gestures are source-backed; no supplied capture shows their result, so display a labelled diagram and explicitly state screen result not captured. Do not mutate the authentic four-kick LCD to depict clap/hat events.

## Same controls, changed jobs

| Mode / visible target | Pad layout and job | Keybed / feedback | Teaching evidence limits |
|---|---|---|---|
| 909/808 SEQ | Top1–8, bottom9–16: steps on selected drum row. | Black keys pick track; white keys columns. OCTAVE pages groups16. | Authentic909 BD frames exist.808 source only. |
| 909/808 PARA (sound) | Same pad→white map, but white/pad press auditions selected drum; **does not write hidden steps**. | Black keys select sound. Footer BLACK: SELECT / WHITE: SOUND / SEQ: STEPS (or KEY SOUND OFF). K5–K8 change visible sound controls. | No supplied SOUND capture; describe as source-based guide without a fake LCD. ui.c3730–3738,6701–6707. |
| HOME | Top1–8, bottom9–16: patterns in current bank. OCTAVE switches1–16/17–32. | First5 black keys mute parts in **909,808,BREAK,CHICAGO,MIAMI** order. White/pad picks all-part pattern; two white keys form chain. Not drum steps. | No HOME capture. ui.c3653–3670,3709–3722; PART_ORDER ui.c100; main_fm1.c1987–1994. |
| SONG | Top1–8, bottom9–16: assign pattern to selected song bar, advance selected bar. | Black1–5 toggle that bar's parts in display order. | No SONG capture. ui.c3650–3670. |
| MIX:909 / MIX:808 | Top1–8, bottom9–16: selected kit's steps remain editable. | Black selects channel/track; PATCH+black mutes. | No MIX capture. ui.c3691–3719. |
| Bass SEQ, REC off, FREE PLAY off | Top1–8,bottom9–16: step columns in piano roll, not drum-track rows. | Hold a step: K5 note,K6 gate,K7 accent,K8 slide; K2 chance,K3 velocity. | Authentic CHICAGO/MIAMI sequence endpoints exist; no held-step capture. ui.c1452–1468,3357–3400,4505–4519,4581 onward. |
| Bass REC keyboard | Row order changes: **bottom1–8 alias the physical F3 G3 A3 B3 C4 D4 E4 F4 keys; top1–8 alias G4 A4 B4 C5 D5 E5 F5 G5**. These are physical-key equivalents, not a promise of played pitch: ui.c3269 computes sounded MIDI note41+relative-key+12*octave (default octave0 makes the first pad F2). They play notes, not steps. | REC changes SEQ→SEQ KEYS. White/black keybed notes; on SEQ with REC stopped each key writes next step; while playing live notes record. | Source-defined mapping and behavior; no REC keyboard screenshot. main_fm1.c1987–1994; smk_input.h96–121; ui.c3321–3352. |
| Miami FREE PLAY on SEQ/PARA, REC off, clip off | **Top8:1/2,1/4,1/8,1/16,1/3,1/6,1/12,1/24 rates. Bottom4:TRI,DOWN,UP,SQR shapes. Bottom last4 empty.** Pads select modulation function, not notes or steps. | 37-key keybed plays notes without writing. Footer KEYS:PLAY and PADS:RATE value. Selected rate/shape pads lit; other valid choices dim. | Source contract only; exact FREE PLAY visual not supplied. ui.c4130–4195,4213–4228,6717–6724,8497–8502. This route is compiled under BOARD_SMK37 && X0X_DEV_WOBBLE && X0X_ORIGINAL_SYNTH; do not promote source-only mode as captured qualification. |
| Loopy clip mode (LP) | Dedicated clip viewport mapping; Loopy row0 is physical bottom row. It is not a909 step layout. | Keybed routes external MIDI; ordinary key_event returns before drum/step logic. | No accepted LP capture. Do not draw a guessed clip grid. main_fm1.c839–857; ui.c3621–3630. |

The `SMK_PIANO_NOTE` two-row white/black piano table in smk_input.h102–105 is **not sufficient evidence of an active piano layout**: inspected pinned main_fm1.c only clears `smk_pad_piano`, never enables it. Do not teach that dormant table as a normal layout. Do not say all synth modes share one pad behavior.

Elite/Pro: the inspected control paths use common BOARD_SMK37 and common maps, not separate Elite/Pro mappings. The pinned manual40 confirms the controls do not differ; USB/Bluetooth names differ. The accepted909 final LCDs are byte-identical across models. No invented model switch in the guide; physical model still matters for installer package choice. This research did not test either physical unit.

## Save and recovery where relevant

Use printed **BT** for Save, **PATCH+SEQ REC** for Undo, **PATCH+SEQ PLAY** for Redo. Stop playback and turn REC off, release notes, then short tap BT (<250ms). A long hold enters copy/HELP behavior; do not animate a hold as save. Source ui.c1885–1886,1980–2018,2245–2273,3943–3960. Save can queue with SAVES WHEN STOPPED / SAVES WHEN QUIET / REC OFF TO SAVE. Only SAVED is completed feedback, not UNSAVED or the BT light. Actual hardware save outcome is not established by emulator browser-flash save/reload frames. No supplied screenshot shows firmware BT save toast; use concise source-backed text without inventing one.

## Authentic frames and animation boundary

Consumed v2 capture report and manifest plus visually inspected exact empty panel and four-kick LCD. Accepted immutable frames:

| Frame | Actual demonstrated state | SHA256 |
|---|---|---|
| pro-reset-panel.png | empty909 BD,stopped,P1,125BPM,16 steps,1/16 | db93085e6ca96bc22e7ec95fb6d983aca6d7692a48c88a4e7fc0dff5d8deb605 |
| independent-qa-pro-playing.png | oneBD step1 playing, exact Pad1 id0→SEQ PLAY id53 | 7236b2080365a1e3e4eb9c2d5a93556a47fb606be3964e27ebb39cf21c5bbbef |
| elite/pro-909-lcd.png | fourBD hits1,5,9,13 stopped,UNSAVED | fef772cb92a8c347ff0dcec8a04de1a21d40cfcf39cda6fb6599a69c5f9b2973 |

They are **separate recorded runs**, not a continuous film. Independent one-hit event order is pad0 down/up,button53 down/up,capture,button53 down/up. Four-kick accepted source test uses analog pad indices0,4,8,12,value700 then0,100ms hold/150ms gap,after actual909 header guard. A truthful teaching animation can move a hand/halo on the original physical-control diagram, reveal source-backed external row/column labels, then show unchanged final capture labelled as a separate recorded example. Do not animate LCD cell response or draw missing intermediate states. Keep animation transport distinct from physical SEQ PLAY. Owner requests play/pause/repeat/step with a manual reduced-motion equivalent; source evidence constrains what may be animated, not those website controls.

No firmware/emulator source edit,rebuild,device action,external message,publication,deployment or denied-export retry was performed. Full live realtime acceptance remains NOT_PASS; these are recorded emulator outputs. Missing captures constrain visual claims but do not block an honest annotated lesson.
