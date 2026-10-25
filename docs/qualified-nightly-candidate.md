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

Every gate exported by `requiredGates` needs a PASS and an immutable review/log
`evidence_url`. What remains is `package-integrity`, `model-controller`,
`memory-flash`, `host-regressions`, `backup-restore-readback`,
`interruption-recovery`, `ota-target-binding`, and `independent-qa`. A missing
native-build receipt does not reject a nightly candidate. A present native-build
receipt which is not PASS with evidence still rejects. A distribution license is
not a nightly qualification gate. Corresponding source does not block
qualification either; that check existed only to satisfy a distribution license.
A receipt may still include `corresponding_source` or `notices`. Those fields do
not accept or reject a candidate. This tool does not write a PASS for a missing
native-build receipt or for either retired gate.

**Owner decision, 2026-10-25.** This gate removal is an owner decision and is not an accidental loss of protection.

**Reason:** Owner policy waives distribution-license, corresponding-source, and missing native-build receipts as nightly qualification blockers. That is a standing channel decision, not a claim that the repository is MIT (see LICENSE). Corresponding source existed only to satisfy a distribution license. A missing native-build receipt is not a reason to stop work.

**Purpose:** Stop a nightly candidate from being blocked by those three paperwork checks.

**End user:** Someone installing a nightly can be offered a DEV / HARDWARE TEST build without a distribution-license receipt, a corresponding-source receipt, or a native-build receipt. A package whose hash does not match, or a build that actually failed, is still not offered. The page stays labeled device not tested. Production main and production GitHub Pages do not change. This pull request does not itself update the live installer.

Distribution license: owner policy waives the distribution-license receipt as a nightly qualification gate. Removing that gate is not a regression, and does not invent an MIT license for this repository.

Corresponding source and distribution notices: that check existed only to satisfy a distribution license. It does not block a nightly. Existing copyright notices stay. Removing the block is not a regression.

Native-build receipt: a missing receipt is not a reason to stop work. An absent native-build gate does not reject a candidate. A present receipt that is not PASS still rejects. A hash mismatch or a failed package check still rejects. This does not waive an actual failed build. Waiving a missing receipt is not a regression.

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
An unavailable URL, failed source test, or missing QA receipt stays NOT
INSTALLABLE. A missing distribution license or corresponding-source receipt does not. A missing native-build receipt does not reject a candidate. A present native-build receipt which is not PASS with evidence still rejects. Physical owner PASS is not a prerequisite for qualified NIGHTLY;
production still requires its separate same-byte device evidence and approval.
