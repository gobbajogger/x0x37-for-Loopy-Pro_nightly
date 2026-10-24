# Proposal: separate-repository firmware NIGHTLY migration (2026-10-23)

Status: **DRAFT POLICY — NO FIRMWARE TRANSFER AUTHORIZED BY THIS DOCUMENT**.

## Owner intent

NIGHTLY is the development source/integration and first physical-test channel. Production `gobbajogger/X0X37-for-Loopy-Pro` `main` accepts firmware behavior changes only after matching model, exact artifact/controller hashes, actual owner-operated device PASS, independent QA and separate production approval. Missing physical-device PASS is **not** a NIGHTLY source, build or test-candidate blocker.

## Safe transition, with no loss of source history

1. Preserve both existing repositories, refs, commits, tags, issues, PR discussions and archives. Freeze new *production-targeting development PR creation* only after NIGHTLY source readiness and scheduler updates have been verified. Do not close or retarget existing production PRs merely because this proposal exists.
2. Inventory every firmware path, dependency, submodule, git-lfs pointer, generated controller file, license and corresponding-source obligation in the production source repository. Explicitly check whether any vendor JieLi SDK/toolchain, proprietary/private DSP, firmware binaries, credentials, samples, private references or unlicensed third-party sources would be transmitted to public NIGHTLY. The current NIGHTLY repo is public and browser/GPL-only. **No firmware migration until this inventory is reviewed and approved and compatible licensing is demonstrated.**
3. Create an isolated migration branch in NIGHTLY from its current protected `main`, and import only reviewed, lawfully distributable firmware *source* and required tests/build scripts with provenance; never replace NIGHTLY main history or overwrite existing installer/status files. For source that cannot lawfully be imported, retain a verified source pointer to the separate production repository and record an explicit migration blocker; do not work around the license or leak private inputs.
4. Reconcile `AGENTS.md`, `README.md`, maintained build/install rules, public GPL obligations and branch ownership through reviewed NIGHTLY PRs. Existing policy PR #2 is canonical for standing NIGHTLY DEV test-candidate permission; catalog PR #3 must drop its conflicting per-candidate authorization requirement. This proposal intentionally does not edit `AGENTS.md` while #2/#3 overlap.
5. After source import, reconstruct and independently compare complete executable trees and tests against exact old producer SHAs. Create new NIGHTLY producer branches/PRs from the validated migrated base, preserving an explicit old-PR → new-PR SHA/path mapping and source attribution. GitHub PRs cannot be moved between repositories by changing their base. Keep old PRs open/draft until each new PR is verified; then close or mark superseded with a link, never delete source branches.
6. Update installed Classic Build plugin and existing producer, Safe Merge, QA, Hourly Build, Catalog, NIGHTLY Merger and Pages publisher schedules **only after** verified NIGHTLY firmware source and branch destinations exist. Specialists write uniquely owned NIGHTLY lanes; sole firmware integrator combines on an isolated NIGHTLY integration lane; NIGHTLY merger integrates reviewed source PRs; builder validates exact integrated source; publisher alone updates `gh-pages`. Production `main` is never an intermediate development merge.
7. For a NIGHTLY installable candidate require actual pinned native Elite/Pro DEV builds as applicable, matching controller, model/header/CRC/SHA256/memory/flash limits, relevant host and installer negative/backup/readback/recovery tests, independent QA, licensing and lawful immutable external artifact hosting. Then sole publisher may expose `DEV / HARDWARE TEST — DEVICE NOT TESTED` without previous owner hardware PASS or per-build signoff. Keep failed/unbuilt history noninstallable; never commit vendor inputs, `.fwsc`, `ctl.img`, credentials or user samples to public NIGHTLY Git.
8. Only after owner tests exact NIGHTLY artifact on matching hardware and explicitly approves production promotion may a separately reviewed source PR target production `main`. Record hardware-reported defects against NIGHTLY source/build identity first; fix and retest there.

## Acceptance gates for actual migration

- Verified complete source inventory and license/redistribution review; no forbidden bytes or private source exposed.
- NIGHTLY `AGENTS.md` and maintained rules reconciled by authorized reviewed PRs.
- Reconstructed migrated source tree, tests and build-input provenance compared against exact upstream SHAs.
- All migrated active work has a new NIGHTLY branch/PR or explicit unmigrated reason, with old PR links preserved.
- Existing scheduler prompts and installed plugin reflect new topology, with remote/current-release verification.
- Production `main` and both `gh-pages` refs unchanged by migration; no forced pushes or device flashes.

This is a documentation-only transition plan, **not** a build, software test PASS, hardware verification or publication authorization.
