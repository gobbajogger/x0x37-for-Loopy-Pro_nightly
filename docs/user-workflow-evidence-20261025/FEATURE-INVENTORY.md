# Musician-facing capability inventory

Claims are grounded in downloadable source `4ee8f37714b0892f2c70d157fda9328da393e987`; exact Git blobs are listed in feature-source-pins.json. The SMC illustration has its separate, explicit preview pin.

| Activity | Functions presented | Why useful |
| --- | --- | --- |
| Create / play | 909 and 808, eleven voices each; two 303 parts, accents/slides, Free Play, pitch/mod expression; TB-3PO density/root/scale/mutation; sliced breaks, rolls/fills/retriggers | Create a complete groove without a computer; reshape a generated phrase or your own loop |
| Sequence / record | 32 patterns, up to64 steps per part; independent patterns/lengths/rates; step/live recording; motion, per-step parameter locks, probability, swing; pattern chains and Song bars/mutes | Develop variation and arrange it into a performance |
| Perform / mix | Keyboard fader banks with pickup; part levels/mutes/pan/sends, reverb, tape delay, master filter/compressor; SMC eight-strip main/drum maps | Shape and balance the groove while it plays |
| Loopy keys / clips | APC40-style clip feedback, pad launches, PLAY/REC, local pad viewport, KNOB BANK mode switch; SCALE, CHORD/inversions/strum, ARP rate/gate/swing/human/latch | Use the same keyboard for clip launches and musical MIDI input |
| Samples / projects | Own loops in limited sample slots; explicit read/prepare/send; slot backup/restore; current-project save/load/autosave; undo/redo; USB MIDI notes/clock | Keep a personal sound set and preserve useful work |
| Choose setup | Standalone; one direct SMC Bluetooth link; Loopy over USB; matching Elite/Pro package, Starrykey uses Pro; fixed velocity; one Bluetooth role, no Bluetooth audio | Decide whether it fits the user's gear and playing style |

## Sources

- [Playing manual](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/4ee8f37714b0892f2c70d157fda9328da393e987/docs/manual.html): instruments, TB-3PO, patterns, recording, motion/locks/probability, Song, effects, save/load and MIDI.
- [SMK controls and model compatibility](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/4ee8f37714b0892f2c70d157fda9328da393e987/SMK37.md).
- [Loopy / APC implementation](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/4ee8f37714b0892f2c70d157fda9328da393e987/APC40_IMPLEMENTATION.md), current section rather than superseded historical sections.
- [Current clip-key routing](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/4ee8f37714b0892f2c70d157fda9328da393e987/firmware/src/app/main_fm1.c): SCALE→CHORD→ARP path and editor controls.
- [SMC implementation](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/4ee8f37714b0892f2c70d157fda9328da393e987/firmware/src/app/smc_mixer.c), [UI settings](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/4ee8f37714b0892f2c70d157fda9328da393e987/firmware/src/app/ui.c), [one-link Bluetooth roles](https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/4ee8f37714b0892f2c70d157fda9328da393e987/ble/README.md).

The current catalog's latest package includes the controller; older prose about building a separate image does not describe this latest bundled package. The page does not claim direct multiple SMCs, simultaneous Bluetooth roles, Bluetooth audio, velocity, a new extension installer, unlimited sample storage or physical-device proof.
