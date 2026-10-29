# Historical firmware NIGHTLY migration proposal (2026-10-23)

Status: **RETIRED PROPOSAL — historical provenance only**.

The proposed transfer of firmware source into the browser repository is not the active topology. Firmware development and integration use `gobbajogger/X0X37-for-Loopy-Pro`, with uniquely owned source lanes and the firmware `nightly` integration branch. Browser/installer/status work uses `gobbajogger/x0x37-for-Loopy-Pro_nightly`, its owned lanes and reviewed `main`. The designated NIGHTLY Pages publisher owns `gh-pages` deployment.

Use current [repository rules](../AGENTS.md), [channel and continuation rules](nightly-first-development-gate.md), and [candidate continuity](nightly-candidate-continuity.md). Resolve actual branch heads and current owners before acting. References to the old policy PR #2 and catalog PR #3 are historical provenance; their former overlap is not a current approval gate.

The [original proposal at commit 93d638b272bf789951553f9ff5437fd0a68d8cf1](https://github.com/gobbajogger/x0x37-for-Loopy-Pro_nightly/blob/93d638b272bf789951553f9ff5437fd0a68d8cf1/docs/firmware-nightly-migration-policy.md) remains available for the decision history. Its source-import, freeze, retargeting and scheduler-migration steps are inactive. Do not execute them from this historical document or pause current work to complete them.

Production firmware and installer behavior still require the exact affected-model owner-operated device PASS, independent review and separate production promotion authority. Documentation-only maintenance follows its applicable review and validation. Current NIGHTLY standing authorization and all model, package, controller, integrity, backup, recovery and publication-ownership boundaries remain in force.
