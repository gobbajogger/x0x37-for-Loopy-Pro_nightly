# R2 independent exact-patch review

Verdict: PASS for the bounded handshake and candidate-failure isolation patch. No actionable findings. Candidate source remains unchanged. This review supersedes R1 only for handshake validation; R1 is preserved as historical discovery/cleanup evidence and its six-byte fake success is not valid INFO identity proof.

## Exact consumption and first action

The first actual R2 review action read `handshake-only.patch`, `candidate-r2.patch`, `handshake-intake-receipt.json`, both executed handshake negative controls, and the new handshake/discovery matrix records. Subsequent reads consumed the complete candidate `Link` and `connect`, fake harness and runner, the retained current-nightly/main/historical firmware ED_INFO emitters, the maintained historical protocol, step constant and source-closure receipt. Computed SHA-256 values match the supplied pins:

- Candidate source: `c21a286c2b3d3cbee38cb6dc7f7992df143b6ea9081fdb4822b221d5d80eabcc`.
- Handshake-only patch: `3e0e576d8c6c3c9796285ec485d583a9a4e60391ed0c9689411039bdfff16737`.
- Combined patch: `4495d3ebf5b487371f2e78b24a9ec525c72fb94f7f7937c7bc9b624b9ee38c84`.

Full consumed file hashes and executable evidence are retained in `review-receipt.json`.

## Findings by severity

- Blocking/high: none.
- Medium/low: none.

## Correctness, schema evidence and compatibility

`Link` still checks the existing framing/header and command correlation. The new `validInfo` gate rejects an empty echoed command-1 reply, missing NUL/version/fixed fields, foreign firmware prefixes, non-7-bit payloads, a zero step count, incomplete engine lists and unknown trailing schemas before returning a candidate. A rejected result enters the already reviewed per-candidate cleanup and proceeds to a later pair. It adds no MIDI commands and does not alter transfer paths.

The bounds are grounded in the retained emitters: both X0X and historical Felucca call `ed_str(..., 24)` for the firmware/version string; Felucca calls `ed_str(..., 8)` for each engine name. The protocol specifies ASCII NUL-terminated strings, all data bytes seven bit, five fixed INFO fields after the version, and either the older end-after-names form or the v3 NTRK byte. The X0X nightly emitter writes zero engine/parameter/global/base/track fields with nonzero `NSTEPS` (the retained pattern header defines 64). Main appends exactly `58 53 47 01 30` (XSG v1, ED_INSTALL48); the validator accepts both retained X0X variants.

The parser deliberately accepts printable version suffixes rather than hardcoding a release number. For Felucca it preserves variable positive engine count, engine names through eight characters, and optional positive NTRK. It does not invent a physical model or serial field. Requiring only a nonzero step count is permissive across supported firmware variants; this is schema validation, not exhaustive validation of every firmware-specific numeric constant or cryptographic authentication. The strict handling of unknown trailing extensions matches the current-source scope; a future INFO schema extension needs its own compatibility update.

The supplied 16-case handshake matrix covers echo, missing/truncated fields, foreign identity, non-7-bit data, zero steps, unknown/unsupported extensions, current XSG, X0X version examples, both Felucca forms, truncated engine names and all-malformed discovery. The refreshed 16-case discovery matrix uses authentic INFO-shaped payloads and reestablishes the open/handshake failure, later success, cleanup, disconnected and successful-link behavior. Both actual original/R1 negative controls recorded selecting the echoed first candidate; they establish why R2 is needed. These exact-input records were consumed, not re-executed as a duplicate suite.

## Independent executed edge

Executed `node review/independent-boundary.mjs`, exit0. Its first dynamic check accepts the emitter-supported boundary of a 24-byte Felucca firmware ID and eight-byte engine name, keeps the successful connection and does not visit the later candidate. Its negative boundary sends a nine-byte engine name, verifies failed-pair close/listener cleanup, then selects the later valid INFO candidate with no timer leak. All endpoints are injected in-memory fakes. The script also asserts that every byte outside `connect` equals the exact original, and that the complete port-name-policy line is unchanged; this independently preserves `Link`, transfers and rendered markup.

## Limits and next consumer

No physical model/serial verification, actual device, real MIDI permission/API request, physical SysEx, samples, shared branch write or publication was used or authorized. No unrelated full suite was duplicated. Current remote pin/ownership and firmware evidence provenance are consumed from the producer packet rather than independently refetched by this reviewer. Producer build, browser and archive receipts remain separately attributable. No external-model or hardware review is claimed.

No candidate edits are requested. The creator/current incumbent should consume this exact R2 packet and first check applicability to its current source, then perform only the separately authorized integration stage.

## Final provenance and affected-state visual supplement

PASS. Consumed final `schema-provenance.json` and independently recomputed SHA-256, byte lengths and Git blob IDs for all six retained evidence files after removal of the transport-added terminal newline. They match the recorded immutable blobs; the firmware emitter content reviewed above is unchanged. Rechecked the candidate and both patch hashes without any change.

Actually opened `browser/candidate-connected-desktop.png` and `browser/candidate-all-malformed-mobile.png` with `view_image`. The desktop capture shows readable empty-slot status and the focused `Read again` control with a visible focus ring. The mobile all-malformed capture shows the complete final error wrapping below a visible `Connect` retry control; add/backup/restore appear disabled, and the controls and footer fit without visible clipping or horizontal overflow. No new visual findings. These screenshot observations do not independently establish keyboard or DOM semantics.

Consumed the producer's Chromium154 receipt, which records16 fake handshake cases and3 actual UI checks: keyboard Connect skips the echo and reaches later valid INFO; disconnect invalidates the ready state; all malformed replies leave retry enabled and writes disabled. It also reproduces the original page's false-success on an echo-only endpoint. No browser/off-origin errors are recorded. The reviewer did not rerun that browser suite; browser execution remains producer-attributed. Hardware and physical/model/serial limitations remain unchanged.
