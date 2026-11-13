# X0X37 nightly

This is the **nightly / beta channel** for DnBOX (X0X37) firmware and its web installer. The production repository is [gobbajogger/X0X37-for-Loopy-Pro](https://github.com/gobbajogger/X0X37-for-Loopy-Pro).

## Install (beta)

Use Chrome or Edge on a computer, with an **SMK-37 Elite** or **SMK-37 Pro** on USB:

**[Open the nightly installer](https://gobbajogger.github.io/x0x37-for-Loopy-Pro_nightly/install/)**

The current public package on this channel is **0.0.25.1** (software-checked, **device not tested**). Pick the Elite or Pro package that matches your keyboard.

- **Back up your sample slots before you install.**
- Do not unplug the USB cable while firmware is being written.
- You can return to M-VAVE stock firmware from the installer or with [M-VAVE M-UPGRADE](https://www.m-vave.com/download).

A **0.0.26** package was briefly published here and was **withdrawn** after a black-screen boot. Do not install 0.0.26. For the main (non-nightly) installer, see https://gobbajogger.github.io/X0X37-for-Loopy-Pro/install/

Firmware `.fwsc` packages, controller images, proprietary SDK/toolchain files and credentials are not committed in this repository. Live packages are served from the published Pages catalog.

## What this repository is

It holds the public installer source and development status for the nightly channel. The visual design of the installer is inspired by the interaction patterns, not the code or assets, of [Meshtastic Flasher](https://flasher.meshtastic.org/), [WLED Installer](https://install.wled.me/) and [qFlipper](https://docs.flipper.net/zero/basics/firmware-update).

To preview installer source locally (this is not the live catalog):

```sh
npm test
npm run build
python3 -m http.server 8000 --directory docs
```

Open `http://localhost:8000/install/` in Chrome or Edge. Do not flash a device only to check the layout.

Committing source here does not, by itself, update the live nightly site, production `main`, or any device. Publication is a separate step.

## Licence

GPL-3.0-only. See [LICENSE](LICENSE). Upstream project terms and credits are in the main repository's [LICENSING.md](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/main/LICENSING.md).
