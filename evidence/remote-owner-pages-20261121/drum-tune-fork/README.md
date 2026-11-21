# Drum Tune glyphs

At base `16afbf2d`, 7 of 83 drum fields changed their schematic between the minimum and maximum values. Six were Attack fields and one was 808 kick Tone. The candidate brings the count to 28 by applying the firmware tuning fork to all eleven 808 voices and ten 909 voices. The 909 kick's Tune belongs to its separate three-parameter pitch sweep. Original source drawings remain in the captured `components.json`. Identification of the owner's full 17:00 batch remains open. [Firmware role selection](https://github.com/gobbajogger/DnBOX/blob/9dd6f2df020340f7a82ab241ef07c6ec16195ebc/firmware/src/app/ui.c#L8497) · [Native fork](https://github.com/gobbajogger/DnBOX/blob/9dd6f2df020340f7a82ab241ef07c6ec16195ebc/firmware/src/app/ui_drum_voice.inc#L225)

The C replay exercises all 128 raw values per voice and compares 112,896 SVG coordinates. The largest deviation was 0.00005138 source units. Chromium 151 exercised all 21 Tune fields in the 844×390 compact strip and the 1440×900 editor. For each field it selected both raw endpoints, pressed Undo twice, and compared five curve states against the C output. The compact Original view also matched the entire stored SVG tree on every voice. Reduced motion selected the settled shape immediately. [Machine results](results.json)

Run from this evidence directory with the candidate repository checked out in `NIGHTLY`, the built site's root in `PRODUCT`, and either a public DnBOX checkout or the pinned raw C file in `FIRMWARE`. The oracle compiler only needs a C11 compiler and the single public source file. The browser replay needs Python Playwright and the project's sandboxed Chromium.

```sh
python3 source-oracle.py "$FIRMWARE" /tmp/dnbox-tune-points.txt
node scan.mjs "$NIGHTLY" /tmp/dnbox-tune-points.txt
python3 browser.py "$PRODUCT" /tmp/dnbox-tune-points.txt /tmp/dnbox-tune-browser.json
```
