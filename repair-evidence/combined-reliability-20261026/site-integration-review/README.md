# Independent combined website integration review

Verdict: **PASS for the bounded combined website source integration.** No blocking combined-code finding.

Exact candidate6ca7fd18e9b4bbbdbd151febbe2f7f46c00c86c9, treeecbcd2b42cb5bb3f090358282b04951492656208, parents57124e472b96d01917770b55529df69cc20d94d7(project compatibility and restore integrity) and a17487fe7657d891f73ad9aa369dc8cb6b0a43d9(OTA identity). Checkout remained clean.

## Merge and producer integrity

All relevant project/restore source and tests are byte-identical to the first reviewed parent. OTA parser/tests and corrected installer identity fixtures are byte-identical to the second reviewed parent. The only resolved source conflict was SOURCE_PROVENANCE: every historical sourcePatches record from each parent remains, no duplicate JSON key exists, and every current public source blob matches the actual Git blob. The existing generator's check confirms all generated outputs, including the installer containing both repairs. The provenance/renderer contract test also passes.

Both C-generated project fixtures were independently checked against exact prior authentic producer evidence. Currentd633833a/tree442b8e3d exports3/10; frozen endpoint6ddea31d/treec61706b9 exports6/10. Each raw36428-byte file exactly matches its committed compressed fixture, SHA256, header, payload CRC, source Git tree/blobs, generator C/shell hashes and successful stage/file-validator log. No producer was recompiled. The fixture's explicit source_commit/source_tree rebind is authoritative; historical source_base text is retained history, not a claim that the endpoint source was d633. Recognition of a proven raw layout is not engine migration, REC qualification, native or device proof.

## Independently executed combined tests

- Project production functions33/33PASS, including both exact producer fixtures, explicit schema whitelist, CRC/length rejection, payload preservation, transaction/offset correlation, lost ACK handling, recovery/rollback, and firmware VALIDATE before samples/COMMIT. A stream3 receiver refuses stream6 before replacement or adoption.
- Project page contracts13/13PASS.
- Restore integrity5/5PASS: absolute logical indices/multizone identities, equal-CRC distinct origins, safe trailing omissions, no automatic restoration writes on unsafe skipped-middle migration, and fresh-backup snapshot risk recomputation.
- OTA corruption and sample-read correlation34/34PASS: malformed checksums/framing/length/version bits refused before discovery, valid contract accepted, stale/wrong sample addresses cannot consume a pending wait, and earlier timer ownership retained.
- Installer production write-boundary functions41/41PASS.
- Generated source parity and source-provenance checksPASS.

This is bounded independent execution, not another full npm/build run. Coordinator full exact-combined npm passed73edge/33project/13page. Its four recorded check-log hashes independently match the exact candidate receipt; that full run remains coordinator/author execution, not a second independent full rerun. commands.json and receipt.json contain actual argument arrays, exits, exact identities and log hashes.

## Raw-log diff exception and limits

Combined full diffcheck exits2 due only to preserved raw negative-test evidence: six original before-pr31.log whitespace lines20/23/39/42/58/61, and six lines reproducing that diagnostic in independent-review/ota-identity-site-full-diff.log2/4/6/8/10/12. Source/generated/test/provenance diffcheck exits0; diff from the OTA parent exits0. Logs were not normalized or erased, and full diffcheck is not falsely reported green.

No GUI/headless action, device/MIDI/USB operation, target build, source edit, commit, external write, publication or merge was performed. The previous headless smoke denial remains NOT_RUN with no retry/workaround. Physical stock identity compatibility and hardware behavior are unproven. Prior broader native transport failures remain open. The restore guard runs after firmware installation and before automatic restoration; trailing omissions still require backup/reconciliation and do not make missing loops playable. Separate source integration approval does not qualify firmware packages, REC migration, historical engine identity, production deployment or device installation.
