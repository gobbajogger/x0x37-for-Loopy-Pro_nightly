# Song workflow source stage — LX-REQ-037 / LX-REQ-001

Based on reviewed PR19 570253d35c84748bba82ddd616b9c17af8d7da58 on a new feature branch; no edits to PR19, stalled PR18 or deployment branch. Parent owns base selection, publication and hardware verification. Community LX-REQ-038 remains deferred.

Projects HTML/protocol/tests and documentation reuse GPL-3.0-only firmware source 08d3164a265123cb4c84e5104642fd93257d63d7; existing website sample protocol retains later backup protections. See SOURCE_PROVENANCE.json and docs/PROJECT_FILES.md. No private sample, backup, firmware, controller or SDK assets were copied.

## Result

Top-level Install firmware / Import samples stay first; Songs & projects opens the existing v1 whole-project workflow. The source build emits projects/ with self-contained modules. Portable import/export includes original sample images; project-only import requires exact existing sample identities. Reset project · keep samples uses confirmed op73 and clearly warns about the broader song/pattern/sound/motion/settings reset and autosave ON. Arrangement-only browser clear is explicitly unavailable; the existing keyboard SONG → CLEAR SONG remains separate. Unsupported protocol is unavailable, with no destructive fallback.

Task changes block active transfers/scans, detach project MIDI, retain file/name/options/recovery download and require fresh device preview. Leaving Projects invalidates sample cache. Empty chooser cancellation retains prepared state. Qualification fingerprint now includes project source and generator, so old qualification cannot silently cover new UI assets.

## Validation

- Native npm run build and npm test: PASS; 29 reused protocol tests + 13 page tests. Includes portable/project-only round trips, malformed/truncated/version/CRC/semantic/layout rejection, sample identity, collision backup consent, readback, interruption/rollback/recovery hold, cancel/disconnect/repeated clicks.
- Existing browser regressions: 677 admission checks, 34 history checks, 61 bundled-controller checks, 29 workspace checks PASS. Fixed one pre-existing fixture to open the collapsed local-package panel before its real click. First run failure is fixture visibility, not a skipped product guard.
- New headless project UI: 63 checks PASS at 320/390/768/1280; existing presentation: 106 PASS. Actual rendered route/assets/navigation, project scope, busy task isolation, retained inputs, invalid file, back/forward, no script errors/overflow.
- Independent functional/data-safety and UX reviewers: PASS; exact reviewed source/generated SHA256 recorded. Qualified-catalog negative suite: 333 cases PASS.
- Unchanged pinned firmware host checks: staging 24,446 checks, protocol, runtime/update/SMC, save-preflight and song actions PASS, plus synthetic arrangement byte invariants and external-clock/recording/reset/autosave/save/reboot/sample/calibration fixtures. Initial macOS compile issues and supported successful flags are retained. No host test is physical-device proof.

## Preview and remaining gates

Actual desktop/mobile PNGs are local deliverables; hashes appear in receipt.json. Library upload was attempted with the current official helper: sandbox DNS failed before upload, escalated attempt reported `Library prepare_uploads is not available`. No transfer completed and no Library ID exists. Do not infer Library delivery. Parent must complete that upload before rollout.

PR171 57beefa7aae0a90e8e2fb57d2410f0bd2b85e8e3 is not an ancestor of the firmware pin. Its legacy arrangement Load repair is not claimed installed. Projects uses its existing staged semantic validation; no firmware patch was applied. Compatible running X0X project protocol v1 and sample commands remain a firmware dependency. Hardware behavior/power-loss proof remains with the parent.

No merge, deployment, device operation or public catalog change. Before rollout, parent must choose/merge the presentation base, refresh qualification against this new fingerprint, independently verify prepared output and served bytes, complete Library preview delivery and perform separately authorized hardware verification. Never publish the empty source-preview catalog.
