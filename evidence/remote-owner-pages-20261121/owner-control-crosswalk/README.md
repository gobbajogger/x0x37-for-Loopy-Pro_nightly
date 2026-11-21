# Owner control comparison

The owner PDF has thirteen desktop drawings at 1440 × 900, seven landscape drawings at 844 × 390, three portrait drawings at 390 × 844 and one evidence appendix. The comparison uses the actual PDF, SHA-256 `db826c9cbeb84971f2d030c847043a21749ad4172e30739773494df0c9acca17`, including controls whose labels are drawn as outlines. The eight written corrections supersede the proposed raw Chicago list, old JUNO controls, wave percentages, tool modes, selected-note inspector and separate phone design. [Owner PDF](../../../docs/design/OWNER-BASELINE-1836.pdf) · [Owner corrections](../../../docs/design/OWNER-BASELINE-1836-NOTES.md)

[Control index](controls.tsv) lists 996 drawing controls, readouts and appendix entries. Join the third column to the first column of [mappings](mappings.tsv) for the action’s Remote route, status and limits. Each knob or paired decrement/increment is one logical parameter. Repeated drum steps, pattern pads, mixer strips, authored song-row fields and workspace controls have separate rows. Each named old JUNO field points to the owner’s replacement instruction. A route means a corresponding destination exists. A Draft edit changes local data. An open item identifies an absent operation or an unavailable signal. Counts measure the comparison’s coverage, not the number of inputs actuated.

At `944e99d8`, all 79 retained screenshots matched their inventory SHA-256 and native dimensions. All 23 page-to-state mappings matched their recorded image hash and control count. The 61 desktop, 15 landscape and three portrait states accounted for 4,815 mounted and 4,355 enabled presentations. Of these, 2,755 enabled controls received the center hit at their captured scroll position. [Retained page comparisons and replay procedures](../../remote-qualification-944e99d8/owner-page-review.md) · [Historical per-control observations](../../remote-qualification-944e99d8/control-inventories.json.gz)

