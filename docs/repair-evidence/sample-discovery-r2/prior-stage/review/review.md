# Independent exact-patch review

Verdict: PASS for the bounded candidate-discovery change. No actionable findings in the reviewed patch. This includes source, synthetic behavior and inspection of two producer browser captures; it is not integration, publication or hardware approval.

## Consumed input and first actions

Reviewed NIGHTLY main pin `18e8278031180854437f077f3afc356f567fad97`, original Git blob `6f77ad50dac0648ad784f5b645382b9e5872cf23`, candidate source SHA-256 `135907651ba1d8293def1e10e0126ea4a84b3e1d5114d64762c654b45b0fa64f`, and patch SHA-256 `d5dd10ad94107d6910c32dc7a3bd046941ba22f2e427acea04d8fc8ef6a3bb23`.

The first review tool action enumerated the packet and applicable instructions. The first substantive review action read `plan.json`, `candidate.patch`, `parity-receipt.json`, `first-negative-control.json`, `synthetic-matrix.json`, and the complete fake harness. The next action read both exact `Link`/`connect` implementations and adjacent transfers, recomputed the eight requested input SHA-256 values and the original Git blob, then checked the caller and workspace activation interaction. Exact consumed hashes are in `review-receipt.json`.

The first independent dynamic check executed the unmodified source as a negative control for the new mixed-ownership edge. It selected the later good candidate but left the failed probe's newly opened output open, as expected. The exact candidate then passed all edge assertions. Evidence: `independent-edge.mjs` and `independent-edge-result.json`; command: `node review/independent-edge.mjs` (exit 0).

## Findings by severity

- Blocking/high: none.
- Medium/low: none.

## Review reasoning and proof

Both `open()` calls now execute inside the per-candidate `try`. Rejected input/output opens and rejected identity retries therefore proceed to later candidates. Success returns before cleanup and preserves its listener and both connections. Disconnected inputs remain excluded; disconnected outputs are now excluded before pairing. The name expression and identity retry arguments are unchanged.

Cleanup restores the preexisting input handler only if the probe's own handler still occupies the property. It closes only ports whose initial connection was closed, and never attempts an output close if the input failed before output opening was attempted. Each close rejection is isolated, allowing the other close and later discovery. These choices are small and directly support the requested failure handling.

Reused the recorded 16-case synthetic matrix, rather than repeating it. Its source/function hashes match the reviewed candidate. It covers input rejection, output rejection after input success, failed/wrong handshake identity, synchronous send failure, disconnected input/output, all failures, empty ports, success short-circuit, preopened-port/listener preservation, cleanup rejection and unchanged naming examples. The saved first executed original-source negative control documents the requested input-open abort before the good candidate.

The new independent edge starts a failed input already open and its output closed, replaces the probe listener during a silent handshake, then permits a later good pair. Candidate assertions passed: replacement listener retained, preopened input retained with no close attempted, newly opened failed output closed, later good candidate selected, successful ports retained, and no timer leaked. The original failed only the expected output-cleanup assertion. All endpoints were in-memory fakes; no real browser MIDI API was called.

The independent script also asserts byte equality before and after `connect`, so `Link`, handshake filters, transfers, sample paths and rendered markup remain unchanged. The supplied parity receipt says the generated-page function delta matches the source delta. No broader refactor or patch-size concern was found.

## Limits and handoff

This reviewer did not rerun the full repository suite or the browser matrix, contact a device, request actual MIDI permission, transfer samples, send physical SysEx, write a shared ref, deploy, or adopt historical PR771 bytes. The producer retains responsibility for actual browser execution, build/test receipts, current-head/owner reconciliation and Library handoff. This review establishes no hardware result and names no external reviewer/model result.

No source changes are requested. The creator/current incumbent may consume this exact reviewed patch packet after checking current source applicability; integration and publication remain outside this stage.

## Affected-state visual supplement

PASS, with no additional findings. Independently opened and visually inspected `browser/candidate-connected-desktop.png` and `browser/candidate-all-fail-mobile.png` using `view_image`, then consumed `browser-receipt.json`. No browser suite was repeated and the candidate remained unchanged.

The connected desktop capture shows the focused `Read again` control with a clearly visible focus ring, readable empty-slot state and controls contained within the page width. The failed mobile capture shows the complete final not-found error wrapping below a visible `Connect` retry control; the add, backup and restore controls appear disabled, and the status text, option rows, buttons and footer fit the narrow layout without visible clipping or horizontal overflow. The screenshot alone cannot prove keyboard activation or disabled DOM semantics; the producer's recorded keyboard retry, disconnect invalidation and disabled-write assertions supply that interaction evidence.

Consumed the producer's Chromium `154.0.8037.57` receipt: 16 fake matrix results and six UI checks, no recorded browser errors or off-origin requests. Its initial render checks at 1440, 390 and 320 pixels report unchanged original/candidate images. This supplement inspects the two affected state captures only; it does not independently reproduce browser execution or assess unrelated design changes.
