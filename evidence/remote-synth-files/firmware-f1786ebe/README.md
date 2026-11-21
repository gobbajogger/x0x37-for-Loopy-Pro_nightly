# Original SuperJ6 inputs and the 17:00 glyph approval at firmware f1786ebe

Firmware merge `f1786ebec2616477163b62b029c7e77405a9c3de` includes the previously cited Linux reference-bench source and a stock firmware screen catalog. The content inventory found no authenticated original app/runner inputs, original three-LFO tempo display observations or file-by-file identities for the owner-approved 17:00 glyph group.

## Linux component evidence

| Source | Exact comparison and supported scope |
|---|---|
| Published Linux bench donor `49662e4d437421e686a6cc04b806cd0d700bab74` | All 13 files under `experiments/sound-hardware-v1/sj6-factory/original` have the same Git tree as this firmware merge, `e2f4932fcbaedab1c714a7b1bc40ab0dbe660cf3`. |
| Live sound PR 973 at `f013ecc653f2b9f0006e976a1097250e9356ce14` | Eleven of those thirteen files match, including the Linux runner, component recording hashes and original initialization result. Consolidated strengthens the Apple Swift host’s silence check to require signal on both channels and updates its README. |
| Linux AU replay | The archived run records five chorus cases, one CoreSynth note and one CoreSampler note, each 4,096 stereo frames at 48 kHz. Its original initialization stopped on Swift Foundation UUID metadata after three guest basic blocks, before creating a complete instrument. The seven raw PCM files are identified by hash in the receipt. |
| Control metadata | The public control catalog, numerical target file and behavior brief reproduce the exact blobs at `03f92a7d94ad29bdb4a6bb238311ba12776401ea`. Original rates 88/96/100 and mode flags 195/196/197 appear in 640 programs each. The candidate’s raw coverage CSV calls these six values opaque. The bank audit records 90,549 matching binary32 fields. |
| Earlier Linux tempo evidence | The Nightly evidence in `evidence/remote-synth-files/tempo-periods` records 54 distinct mono component waveforms, all 18 settings at 90, 120 and 180 BPM. The source was the portable Conductor reconstruction at `74b50bdfe2e1d9ac7f22445cdf5ab3726bb85272`. The musical-duration names were assigned from measured periods. No original AU field-string readback or movement across its 17 display transitions on each of the three LFOs is present. |

The supplied Linux runner requires the exact AU archive, bounded reference bench and musical matrix for its parser. The scan compared the accumulated content against all three pins, the checked AU executable, standalone executable, IPA, exported bank ZIP and all seven original component PCM hashes. None matched. The new-head report identifies the authenticated bank ZIP by digest and links the project file. It supplies no public archive download. The separate oscillator Linux replay explicitly reports zero original AU executions and zero complete preset pairs. This new-head review ran on the tracked evidence and did not execute the original AU.

## Firmware screens and owner approval

The current `screen-index.tsv` matches its recorded SHA-256, `9aa3a8b48b82001ffcff065968ca31a429099e943587fb9707de3cf8ca20e9ab`. It contains 1,968 frames from firmware `199f0444a4cf27374112a5fdf48f82005b070bbc`, including 1,952 active and 16 historical entries. The producer recorded 5,904 viewport/LCD comparisons at three browser sizes. The independent panel review reports 249 glyph checks with zero missing or damaged in its measured firmware regions.

All 28 compact SuperJ6 entries were independently verified against the source archive, native PNG hashes, decoded RGB hashes, 240×240 dimensions and the catalog. Four are LFO/chorus screens, one list and one matrix for each bass owner. The `Stock compact juno6 slot` shows one PWM rate of 0.1–8.1 Hz and one chorus rate of 0.1–5 Hz. It does not implement the original AU’s three per-LFO tempo selectors.

The November 16 17:22 owner rules and 18:36 PDF/notes have unchanged Git identities relative to `46874497`, as does the recovered mock glyphs tree. Five tracked documents mention the dated approval or its historical disposition. None names a member of the approved batch by asset key or hash. Content verification also found no match for the separately identified later glyph ZIP, its decision file and picks image, the R22 source-map archive, or the owner MIX archive/PNG. The November 17 decisions include five R23 choices and carry a different date. The stock panel pixel checks establish firmware rendering, while the original November 16 selection still needs an identified source.

## Inventory and reproduction

The scan hashed 6,102 unique Git blobs across 6,865 paths, covering 135,050,332 distinct stored bytes. It joined the two Synth One input parts, read 126 tar/ZIP containers and 334 compressed streams, and hashed 5,532 archive member payloads totaling 476,542,588 bytes. It enforced a 96 MiB limit per expanded stream, 64 MiB per archive member and maximum nesting depth five. No limit was reached. It did not extract files to the checkout. The scope is this Git tree and the recognized archive formats. Unknown custom containers or unattributed artwork are outside the hash evidence.

Run the following with a local Git object store containing the pinned firmware and donor commits. `inventory.json` contains all target hashes and comparisons. `targeted-source.json` contains the dated references, six original field identities, stock glyph counts and unchanged source identities. `archive-members-summary.json` records each inspected container and member count. The full path/object/size inventory can be regenerated with the second command.

```sh
python inventory.py /path/to/DnBOX
git -C /path/to/DnBOX ls-tree -rl f1786ebec2616477163b62b029c7e77405a9c3de
```

[Full inventory, source hashes and reproduction script](firmware-f178-evidence.tar.gz) · [Conventional musical durations measured from the isolated Conductor](../tempo-periods/README.md)
