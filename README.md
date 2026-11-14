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

**Recommended published release (hardware qualification incomplete): DnBOX 0.0.25.1.** Its [GitHub Release](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/releases/tag/v0.0.25.1) is available, but the installed-package hash of the owner-reported Elite test was not confirmed and the Pro has not been device-tested. Downloadable model-specific packages:

- [SMK-37 Elite: `dnbox-x0x37-0.0.25.1-elite.fwsc`](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/releases/download/v0.0.25.1/dnbox-x0x37-0.0.25.1-elite.fwsc)
- [SMK-37 Pro: `dnbox-x0x37-0.0.25.1-pro.fwsc`](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/releases/download/v0.0.25.1/dnbox-x0x37-0.0.25.1-pro.fwsc)

**For hardware testing only: DnBOX 0.0.26 candidate** at `94197fc8`, in the [nightly installer](https://gobbajogger.github.io/x0x37-for-Loopy-Pro_nightly/install/). The [live package catalog](https://gobbajogger.github.io/x0x37-for-Loopy-Pro_nightly/versions.json) labels it **“HARDWARE TEST — BOOT/RESTART NOT YET VERIFIED”**. Its versioned filenames are `DnBOX-0.0.26-SMK37-Elite-94197fc8-hwtest.fwsc` and `DnBOX-0.0.26-SMK37-Pro-94197fc8-hwtest.fwsc`. Do not treat them as fully hardware-qualified or suitable for production use. An earlier 0.0.26 package was withdrawn following a boot concern.

The owner reported trying 0.0.25.1 and an earlier 0.0.26 build on an SMK-37 Elite, without a confirmed installed-package hash. The current corrected 0.0.26 candidate still needs physical startup, restart and recovery testing. The SMK-37 Pro has no reported physical test; neither model has full hardware qualification. Keep a stable recovery package and sample backup before testing.

## Install

On desktop Chrome or Edge, connect by a USB data cable, click **Connect**, and grant **MIDI and SysEx** access. If denied, review browser MIDI/SysEx permission and retry; close other MIDI programs. Verify the model **printed on the hardware** (SMK-37 Elite or Pro), not just the USB name. Starrykey 37 Play uses the Pro package.

- **[Recommended published 0.0.25.1 installer](https://gobbajogger.github.io/X0X37-for-Loopy-Pro/install/)**: select the **visible model and admitted version** from the catalog. Its local `.fwsc` / stock chooser is **hidden and disabled**, so a downloaded file from [GitHub Releases](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/releases/tag/v0.0.25.1) cannot be dropped into that page.
- **[Nightly installer](https://gobbajogger.github.io/x0x37-for-Loopy-Pro_nightly/install/)**: for deliberate developer/hardware testing only. Its 0.0.26 build at `94197fc8` has **unverified boot/restart**. The nightly source contains a separate, visible advanced local-file chooser, but its presence is **not proof of qualified stock recovery**; prefer listed admitted packages for DnBOX updates.

**First switch from M-VAVE factory firmware:** There is no DnBOX app or project yet, so a DnBOX `.x0xslots` sample backup and `.x0xproject` export are **not available**. Use any manufacturer-supported method to preserve factory data, if available. Choose only the admitted model-specific firmware shown in the installer; if the current app cannot complete the main installer's sample-layout preflight and installation is refused, **stop rather than bypass the check**. Do not assume the nightly installer's best-effort backup can save factory data.

**For an existing running DnBOX app (update/reinstall):** Stop playback; use [Samples](https://gobbajogger.github.io/X0X37-for-Loopy-Pro/breaks/) to save `.x0xslots` and separately use [Projects](https://gobbajogger.github.io/X0X37-for-Loopy-Pro/projects/) to export a portable `.x0xproject` **with samples**. Verify both files exist. The main installer blocks a risky write if a required sample backup fails. The **published nightly installer** attempts a backup, but a backup failure can **show a warning and continue automatically without a recoverable archive**, permanently losing old loops. This warning applies to the published nightly site, **not** the older fail-closed installer source in this PR branch (see the source/deployment note below). Package and model admission checks still apply. Do not unplug USB during an active firmware write.
## Manual and help

- **[SMK-37 keyboard map](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/main/SMK37.md)** for the older port; the [0.0.26 keyboard manual (draft)](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/docs/manual-94197fc8/docs/MANUAL.md) covers the newer controls, glyphs, chords and presets. It does not describe published 0.0.25.1. The [published web manual](https://gobbajogger.github.io/X0X37-for-Loopy-Pro/manual/) still covers the FM-1.
- **[Sample importer](https://gobbajogger.github.io/X0X37-for-Loopy-Pro/breaks/)** — import your own break loops
- **[Projects](https://gobbajogger.github.io/X0X37-for-Loopy-Pro/projects/)** — save, load and export projects

Repository and Pages URLs still use the previous name, because the GitHub repository has not been renamed.

## Restore

Choose recovery by the **actual detected state**, not a transient disconnect or USB display name:

1. **Already-running DnBOX app (update or reinstall).** Back up **both** `.x0xslots` and `.x0xproject` while they are readable. Use an **admitted published 0.0.25.1 package in the [main installer](https://gobbajogger.github.io/X0X37-for-Loopy-Pro/install/)** when seeking the recommended release, not the main site's hidden local upload.
2. **Only the update loader responds after an interrupted write.** The normal app's sample reader is absent, so **no new sample/project export is possible from the loader**. The published installer can resume an interrupted update from its loader using a **listed admitted package for the printed physical model**, but no app-side backup is made first; existing samples may be lost. A 0.0.26 nightly candidate remains an unqualified test even if the loader accepts it. If there is no safely admitted matching package, **stop**, rather than force a foreign image or guess a button gesture.
3. **Uncertain reboot or no device appears.** Wait for an active write to finish, then reconnect and use **Connect / Rescan** to check whether the normal app or `ota-` update loader actually answers. Check browser MIDI/SysEx permission; avoid blind retries. A loader identity is not a completed application boot.
4. **Return to factory M-VAVE firmware.** Download the **exact model's** official stock package and follow [M-VAVE M-UPGRADE](https://www.m-vave.com/download). The main site's file chooser is hidden and no factory image is bundled. The nightly page has an advanced local chooser in its source, but it is not independently hardware-qualified as a stock-recovery route; the manufacturer path is the documented recommendation.

**After the write**, `Done` means the web updater received a fresh, matching **application MIDI identity**, not that sound, long-term boot/restart or data recovery were physically verified. Check the actual running UI and sound; inspect the project and each sample slot. An incomplete/partial sample restore is **not success**. Preserve the earlier archives until sample read-back and project content have been checked. Stock firmware need not understand DnBOX sample slots.
## Samples, projects and presets

DnBOX does not ship with recorded breaks, only two loops from its own 909.
You can import your own loops into the sample slots at 44.1 kHz.
The SMK-37 has three slots of 80, 120 and 32 KiB (about 3.7, 5.5 and 1.5 seconds, 10.7 seconds in all).
You can ask for 22.05 kHz to fit twice as much at lower quality.

The [sample importer](https://gobbajogger.github.io/X0X37-for-Loopy-Pro/breaks/) does this from Chrome or Edge.
While the normal app responds, the Samples page can back up slots; after updating, compatible saved slots can be restored. In loader-only recovery, no new sample backup can be read.

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

**Installer source versus published site.** This PR branch's [local installer preview at `fca2333b`](https://github.com/gobbajogger/x0x37-for-Loopy-Pro_nightly/blob/fca2333bb4abd635dfd31421935d98176786bd0a/docs/install/index.html#L2176-L2232) stops on required sample-backup failures; it is **not** the current nightly site's backup policy. The current [`main` installer source at `0fa5ac71`](https://github.com/gobbajogger/x0x37-for-Loopy-Pro_nightly/blob/0fa5ac71371bcfe97ef8ebf1966df7477c1bea6b/docs/install/index.html#L2269-L2282) and the [published `gh-pages` installer at `5734c215`](https://github.com/gobbajogger/x0x37-for-Loopy-Pro_nightly/blob/5734c215c233fb1431d80e26558f7ac662c6a992/install/index.html#L2269-L2282) instead catch backup failures, display a warning and can proceed **without** sample protection. These are pinned source artifacts, not a new browser or hardware test. Always save and verify independent backups before updating an existing DnBOX installation.

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
