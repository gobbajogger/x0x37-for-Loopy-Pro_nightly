# Bundled NIGHTLY installer source evidence

Base is PR14 `593c0fc3c18200fd887373bff4602bfd322f0d54`, root
`e1255056dff9ebdcb2d1836e6e139dfa506f8995`. This draft is stacked on its owned
hardening branch and must preserve that prerequisite. PR12 history-only publication and
PR15's unaccepted gate-removal proposal are not adopted. Main, Pages, live catalogs and
firmware/controller hosting are unchanged.

New candidate preparation requires bundled controller strategy, exact declared size/hash
and actual embedded validation; only two pinned existing legacy package identities may
retain owner-supplied receipts. Browser legacy compatibility remains. Qualified bundled
selection hides the separate file field after checking real layout/CRCs/hash/model, and
passes unchanged combined logical bytes to the existing backup/OTA install boundary.
Missing/mismatched controllers fail before download/MIDI. Pending and failed verification
never claim Bluetooth is included. Stale selection, metadata denials and DEV consent remain.

Build, complete Node suite and complete headless Chromium suite exit0. Existing677 installer
checks,34 history checks and61 bundled checks pass. Synthetic bytes and mocked MIDI prove
software boundaries only. New62 Node assertions cover parser/composition/qualification;
58 admission,336 receipt negatives and41 existing shipping-write cases also pass. Tests use
a task-local Playwright/Chromium runtime; macOS headless process launch required sandbox
escalation. No computer-use or GUI tool was used.

Independent review accepted exact source blobs and reran Node and61 headless bundled checks;
see independent-review.json and validation.json. The reviewed parser also checked actual
owner-local complete Elite/Pro outputs and refused the actual blank public input. No
artifact URL or installable catalog entry was added. Rights, notices, exact firmware QA,
immutable hosting and publisher served-byte verification remain adoption requirements.

A macOS test exposed the existing CLI path-alias guard silently skipping execution through
/var -> /private/var; direct-launch comparison now resolves the script real path. The
existing actual-CLI async parent-rebinding positive/negative test passes, and stdin imports
remain valid. No qualification gate was removed.
