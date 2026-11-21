# 909 kick pitch depth

The captured 909 kick uses one descending sweep for P.Dpth. With the original 32-unit horizontal axis, the native renderer samples 25 positions across 100 ms. Tune supplies the 6–32 ms sweep time, Depth supplies the amount and Pitch supplies the multiplier. The kick holds its initial pitch for 16 ms. Changing any of these three settings updates the existing Depth path. The component's other two drawings remain the retained Tune and Pitch forks. The live marker requires a sounding kick's measured age and pitch. [Original idle renderer](https://github.com/gobbajogger/DnBOX/blob/9dd6f2df020340f7a82ab241ef07c6ec16195ebc/firmware/src/app/ui_drum_voice.inc#L365) · [Original kick pitch law](https://github.com/gobbajogger/DnBOX/blob/9dd6f2df020340f7a82ab241ef07c6ec16195ebc/firmware/src/dsp/drum909.c#L282)

The C probe compiled the production DSP, per-knob unit conversion and original idle drawing branch. It checked all 128 values on each axis with the other two knobs at representative settings, including both endpoints. Across 3,402 different combinations, comparisons invoked each of the three edit paths and checked 510,300 integer-setting coordinates. Two actual eased positions, raw 8.3916235 and 25.8110504, added 500 coordinates across five Tune/Pitch pairs. The original C rounded them to raw 8 and 26 before looking up physical units. The largest difference was 0.000052 source units. [Measurements](results.json)

## Reproduce

```sh
python3 source-oracle.py "$NIGHTLY" "$FIRMWARE" /tmp/dnbox-depth-points.txt
node scan.mjs "$NIGHTLY" /tmp/dnbox-depth-points.txt
node --test "$NIGHTLY"/tests/product-remote/drum-kick-depth.test.mjs
```
