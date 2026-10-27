# Adaptive BREAK project compatibility

This source-only companion adds portable-project reader support for adaptive BREAK pattern streams 8 and 9. The container and payload sizes stay unchanged. Stream 8 carries release endpoints; stream 9 also permits the firmware’s tagged per-note sound representation. Reader support does not enable that firmware feature, approve a build or publish firmware.

The paired firmware changes the old BREAK MIDI-mode byte into independent A/B slice-count codes. It migrates recognized legacy modes to A8/B8 after checking their original CRC and preserves reserved bytes and pins. New project streams require that paired firmware; older firmware must reject them rather than reinterpret slice counts as an old MIDI mode. Import validates the complete project before any sample replacement, so version rejection leaves the existing project and samples intact.

Historical stream 7 remains rejected by this website, preserving its earlier NOTE0 contract; the firmware has a broader optional legacy migration reader. New stream 9 admission is explicit and does not silently widen historical input acceptance.

This patch changes only project schema admission, regression tests and the generated project page. Existing bounded MIDI receive and closed-link safeguards remain. Firmware qualification, independent source review, owner preview where applicable, merge and publication are separate pending states. This document is not evidence that the paired firmware or this website is available to the owner.
