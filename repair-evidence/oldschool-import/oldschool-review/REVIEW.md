# Independent OLD SCHOOL importer review

**Bounded PASS**, exact7828b564c7f24b3c6e2d6616ef1df597aef286ee/tree001b61dcdc81dd566b4653da9e7fcb2e8de846b3 atopcd6a4b9. Reviewer made no source/device/GUI/publication actions; source worktree remains clean.

## Meaningful result

Actual preparation serializes fewer samples with matching lower zone rates; Off/Light1.5/Medium2/Heavy3/Max4 images retain the intended duration and musical pitch at the reference/source loop tempo. Saved sample counts, ADPCM ceil(n/2), CRC-backed archive roundtrip, and fixed512-byte occupied-slot image headers match the displayed saving calculation. Rate reduction lowers bandwidth; this does not promise independent pitch/time stretch or physical DSP identity. Other BREAK tempo/pitch/performance behavior remains explicit.

The original decoded source is retained unchanged; all settings rebuild from it. Encoded audition decodes the prepared actual ADPCM and plays at its saved-rate ratio, rather than playing unchanged source. Recut builds replacements before commit; error/cancel restores accepted controls and existing loop references. Send confirmation/escape retains0writes until explicit acceptance. The existing MIDI read correlation and backup/archive checks remain in source.

Independent checks executed:

-16actual importer/page cases PASS: serialization across all5settings, odd nibble+half-rate, unchanged-source/Off reconstruction, malformed/short refusal, actual encoded preview, atomic recut, Cancel/escape and stale-resume/source-switch cases.
-2additional actual-page cleanup cases PASS: replacement stops/disconnects prior node; late prior onended cannot clear successor; natural end releases once; settings recut and workspace invalidation stop/disconnect audio, preserving source and0writes.
-10freshJS-generated banks match author hashes. All5actual d633 BREAK C renderer variants, compiled with ASan/UBSan plus original strict warning/float flags, pass20musical/gate/live assertions each at90/120/170BPM. Actual included renderer/test source bytes match pinned d633; copied loop_bars is byte-identical. This is100host checks, not hardware proof.
-20author text-manifest hashes including exact-head fullnpm/generation/provenance logs independently matched. Fullnpm is inspected author evidence, not reviewer rerun.

## User-open artifact accuracy

`../previews/sample-oldschool-import.html` SHA25636262401736da3bed1c2fa09c5ff6435ab33b653d75d1c2ce72a6a4849f6ca93 reconstructs the actual compiled importer prefix byte-for-byte. Extra script only seeds labeled synthetic local audio/Medium2x, disables device action handlers/buttons and adds its disclosure. No external script/style resources are needed. Product default remainsOff. This is an accurate source UI/audio artifact for owner-open review, not an invented screenshot or a browser-verified render.

No source blocker found. Owner UI/audio review is still required before rollout. Actual browser rendering/listening, physical device behavior, native package qualification, firmware mirror integration and deployment are outside this result. No denied headless action was retried. Exact commands/source blobs/log digests and limits: receipt.json, preview-provenance.json, source-evidence-check.json and host/independent-receipt.json.
