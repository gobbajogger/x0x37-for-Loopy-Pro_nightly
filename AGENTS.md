# Nightly installer preview — repository rules

**Current rules:** [RULES.md](RULES.md). Older AGENTS text and dated proposals are evidence, not executable rules.

**Inline protections** (full text in RULES.md):
- No force-push; no direct `main` updates by regular workers; merge/publish only via the designated NIGHTLY merger / sole Pages publisher.
- Never commit proprietary SDK/toolchain/DSP, `refs-oscuro`, credentials, private samples/backups, `.fwsc`, or `ctl.img` here. Preserve LICENSE/notices. Only an owner-designated exact stock-loop selection has its scoped distribution permission.
- Commit identity `gobbajogger <255244738+gobbajogger@users.noreply.github.com>`; no commit trailers.
- Cloud only; never operate the owner's Mac or devices; never flash hardware. Current Elite recovery and flash remain withdrawn; read-only Pro investigation through the assigned integrator does not grant a write, install, flash, or recovery.
- Honest PASS/FAIL/NOT_RUN with exact SHAs. D6 for new installable NIGHTLY: 0 FAIL / 0 SKIP / 0 NOT_RUN. Failed/unrun required gates stay out of the flashable picker.
- Do not edit NIGHTLY catalogs (existing 0.0.24.5 entry untouched). Standing DEV authority labels `DEV / HARDWARE TEST — DEVICE NOT TESTED`; no prior physical PASS required. Production is separate. Prevent cross-model flash; keep device-write confirmation and backup; preserve model guards.
- Stuck locks: contact the holder (no timeouts); escalate unreachable holders to coordinator and owner.
- Do not bypass a denial by switching transport, encoding, or worker; do not bypass required checks/reviews or silently change auto-merge.

Channel detail: [docs/nightly-first-development-gate.md](docs/nightly-first-development-gate.md). Candidate prep: [docs/qualified-nightly-candidate.md](docs/qualified-nightly-candidate.md).
