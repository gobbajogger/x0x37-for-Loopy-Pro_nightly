# Independent project export parser review

PASS for the bounded parser/source compatibility change. No blocking code finding.

Exact reviewed candidates:
- Website `c87db70733e8261155f18a6c1b8202ddbf879a69`, tree `f3739aedffa6323be1d28a88aef6ea265bd261e5`, atop reviewed restore `1b2b687b0c572602debbe2bba4cde9dfa647f774`.
- Firmware web mirror `ad37e35dc1131c63c9eede69e5c6f83f1d64fd5c`, tree `f1258b387ea7905ab9ba14a6fd077f27ccb2b82c`, atop restore `d049682cccc31a7ce5285edaa5f968869aaef2d9`.

Only explicit portable header pairs (3,4), (3,10), (6,10) are recognized. The parser returns the actual versions without rewriting or interpreting payloads. File/project version, reserved word, payload length, caller-supplied exact receiver length and CRC guards are retained. Unknown pairs remain refused. No per-voice engine identity is inferred and no sound migration is performed.

The actual C producer evidence is bound to clean d633833a/tree442b8e3d (current 3/10) and 6ddea31d/treec61706b9 (prospective endpoint 6/10). Independently compared each pinned source tree and fixture source blobs, exact generator C/shell digests, actual generated .bin bytes versus decompressed committed JSON, raw SHA256/length, and stage/file validator-zero log digests. All match. The generator uses real project reset/capture/header functions, not edited JS header words. Synthetic sound cells explicitly do not represent historical user sounds. Full C compilation was not repeated by this reviewer; authentic producer execution receipts were verified.

Independent old-parser probe using the exact prior parseProject function rejects both actual current 3/10 and endpoint 6/10 fixtures. Both repaired parsers accept their exact bytes while still refusing nonzero reserved words and unknown pattern7. Existing whitelist, corruption and receiver-length tests pass.

The frontend stages the project and awaits firmware VALIDATE before entering sample replacement or COMMIT. Current firmware project_file_validate compares its exact PROJ_STREAM/SND revision before validating semantics, so a current stream3 receiver refuses stream6. Protocol-peer regression confirms no sample writes or COMMIT on that refusal. This is source/contract proof; actual hardware behavior is not claimed.

Independent commands (all exit0; logs/digests in commands.json):
- Website `node web/test_projects.mjs`: 33/33 PASS.
- Website `node web/test_projects_page.mjs`: 13/13 PASS (the reviewed restore stack includes six additional page contracts).
- Firmware mirror `node web/test_projects.mjs`: 33/33 PASS.
- Firmware mirror `node web/test_projects_page.mjs`: 7/7 PASS.
- Website generated preview `--check` and nightly source-provenance test: PASS.
- Both source diffs `git diff --check`: PASS.
- `node ../project-compat-review/before-after.mjs`: both real producer schemas fail before/pass after, reserved/unknown guards preserved.

Full combined npm/48-edge author evidence was inspected through its recorded digest, not rerun or represented as independent execution. No GUI/headless action, source modification, commit, native build, device operation or merge was performed. A prior headless denial was not rerouted. The separate recorder source remains HOLD/under repair per coordinator; known raw format proof is not REC merge qualification, native fit or device readiness.

Nonblocking documentation note sent to coordinator: the initial retained README still describes an uncommitted endpoint source and 43 edge tests, while its superseding producer-rebind/stack receipts bind clean source and combined48 tests. Clarifying that initial prose would improve evidence readability; exact final machine-readable identities already resolve it.
