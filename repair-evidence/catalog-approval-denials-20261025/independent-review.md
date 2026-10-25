# Independent bounded source review — catalog approval denials

Reviewer role: independent helper; did not author the implementation. This is scoped source review, not the existing Independent Website QA owner's final acceptance, merge permission, publication approval, firmware qualification, or hardware proof.

## Exact reviewed source

- Repository: `gobbajogger/x0x37-for-Loopy-Pro_nightly`
- Owned implementation branch: `lane/catalog-approval-denials-20261025`
- Accepted base: `10c47659192a32821da171417069ffefdbc05d63`
- Accepted base root: `a2845ebf94c7c55e972254075f324441c2f82e38`
- Frozen implementation/test candidate root: `2506ad142b6910dd389df7453b9ed9f7b6500357`
- Complete seven-file source diff SHA256 (`git diff HEAD --binary`, including the staged fixture): `840d07c2eef3edeb74145606f446a76df52bef8a1a9a3345db1c94e51815b97d`
- Exact public metadata fixture Git blob: `519d9500c57848d5ed103fbd88befb5f43f6d020`, matching `versions.json` at pinned `gh-pages@b7af05f00a91056ca732b21cbe1dc719edbcb585`.

## Review finding and disposition

No blocking finding in the bounded source/test change. The browser and renderer now treat each supplied `qualified`, `installable`, `qa_pass`, `source_licenses_approved`, `immutable_http_pass`, `backup_integrity_pass`, or `model_and_controller_pass` field as a true-only optional hint. An explicit false or malformed value denies eligibility at either version or package scope. Missing optional fields preserve the prior qualified catalog contract.

This is coherent with the current trust boundary: the installer embeds the publisher's catalog; the private preparation CLI separately validates independent receipts and downloaded bytes. Client hint values are not independently produced qualification receipts. All-true hints cannot override a failed independent-QA receipt or substitute for a missing package receipt. This repair needs no new signing service, browser attestation, mandatory metadata, or receipt-binding API.

The renderer retains its existing exact source/tree/product/size/URL/controller bindings, installer fingerprint, gate status/evidence checks, budgets, corresponding source/notices checks, and actual HTTPS download size/hash/model verification. The patch does not claim to resolve unrelated historical PR9 host/resource findings.

## Independently executed verification

Environment: Linux; Node `v24.19.0`, npm `11.9.0`, Chromium `154.0.8037.57` (Debian 13).

1. `npm test` — EXIT 0 on the complete frozen checkout. Log: `npm-test.log`, SHA256 `2e7be6971c4472ed3f11ae2525bb1336a534901a57dff35afd348df866b64ef1`.
2. `python3 tests/browser-admission.py --approval-only` — EXIT 0 in real local Chromium, complete generated installer page, 312 observations and zero failures. Log: `approval-browser.log`, SHA256 `34d121f98111ce4e2ec779d918eccad4cdf6a86c987784735d4e61f9c2262ec6`.
3. `git diff --cached --check` — EXIT 0. Generated installer diff matches the source predicate/comment change.
4. Byte comparisons against accepted base — unchanged `web/fm1pkg.js`, `web/fm1ota.js`, `web/x0x_breaks.js`, both build-status mirrors, append-only history lock, `package.json`, `preview-catalog.json`, and `docs/versions.json`.

The browser observations distinguish actual behavior: each negative field/type blocks a package fetch and leaves no usable image/Blob download/Install state for both models; cached Download and Go events after an in-place denial stop before MIDI permission or installer entry; true and absent hints preserve the verified-byte Blob and DEV-acknowledgement path. The exact existing public metadata still reaches the intended package URL without optional hints, while metadata alone never enables a download or install. External fetch and MIDI boundaries are mocked; real browser URL/DOM, streaming Response, SHA256/product parsing, and page handlers execute.

The complete Node suite additionally covers the actual renderer/CLI, failed and missing independent receipts, downloaded-byte checks, generated parity, controller padding, model/backup/restore/OTA write boundaries, and immutable history. Existing package/controller/OTA evidence is reused only for byte-identical code and is not relabeled as a new firmware or device qualification.

## Limits and adoption handoff

The producer subsequently reported full `npm run test:browser` EXIT 0. Reviewer inspected the complete registry log's final results: 565 generated-installer observations with zero failures and 34 history observations with zero failures; log SHA256 `8993d8b9086a56413aa139e15564ea4c41db1f905ff2be4254076bdb87681f4a`. This includes inherited manual stock/controller-file, verified-download/selection/revocation/hash/model, write-boundary and empty-preview behavior. The review also observed the new differential full-page test reject old source (216 meaningful failures among 312 observations) and pass new source; these characterization failures are expected RED evidence, not a safety PASS for old source.

No live firmware/download/HTTPS/CORS, physical device, SDK/toolchain rebuild, private controller, publication, main/gh-pages update, merge, or scheduler action was performed by this reviewer. Previously qualified Elite/Pro package bytes are neither revoked nor requalified by this metadata fix. The existing Independent Website QA and sole Main Merger retain final exact-delivery acceptance/integration; the sole publisher retains separate deployment/served-byte responsibilities. PR12's one-file history patch is outside this change.
