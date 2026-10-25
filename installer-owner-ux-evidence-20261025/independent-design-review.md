# Independent design review

Reviewer: `/root/design_review`, separate read-only design assessment. Reviewed the actual task96 after screenshots, the edited HTML source, the first candidate screenshot set, and all six populated `previews/published-{firmware,samples,projects}-{1280,390}.png` renders. Findings are from rendered pixels and source, not acceptance-test assertions. Guidance: Impeccable 4.7.0 Operate, critique and distill plus Vercel Web Interface Guidelines. No Impeccable runtime, detector, hooks or binaries were installed or run, per the owner's restriction. This is a manual design assessment; it is not hardware or functional proof.

## Prior regressions and resolved design findings

- Firmware: the initial empty-catalog message was repeated in the picker and bold status, followed by an oversized safety sidebar. The revised design presents the selected task plainly, keeps the backup/data-loss warning beside installation, and demotes recovery/history to secondary disclosures.
- Navigation: the mobile Build details link competed with Songs & projects in the same task group. The revised top navigation presents only the three requested tasks with consistent treatment and an explicit current underline.
- Samples: the old page placed several dense explanatory paragraphs before Connect. The revised page gives Connect early prominence and retains the slot/removal/backup warning beside Send. The misleading FM-1-only empty state now refers to the keyboard's slots.
- Projects: Export originally followed the destructive Reset section. Export now precedes Save/Load/Reset, with reset scope, retained samples/roles, stop conditions and autosave implications still visible. Desktop paragraphs have a reasonable reading measure.
- Shared guidance: duplicate capability prose is collapsed; Closer look is followed by an explicitly titled, visible Setup section on all three routes. The standalone, SMC and Loopy steps remain useful and do not require opening a tiny top hyperlink.
- Feature pictures remain sharp, faithful square screen vectors. Raw reference SHAs are confined to optional provenance. The SMC picture has a visible Upcoming UI / not in offered builds label.
- The first revised Samples render accidentally left all content flush against a rounded outer border. The final set removes that border and aligns the workspace with the page, resolving that specific containment regression.

## Findings raised and verified after repair

1. **Resolved P2 — Samples residual iframe strip.** The first populated 1280 render had a 158px empty, contrasting rectangle below Loop playback & file tips (approximately x90–1190, y772–930). The final `final-samples-1280.png` removes that dead area by allowing the frame to follow content height. A narrow divider remains but no unfinished large card or obstructed content is present.
2. **Resolved P2 — Design-preview status never finishes.** The first populated firmware render said “Checking this package for its matching included Bluetooth controller…” despite disabled downloads. In `final-firmware-390.png`, the status explicitly says controller verification is disabled in the design preview. This is clearly scoped to review; the rendered candidate still shows hardware-untested consent and disabled installation.
3. **Resolved P3 — Source-preview empty-state recovery.** The first empty-source message referred to a published installer in plain text. The source now supplies a real published NIGHTLY installer link, making the intentionally empty fixture actionable.

Final pixel disposition: **acceptable reviewed design candidate**, with no remaining blocking hierarchy/copy/navigation regression found in the inspected sizes. This is not a blanket quality guarantee or a claim about uninspected states.

No additional hierarchy, navigation or copy regression was found in the final Projects desktop/mobile pixels. The final firmware page is longer with a real catalog because model choice, DEV/hardware-untested consent and installation warnings now actually render; their presence is useful, not redundant filler.

## Limits

Reviewed 1280px desktop and 390px mobile screenshots and corresponding HTML. Keyboard behavior, focus contrast measurements, narrow 320px reflow, device guards and offline import behavior belong to the separate browser/functional assessment. No device operation was performed. No guarantee of a flawless UI is made. Questions skipped: the owner already gave a concrete remediation brief and authorized implementation.
