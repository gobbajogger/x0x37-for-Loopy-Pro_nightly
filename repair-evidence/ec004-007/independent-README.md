# Independent combined source review

Verdict: PASS for the bounded EC004–007 browser source repair. No blocking finding.

Reviewed final source commit `e4e3d42c3573e73629c03b0a1dd819bc47c80c7e`, tree `ac86bbf18049f53cc30274d0b56f3f84fa13dcd9`, against base `2b11200c8cc69b7f80d8cd2ccef968adb6cc3a75`. Initial review at `b10885a6ff28458470c836470d6c861a41829517` was carried forward after inspecting the wording-only follow-up and regenerated docs/provenance. Reviewer did not implement source or author the committed tests.

The archive parser validates contiguous slot-owned image ranges, complete payload consumption, strict empty descriptors, header/data CRC, sample-zone bounds, and display metadata agreement. The restore event handler calls readArchive before confirmation, planning, and any writeImage call. Legitimate all-empty, interspersed-empty and multi-zone archives are covered. The independently executed actual Python make_archive compatibility probe preserves two populated slots around an empty middle slot, differing original slot sizes, odd ADPCM sample counts and 22050Hz metadata. Probe source is `python-archive-compat.mjs`; it imports current owner-local tools/x0x_slots.py with Python bytecode writes disabled and uses only synthetic bytes. Its initial fixture had an incorrect zone index field initialization; correcting that test fixture produced the recorded PASS, without source changes.

SMP_READ transport correlates the firmware-confirmed slot + three offset bytes before consuming the pending request or clearing its timer. Wrong-offset/wrong-slot/truncated/unterminated replies leave the valid wait intact. Same-address retry replies remain acceptable, in-order/high-offset/odd-final-pair reads pass, and PR26 failed-send timer ownership remains unchanged. Examined current firmware editor.c envelope and slots.c zone scanner as read-only compatibility evidence. Comprehensive wire-encoding validation beyond this address-correlation repair remains outside this review.

Independent final-source commands (all exit 0):
- `node --test tests/edge-*.test.mjs`: 43/43 PASS.
- `node scripts/build-preview.mjs --check`: generated source parity PASS.
- `node ../review-evidence/python-archive-compat.mjs`: actual Python writer → browser parser PASS.
- `git diff --check 2b11200..HEAD`: PASS.

Exact environment, command argument arrays, exits and log digests: `receipt.json`. Logs are local evidence in this directory. The coordinator owns complete npm/browser validation and Git delivery. No GUI, hardware, flash, publication, production readiness or native firmware build claim is made. No source, index, commit or branch mutation was performed by this reviewer.

## Browser harness follow-up

Independent review PASS for test-only mock corrections, inspected against source candidate `e4e3d42c3573e73629c03b0a1dd819bc47c80c7e`:
- tests/browser-admission.py blob `12bb25e84984f0cfb94ebb33aa13e826445368e9`
- tests/bundled-browser.py blob `186679c02c96d25e80d5180596f1460419ea2817`

Existing production midiAccess caches a successful access object. run() awaits a post-install scan that calls midiAccess again. The original mocks incorrectly treated that cached call as another permission prompt or held a new unresolved permission Promise. The repaired doubles preserve first-grant control and denial retry, cache only successful grants, and explicitly assert denied retry prompts twice while interrupted retry retains one grant and performs its second install. Existing install counts, exact logical bytes/product, single-writer, negative-admission and pre-MIDI refusal assertions remain. Fixed 30ms lock-release sleeps become waits for observed completion. No production source change or safety assertion weakening was found. Python in-memory compile and git diff --check passed.

The triage worker independently reproduced the old failures against unchanged baseline. Its bundled-after log records 61/61 PASS. At this review, admission execution is still RUNNING in its receipt; final browser execution belongs to the coordinator and is not inferred from source review. This appendix is coverage review approval pending the actual browser executor result.
