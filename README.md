# DnBOX nightly

This repository is the **beta / nightly channel** for DnBOX firmware and its web installer.
The production repository is [gobbajogger/X0X37-for-Loopy-Pro](https://github.com/gobbajogger/X0X37-for-Loopy-Pro).

DnBOX is firmware for the **M-VAVE SMK-37 Elite** and the **SMK-37 Pro**.
It turns the keyboard into a groovebox.
You can play it with [Loopy Pro](https://loopypro.com/) or as a stand-alone instrument.

Current public packages support the SMK-37 Elite and the SMK-37 Pro only.
Starrykey 37 Play uses the SMK-37 Pro package.
FM-1 builds exist in the production source tree.
They are not in the current public packages.

[![Upstream X0X on the M-VAVE FM-1 (historical reference, watch on YouTube)](https://img.youtube.com/vi/cZLYrZaLDUk/maxresdefault.jpg)](https://www.youtube.com/watch?v=cZLYrZaLDUk)

## What it does

DnBOX runs a **909**, an **808**, two bass slots, and a **breakbeat player** at the same time.

| Part | What it is | Based on |
|---|---|---|
| 909 | 11 voices: modelled kick, snare, toms, rim and clap, with sampled hats and cymbals | [9W9](https://github.com/athousanddetails/schwung-9W9) (samples from ER-99) |
| 808 | 11 tracks, with the 808's tom/conga, rim/claves and clap/maracas switches | [8W8](https://github.com/athousanddetails/schwung-8W8) |
| Chicago | The 303 engine, with Open303 Devilfish-style ranges and a TB-3PO line generator | [schwung-303](https://github.com/charlesvestal/schwung-303), [schwung-tb3po](https://github.com/charlesvestal/schwung-tb3po) |
| Miami | A separate bass engine. Miami is not a 303 | — |
| Break | A loop cut into eight slices and rearranged as it plays | [BB Gen](https://github.com/mestela/schwung-breakbeat) |

Each bass slot can run Chicago or Miami.

In **0.0.26**, each bass slot can also run **Juno** or **Drone**.
Juno is a six-voice subtractive engine with chorus.
Drone is a four-voice string-machine engine.
Juno and Drone are not 303 engines.
Juno and Drone can record a held-key chord.
These engines and held-key chords are not in **0.0.25.1**.

Each part can use its own step length (up to 64 steps) and rate.
Parts can drift against each other.
Pattern changes wait for the end of the bar.
You can chain patterns and record knob moves.

Playback is stereo, through a shared reverb, tape delay and master compressor.
Over USB the keyboard is a MIDI device and an audio interface.
The keyboard needs no driver.

On the SMK-37, clip mode can act as an Akai APC40 mkII for Loopy Pro.
See [ble/README.md](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/main/ble/README.md) in the production repository for Bluetooth MIDI.

## Versions

The **[nightly installer](https://gobbajogger.github.io/x0x37-for-Loopy-Pro_nightly/install/)** offers the current **0.0.26** package, and also keeps 0.0.25.1.
The project withdrew an earlier 0.0.26 package, pending a boot fix.
Do not install that withdrawn package.
Use only the current 0.0.26 package from the nightly installer.
The nightly installer can also list older development builds. Those builds are for testing only.

The current stable release is **DnBOX 0.0.25.1**.
Download it from **[GitHub Releases (latest)](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/releases/latest)**.

0.0.25.1 and 0.0.26 are owner-tested on an SMK-37 Elite. The Pro is not yet tested.
See the [0.0.25.1 release notes](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/releases/tag/v0.0.25.1) and the [nightly installer](https://gobbajogger.github.io/x0x37-for-Loopy-Pro_nightly/install/).

## Install

Use Chrome or Edge on a computer.
Connect an **SMK-37 Elite** or **SMK-37 Pro** with USB.

- **[Nightly installer](https://gobbajogger.github.io/x0x37-for-Loopy-Pro_nightly/install/)** (current 0.0.26, and 0.0.25.1)
- **[Current stable packages (v0.0.25.1)](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/releases/latest)**
- **[Main web installer](https://gobbajogger.github.io/X0X37-for-Loopy-Pro/install/)**

Pick the package that matches your model (**Elite** or **Pro**).
Starrykey 37 Play uses the SMK-37 Pro package.
**Back up your sample slots before you install.** The installer can do this for you.
Do not unplug the USB cable during a firmware write.

Get the 0.0.25.1 packages from GitHub Releases.
Confirm the version name before you write the keyboard.
You can drop a downloaded `.fwsc` file on the web installer.

## Manual and help

- **[Manual](https://gobbajogger.github.io/X0X37-for-Loopy-Pro/manual/)**. The published manual is for the FM-1. [SMK37.md](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/main/SMK37.md) in the production repository has the SMK-37 keyboard map.
- **[Sample importer](https://gobbajogger.github.io/X0X37-for-Loopy-Pro/breaks/)** — import your own break loops
- **[Projects](https://gobbajogger.github.io/X0X37-for-Loopy-Pro/projects/)** — save, load and export projects

Repository and Pages URLs still use the previous name, because the GitHub repository has not been renamed.

## Restore

If an install fails, the keyboard becomes unresponsive, or you want the factory software back:

1. Keep the USB cable plugged in until any write in progress finishes. Do not unplug during a write.
2. Use the [nightly installer](https://gobbajogger.github.io/x0x37-for-Loopy-Pro_nightly/install/) to restore **M-VAVE stock firmware**, or use [M-VAVE M-UPGRADE](https://www.m-vave.com/download).
3. If you have a sample-slot backup, restore it after the keyboard runs again. Use the installer, or use `tools/x0x_slots.py restore` in the production repository.

This project does not document a special SMK-37 button gesture for recovery.
Use the installer and the backup steps above.

## Samples, projects and presets

DnBOX does not ship with recorded breaks, only two loops from its own 909.
You can import your own loops into the sample slots at 44.1 kHz.
The SMK-37 has three slots of 80, 120 and 32 KiB (about 3.7, 5.5 and 1.5 seconds, 10.7 seconds in all).
You can ask for 22.05 kHz to fit twice as much at lower quality.

The [sample importer](https://gobbajogger.github.io/X0X37-for-Loopy-Pro/breaks/) does this from Chrome or Edge.
The installer can back up the slots and write them back after an update.

The production repository has command-line tools for the same work:

```
tools/upload_breaks.py --bars amen.wav think.wav ...   # take one bar of each and upload them
tools/upload_breaks.py --rate 22050 --bars ...          # half the rate: twice the room, duller
tools/upload_breaks.py --dry-run OUTDIR ...            # see what fits, without a device
tools/x0x_slots.py backup my.x0xslots                  # save every slot (read-only)
tools/x0x_slots.py restore my.x0xslots                 # write a backup back (asks first)
```

Those tools are in [gobbajogger/X0X37-for-Loopy-Pro](https://github.com/gobbajogger/X0X37-for-Loopy-Pro).

You can save, load and reset a project on the keyboard.
You can export or import a portable `.x0xproject` file from the [Projects](https://gobbajogger.github.io/X0X37-for-Loopy-Pro/projects/) page.

The device can recall factory Chicago and Miami presets.
User preset file import and export is not in the current packages.

This project's licence does not cover recorded breaks.
Those recordings belong to whoever made them.

## What this repository is

It holds the public installer source and development status for the DnBOX nightly / beta channel.
The installer takes its interaction patterns, not its code or assets, from [Meshtastic Flasher](https://flasher.meshtastic.org/), [WLED Installer](https://install.wled.me/) and [qFlipper](https://docs.flipper.net/zero/basics/firmware-update).

This source branch does not contain firmware `.fwsc` packages, controller images, proprietary SDK/toolchain files or credentials.
The published Pages catalog on the `gh-pages` branch serves the live packages.

To preview installer source locally (this is not the live catalog):

```sh
npm test
npm run build
python3 -m http.server 8000 --directory docs
```

Open `http://localhost:8000/install/` in Chrome or Edge. Do not flash a device only to check the layout.

Committing source here does not, by itself, update the live nightly site, production `main`, or any device.
Publication is a separate step.

Firmware build steps are in [BUILDING.md](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/main/BUILDING.md) in the production repository.

## Licence and credits

DnBOX comes from [Felucca](https://github.com/hugelton/Felucca) by Leo Kuroshita (Hügelton Instruments).
[Charles Vestal](https://github.com/charlesvestal) then made [X0X](https://github.com/charlesvestal/fm1-x0x), groovebox firmware for the M-VAVE FM-1.
[genkigenki](https://github.com/genkigenki) then made the [X0X37 SMK-37 port](https://github.com/genkigenki/fm1-x0x).
DnBOX keeps Felucca's foundations: the hardware layer, USB, the update loader, the web installer and the storage.
It replaces the instrument on top.

DnBOX is GPL-3.0-only, like Felucca, 9W9, 8W8 and schwung-tb3po.
Open303 (by Robin Schmidt) is MIT.
The project ports BB Gen from mestela's schwung-breakbeat.
Upstream declares MIT.
The inherited port uses GPL-3.0-only and retains the MIT notice.

The 909's hi-hat, ride and crash samples come from ER-99 (Matthew Cieplak, GPL-3.0).
The fonts are Barlow Semi Condensed and Terminus (SIL OFL 1.1).
The BLE-MIDI host (from felucca-bsp) and the Bluetooth controller interface are MPL-2.0.
JieLi's Bluetooth files are never part of the firmware source tree in the production repository.
Packages include three JieLi SDK files (Apache-2.0).
See [LICENSING.md](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/main/LICENSING.md) in the production repository and [LICENSE](LICENSE) in this repository for the full terms.

Felucca's own assets that are not under its GPL are not part of this fork.
Those assets are the icon set, the panel photo and the Hügelton drum pack.

Felucca and Hügelton Instruments are names of Hügelton Instruments.
M-VAVE, FM-1, SMK-37 and MKE-P37 are trademarks of their respective owners.
TR-808, TR-909 and TB-303 are trademarks of Roland Corporation.
Akai, APC40 and APC40 mkII are trademarks of inMusic Brands, Inc.
Loopy Pro is a product of A Tasty Pixel.

Novation and Launchpad are trademarks of the Focusrite group.
All other names belong to their respective owners.
DnBOX uses these names only to describe what the parts emulate and which products it can operate with.
DnBOX has no affiliation with these owners, and these owners do not endorse DnBOX.

The SMK-37 firmware answers a MIDI Device Inquiry with the Akai and APC40 mkII IDs only for interoperability with host software such as Loopy Pro.

## Support the original creators

DnBOX does not take donations.
It builds on other people's work.
If you want to support it, support the original creators directly:

- Leo Kuroshita / Hügelton Instruments (Felucca): [GitHub Sponsors](https://github.com/sponsors/hugelton) or [Felucca on itch.io](https://hugelton.itch.io/felucca)
- Charles Vestal (X0X, schwung-303, TB-3PO, Polly): [X0X](https://github.com/charlesvestal/fm1-x0x) or [GitHub](https://github.com/charlesvestal)
- genkigenki (X0X37 SMK-37 port): [SMK37](https://genkigenki.github.io/smk37/) or [the port](https://github.com/genkigenki/fm1-x0x)
- athousanddetails (9W9, 8W8): [GitHub](https://github.com/athousanddetails)
- Matthew Cieplak (ER-99): [ER-99](https://github.com/matthewcieplak/er-99)
- Robin Schmidt (Open303): [Open303](https://github.com/RobinSchmidt/Open303)
- mestela (BB Gen): [schwung-breakbeat](https://github.com/mestela/schwung-breakbeat)
- midilab (jc303): [Support midilab](https://midilab.co/#support)
- Dave Mollen (dm-Rat): [GitHub Sponsors](https://github.com/sponsors/davemollen)
- djphazer (Hemisphere Suite TB-3PO): [GitHub](https://github.com/djphazer)

## More links

- [Production repository](https://github.com/gobbajogger/X0X37-for-Loopy-Pro)
- [BUILDING.md](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/main/BUILDING.md) in the production repository — how to build the firmware
- [LICENSING.md](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/main/LICENSING.md) — licence terms
- [LICENSE](LICENSE) — GPL-3.0-only text
- [SMK37.md](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/main/SMK37.md) — SMK-37 keyboard map
- [ble/README.md](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/main/ble/README.md) — Bluetooth MIDI

Use the GitHub issue tracker on the [production repository](https://github.com/gobbajogger/X0X37-for-Loopy-Pro) to report a problem.
