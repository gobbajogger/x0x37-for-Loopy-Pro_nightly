# Installer workflow revision

Both Install firmware and Import samples appear at the page top before the product introduction. The install route has a real `#firmware` target. Device selection, available version, consent, install status and recovery remain the existing implementation. Model naming help and source/hash/build evidence are optional disclosures. Experimental status, matching-model guidance, sample backup and first-install data replacement remain at the action.

The short introduction explains standalone music-making. Expandable setup guidance separates standalone, SMC and Loopy Pro. Capabilities are grouped by the musician's activity; see FEATURE-INVENTORY.md. The existing GitHub Issues tracker is enabled, Discussions disabled: optional request links use native GitHub reactions. The page implements no vote storage, account system or new service.

## Exact evidence

- Frozen recovery commit: `160b905cbf3c985d5c554f66dbe4418c22e06825`, tree `28c90a8856dd8c272969138e4fa0a26fdb99d006`; exact PR18 correction preserved before this authorized revision. Original PR18 remains untouched.
- Final source blob and exact preview hashes: receipt.json. Independent review: final-independent-review.json. Catalog Git and actual live HTTP bytes match SHA256 `1b6dca6cf076d282788b5ff6e7abd4eb376f8b5844f7e899aa283e1f5288be45`, latest `nightly-4ee8f377-dev`.
- Current-catalog fixture uses unchanged `renderInstaller` and exact live catalog. Its bytes were compared to final source output. Held downloads provide truthful loading-state previews; negative tests use intentionally invalid package bytes and confirm install/download refusal. No real firmware bytes or device I/O are involved.
- `npm test`, generated output parity, 98 presentation checks, 29 workspace checks, 30 current-catalog checks and 67 independent browser checks PASS. Narrow final markup/copy changes received independent checks. Logs are retained. No hosted Actions tests.
- Operation controls, catalogs and package/MIDI/sample libraries are unchanged. Shipping script differences are only three informational strings: English/Japanese consent copy and the default workspace status text. Busy warnings, admission, install, backup/restore, stock recovery and state logic are unchanged. Prior expensive operation coverage is reused for unchanged logic; actual affected page/navigation checks were rerun.

## SMC reconstruction

The actual PR168 native frame at `b8794f9f10b0be68bf21579d43d4a6fef6cd4d72` is the reference for `../assets/firmware-ui/smc-pr168.png` and `.svg`. A private isolated archive of that exact source was instrumented with the existing `../ui-fidelity-evidence-20261025/trace-renderer.py`. The host UI harness sets HOME / 303A, opens/closes the same list and song views as its `test_action_captions_and_knobs`, then turns knob8 and captures. `smc-b879-trace.log` preserves the actual drawing commands; the unchanged vectorize.py uses original source Barlow font outlines and native advances. The reconstructed frame was compared visually with the original native render. It preserves selected 303A title, filter resonance20, true PART/HOME captions and knob position feedback. It is smooth vector geometry, not byte-identical device raster or hardware proof.

Later drum-name/Pause-lock source is owned by the active firmware stage. Its final pinned source/render handoff is not yet delivered; no output is invented. The site labels the displayed SMC source as newer preview, outside downloadable builds, and explicitly states the later changes are pending their final reference.

## Reproduction and next owner

Run `npm run build` and `npm test`; use the existing presentation and workspace browser scripts in an agent headless-browser environment. The published catalog is a fixture input, never a replacement for preview-catalog.json or source docs/versions.json. Rebind the final presentation fingerprint via the unchanged qualified renderer before any separately authorized rollout; keep the current real catalog. Parent alone chooses an integration candidate, never both PR18 and PR19. No merge, deployment, hardware claim, permission change or public firmware binary is included.