At `242f0189`, the stock instrument still lacks qualified per-part position, pattern queue at wrap, comprehensive parameter readback and complete project transactions. The drawings also include per-strip peak, mute, solo and gain-reduction controls without corresponding qualified signals or actions. The 844 × 390 drum grid shows three rows by eleven complete steps next to Sound; page 15 draws six rows by sixteen. Exact identification of the previously approved 17:00 glyphs and joint cross-surface approval remain open. [Page 15 measurements](../page-15-step-widths/review.md) · [Exact-head qualification](https://github.com/gobbajogger/DnBOX-nightly/pull/169#issuecomment-7063279830)


## Fresh Chromium comparison

The full 303-file build at `242f0189af17d7c48b3b7274dea064a84dbc6664` supplied all 26 browser states. The walk used bundled Chromium 151.0.7922.34 with its normal sandbox. All 23 product pages have a screenshot at the PDF page’s native viewport. Page 5 includes both engines, page 11 includes Slices and Generator, and page 13 includes Review and Connect. All captures had zero page errors and zero horizontal body overflow.

| Viewport | States | Mounted | Enabled | Enabled center hits |
|---|---:|---:|---:|---:|
| 1440 × 900 | 16 | 903 | 822 | 722 |
| 844 × 390 | 7 | 524 | 476 | 272 |
| 390 × 844 | 3 | 134 | 118 | 97 |
| Total | 26 | 1,561 | 1,416 | 1,091 |

Center hits report the element under the middle of each control’s box at the current scroll position. The separate exact-head landscape inventory covers 131 states. Underlying per-control data here includes accessible labels, values, geometry, disabled state, screen hash and hit observations. [Browser inventory](browser-controls.json.gz)

[Pages 1–4](pages-01.webp) · [5–8](pages-05.webp) · [9–12](pages-09.webp) · [13–16](pages-13.webp) · [17–20](pages-17.webp) · [21–23](pages-21.webp)

The page 11 change adds Step locks and Review draft to the BREAK toolbar. A musician can go directly from Slices or Generator to the selected pattern’s sixteen Level locks, edit a step, inspect its exact change and return. Reopening the exported Draft restores the Notes editor and selected lock lane. Before the empty-pattern sizing correction, the pointer/file journey exercised the same P03 step-8 edit at all three sizes, read −0.1 dB, verified Undo and Redo, reopened the saved Draft and cleared the override. All fifteen toolbar button presentations returned a center hit. These actions used the Draft application identified in the receipt. The first post-sizing pass completed the desktop journey and the landscape edit, review, Undo, Redo and export. Its next Slices click exceeded Playwright’s 30-second action deadline after the element passed the enabled, visible and stable checks. An unchanged repeat timed out locating the Patterns tab during setup. Both failures remain recorded. A subsequent replay of the unchanged corrected application passed the complete pointer, keyboard and file journey at all three sizes. At each size it verified focus, the sixteen step controls at 1×, the −0.1 dB edit, Review, Undo, Redo, export, reopen and clearing the override. Six captures and their control observations are in the browser inventory under `correctedBreak`.

The first implementation kept the hidden roll’s 1,400 px fallback width when an empty pattern opened at 1×. At 844 × 390 this left seven complete cells in the 660 px pane, and ordinary scrolling could clip the leftmost partial cell’s text. Recomputing the width from the visible roll preserves the selected zoom and shows all sixteen cells at 1× on desktop, landscape and portrait. The separate focused DOM and keyboard check measured eight complete cells at 2×, verified the selected control and observed edit/Review/Undo/Redo at each size. [Original and corrected browser images](break-locks-844.webp) · [Build hashes, before/after geometry and interaction results](break-journey.json)

To reproduce, build the product in the checkout, then run `python capture.py CHECKOUT OUTPUT` for the page inventory and `python capture.py CHECKOUT OUTPUT --break-journey` for the edited BREAK workflow. Run `python check_axis.py CHECKOUT OUTPUT` to reproduce the independent three-size 1×/2× geometry and keyboard-event comparison. Each script uses Playwright’s bundled Chromium and a local HTTP server. The browser test in `tests/product-remote/pattern_lock_journey.py` also covers the new route as part of the normal suite.

## What changed across the drawings

| Page | Observed in the fetched build | Difference from the drawing or remaining work |
|---:|---|---|
| 1 | Bass A green notes, beat/step grid and a single velocity lane | Gestures replace four tool buttons and the selected-note inspector. The trace starts at a fixed marker. |
| 2 | 909 voice and Accent rows alongside the editable Sound pane | Fields show firmware units. Bass-drum Tune is 13 ms. A general per-voice stock step lock is unavailable. |
| 3 | The roll and MIAMI Wave Motion grid appear together. A header picker exposes Chicago lock targets. | The default Motion point and the pictured Chicago Cutoff lock are distinct. The drawn numeric Start/End inspector is superseded. |
| 4 | Chicago groups its oscillator, filters, envelope, amplifier, arpeggiator and effects | The written correction removes the duplicate raw list. Wave has its source selector name. |
| 5 | The Miami and SuperJ6 captures each show one selected engine. SuperJ6 exposes layer controls and three LFOs. | The drawing presents two panels together. Its old JUNO fields were superseded by the actual SuperJ6 map. |
| 6 | Five labelled level faders, Sound destinations, four master macros and additional Draft controls | Five part meters and the ten independent Mute/Solo controls remain open. |
| 7 | Separate Master destination with Drive, Comp, Pump, Filter and twelve additional Draft controls | The captured Draft has Comp 75% and Pump 4.0 dB. Gain-reduction history lacks a qualified signal. |
| 8 | Four Reverb fields, four Delay fields, ten sends and Tape Wear | Decay uses 62% feedback. The pictured independent Delay type action and Tape activity are absent. |
| 9 | The selected part has a 4 × 8 bank with a Song route | The initial capture has no selected pad. Cue at wrap, copy/paste/clear of pattern content and chain bounds are open. |
| 10 | One authored five-part row with five pattern fields, five On switches and a repeat field | Additional rows are explicit authoring actions. The reference draws four empty Choose rows. |
| 11 | Sixteen slice fields, two loop selectors, rate, Generator and five sample-selection/preview pairs | The change under review adds direct Step locks and Review. A genuine BREAK free-motion route remains open. |
| 12 | Three project cards, original-preset actions, session changes and a DAW guide | Stock complete-project transfer and provider-executed MIDI export remain open. |
| 13 | Separate Connect feedback and local Review dialog | The PDF puts both side by side. The stock device cannot perform Read latest/Compare on this revision. |
| 14 | Landscape notes occupy the gesture roll, with thin velocity lane below | The written correction replaces the right-side inspector and tool row. The selected-part running position is unavailable. |
| 15 | Both navigation banks, Accent and Review can be reached while the Sound pane stays adjacent | The first viewport has 3 × 11 complete pads at 844 px. The drawing has 6 × 16. |
| 16 | Landscape Level faders and the Master panel use the shared Mix controls | No per-part peak, Mute or Solo. Some controls need vertical scrolling. |
| 17 | The roll shares the landscape viewport with Motion and a lock-target picker | The grouped numerical inspector is superseded. Arbitrary native lock routing is open. |
| 18 | Six 909 kick fields, including pitch depth, plus/minus actions and source-frame navigation | The sixth field edits Velocity sensitivity. The drawing’s separate Accent gain has a different firmware address. |
| 19 | Selected P01, all 32 selected-part pads, scope toggles, Song and Review | Pattern clipboard, cue-at-wrap and chain bounds are open. |
| 20 | Three project cards plus Samples and Manual links | Original-file actions use the loaded file. Connected backup and MIDI execution still need a provider. |
| 21 | The portrait layout shares the gesture roll, green notes and thin lane | The written correction replaces phone-only styling and the tool row. No selected-part live position. |
| 22 | Portrait Gate lane and its sixteen cells remain under the notes | There is no separate Step inspector. The shared lane also offers Release, Accent and Slide. |
| 23 | The portrait Mix shows five faders and Master controls | Individual meters, Mute and Solo are absent. Remaining controls scroll below the viewport. |
| 24 | Evidence appendix | The source identifies the drawing as a proposal and distinguishes it from measured browser and hardware behavior. |
