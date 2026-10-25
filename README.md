# X0X37 Nightly — Installer UI Preview

This is the **development-preview repository** for the X0X37 web firmware installer. It is separate from the production [X0X37-for-Loopy-Pro](https://github.com/gobbajogger/X0X37-for-Loopy-Pro) repository and its live GitHub Pages installer.

**Nightly is not a firmware release.** No `.fwsc` firmware, `ctl.img` controller image, proprietary SDK, DSP references, samples, secrets, or release artifacts are distributed in this repository. The installer preview's version catalog is deliberately empty; never infer device validation from a design preview.

## What you will notice

- Dark, instrument-inspired interface with a prominent USB connection action and three clear steps.
- Keyboard model selection stays visible, reducing mistaken model choice.
- More readable firmware version labels, safety badges, and backup/recovery information.
- The stock firmware and required legacy controller-image pickers keep the latest file selection authoritative and require fresh confirmation.
- English/Japanese labels and keyboard-accessible status and controls.

The visual design is inspired by the *interaction patterns*, not the code or assets, of [Meshtastic Flasher](https://flasher.meshtastic.org/), [WLED Installer](https://install.wled.me/) and [qFlipper](https://docs.flipper.net/zero/basics/firmware-update).

## Origin and exact source identity

- Upstream: `gobbajogger/X0X37-for-Loopy-Pro`
- Installer design source: `lane/installer-studio-design-20261023` at `33c60ee9d3161de48b11ce890410384429983886` (draft [PR #32](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/pull/32)).
- Dependency chain: safety [PR #31](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/pull/31) → UX [PR #24](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/pull/24) → DEV catalog [PR #20](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/pull/20).
- Included sources are public GPL-3.0-only X0X37/Felucca derivatives. Original copyright notices are retained; see [LICENSE](LICENSE).

## Preview and verification

The checked-in `docs/` directory holds a browser-ready, **source-only** Pages preview, including the sample-backup interface. It does not contain hosted firmware packages.

Run locally with Node.js 22+ and Python 3:

```sh
npm test
npm run build
python3 -m http.server 8000 --directory docs
```

Open `http://localhost:8000/install/` in Chrome or Edge. The page can show model/firmware-selection states; actual hardware operations require a separately reviewed firmware package and user-controlled device testing. Never select a file for real flashing merely to evaluate layout.

**Publication is separate.** Committing source and a static preview to this public nightly repository does not update production `main`, production `gh-pages`, the live production installer, any firmware image or the device. Nightly GitHub Pages must be enabled/deployed and checked separately if desired.

## Safety and limitations

The upstream Web MIDI and sample-preservation implementations are retained in source. The NIGHTLY preview includes no validated/hosted `.fwsc` files. A local `.fwsc` can still be provided manually and is subject to explicit model and write confirmation; do not treat the preview as a hardware-tested installer. Real USB flashing, sample-slot backup/readback, release-gate and physical testing are **not** established by UI tests.

Do not force-push, publish stable firmware, publish new GitHub Pages, or flash a keyboard as part of editing this preview.

## License

GPL-3.0-only. Full corresponding source for this *preview* is in `web/` and the build script; sources for the underlying project are linked above. Retain attribution and GPL terms when redistributing modifications.

New qualified NIGHTLY packages use one complete firmware file with matching Bluetooth
included. The installer verifies embedded bytes before offering download/install and hides
the separate controller field for that path. Existing published blank-slot packages retain
their exact local `ctl.img` requirement until reviewed combined artifacts are legally
qualified, hosted and published. This source change does not change the live catalog.
See [candidate preparation](docs/qualified-nightly-candidate.md).
