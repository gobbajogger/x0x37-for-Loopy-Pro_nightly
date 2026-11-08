# UNREVIEWED · DEVICE NOT TESTED — V3-PANIC-REARM-01 D6-N preview

Title: UNREVIEWED · DEVICE NOT TESTED — V3-PANIC-REARM-01 D6-N preview

Label: UNREVIEWED · DEVICE NOT TESTED — 617c0ff1

Description: UNREVIEWED · DEVICE NOT TESTED — D6-N preview: host 348 ok / 0 FAIL / 0 NOT_RUN. Device NOT_RUN (no device testing performed or authorized for this local package). Not a publish, not a 0.0.25 freeze.

hardware_tested=false. Local evidence only; NOT a publish; NOT a 0.0.25 freeze; NOT release qualification or formal independent QA. No commit, push, PR, GitHub post, agent message, or protected remote ref update was made. Decision (A): neither 6ccc91ca nor b01fb2d6 applied.

## Source and freeze checks
- Source `617c0ff1d49ccfdd789d358dc962fbfea5f94c15`; tree `0c346e5bee8ec20cac7e59ded175085594079e42`; sole parent `2287f113fa4bf74757b4e6d758c2e5464eb47036`.
- Three authorized post-fetch tests exited 0: see `logs/initial-fetch-tests.txt`.
- All protected firmware / nightly refs and nightly main/gh-pages trees matched: `logs/verify-freeze.txt`; live refs rechecked in `logs/protected-refs-final.txt`. Evidence branch absent.
- The first nightly fetch did not populate a missing local origin/gh-pages tracking ref. This was a local missing-ref error, not a SHA/tree mismatch; explicit refspec fetch populated it, and all pins then matched. Historical log retained as `logs/tracking-initial-missing-ref.txt`.
- Final source porcelain empty at exact HEAD/tree above: `logs/source-final.log`. Original `/workspace/plan-all/wt` also remains clean and unchanged.
- Exact schwung-9W9 and schwung-8W8 donor heads and required engine files verified. No substituted forks/tips.

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
No firmware version allocation supplied. Controller was freshly rebuilt with CTL_NO_CACHE=1 and remeasured before checks. Its measured hash equals the prior controller because this firmware-only port does not change controller sources; it was not copied from old evidence. All five rebuilt firmware products have newly measured hashes. Hashes and byte sizes: `artifact-hashes.json` and `logs/artifact-sha256-size.log`. Binaries remain solely in the worktree build/ and ble/ctl/out/ paths, never in this directory.

## Measured host
- target-ui: 3 ok / 0 FAIL / 0 NOT_RUN; exit 0; `logs/target-ui.log`
- target-panic: 10 ok / 0 FAIL / 0 NOT_RUN; exit 0; `logs/target-panic.log`
- host-suite: 348 ok / 0 FAIL / 0 NOT_RUN; exit 0; `logs/host-suite.log`
Host suite counts are selector result lines, not assertion counts. Full per-selector runner lines are in host-results.json. Target panic set includes project-protocol, project-save-preflight, project-stage, project-runtime. Host tests ran AFTER native with AC79_SDK configured; host clang and g++ were used, not JieLi clang. No package installation was needed. Optimization classifier exit 0: logs/optimization-classifier.log. Per-test measured logs retained in logs/host-suite-details/ (target logs in their own detail folders).

### Every FAIL / NOT_RUN
Native/host/package FAIL and NOT_RUN: none.
- Device: NOT_RUN; no device testing performed/authorized for local package; hardware_tested=false.

## Budgets and environment
See logs/budgets.txt and logs/build-inputs.log. All native inputs were cached; no SDK/toolchain download, credentials or secrets used. Codex read-only exec hit its usage limit (logs/codex-attempt.log), so measurements ran directly on this box. This did not block any native/host step.

## Evidence integrity and future handoff
Verify: `(cd /workspace/d6n-617c0ff1-20261109 && sha256sum -c SHA256SUMS)`; expected every named file OK, exit 0.
SHA256SUMS covers every evidence file except itself and SHA256SUMS.check.log (the check's own output); both exclusions are intentional to avoid self-reference. No firmware/controller/toolchain binaries exist in this directory.

No nightly commit exists yet. Later authorized evidence commit target: evidence/d6n-617c0ff1-20261109; sole parent MUST be nightly main a8205aff483dce09414093defdc19cf79d57b719, NOT gh-pages. Parent handles any cloud-agent push and external reviews separately.
