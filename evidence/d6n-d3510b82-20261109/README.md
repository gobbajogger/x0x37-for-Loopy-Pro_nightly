# UNREVIEWED · DEVICE NOT TESTED — REC pattern-cell cutover D6-N preview

Title: UNREVIEWED · DEVICE NOT TESTED — REC pattern-cell cutover D6-N preview

Label: UNREVIEWED · DEVICE NOT TESTED — d3510b82

Description: UNREVIEWED · DEVICE NOT TESTED — D6-N preview: host 348 ok / 0 FAIL / 0 NOT_RUN. Device NOT_RUN (no device testing performed or authorized for this local package). Not a publish, not a 0.0.25 freeze.

hardware_tested=false. Local evidence only; NOT a publish; NOT D6/release; NOT a 0.0.25 freeze; NOT formal independent_qa or gate authorization. Full 0.0.25 remains HOLD. No source edits, commit, push, PR, GitHub post, catalog dry-run, protected ref update or publish was made. Decision (A): neither 6ccc91ca nor b01fb2d6 applied.

## Source and freeze checks
- Source `d3510b8274d5c737e1a1aab93f65081b9e28b5e8`; tree `0310ab1bb5469c4992302b57a11eb880f8118de2`; sole parent `617c0ff1d49ccfdd789d358dc962fbfea5f94c15`.
- Worktree `/workspace/plan-all/wt-d3510b82`. Exact HEAD/tree/parent and empty porcelain verified before and after build: logs/source-initial.log, logs/source-final.log. Existing wt-617c0ff1 HEAD was not moved.
- Remote source and protected firmware/nightly SHA/tree pins matched before any evidence writes: logs/verify-freeze.txt. Evidence branch absent. Final read-only remote pin check: logs/protected-refs-final.txt.
- Source identity and changed-file blobs: logs/source-identity.log.
- Cached donor heads and engine inputs: logs/donor-heads.txt.

## Native (executed before host)
- locked-settings: ok, exit 0; `logs/locked-settings.log`
- native-elite: ok, exit 0; `logs/native-elite.log`
- native-pro: ok, exit 0; `logs/native-pro.log`
- ARM-ctl: ok, exit 0; `logs/ARM-ctl.log`
- compose-pro: ok, exit 0; `logs/compose-pro.log`
- compose-elite: ok, exit 0; `logs/compose-elite.log`
- native-mke: ok, exit 0; `logs/native-mke.log`

## Package structural checks
- package-elite: ok, exit 0; `logs/package-elite.log`
- package-pro: ok, exit 0; `logs/package-pro.log`

No firmware version allocation supplied. Controller was freshly rebuilt with CTL_NO_CACHE=1 and independently remeasured. Its measured hash equals the prior controller because controller sources are unchanged; no hash was reused as an input before measurement. All five firmware artifacts have new measured hashes. Binary outputs remain in worktree build/ and ble/ctl/out/, never this evidence package.

### Measured artifact hashes and sizes
- `ctl.img`: 61088 bytes; SHA-256 `aafb4542336d7ed192d97052b2effa3929cc3740a0e4051ec43b21be26866af7`
- `x0x-smk37-ble.fwsc`: 651457 bytes; SHA-256 `d997fea7b95e157f5c35271c95087d37abab7904668714631162250e8ea867db`
- `x0x-smk37-elite-ble.fwsc`: 651457 bytes; SHA-256 `1e6d56a3c4d4bf8d90c8a04f32abadb0b7ca58f5523f45c3036a7d05f8cefbb7`
- `x0x-smk37-elite.fwsc`: 651457 bytes; SHA-256 `57dfcd9aec92f568480201c686618f049a33c1cdce5904266160eca06ab9a321`
- `x0x-smk37-mke.fwsc`: 651453 bytes; SHA-256 `98634bf107a35284ff853f24fd847d8489e628488923c054dc85c5923f2deac8`
- `x0x-smk37.fwsc`: 651457 bytes; SHA-256 `83f4b574002f309f6f32542393f836dd9fb0584760c9cd3eaec0efb79b684a09`

## Measured host
- target-ui: 3 ok / 0 FAIL / 0 NOT_RUN; exit 0; `logs/target-ui.log`
- target-panic: 10 ok / 0 FAIL / 0 NOT_RUN; exit 0; `logs/target-panic.log`
- target-gaps: 4 ok / 0 FAIL / 0 NOT_RUN; exit 0; `logs/target-gaps.log`
- host-suite: 348 ok / 0 FAIL / 0 NOT_RUN; exit 0; `logs/host-suite.log`
Host suite counts are selector result lines, not assertion counts. All per-selector result lines are in host-results.json. Target panic includes the six panic selectors plus project-protocol, project-save-preflight, project-stage and project-runtime. Target gaps explicitly runs optimization-equivalence, drum909, drum808 and smk-build-package-mke. Per-selector logs are retained in logs/host-suite-details/ and logs/target-*-details/. Full suite ran with X0X_TEST_JOBS=2. Host clang 19.1.7 and c++ 14.2.0 were already installed; no package install was needed.

Optimization classifier: PASS: clang sanitizer IMA check printed PASS; exit 0; logs/optimization-classifier.log.

### Every FAIL / NOT_RUN
Native/host/package FAIL and NOT_RUN: none.
- Device: NOT_RUN; no device testing performed or authorized for this local package; hardware_tested=false.

## Budgets and environment
See logs/budgets.txt and logs/build-inputs.log. All native inputs were cached on this box; no SDK/toolchain download, credentials or secrets used. Codex was attempted once with --approve-for-me --skip-git-repo-check, exited 1 due to usage limit (logs/codex-attempt.log); immediately used the established local-Shell fallback. No build/test was skipped for that service limit.

## Evidence integrity and future handoff
Verify: `(cd /workspace/d6n-d3510b82-20261109 && sha256sum -c SHA256SUMS)`; expected every named file OK, exit 0.
SHA256SUMS covers every evidence file except itself and SHA256SUMS.check.log (the check's own output); both exclusions avoid self-reference. No .fwsc, .ctl, ctl.img, executable/toolchain or other binary is inside the evidence directory; see logs/binary-scan.log.

This local package is prepared for nightly branch evidence/d6n-d3510b82-20261109 with single parent nightly main a8205aff483dce09414093defdc19cf79d57b719 (not live gh-pages 2b2106f38656ea54372c074aef5d02a89f749f95, because that tip already has published .fwsc blobs). No branch/commit/push is created by this task. A future separately authorized handoff is the parent's responsibility. catalog-draft.json is a local future-entry draft only; no catalog dry-run was performed.
