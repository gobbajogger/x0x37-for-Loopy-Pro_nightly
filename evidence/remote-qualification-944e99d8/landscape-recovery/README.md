# Phone landscape coverage at 944e99d8

All 127 expected states have a unique 844×390 screenshot from sandboxed Chromium 151.0.7922.34 on `944e99d87125e60aff9e3020ead7212fb47687d6`. Each selected observation had zero recorded blocked controls. The ZIP contains the screenshots plus a manifest identifying the run, log line, metrics available and SHA-256 for each image. The ZIP SHA-256 is `85de99cf9e1ebb817814846cb48d19b46e3434f275ff0c83b4cde45fbdfcb77a`. [All 127 screenshots](944-landscape-states.zip) · [Per-state manifest](944-landscape-states-manifest.json)

| Attempt | States recorded | Enabled control presentations | Outcome | Images used in combined set |
|---|---:|---:|---|---:|
| First unfiltered traversal | 98 | 3,702 | Exited 1 with three timed-out journeys | 98 |
| Second unfiltered traversal | 32 | 1,113 | Worker interrupted before a terminal result | 11 |
| Third unfiltered traversal | 94 | 4,210 | Exited 1 on Device navigation after earlier 909 Undo and 808 Return to Sound timeouts | 5 |
| Independent recovery of the 13 outstanding states | 13 | 953 | Exited 0. All 953 controls reachable, zero page errors and zero horizontal clips | 13 |

The focused run also performed 808 Accent Undo and the authored Bass B and BREAK lock edits. The third run emitted per-state observations before failing to write its aggregate. The first three runs together documented 114 distinct names. On 21 overlapping states the number of enabled control presentations differed by one or two. No unfiltered run passed. [First complete log](../944-landscape.log) · [Second partial log](944-landscape-retry.log.gz) · [Third complete log](944-landscape-final.log.gz) · [Third-run review](944-landscape-final-review.json) · [Three-run comparison](944-landscape-union.json) · [Focused result](944-landscape-focused.json) · [Focused log](944-landscape-focused.log.gz)

For each state the combined set uses the earliest eligible observation that has a native-size PNG and zero recorded blocked controls. A terminal geometry failure for that state or recorded clipping excludes that observation. Full geometry is available for 111 states. Another 16 retain the counts and diagnostics printed to stdout. The reachability probe names an individual control when it is blocked. The separate [owner control crosswalk](../control-crosswalk.md) maps the page-by-page inventory to the owner drawings.
