# SuperJ6 tempo periods measured from the isolated LFO

The Linux run renders the source-derived Build 9 Conductor rate, phase, index and square-wave lookup as mono PCM. The three tempos are 90, 120 and 180 BPM. All 18 settings produced the expected musical periods at each tempo. The table uses a quarter note as one beat. A triplet note lasts two thirds of its straight counterpart. The musical names describe the measured durations.

Source revision [74b50bdf](https://github.com/gobbajogger/DnBOX/blob/74b50bdfe2e1d9ac7f22445cdf5ab3726bb85272/experiments/superj6-conductor-source-20261115/lfo_laws.cpp) contains a portable reconstruction of the inspected Conductor. Executing the proprietary AU and recovering its literal display strings remain separate outstanding checks. The [archived original AU bench](https://github.com/gobbajogger/DnBOX/blob/5837c73f/experiments/sound-hardware-v1/sj6-factory/original/README.md) documents seven component audio captures and the inputs required to run native ARM64 code on Linux. Those recordings cover chorus, CoreSynth and CoreSampler. They do not sweep the tempo control.

| Bin (fastest first) | Remote quarter-note beats per cycle | Musical duration | Measured Hz at 120 BPM |
|---:|---:|---|---:|
| 0 | 1/16 | 1/64 note | 32 |
| 1 | 1/12 | 1/32-note triplet | 24 |
| 2 | 1/8 | 1/32 note | 16 |
| 3 | 1/6 | 1/16-note triplet | 12 |
| 4 | 1/4 | 1/16 note | 8 |
| 5 | 1/3 | 1/8-note triplet | 6 |
| 6 | 1/2 | 1/8 note | 4 |
| 7 | 2/3 | 1/4-note triplet | 3 |
| 8 | 1 | 1/4 note | 2 |
| 9 | 4/3 | 1/2-note triplet | 1.5 |
| 10 | 2 | 1/2 note | 1 |
| 11 | 8/3 | whole-note triplet | 0.75 |
| 12 | 4 | whole note | 0.5 |
| 13 | 8 | 2 whole notes | 0.25 |
| 14 | ≈12 | about 3 whole notes | 0.16665 |
| 15 | 16 | 4 whole notes | 0.125 |
| 16 | ≈24 | about 6 whole notes | 0.08335 |
| 17 | 32 | 8 whole notes | 0.0625 |

The two approximate durations follow from the original factors 0.3333 and 0.1667. Each measurement locates three falling transitions directly in unsigned 8-bit PCM sampled at 8 kHz. The interval from the first transition to the third spans two complete cycles. Each bundled WAV has an individual SHA-256 in [the measurements](measurements.json). All 54 [component renders](lfo-component-wav.zip) can be inspected without a plugin host.

To repeat the run with the three pinned source files in one directory, use `python3 replay.py SOURCE_DIRECTORY NEW_OUTPUT_DIRECTORY`. The script checks all three digests before compiling and verifies each PCM independently after rendering. [Renderer](render.cpp) · [Measurement script](replay.py)
