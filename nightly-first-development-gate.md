# LoopyX0X37 — fast NIGHTLY, hardware-proven production

**Owner policy, 2026-10-23:** NIGHTLY supports rapid development, truthful build history, checked beta installers and owner-operated hardware-test candidates. Standing NIGHTLY DEV authority covers each qualifying candidate without another per-candidate owner reply. Model, integrity, backup and recovery gates remain required. Production firmware and installer behavior on `gobbajogger/X0X37-for-Loopy-Pro` `main` requires matching real-device proof and separate production approval.

This maintained document and current `AGENTS.md` define the active workflow. Historical proposals and dated PR/evidence snapshots preserve provenance; they are not additional prerequisites. Firmware source remains in the firmware repository's owned lanes and `nightly` integration branch. The separate NIGHTLY repository contains browser/installer/status source and reviewed `main`.

## Scope of the receipt waiver

The **2026-10-25 owner decision** removes separate `distribution-license` and `corresponding-source` qualification receipts and an absent `native-build` receipt as NIGHTLY paperwork blockers. Do not restore those retired JSON fields as mandatory gates or request duplicate receipts or rebuilds when unchanged exact-input evidence already exists. A present `native-build` receipt must still be PASS with evidence; a failed or unsupported receipt rejects the candidate. The renderer's required gate list remains the one documented in [candidate preparation](qualified-nightly-candidate.md).

The waiver does not transfer third-party rights, change repository licenses, authorize proprietary SDK/toolchain disclosure, or make a missing build or failed/unrun check PASS. Preserve applicable distribution obligations and author notices. Use existing exact-input source, build, package and rights evidence instead of demanding another document in a particular format. The current delivery task still requires real matching firmware/controller bytes and verified build/package evidence before claiming an installable result. Source, history and BUILD_ONLY work continue while an affected installability requirement remains unresolved.

Standing channel approval preserves sole-publisher ownership. The installer's explicit confirmation is the owner's device-write interaction, not another chat approval for a candidate covered by current authority. Hardware validation and separate production promotion remain distinct. Editing these documents neither changes runtime admission nor publishes a candidate.

## Channel gates

| Stage | NIGHTLY | PRODUCTION main / production Pages |
| --- | --- | --- |
| Source changes | Owned isolated branches and reviewed source/UI/status PRs; hardware proof is not needed | Reviewed documentation maintenance uses applicable checks; firmware/installer behavior requires production gates |
| Build inventory | All real source-only, failed, unbuilt, missing, broken, superseded, DEV CHECKED and hardware-untested results | Only per-model hardware-proven working candidates appear in the firmware picker |
| Installable firmware | Clearly marked DEV / HARDWARE TEST — DEVICE NOT TESTED after the complete automated prehardware gate | Same exact bytes proven on the corresponding Elite/Pro device, plus explicit owner production approval |
| Failed/unverified candidates | Read-only status history; unavailable for flashing | Excluded from the production picker |
| User data / hardware | Backup safeguards and manual owner flash | Backup safeguards and manual owner flash |

## Continuous development stages

Stages retain their real dependencies; independent ready stages and disjoint tasks run in parallel within actual capacity.

