# Canonical PR398 Web MIDI pairing integration

This closes the missing site integration of firmware PR398, not a new pairing
algorithm or new EC identifier. PR52 was closed as a duplicate; its redundant
commit is not merged here.

- Site baseline: `003cf088c0c434f28341d5121a53ec66db027c15`.
- Canonical source/test: firmware PR398,
  `66e15ed0af2f06a8cd97cea2c7302d6395a2da15`.
- `_portPairs()` is copied byte-for-byte. The site `find()` calls it while
  retaining the existing bound-target `singlePort()` and cross-family checks.
- The upstream 14-map / 51-assertion regression is registered in `npm test`.
  Its only executable adaptation is the `find()` extraction end delimiter,
  because this site's surrounding method layout differs.

The actual production-module PR52 fixture reproduced the unsafe sole unrelated
output handshake on the baseline: 2 controls passed, 1 negative failed. It passes
3/3 after integration. It was materialized only for proof, not added as a second
copy of the canonical committed regression. Affected author checks also pass:
51 canonical assertions, 42 installer-write-boundary tests and 79 OTA tests
(the latter includes the temporary 3-case fixture). No device was connected.

Only uniquely matching, connected port names are probed. Duplicate inputs or
outputs, disconnected outputs, case-only mismatches and different-name sole
ports are refused before opening or sending. Matching single devices and
unique names among unrelated MIDI equipment remain supported. Current
single-observable-keyboard, loader alias and application-return protections are
retained. Different legitimate OS input/output names still require explicit
compatibility work; this change does not guess a pairing.

Names are not physical unit identity, a serial number or firmware-byte proof.
Synthetic coverage does not establish actual USB/OS compatibility, hardware
backup/restore, installability or publication approval. No firmware, controller,
catalog/package, allocation or private sample content is changed. No device writes
were performed.
