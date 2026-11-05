# LoopyX0X37 — fast NIGHTLY, hardware-proven production

**Current rules:** [RULES.md](../RULES.md). Owner policy 2026-10-23 (NIGHTLY first hardware test) remains; this file is the short channel note.

## Scope of the receipt waiver

The **2026-10-25** waiver removes duplicate paperwork receipts. It does not transfer third-party rights, change repository licenses, or make a missing build or a failed or unrun check PASS. A present `native-build` receipt must still be PASS with evidence. Required gates: [qualified-nightly-candidate.md](qualified-nightly-candidate.md).

| Stage | NIGHTLY | PRODUCTION |
| --- | --- | --- |
| Source | Owned branches + reviewed PRs; hardware proof not required | Docs maintenance uses applicable checks; behavior needs production gates |
| Installable | `DEV / HARDWARE TEST — DEVICE NOT TESTED` after full automated prehardware gate | Same bytes + owner physical PASS + separate production approval |
| Failed/unrun | History only; not flashable (out of the picker) | Excluded from the production picker |

Installable NIGHTLY keeps explicit device-write confirmation and backup instructions, preserves model guards, and prevents cross-model flashing.

Sole firmware integrator owns firmware `nightly`. NIGHTLY Main Merger owns this repo's `main`. Sole Pages publisher owns `gh-pages` (nonforced). Do not force-push, fabricate proof, flash hardware, or put secrets/SDK/DSP binaries in git. Preserve existing catalog entries. Verify served HTTP bytes after publish.

`npm run verify:pages` (`package.json` → `scripts/verify-pages-source-parity.mjs`) is the designated publisher's Pages source-parity check, not a standing firmware qualification gate.
