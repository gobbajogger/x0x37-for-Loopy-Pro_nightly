# Preparing a qualified NIGHTLY candidate

The normal `npm run build` remains an empty, noninstallable preview. Previously,
the only renderer rejected every nonempty catalog, including a fully qualified
one. `npm run prepare:candidate` now provides a separate, nonpublishing path.

The sole publisher supplies `--catalog`, `--qualification` and `--out` as ordered
arguments. The output must be a new directory outside this repository. Run
`node scripts/render-qualified-nightly.mjs` without arguments for its exact syntax.
No command here pushes Git, merges source, flashes hardware or deploys Pages.

A catalog uses the existing schema-1 `versions`/`models` structure. Each version
has `status: dev-checked`, `config: dev`, `hardware_tested: false`, the explicit
DEV / HARDWARE TEST — DEVICE NOT TESTED label, and full `source_commit` and
`source_tree`. Each Elite/Pro entry contains the exact `_900` product, size,
SHA-256, digest-addressed immutable HTTPS `pkg` and `controller_sha256`.
`latest` must identify a qualified version. Noninstallable history stays in the
separate build-status ledger. Existing qualified versions must be supplied too;
this tool does not infer or delete the live catalog's history.

The separate qualification object has `schema: 1`, `installer_sha256` and a
`packages` object keyed by package SHA-256. `installerFingerprint()` hashes the
actual installer HTML/libraries and candidate renderer. Changed installer code
invalidates the receipt. Each package receipt repeats `source_commit`,
`source_tree`, `product`, `size` and `url`; identifies accepted firmware
`integration` (`ref: nightly`, commit, identical tree, evidence_url); records
`controller` (`strategy: bundled`, sha256, size); and records measured
`budgets` (`app_code_free`, `ram_free`, `pool_free`). Pool free must be at least
8192 bytes. New candidates require package fields `controller_strategy: bundled`,
`controller_size` (exact declared image bytes), and `controller_sha256`. The receipt's
strategy, size and hash must match. The two exact existing public legacy packages are
pinned in `scripts/legacy-controller-packages.json`; only those old identities may retain
`owner-supplied` controller receipts. This is continuity, not qualification of new blank
packages. The legacy pin file is part of the installer fingerprint.
No firmware/controller bytes are copied into the site source.

Every gate exported by `requiredGates` needs PASS and an immutable review/log
`evidence_url`: `package-integrity`, `model-controller`, `memory-flash`,
`host-regressions`, `backup-restore-readback`, `interruption-recovery`,
`ota-target-binding`, and `independent-qa`. An absent `native-build` receipt
does not reject a candidate; a present receipt must be PASS with evidence.
The retired `distribution-license` and `corresponding-source` receipt checks
remain optional, and `corresponding_source` or `notices` fields do not accept
or reject a candidate. No missing receipt is written as PASS.

Apply the [2026-10-25 receipt waiver and its scope](nightly-first-development-gate.md#scope-of-the-receipt-waiver).
It removes duplicate paperwork requirements without transferring third-party
rights or replacing actual build, package and independent-review evidence.
Reuse valid exact-input evidence. Preserve applicable licenses and notices;
an actual failed build or missing package does not become qualified because a
receipt field is optional. This documentation does not change runtime admission.

The tool validates receipts; it does not create independent reviews or prove
that somebody's PASS claim is authentic. Existing owners must inspect those
records before approving the site. Synthetic test receipts are never approvals.

After validation the tool fetches every package again, refuses redirects and
oversized data, and checks actual size, SHA-256 and package model before creating
any output. It retains the static site's navigation, renders the catalog into
the installer using an explicit public catalog projection. The full qualification
file remains a private input and is not emitted as qualification.json. Unknown
fields at each schema level are rejected before output. It publishes no artifact. For bundled packages, both preparation and the browser decrypt
and verify the actual embedded controller: exact SMK layout, installed-file and nested app
CRCs, ABI/header, controller CRC, erased 64 KiB slot padding, declared size and SHA-256.
The browser offers its verified Blob only after those checks, hides the separate controller
input, and rechecks before installation. It sends the verified combined bytes unchanged.
Missing or mismatched controller bytes fail clearly. Existing legacy packages still require
the exact checked local controller hash; missing input blocks installation. Both paths retain
selection/race, DEV consent, model, backup/restore and OTA safeguards. Responses without a
reader are refused before allocation. No catalog or live site changes occur here.

Next, independent site QA must inspect the generated site and qualified package
flows in a browser. The sole publisher reconciles the live Pages history,
fast-forwards only through the approved route, and checks live served catalog,
installer and package hashes. A prepared folder is not deployed or device tested.
An unavailable URL, failed source test or missing required QA evidence stays NOT
INSTALLABLE for the affected candidate. Retired paperwork and an absent
`native-build` receipt follow the waiver above; a present unsupported or failed
native-build receipt still rejects. Physical owner PASS is not a prerequisite
for qualified NIGHTLY; production requires separate same-byte device evidence
and approval. Reports accompany the result and next action. The assigned owners
continue accepted qualification/publication work within current authority while
independent source and history work proceeds in parallel.
