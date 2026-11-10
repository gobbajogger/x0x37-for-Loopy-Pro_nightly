# UNREVIEWED · DEVICE NOT TESTED — 0.0.25 candidate (SDK V1.2.14) D6-N preview

Title: UNREVIEWED · DEVICE NOT TESTED — 0.0.25 candidate (SDK V1.2.14) D6-N preview

Label: UNREVIEWED · DEVICE NOT TESTED — 42de2893

Description: UNREVIEWED · DEVICE NOT TESTED — D6-N preview: host 348 ok / 0 FAIL / 2 NOT_RUN (drum909/drum808 ok in target-gaps-donors). Device NOT_RUN (no device testing performed or authorized for this local package). Not a publish.

KNOWN LIMITATION 0.0.25: Note On accepted in the same drain as PANIC is silenced (≤1 drain, ~11.6 ms; engine.c:1747, panic_order_test.c:214-216).

hardware_tested=false. Local evidence only; NOT a publish. Source 42de2893 was ACCEPTED by Watchdog as the 0.0.25 NIGHTLY source (/workspace/dnbox/integrator-auth-42de2893-nightly-prep.md; exact-tree receipts on #832: Build 6761306711 (+6762228042), GV 6761340243, QA2 6762206467/6762552941, QA 6762878873). This evidence package itself is UNREVIEWED. No source edits, push, PR, GitHub post, protected ref update or publish was made by this measurement.

## Source and freeze checks
- Source `42de289338e3fb718423b4eafbefd567115b81bf`; tree `cd0e967f410dd5e11c97f2c6c0743baf3c03679f`; parents `7af8dca112331f6d796a24d2580ad9d4bece629d` (^1, Dev UI merge) and `71c0a932bbbe7b22dd5b22ddcf9cfe223e4a1403` (^2, SDK V1.2.14 pins); branch lane/build-025-candidate-20261110.
- Fresh clean detached worktree `/workspace/d6n-42de2893-20261110/src`. Exact HEAD/tree/parents and empty porcelain (including --ignored) verified before the build; HEAD/tree/parents and empty porcelain verified after: logs/source-initial.log, logs/source-final.log (after: only ignored build/ and __pycache__/ outputs).
- Remote source and protected firmware/nightly pins matched before any evidence writes; verify-freeze.sh PASS (head, tree, noreply author, no trailers), exit 0: logs/verify-freeze.txt, logs/verify-freeze-src.txt. Both target evidence branches absent. Final read-only remote pin check: logs/protected-refs-final.txt.
- Source identity and changed-file blobs vs 7af8dca1 (tools/build.py and tests/sdk_pin_test.py blobs equal 71c0a932): logs/source-identity.log.
- Cached donor heads: logs/donor-heads.log.

## Build inputs
- SDK: JieLi AC79 V1.2.14, tag AC79NN_SDK_V1.2.14_2026-10-13, commit 5fa84a9b2f723a5e9337ad79dc2ad741fc98fe2d (cached public gitee clone, clean). In-tree pins in tools/build.py (SDK_TAG AC79NN_SDK_V1.2.14_2026-10-13); check_sdk passed silently; NO local override.
- Toolchain: /workspace/build-inputs/jieli/toolchain (pi32v2 clang 4.0.1, sha256 c45189ee…240f).
- `JIELI_DOCKER=0 X0X_DEV_PADCAL=0 BOARD=smk37 MODEL=elite|pro ./build.sh --board smk37`. X0X_DEV_PADCAL=0 set explicitly (header default is 1). Each model built from an empty build/ (rm -rf build before each), and only that model's own .fwsc was copied out.
- Controller: input /workspace/build-ce278129-out/ctl.img, sha256 a334208b51f62bc7231ebb76a6de0dfa260033d7f7316e5b92053c540bc1d984, 61552 B, header crc32 564a8f55; not rebuilt. `tools/add_ctl.py ctl.img --check` ok.
- tools/native_nightly_build_probe.py (stale V1.2.1 pins) was NOT used.
- See logs/build-inputs.log and logs/budgets.txt.

## Native (executed before host)
- locked-settings: ok, exit 0; `logs/locked-settings.log`
- native-elite: ok, exit 0; `logs/native-elite.log`
- native-pro: ok, exit 0; `logs/native-pro.log`
- ctl-check: ok, exit 0; `logs/ctl-check.log`
- compose-elite: ok, exit 0; `logs/compose-elite.log`
- compose-pro: ok, exit 0; `logs/compose-pro.log`

Gate lines (identical for Elite and Pro): `ok image 483672 B; RAM .data+.bss 95540 B of 98304; pool 335464 B of 344064` -> RAM 95540/98304 (2764 B free), pool headroom 8600 B (gate 8192 B: PASS). `.ram_text` 844 insns no calls; app code area 552672 B, 69000 B free; no soft-double; register access hal/ only.

## Package structural checks
- package-elite: ok, exit 0; `logs/package-elite.log`
- package-pro: ok, exit 0; `logs/package-pro.log`

package_nightly --check (both): schema x0x37-bundled-controller-v1, controller strategy bundled, abi 2, header_version 2, flash_offset 569344, block_size 65536, block_crc32 297cc0a4, crc32 564a8f55, firmware_version null (dev build, no --release). No firmware version allocation supplied.

### Measured artifact hashes and sizes
All four firmware hashes reproduce the reviewed Build hashes (#832 6761306711) byte-for-byte: logs/reviewed-hash-match.txt. Binary outputs remain outside this evidence package (hashes only, as in the d3510b82 precedent).
- `ctl.img`: 61552 bytes; SHA-256 `a334208b51f62bc7231ebb76a6de0dfa260033d7f7316e5b92053c540bc1d984`
- `x0x-smk37-elite-ble.fwsc`: 651667 bytes; SHA-256 `8997b5e437892bb0c543702c042ff304f924f860c272a15b88a42182130b36c2`
- `x0x-smk37-elite.fwsc`: 651667 bytes; SHA-256 `3640f426e8b1ea10ef2ab23886529d848929eb24e30d08afaf43981927ff624e`
- `x0x-smk37-ble.fwsc`: 651667 bytes; SHA-256 `0ff74548a1a83ead811b5c5d6780df47788947877c948ffac800f955815cb8fd`
- `x0x-smk37.fwsc`: 651667 bytes; SHA-256 `2973b96a67c9b634351b53989641bc1a14dcc04d10c229b2386a7d2462087fd4`

## Measured host
- target-ui: 3 ok / 0 FAIL / 0 NOT_RUN; exit 0; `logs/target-ui.log`
- target-panic: 10 ok / 0 FAIL / 0 NOT_RUN; exit 0; `logs/target-panic.log`
- target-gaps: 1 ok / 0 FAIL / 2 NOT_RUN; exit 0; `logs/target-gaps.log`
- target-gaps-donors: 3 ok / 0 FAIL / 0 NOT_RUN; exit 0; `logs/target-gaps-donors.log`
- host-suite: 348 ok / 0 FAIL / 2 NOT_RUN; exit 0; `logs/host-suite.log`
Host suite counts are selector result lines, not assertion counts (QA's exact-tree 337/0 in #832 6762878873 counts differently). All per-selector result lines are in host-results.json. The full-suite and target-gaps runs printed `not-run` for drum909/drum808 because the cached donor heads are not siblings of this worktree; target-gaps-donors reran them with NINEW9_DIR/EIGHTW8_DIR set to the same donor heads as the d3510b82 precedent, and both passed. smk-build-package-mke does not appear because no MKE build was made (scope: Elite and Pro). Per-selector logs are retained in logs/host-suite-details/ and logs/target-*-details/. Full suite ran with X0X_TEST_JOBS=2. Host clang 19.1.7 and c++ 14.2.0 were already installed; no package install was needed.

Optimization classifier: PASS: clang sanitizer IMA check printed PASS; exit 0; logs/optimization-classifier.log.

### Every FAIL / NOT_RUN
- target-gaps drum909: NOT_RUN; (../schwung-9W9/src/dsp/er99_engine.c)
- target-gaps drum808: NOT_RUN; (../schwung-8W8/src/dsp/sc808_engine.cpp)
- host-suite drum909: NOT_RUN; (../schwung-9W9/src/dsp/er99_engine.c)
- host-suite drum808: NOT_RUN; (../schwung-8W8/src/dsp/sc808_engine.cpp)
- FAIL: none.
- Device: NOT_RUN; no device testing performed or authorized for this local package; hardware_tested=false.

## Environment
All native inputs were cached on this box; no SDK/toolchain download, credentials or secrets used. Codex is usage-limited until 2026-11-13 05:06 Asia/Vladivostok, so it was not re-attempted; the established local-Shell fallback was used. No build/test was skipped for that service limit.

## Evidence integrity and future handoff
Verify: `(cd evidence/d6n-42de2893-20261110 && sha256sum -c SHA256SUMS)`; expected every named file OK, exit 0.
SHA256SUMS covers every evidence file except itself and SHA256SUMS.check.log (the check's own output); both exclusions avoid self-reference. No .fwsc, .ctl, ctl.img, executable/toolchain or other binary is inside the evidence directory; see logs/binary-scan.log.

This package is prepared for nightly branch evidence/d6n-42de2893-20261110 with single parent nightly main a8205aff483dce09414093defdc19cf79d57b719 (not live gh-pages 2a2e81466cce0af635440f9cf62f0e909fb6d2a3). catalog-draft.json is a local future-entry draft only; the catalog dry-run is a separate branch evidence/d6n-42de2893-catalog-dryrun-20261110 parented at live gh-pages.
