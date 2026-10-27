# X0X37 Nightly — Installer UI Preview

This is the **development-preview repository** for the X0X37 web firmware installer. It is separate from the production [X0X37-for-Loopy-Pro](https://github.com/gobbajogger/X0X37-for-Loopy-Pro) repository and its live GitHub Pages installer.

This repository contains public browser/installer source and development status. Firmware `.fwsc` packages, controller `ctl.img` images, proprietary SDK/toolchain or DSP inputs, credentials and unrelated private samples/backups are not committed here. The default source-preview build has an empty catalog. A separately qualified NIGHTLY DEV catalog may link to verified immutable external packages through the sole publisher's authorized path; a design preview does not establish device validation. See the [current channel and continuation rules](docs/nightly-first-development-gate.md).

## What you will notice

- Dark, instrument-inspired interface with a prominent USB connection action and three clear steps.
- Keyboard model selection stays visible, reducing mistaken model choice.
- More readable firmware version labels, safety badges, and backup/recovery information.
- The stock firmware and required legacy controller-image pickers keep the latest file selection authoritative and require fresh confirmation.
- English/Japanese labels and keyboard-accessible status and controls.

The visual design is inspired by the *interaction patterns*, not the code or assets, of [Meshtastic Flasher](https://flasher.meshtastic.org/), [WLED Installer](https://install.wled.me/) and [qFlipper](https://docs.flipper.net/zero/basics/firmware-update).

## Initial origin and source provenance (2026-10-23)

- Upstream: `gobbajogger/X0X37-for-Loopy-Pro`
- Installer design source: `lane/installer-studio-design-20261023` at `33c60ee9d3161de48b11ce890410384429983886` ([PR #32](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/pull/32)).
- Initial dependency chain: safety [PR #31](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/pull/31) → UX [PR #24](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/pull/24) → DEV catalog [PR #20](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/pull/20).
- Included sources are public GPL-3.0-only X0X37/Felucca derivatives. Original copyright notices are retained; see [LICENSE](LICENSE).

These pins describe the initial import. Read the current branch, PR state and maintained rules for today's work; the historical PR chain is not a standing prerequisite or a new owner-approval gate.

## Preview and verification

The checked-in `docs/` directory holds a browser-ready, **source-only** Pages preview, including the sample-backup interface. It does not contain hosted firmware packages.

Run locally with Node.js 22+ and Python 3:

```sh
npm test
npm run build
python3 -m http.server 8000 --directory docs
```

Open `http://localhost:8000/install/` in Chrome or Edge. The page can show model/firmware-selection states; actual hardware operations require a separately reviewed firmware package and user-controlled device testing. Never select a file for real flashing merely to evaluate layout.

**Publication is separate.** Committing source and a static preview to this public nightly repository does not update production `main`, production `gh-pages`, the live production installer, any firmware image or the device. The designated NIGHTLY Pages publisher continues the currently authorized deployment stage, then verifies its Git ref and actual HTTP-served bytes. A source commit alone is not a deployed site.

## Safety and limitations

The upstream Web MIDI and sample-preservation implementations are retained in source. The NIGHTLY preview includes no validated/hosted `.fwsc` files. A local `.fwsc` can still be provided manually and is subject to explicit model and write confirmation; do not treat the preview as a hardware-tested installer. Real USB flashing, sample-slot backup/readback, release-gate and physical testing are **not** established by UI tests.

Source editing does not transfer publisher ownership or authorize production promotion or device writes. Deliver the checked source through its normal PR route, provide the next owner an exact-input handoff, and continue the next authorized action without a fresh chat approval. The sole publisher owns Pages deployment; the owner operates hardware. Never force-push.

## License

GPL-3.0-only. Full corresponding source for this *preview* is in `web/` and the build script; sources for the underlying project are linked above. Retain attribution and GPL terms when redistributing modifications.

New qualified NIGHTLY packages use one complete firmware file with matching Bluetooth
included. The installer verifies embedded bytes before offering download/install and hides
the separate controller field for that path. Existing published blank-slot packages retain
their exact local `ctl.img` requirement until reviewed combined artifacts are legally
qualified, hosted and published. This source change does not change the live catalog.
See [candidate preparation](docs/qualified-nightly-candidate.md).
