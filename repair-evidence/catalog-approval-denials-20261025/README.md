# Catalog approval denial repair — source only

The browser admitted otherwise plausible `dev-checked` catalog records even when
`qa_pass`, `source_licenses_approved`, `immutable_http_pass`,
`backup_integrity_pass`, or `model_and_controller_pass` explicitly said false.
This patch refuses supplied non-true approval hints at either version or package
scope. It also closes the identical malformed-type gap in `qualified` and
`installable`. Missing optional hints preserve existing qualified DEV records.

## Ownership and exact input

- Existing website producer's bounded R36 successor, owned branch
  `lane/catalog-approval-denials-20261025`; implementation worker
  `catalog_producer`, independent read-only reviewer `catalog_independent_review`.
- Base accepted main `10c47659192a32821da171417069ffefdbc05d63`, full ROOT
  `a2845ebf94c7c55e972254075f324441c2f82e38`.
- Frozen seven-path source/test candidate tree
  `2506ad142b6910dd389df7453b9ed9f7b6500357`; complete binary diff from base SHA256
  `840d07c2eef3edeb74145606f446a76df52bef8a1a9a3345db1c94e51815b97d`.
  The delivery tree adds only this textual evidence directory to that candidate.
- [Coordination receipt on PR #9](https://github.com/gobbajogger/x0x37-for-Loopy-Pro_nightly/pull/9#issuecomment-6391315877).
  PR #9 remains at stale head `47cc6eaaa43655192c9ee88d9e1217473fe4f2f4`;
  its branch is untouched. This is only the explicit approval-denial repair,
  not wholesale adoption or acceptance of PR #9's other proposals/findings.
- Open PRs, branches, PR9 discussion/reviews and current source were inspected.
  No active exact-fix successor was found; PR #13 is history-only. Personal
  Context was unavailable and private automation lookup returned no entries;
  those limited reads do not establish global scheduler/thread inactivity.
  No scheduler was created or changed.

## Existing trust contract retained

The generated installer embeds the publisher's catalog; it does not fetch an
external catalog. Optional client assertions cannot establish independent QA or
lawful hosting. The existing candidate CLI still requires independent receipts
bound to source commit/tree, package SHA/product/size/URL, controller hash/size,
accepted integration tree, budgets, safety/source/license gates and installer
fingerprint. It re-fetches and checks actual package size/SHA/model before output.
All-true hints cannot replace a missing receipt or override failed independent
QA; permanent tests exercise both refusals. Receipt validators and download
verification were not weakened. The fingerprint changes normally with source.

The renderer's existing public allowlist now recognizes these optional boolean
hints and preserves them. Its deny predicate and the browser agree that any
supplied value other than literal true refuses admission. This fixes the
contradiction without mandatory new fields, a signing service or browser
attestation. It does not authenticate arbitrary replacement JavaScript/catalogs;
publisher qualification and review remain the source of trust.

## Executed verification

Linux x86_64; Node `v24.19.0`, npm `11.9.0`, Chromium `154.0.8037.57`, Python
Playwright. All browser package bytes and MIDI behavior are local synthetic
fixtures. Tests execute complete generated HTML with actual page handlers,
streams, hashing, Blob downloads and DOM events, rather than extracted predicates.
The RED template is reproducible with
`git show 10c47659192a32821da171417069ffefdbc05d63:web/x0x_installer.html > /tmp/catalog-approval-evidence/before-installer.html`;
the unchanged libraries are assembled by the same complete-page test harness.

| Command | Exit | Behavior observed |
| --- | --- | --- |
| `npm run build` | 0 | Generated source-only installer and empty preview catalog |
| `npm test` | 0 | Full registered Node suite: qualification/receipt negatives, package/controller/write/backup/model checks, history and generated parity |
| `python3 tests/browser-admission.py --approval-only --source /tmp/catalog-approval-evidence/before-installer.html` | 1, expected RED | Accepted-main complete page admits explicit false new fields and malformed existing approval flags; 216 failing safety assertions expose metadata admission, not successful device writes |
| `python3 tests/browser-admission.py --approval-only` | 0 | Both models and version/package scopes deny false/null/numeric/string/array/object hints before fetch; absent/true paths preserve verified Blob and DEV acknowledgement; cached Download/Go denial occurs before MIDI |
| `npm run test:browser` | 0 | Complete registered installer and history suites: verified bytes for both models at 320/390/1280 and EN/JA; release/revocation/hash/model refusals; stale selection/digest/stream guards; local stock/controller file handlers and write/restore guards; empty preview and truthful history |
| Independent `npm test` and `python3 tests/browser-admission.py --approval-only` | 0 / 0 | Same complete candidate independently rerun, no scoped blocking finding |

The repaired approval suite has 312 meaningful observations; full installer
regressions have 565 and history 34, all without failures. Counts are supporting
indexing only: the relevant refusal is **no fetch, image, Blob link or enabled
Install for denied metadata**, and no MIDI/install entry on cached denial.
The original suite still has positive and independent-guard passes. Its expected
RED is not proof of a malicious firmware install or current device exposure.

The checked-in metadata fixture is byte-exact public `versions.json` from
`gh-pages@b7af05f00a91056ca732b21cbe1dc719edbcb585`, Git blob
`519d9500c57848d5ed103fbd88befb5f43f6d020`. Both original model entries remain
admitted with optional fields absent, but metadata alone exposes no download or
Install. No real package/controller bytes were fetched. Existing R36/publisher
reports were read from PR9; the Library archive identity was resolved but its
archived source-window scripts were not rerun. These complete-page RED/GREEN
checks are fresh evidence, not a relabeling of historical excerpt tests.

Two initial new-browser attempts hung because test instrumentation awaited a
deliberately intercepted fetch. Those exact processes were stopped, the harness
was corrected, and the complete commands above were rerun. The hangs are not
claimed as passes.

## Reuse, limits and adoption handoff

Independent byte comparisons against base confirm unchanged `fm1pkg.js`,
`fm1ota.js`, `x0x_breaks.js`, status/history mirrors and lock, command registry,
preview catalog and generated `versions.json`. Existing package/controller/OTA
evidence remains applicable to those identical inputs; no firmware/toolchain
build was performed. History remains 125 records and source preview stays empty.
Previously qualified Elite/Pro bytes are not revoked or requalified by this patch.

Only source/tests/public metadata and nonsecret textual evidence are delivered.
No SDK/controller/firmware bytes, raw captures, samples, backups or secrets are
included. No merge, artifact publication, gh-pages write, live HTTPS assertion,
scheduler mutation, hardware operation or production promotion occurred.
PR #12's one-file history patch is unchanged and has no new gate from this work.

Next accountable receivers: **existing Independent Website QA**, then **existing
Website Main Merger**. Consume the delivered exact HEAD/ROOT from the successor
PR, verify this seven-path patch plus evidence, and independently decide source
adoption under existing rules. This bounded review is not their final acceptance.
The sole Pages publisher separately owns later reviewed deployment and served-byte
checks. Other PR9 findings and publisher DNS checks retain their own causal scope.
