# DnBOX project rules (source of truth)

Owner-dated decisions and this file govern. Older AGENTS text, handoffs, and plans are evidence only.

## Hard limits
1. No force-push. Do not change branch protections or bypass a denied Git action. Do not bypass a denial by switching transport, encoding, or worker. Do not bypass required checks or reviews, or silently change auto-merge; Full Stop does not arm auto-merge.
2. Do not merge to firmware `main` or publish outside the authorized chain. Only the existing sole integrator / merger / publisher may integrate or publish on their owned refs.
3. Never put secrets, raw captures, `refs-oscuro`, proprietary SDK/toolchain/DSP bytes, restricted binaries, non-artifact build output, or unrelated private samples/backups in git. Preserve LICENSE, LICENSING.md, and applicable notices/rights. Existing in-repo `*_private.h` / #684 synth headers stay; a name containing `private` is not a ban. Only an owner-designated exact stock-loop selection has its scoped distribution permission.
4. Commit as `gobbajogger <255244738+gobbajogger@users.noreply.github.com>`. No commit trailers (no `Co-authored-by`). Push durable results to a named non-main branch; nothing stays local-only. The sole branch exception is the sole publisher's fast-forward to `gh-pages`.
5. Cloud only. Never operate the owner's Mac or devices. Agents do not flash or install on hardware. Current Elite recovery and flash remain withdrawn; read-only Pro investigation through the assigned integrator does not grant a write, install, flash, or recovery. Ordinary work goes through Codex (`codex exec`); builds that need the Build VM toolchain/SDK stay on that VM.
6. Docs and unassigned roles do not edit or publish NIGHTLY catalogs; assigned `catalog_sync` / publisher roles act only through their briefs. Leave the existing 0.0.24.5 entry untouched. No removal of an existing catalog entry, and no status/label/hardware_tested/models/source_commit change on an existing entry, without the owner's word (`tools/workflow/catalog-diff.sh` (firmware repo) exit 2 is advisory for the push gate; a human/publisher reads the output).

## Evidence and bars
7. Report PASS / FAIL / NOT_RUN honestly with exact SHAs (and trees when claiming a tree). GitHub Actions alone is not agent-run proof. Handoffs name the branch or SHA (and tree when claiming a tree), what was done, and how it was checked. Before calling a file or commit missing, search by exact SHA and forks.
8. D6 for openbeta/release/qualification and for a new installable NIGHTLY entry: 0 FAIL / 0 SKIP / 0 NOT_RUN on required checks. Do not change this bar without a dated owner decision. NIGHTLY is the owner's first hardware test; no prior physical PASS is required. Production promotion is separate. A failed or unrun required gate keeps that candidate out of the flashable picker.
9. Pending — NIGHTLY preview amendment D6-N (coordinator interpretation, #832 6657810166, owner confirmation pending): no new FAIL by name vs baseline; every FAIL/NOT_RUN named in the entry; QA + QA 2 exact-tree receipts and Git Verifier PASS; native Elite+Pro build of the frozen tree; previous entry stays installable; rollback = FF revert. Does not change D6 for openbeta/release/qualification. Not in force until the owner confirms; rule 8 applies in full until then.

## Publishing
10. Watchdog holds role_ids `website_publisher` and `safe_merge_intake` via the durable owner map (`roles.json` @ `4a35a6cd` names those role_ids but not the agent): issues the written authorization and publish order; the publish cloud agent executes mechanically (fast-forward `gh-pages` only), launched by the coordinator on Watchdog's behalf; then run `tools/workflow/verify-hashes.sh` (firmware repo) and `tools/workflow/catalog-diff.sh` (firmware repo) on the live bytes. Build as standby publisher running the same brief if Watchdog/coordinator is unavailable — not in force until the owner confirms.

## Locks and ownership
11. One writer per shared scope. Resolve a stuck lock by contacting the holder — no timeouts. Takeover only on explicit release/hand-off. If the holder is unreachable, escalate to the coordinator and owner; the lock stays with the holder until then.
12. Continue independent ready work when something else is blocked. A report is not consumer acceptance.

## Efficiency (owner instruction 2026-11-05)
- Do not rerun a baseline already recorded on #832; compare by test name and totals. Rerun only if the record is missing or inconsistent, and say why.
- Independent QA does one full run on the exact subject tree; verify claims (hashes, tree, catalog contents, diff scope) with `tools/workflow/` instead of re-executing work; no repeated runs that add no new information.
- Run stages in parallel unless there is a data dependency. A newer candidate SHA cancels work on the older one.
- Post on #832 only on change (PASS/FAIL, new SHA, blocker, authorization); correct by editing, not a new comment; no acknowledgement or duplicate comments.
- Priority wake only when the recipient must act on the critical path; no replies just to acknowledge. The coordinator messages the owner only with a concrete result or real blocker. Estimates are labelled estimates; update the ETA only when it changes.

## Roles (one owner per artefact)
- Grok Bot: coordinator; plans lanes, decides within delegated scope, launches the publish cloud agent, talks to the owner.
- Dev: implements lanes; runs the full host suite on the exact tree before announcing a candidate.
- QA / QA 2: independent_qa receipts; on candidates they split scope, not duplicate it.
- Build: native_build + catalog_sync (package/publish scripts without `--push`).
- Watchdog: `safe_merge_intake` (#698 integrator; freezes one SHA/tree) and `website_publisher` (gate authorization), held via the durable owner map; no lane work.
- Git Verifier: read-only structure check of pushes + P5.5 post-publish check.
- Docs: owns this file and the runbook; edits in place, no addenda; never catalogs.

## Scope notes
- Firmware `nightly` is development integration; production `main` needs same-byte matching-model owner hardware PASS plus separate production authority. Docs/skills adapters do not grant merge, publish, or device rights. A docs-only change needs no firmware rebuild.
- Installable NIGHTLY must prevent cross-model flash, keep explicit device-write confirmation and backup instructions, and preserve model guards (see https://github.com/gobbajogger/x0x37-for-Loopy-Pro_nightly/blob/main/docs/nightly-first-development-gate.md and https://github.com/gobbajogger/x0x37-for-Loopy-Pro_nightly/blob/main/docs/qualified-nightly-candidate.md).
- Read-only verification scripts live at `tools/workflow/{verify-freeze,verify-hashes,catalog-diff,evidence-pin-check}.sh` (firmware repo).
