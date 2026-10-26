# EC021: bound occupied sample reads by actual slot capacity

This is a distinct local child after frozen source
`094aa3227c0bf512c71f7e0449361cf9886a6223` (tree
`0e791b9fc21feebdfce9ccbdac9d5fda87c2d2a8`). Its exact prior test/review
receipts remain separate from this new change.

Test-only PR50 is `d143ba139f43322ce5bb1cc2a03a6333a58001c9`, based on
`d8660c2caf01f67ca07628fef7a8489570ccb96a`. Original regression
`tests/edge-occupied-oversized-data-length.test.mjs` remains byte-identical to
blob `75369330d46d0f2648b97a8d577b054945f27aa3`.

Running that test against the complete frozen production module gave 1 pass and
1 failure: a valid 128-byte sample returned its 640-byte image, but an occupied
80 KiB slot header declaring 2 MiB caused a data request at offset 512 instead
of rejecting first. Separate full-module execution in an isolated JavaScript
realm intercepted attempted numeric buffer allocations of 81,409, 2,097,152 and
4,294,967,295 bytes. The allocation sentinel prevented large allocations;
this is evidence of an unsafe request, not actual browser OOM or sample loss.

`readSlotImage` now accepts an appended capacity argument after its existing
progress callback. Standalone legacy calls retain the 80 KiB default. The two
production layout-aware callers, backup and post-restore readback, explicitly
pass `slotSize(layout,k)` from their observed layouts. Invalid explicit capacity
is refused before reading even the fixed header. A valid parsed occupied header
must satisfy `dataLen <= capacity - 512` before the data buffer is allocated or
any sample-data request is sent. Existing empty-slot, CRC, invalid-header,
retained-backup, range and installer completion guards remain intact. Projects'
separate already-bounded reader is unchanged.

The supplemental full-module suite covers exact-fit and one-byte-too-large
images at 4, 44, 80 and 112 KiB, invalid capacities, progress callbacks, empty
slots, mixed extended layouts, genuine legacy layouts, and fresh destination
capacity during post-restore readback. The restore test deliberately observes
readback after simulated authorized writes; it does not claim a new prewrite
restore guard. The actual preflash caller refuses oversized occupied backups
before save/progress/sample writes/OTA and closes its link.

The combined original and supplemental regressions were 3/12 before the fix;
all 12 pass after. The affected sample-preservation/backup/migration/SMP_INFO
group passes 72/72. Final immutable-child aggregate and independent review
receipts are recorded separately by the integration owner. The same Sol ledger
extends from three to four rounds for this newly evidenced data-safety blocker;
it is not a fresh review budget.

Only synthetic bytes and fake MIDI are used. No hardware/device action, private
samples, native firmware change, rendered-browser claim, firmware/catalog
publication or remote PR mutation is included. Earlier denied remote delivery
remains paused; this local source repair does not authorize a retry.
