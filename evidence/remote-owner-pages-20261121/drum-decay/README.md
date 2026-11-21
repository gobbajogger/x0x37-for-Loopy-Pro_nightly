# Editable drum Decay and Tail

The ten 909 fields use their original per-voice fall time on a fixed two-second axis. Three 808 toms use the engine's ring time in seconds. The seven other standard 808 slots use the renderer's normalized pot fallback. The table stores binary32 durations obtained before the display formatter rounds its text. The compiled renderer and DSP sources come from [firmware 9dd6f2df](https://github.com/gobbajogger/DnBOX/tree/9dd6f2df020340f7a82ab241ef07c6ec16195ebc/firmware/src).

The oracle checks the retained one-path donor, exact role and source ID for each field. Across 128 integer settings and two in-between animation values per control, the 17-point paths matched 88,400 original C coordinates within 0.000052 source units. Seventy of the 83 captured control occurrences now change between their endpoints. [Results](results.json)

The editable views change the existing donor path's geometry. Open Original retains the archived drawing. The preview shows the idle curve. A live overlay requires the voice's envelope and age. The separate 808 clap page requires its selected sound and stage owner.

## Reproduce

Use a checkout of the candidate and the pinned public firmware. The unit test uses a digest at one sixteenth of a source unit. The independent scan compares individual coordinates against C with a tolerance of 0.000055.

```sh
python3 source-oracle.py "$NIGHTLY" "$FIRMWARE" /tmp/dnbox-decay-points.txt
node scan.mjs "$NIGHTLY" /tmp/dnbox-decay-points.txt
node --test "$NIGHTLY"/tests/product-remote/drum-decay.test.mjs
```
