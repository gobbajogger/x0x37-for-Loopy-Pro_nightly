# EC022: contradictory sample usage cannot suppress preservation

This bounded child follows remote PR34 `b12d1183f80500765ac5c926c731ad2ebfbc7d67`,
whose tree exactly matches local reviewed `045e7ac31771f508ac9a0b4c9d1c9a4ef959313a`.
Original test-only PR51 is `75835717c0af72f9ac9e4a0f93d0cfcfdfb7e0d9`.
Its full-module regression remains byte-identical to blob
`ac0d91181591ff2614bd2501cd73ba58cc1c5b7f`.

Native Node execution of the complete frozen browser module produced one pass
and one failure: consistent usage100 KiB needs preservation when a160 KiB slot
shrinks to80 KiB at the same offset, but legacy100/extended0 incorrectly gave
an empty at-risk list. This is a synthetic unsafe decision, not observed sample
loss or a physical-device test.

The exact firmware144 producer (`firmware/src/app/editor.c:884–921`, commit
`144f4e042bdfb2cc52ed16a1cf2a26a1148a0101`) computes both fields from the same
`ceil(data_len / 1024)`: legacy saturates at127, extension retains the full
14-bit value. Empty slots emit zero in both fields. Its Python consumer already
checks `legacy == min(127, extended)`. These are source-inspected protocol facts;
no new native producer build is claimed for this change.

The browser now enforces that same equality before using an extension for
preservation decisions. Contradictions fail closed rather than guessing which
value is right. Matching usage above127 remains accepted and its full value
still drives `atRisk`; genuine extension-free legacy replies are unchanged.
Existing range/overlap, header/capacity, retained-backup and completion checks
remain intact. A changing producer snapshot may be refused safely and retried,
not silently interpreted as a smaller occupied sample.

Original and supplemental tests pass7/7. Supplemental cases cover producer-field
agreement through512 KiB, saturation boundaries, contradictory high/low values,
empty descriptors, genuine legacy, standalone backup and actual installer
refusal before sample commands, save/progress or OTA. The installer closes its
link; a stock identity cannot waive an inconsistent reply. The affected
preservation/backup/migration/SMP_INFO group passes79/79.

Final exact-child review/test receipts are recorded separately by the source
owner. Same Sol ledger round5 is justified only by this newly evidenced potential
data-loss blocker; the budget is not reset. No hardware/sample action, private
inputs, native firmware changes, merge or publication is part of this repair.
