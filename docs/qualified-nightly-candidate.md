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
`controller` (`strategy: owner-supplied`, sha256, size); and records measured
`budgets` (`app_code_free`, `ram_free`, `pool_free`). Pool free must be at least
8192 bytes. Controller bytes are never copied into the site.

Every gate exported by `requiredGates` needs a PASS and an immutable review/log
`evidence_url`: real native build, package integrity, model/controller,
memory/flash, host regressions, backup/restore/readback, interrupted recovery,
OTA target binding, independent QA, distribution licensing and corresponding
source. The receipt also links exact `corresponding_source` and `notices`.
The tool validates receipts; it does not create independent reviews or prove
that somebody's PASS claim is authentic. Existing owners must inspect those
records before approving the site. Synthetic test receipts are never approvals.

After validation the tool fetches every package again, refuses redirects and
oversized data, and checks actual size, SHA-256 and package model before creating
any output. It retains the static site's navigation, renders the catalog into
the installer, and saves the receipts. It never downloads or publishes a
controller. The browser requires the exact checked local controller hash and
rejects a changed selection while the asynchronous hash is calculated.

Next, independent site QA must inspect the generated site and qualified package
flows in a browser. The sole publisher reconciles the live Pages history,
fast-forwards only through the approved route, and checks live served catalog,
installer and package hashes. A prepared folder is not deployed or device tested.
An unavailable URL, failed source test or missing legal/QA receipt stays NOT
INSTALLABLE. Physical owner PASS is not a prerequisite for qualified NIGHTLY;
production still requires its separate same-byte device evidence and approval.
