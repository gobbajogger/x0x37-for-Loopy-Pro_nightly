# Sample archive and MIDI repair proof

Reviewed implementation: `e4e3d42c3573e73629c03b0a1dd819bc47c80c7e`, tree `ac86bbf18049f53cc30274d0b56f3f84fa13dcd9`, against site main `2b11200c8cc69b7f80d8cd2ccef968adb6cc3a75`.

EC004–006 reject overlapping, hidden, false-empty or misleading backup descriptors before confirmation/planning/writes. Valid browser/Python archives remain readable. EC007 matches the firmware slot and three offset bytes before a pending read can consume a reply. No packet-format change was needed.

Native `npm run build` and complete `npm test` pass, including 43 edge regressions now included in the normal command. `baseline-edge.log` executes the same final tests against unchanged main and records expected failures; `npm-test.log` records the repaired result. Original PR27 archive tests are preserved. The old PR25 delayed-read fixture always echoed offset0 and omitted eventual correct data, so firmware-faithful replacement tests exercise real extracted page functions and provide proper positive responses.

All repository headless Chromium suites pass after independently reviewed test-fixture repairs:
- admission679/679; bundled61/61;
- history34/34; workspace29/29;
- presentation106/106; project workspace63/63.

Original two-suite failures are retained in `*-before-fixture-repair.log`. They were reproduced on unchanged main: stale mocks requested MIDI permission again during post-install scan, while actual midiAccess caches a successful grant. `browser-fixture-triage.md` and receipt record the focused baseline proof. Corrected mocks preserve one-write/single-writer/refusal checks and explicitly distinguish denied permission retry from cached access after interrupted installation. Completion assertions wait for actual completion.

An independent worker implemented neither source nor committed regression tests and reviewed the complete repair. `independent-README.md` and `independent-receipt.json` preserve that review and the later browser-fixture review. Its original local probe paths are historical execution locations. The portable synthetic `python-archive-compat.mjs` uses X0X_SLOTS_PY for the corresponding firmware Python module; coordinator executed this copy successfully too. No private data, sample backups or binary build inputs are included.

This is website source and headless simulated MIDI proof. No physical MIDI, flash, native firmware builds, model/package qualification, live Pages publication or production promotion was performed. Generated pages are source artifacts only. Existing bass/SMC/firmware integration obligations remain separate.
