# EC024 — Project Workspace port pairing

Base: `f7c3745aa1ab8859f8d5ba3966162917d881baa9`. Original test-only PR54: `a7e27925a8d1a121c14a90c7147b9b3705fc3f23`, retained as an ancestor.

The original full production page plus real `ProjectMidiLink` / `ProjectDevice` regression fails natively on that current base: 1/2 passes. A sole unrelated output receives identity and QUERY requests; queued synthetic replies on the separate X0X input can enable Reset. No physical device or destructive command was used.

The page now reuses canonical firmware PR398's unique, connected, exact-name pairing rule, both during automatic discovery and immediately before an explicit connection. Mismatched, duplicate, disconnected and nameless pairs cannot construct the link or send project SysEx. Rediscovery first invalidates the old connection. Existing recognized auto-discovery labels are unchanged; a sole uniquely matching custom label still works, and multiple distinct matched pairs remain explicitly selectable. Names are not a physical-unit serial or cryptographic identity guarantee. Renamed/mismatched ports are conservatively refused, not guessed.

`web/x0x_projects.js`, protocol parsing, transaction ordering, recovery/mutation consent and EC023 pending-connect guards are unchanged. Markup/styles, firmware catalogs/packages and other source modules are unchanged; only the generated Projects page and provenance follow the source change.

## Focused native proof

`node --test tests/edge-project-unrelated-midi-output.test.mjs tests/edge-project-connect-disconnect-race.test.mjs web/test_projects_page.mjs web/test_projects.mjs`: **72/72 PASS** (16 pairing, original EC023 3, page20, transactions33).

PR54's original wrong-output and matched controls remain; its `assert.notMatch` typo (not a Node assert API, reached only after the wrong-output assertion succeeds) is corrected to the equivalent `assert.doesNotMatch`. The unchanged original test/blob remains in PR54 ancestry and the RED evidence. Added tests exercise automatic and explicit refusal, duplicate labels, disconnected ports, missing/case-mismatched labels, known and custom matching compatibility, multiple explicit pairs, fresh-map ambiguity and stale-session removal. All fixtures are synthetic; zero hardware access.

Required `npm run build` and final `npm test`, independent native Sol review and exact tree/parent delivery receipts are recorded in the PR. No duplicate aggregate is required for transport commit metadata. Previously documented Chromium launch restrictions remain an unavailable rendered check, not a failed browser assertion; this patch changes no layout and makes no new browser/hardware claim.
