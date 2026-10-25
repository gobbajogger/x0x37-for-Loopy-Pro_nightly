# NIGHTLY installer — installable candidate continuity (2026-10-23)

This is an owner-approved **development hardware-testing** requirement, not authorization to change production firmware, bypass software/installer gates, flash hardware, or publicly redistribute proprietary components. Follow live `AGENTS.md` and reconcile its older per-build authorization wording with existing NIGHTLY policy PR #2 and catalog PR #3 before changing selectable catalog entries.

## Required behavior on every hourly release-chain run

The nightly installer is expected to offer an **actually downloadable, per-model-qualified DEV / HARDWARE TEST — DEVICE NOT TESTED** firmware candidate for the owner to install and test on SMK-37 Elite and SMK-37 Pro. A scheduled run need not compile a new binary when the exact already-verified candidate remains current. The pipeline **must preserve the last safe installed/downloadable candidate for each model** unless later evidence proves that candidate unsafe.

Report each model independently using exactly one of:

- **NEW VERIFIED LIVE** — an independently reviewed, fully native-software/package-checked and legally hosted candidate is served through NIGHTLY Pages, model correctly selected, downloaded bytes SHA-256 verified and installer guards intact
- **PRIOR VERIFIED LIVE RETAINED** — no newer source/build passed or source is unchanged, but the previous qualified and still accessible firmware remains selectable, with unchanged immutable URL and SHA-256
- **NO INSTALLABLE YET** — no qualified candidate has been proven downloadable; leave install disabled, record exact remaining failed/unrun check(s) in read-only history, prioritize the first safe qualified Elite/Pro builds
- **REVOKED / UNSAFE** — previously live firmware is now demonstrably unsafe; disable selecting it while preserving historical evidence and prioritizing a safe replacement

Do not turn `latest-built`, `latest-commit` or `latest-failed` into `latest-installable`. New failed/incomplete candidate must not evict previous verified safe package. Retain archives and model-specific version IDs. Do not assert installability from a proposed PR, source-only checkpoint, local ZIP, Pages Git ref, mock browser result or an unchecked URL.

## Repository and role separation

- Firmware source: [`gobbajogger/X0X37-for-Loopy-Pro`](https://github.com/gobbajogger/X0X37-for-Loopy-Pro), integration branch `nightly`. Sole Safe Merge owner proposes reviewed integration; native Hourly Build compiles and attests real Elite/Pro DEV targets; Independent QA second-passes the **same exact** source/compiled bytes. Unmerged PRs remain separate. Production `main` is reserved for separate same-byte, matching-model owner hardware PASS plus explicitly authorized promotion.
- NIGHTLY browser/status: [`gobbajogger/x0x37-for-Loopy-Pro_nightly`](https://github.com/gobbajogger/x0x37-for-Loopy-Pro_nightly). Catalog Sync produces status/qualified immutable *references* on its isolated lane. Nightly Main Merger alone merges eligible reviewed browser/status PRs into this repo's `main`. The sole NIGHTLY Pages publisher deploys `gh-pages` by nonforced fast-forward only and verifies actual HTTP responses. These are different stages.
- **No firmware `.fwsc`, controller `ctl.img`, SDK, DSP, toolchains, user samples/backups or credentials may be committed to the public browser/status repo.** A verified installable entry may link to a **lawfully hosted, immutable external artifact**, with exact measured bytes, independently checked licensing/source availability, SHA-256 and model identity. Never substitute an unverified GitHub Release or mutable `latest` redirect.
- Physical keyboard PASS is **not** a prerequisite for a fully prehardware-checked NIGHTLY owner-test candidate and no per-candidate signoff is required, but physical owner PASS and explicit approval are **mandatory for production**. The user, not a scheduler, performs flashing.

## Qualification for a new selectable firmware

For each Elite/Pro package, record immutable source SHA+tree, real embedded numeric firmware version and build ID, pinned native JieLi toolchain and AC79NN SDK **V1.2.1** (do not substitute V1.2.0), pinned DSP inputs, exact `.fwsc` and required matching controller identities and contents, model/header/loader/CRC/SHA-256/byte length, memory/code/pool/flash limits, actual positive/negative host/OTA/controller/model tests, backup-first/readback/restore/interrupted-install recovery, reviewer findings, legal component distribution rights and GPL/Apache notices, immutably hosted bytes and the web installer's actual safe selected-model behavior. Any required failed/unrun/missing item means **NOT INSTALLABLE**, but does not stop independent source/history work.

The firmware site's licensing document describes a closed-source Bluetooth controller distributed separately from GPL X0X application. Its actual redistribution rights and installation method must be checked component-by-component; never infer rights from general SDK notices. If required controller bytes cannot lawfully be hosted, a candid local verified acquisition/build step must be part of any claimed installation flow rather than an undisclosed download.

## Publication and observable checks

After approved website source PR merging, the sole NIGHTLY Pages publisher must inspect the old `gh-pages` SHA, full existing files and old per-model catalog entries; overlay only tested HTML/manifest changes, preserve archives; run current `npm run build`, `npm test`, schema/fail-closed fixtures, responsive browser and wrong-model/backup/OTA negative tests as applicable; fast-forward only. Then verify the new `gh-pages` SHA **and** that the actual HTTP-served catalog, HTML and *downloaded* firmware have the same manifest/byte hashes. If HTTP access fails, report **GIT PUBLISHED / HTTP UNVERIFIED** rather than **LIVE**.

For each bounded run record **ELITE** and **PRO** independently: the above availability status, actual URL+download SHA-256 or first missing gate, source SHA/version, last-known-good retention, exact tests/exits, consumer/reviewer and next safe action. Producer, QA, site merger, publisher and blocker auditor use live Git/bytes as handoff, not scheduler timing or private chat messages. No worker disables itself when a cycle fails. 

At the initial 2026-10-23 observation, public NIGHTLY `gh-pages/versions.json` contained `latest: null`, `versions: []`, `history: []`. This is a recorded baseline; refresh live state on every run. A permanently empty installer does not satisfy the hardware-test objective, but missing automated or legal checks cannot be bypassed to change it.
