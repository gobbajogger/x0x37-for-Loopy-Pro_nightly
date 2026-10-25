# One workspace for firmware and samples — source handoff

Reason: separate installer/sample pages and a decorative device illustration made it
hard to distinguish software installation, prepared sample changes and actual device writes.
Purpose: one entry at `install/`, linked from the root, with separate named actions and
real firmware renderer images. Effect: users can understand the firmware, choose a
matching build, or work with samples while retaining selected files and drafts.
The expected usability benefit is supported by headless workflow/state checks;
no human usability or physical-device validation is claimed.

## Scope and dependencies

Sole implementation writer: task28. Read-only UX helper, isolated renderer producer,
and independent implementation reviewer have bounded roles, no scheduler ownership.
Isolated branch starts at PR16 `cc7e7e8e68717acda8c774d4da8ca7d5cc401ff8`,
root `7600043f26378ff575e22bc8a8ee245e4a044d35`, itself stacked on open PR14
`593c0fc3c18200fd887373bff4602bfd322f0d54`. Both remain unmerged dependencies.
PR15 gate-policy changes are excluded. PR13 owns read-only catalog history; PR12
and the existing sole Pages publisher retain publication ownership. Main observed
`10c47659192a32821da171417069ffefdbc05d63`; Pages Git observed
`b7af05f00a91056ca732b21cbe1dc719edbcb585`. No other lane changed.

Current public HTTPS catalog was fetched on 2026-10-25 and exactly matches Pages
Git `versions.json`: only `nightly-54f2ffbc-dev`, Elite/Pro, DEVICE NOT TESTED,
legacy owner-supplied exact controller. Source preview stays empty. No catalog
entry, firmware/controller byte or installability approval is added here.

## Meaningful changes and user effects

- Replace decorative screen with production HOME/MIX/SMC renders. HOME/MIX are
  byte-identical across offered `54f2ffbc` and accepted PR144. SMC is clearly a
  newer-source-only preview. Images do not imply device photography or applied state.
  `renderer.json` pins source/blobs/commands/image hashes; accepted merged nightly
  `93449136baae02c9715ba20edc5c43176786b635` root was independently fetched and
  equals `87819bd7af981f8a7315875233f69ff720bc13ce`. No Pause lock claim.
- Keep both tool contexts mounted, with one visible task panel. This preserves
  firmware selections and sample drafts across hash navigation/back/forward.
  Same-origin sample isolation retains actual parser/bounds/render/restore code
  and avoids duplicate conflicting IDs/styles. Standalone `/breaks/`, `/builds/`,
  `/install/#buildarchive` still work; root deliberately enters `/install/`.
- Exclude task switching while scans, writes, reads or decoding run. Inactive
  installer does not auto-scan; sample MIDI callback detaches/restores at task
  boundaries. This prevents one tool from taking another tool's pending response.
  Firmware operations invalidate sample read readiness while preserving drafts;
  an explicit reread confirms discard, including removal-only drafts. Disconnect
  also invalidates sample readiness. Device state is never inferred from a preview.
- Label Send as sample writes, and explain deletion/restore consequences and
  connection/read prerequisites. No offline import or automatic device application
  is claimed. Existing backup/readback, model/controller/consent/CRC/bounds remain.
  Added decode busy handling also prevents repeated file operations from racing.
- Optional sample-panel failure cannot interrupt firmware installation. The panel
  has a standalone fallback. Its actual source joins the qualification fingerprint,
  so acceptance cannot silently reuse receipts for different sample behavior.
- Browser guidance uses feature detection and accurate desktop Chrome/Edge advice,
  HTTPS/localhost and MIDI/SysEx permission. Safari/iOS unsupported guidance checked
  against https://developer.mozilla.org/en-US/docs/Web/API/Navigator/requestMIDIAccess
  and https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API on 2026-10-25.

## Local validation and preview

`npm run build`; `npm test`; `npm run test:browser`. The latter includes the new
`tests/workspace-browser.py` and inherited admission/history/bundled tests. Tests
use actual generated pages, real synthetic WAV parsing and mocked MIDI boundaries;
no hardware, GUI/computer-use or GitHub Actions is involved. The focused suite
covers replace/cancel, hash/back/forward, preserved drafts, pending decode exclusion,
permission retry/repeated clicks, malformed firmware and backup refusal, stale
sample refusal, and 320/390/1280px layouts. Independent review additionally checks
removal-only reread cancellation and exact MIDI callback detach/restore identity.

Serve `docs/` with a local HTTP server and open `/install/` for manual owner review.
Headless screenshots are retained in the task28 workspace; source captures/hashes
and review/validation receipts are retained here. Only curated generic firmware
renders are public assets; user media, raw device captures and private binaries
are absent. Renderer harnesses here replay after extracting the exact pinned
firmware source and placing them in its `tests/host/`; their dependencies remain
in that public pinned source, not in this browser repository.

## Exact minimal publication handoff — no deployment done

1. Existing Independent Website QA accepts the exact final PR head with PR14/PR16
   prerequisites. Existing Website Main Merger reconciles/merges source under its
   own authority. Preserve PR13 catalog history and PR12 publisher scope.
2. Sole Pages publisher uses the existing qualified renderer against the accepted
   source and retained verified catalog. The changed installer fingerprint needs
   fresh matching installer acceptance; do not copy old approvals or turn the empty
   preview catalog into the served catalog. Candidate preparation already copies
   `docs/`, including sample route and new assets, then renders qualified installer.
3. Review the generated install page, breaks page, root landing and all three
   `assets/firmware-ui/*.png` together; preserve currently qualified model packages
   and exact legacy/bundled controller facts. No firmware rebuild follows merely
   from this browser-only change, and no new binary is published in this stage.
4. Publisher alone deploys when authorized, then fetches served HTML, catalog and
   assets and verifies bytes/links/model selection. Until those checks pass, this
   is ready source/local evidence only; the live page is unchanged by this task.