1. **Deliver source on owned refs.** Firmware, SMC, clock, storage and native installation source stays in the firmware repository's uniquely owned lanes. Browser/installer/status work stays in this separate public repository's owned lanes. After relevant local checks, commit and nonforced push meaningful work, or preserve explicitly marked WIP/NO-GO, then verify the remote SHA. Hardware testing is not a prerequisite for development source delivery. Read current instructions, capabilities and owner assignment; use an available authorized delivery route. A transport failure is scoped to that route; an actual security denial remains binding for the denied action.
2. **Build and review exact inputs.** The assigned build owner runs relevant local host/negative tests and, when required, actual pinned SDK/toolchain/DSP Elite/Pro DEV builds. Verify per-model package/controller identity, CRC/SHA-256, RAM/flash/pool limits, backup/readback and installer guards. Independent QA reviews critical changes. Reuse unchanged valid evidence; rebuild or re-review the affected inputs when they change. No GitHub-hosted build runners. Record failed/unrun checks truthfully; compiler success does not establish hardware PASS.
3. **Record truthful NIGHTLY history.** Catalog Sync records real outcomes on its owned status lane. Each record identifies the firmware source ref/full commit/tree, executed checks, model and genuine package hashes when the bytes were inspected. The NIGHTLY Main Merger may integrate independently checked browser/status PRs without physical-device evidence. The public browser/status repository remains GPL source, not a mirrored firmware tree. Proprietary SDK/toolchain/DSP, credentials, unrelated private samples/backups, `.fwsc` and `ctl.img` are excluded from its Git history.
4. **Qualify and publish NIGHTLY.** The sole NIGHTLY Pages publisher may publish independently checked browser/status changes without hardware PASS. Standing channel authority permits a DEV / HARDWARE TEST candidate after exact-source review, independent critical-code review, real package/controller CRC/SHA-256, model/memory/flash checks, data-preservation/rollback and installer/negative tests PASS. Apply the receipt waiver above without inventing test success or distribution rights. Verify immutable hosted package bytes, size and SHA-256; label DEVICE NOT TESTED, retain explicit device-write confirmation and backup instructions, and prevent cross-model flashing. Host packages outside this source repository. A missing actual artifact, failed/unrun required check or unresolved applicable distribution obligation blocks that candidate's installability. It does not stop independent source, review, build or history work. Physical owner PASS is not required before a fully checked NIGHTLY hardware-test candidate is available.
5. **Preserve integration and publisher ownership.** The currently assigned sole firmware integrator assembles reviewed firmware work into firmware `nightly`; resolve the actual assignment instead of inferring it from a scheduler title. The NIGHTLY Main Merger integrates eligible PRs into this browser/status repository's `main`. Only the designated NIGHTLY Pages publisher writes its `gh-pages` through the approved nonforced route. Source pushed, PR merged, Pages Git updated and actual HTTP-served bytes verified are separate states.
6. **Promote production only through its gate.** Firmware/installer behavior in production requires exact source/tree, NIGHTLY development evidence, complete automatic checks, attributable owner-operated physical PASS for each affected model on the same firmware/controller hashes, backed-up/read-back slot data and actual behavior, independent review and separate explicit production promotion authority. Documentation-only maintenance uses applicable review and tests without manufacturing a device flash. Development progress never implies a production release, production Pages publication or destructive device write.

## Pages source and served-byte verification

Before the designated publisher updates `gh-pages`, pin the reviewed source commit/tree, generate the candidate from that exact checkout with the retained public catalog, and require this check to pass from the same checkout:

```sh
npm run verify:pages -- --candidate /absolute/path/to/candidate --retained-catalog /absolute/path/to/retained-versions.json
```

The check compares the installer, sample and project pages with current source rendering, verifies package-version assignments and build status, and preserves existing catalog entries and package identities. Keep the retained `versions.json` bytes in the candidate; an empty preview or a page displaying a recent version number does not establish source parity. This is a browser/status publication check and does not add a firmware qualification or hardware gate.

After the approved nonforced `gh-pages` update, verify the actual HTTPS-served installer, sample and project pages, package-version assignments, build status and catalog against the candidate hashes. Record served URLs, SHA-256 values and verification time. A source merge or Pages Git update alone is not evidence that the intended bytes are being served.

## Automatic continuation and parallel ownership

Deliver the result and its evidence, report the completed stage, then continue the next authorized action without waiting for a user message. A progress report, preview, PR creation or queue entry is not task completion. Resolve findings and handoff gaps within current authority. Continue accepted independent work while another lane waits on its own dependency, failed check, unavailable executor or actual denial.

Before claiming new work, verify real executor capacity, current ownership and disjoint write areas. Serialize shared-ref writes under their assigned sole owner. An unknown active writer scope blocks new potentially conflicting claims; it does not erase accepted continuations. The affected owner first performs read-only ownership/liveness reconciliation while safe independent actions continue. Do not replace an active owner or acquire another worker's lane from silence alone.

Handoffs identify current source/tree or package identity, validation/review evidence, the consumer, the next action and any scoped blocker. Re-read changed inputs before accepting them and verify the consumer's first substantive action. Accepted pending actions remain actionable even when source bytes are unchanged. A finite run saves a durable continuation and recovery action; reporting or reaching its execution limit does not close unfinished work or disable the recurring job. Keep the configured schedule and paused states unless an authorized schedule change is part of the task.

## Mechanical decision

- **NIGHTLY history eligible:** truthful source/build evidence, verified remote SHA and stage status. Hardware proof is unnecessary.
- **NIGHTLY source/UI merge eligible:** current reviewed PR and applicable native npm/browser/static/negative checks. Hardware proof is unnecessary.
- **NIGHTLY installable DEV eligible:** actual matching build/controller package, independent safety review, complete model/hash/backup/installer automated PASS, applicable lawful distribution and verified hosted bytes. Apply the receipt waiver without adding retired paperwork gates. Failed eligibility means history only for that candidate, with a named recovery action.
- **PRODUCTION firmware/behavior eligible:** applicable software requirements plus same-byte, per-model owner device PASS and separate production approval. Otherwise record PRODUCTION HARDWARE GATE PENDING while authorized development and documentation work continue.

Never bypass a safety-refused Git write, force-push, silently mutate shared branches, fabricate tests/device proof, flash hardware, expose private inputs or overwrite another worker's lane.
