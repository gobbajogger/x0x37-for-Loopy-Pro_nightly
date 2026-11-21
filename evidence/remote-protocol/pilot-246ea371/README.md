# Real firmware host parameter round trips

On 21 November 2026 the archived DnBOX UI, project and engine at `246ea3718c6c72ba80bbd1aafcd5356f871c78c8` passed 7,242 native checks. The original C test selected both Chicago and Miami through the real engine API, performed 978 edits across 326 controls, and verified each stored target. It rejected 72 reads of inactive banks across the two selections. All ten required original build inputs matched the firmware manifest. The checkout stayed clean. [Firmware test](https://github.com/gobbajogger/DnBOX/blob/246ea3718c6c72ba80bbd1aafcd5356f871c78c8/tests/host/remote_actual_core_test.c) · [Original build and test log](native-host.log.gz)

A second test used the Remote's 51-byte DNR2 browser codec and the same compiled host's standard-input receiver. Its catalogue returned 326 controls and CRC `0xeec38bc1`. The archived codec and the codec in Remote revision `736864d3` had identical SHA-256 hashes. [Archived codec provenance](https://github.com/gobbajogger/DnBOX/blob/246ea3718c6c72ba80bbd1aafcd5356f871c78c8/tests/host/dnr2_reference/SOURCE.json) · [Remote codec](https://github.com/gobbajogger/DnBOX-nightly/blob/736864d310285d7e2bc60721658d9e15c32a56c0/web/product-site/remote/device/vendor/codec.mjs)

| Wire result | Measured outcome |
|---|---|
| Read, edit, fresh read, guarded restore, fresh read | All 254 fixed controls and 40 active Chicago controls changed to a different stored value and returned to their originals. Both Chicago cutoffs went from 32 to 33 and back to 32. |
| Inactive Miami | All 32 descriptors returned UNSUPPORTED. The stdio receiver starts with both basses on Chicago and exposes no bank-selection command. Its companion C suite exercised the Miami edits directly. |
| Intervening UI edit | After the wire client set Master Makeup to 23, the host UI set it to 24. A restore using the earlier revision returned CONFLICT. A fresh read returned 24. |
| Totals | 1,510 wire requests including 917 reads. Each inverse SET used the verified edit revision. DNR2 has no separate Undo opcode. |

A separate ten-frame run identified a coupled control. From a fresh host, Master COMP (ID 253) read 95 and Master Makeup (ID 245) read 85. Setting COMP to 96 left Makeup at 85. Restoring COMP to 95 returned the macro to its original value and changed Makeup to 84. Both SETs returned QUEUED and each value came from a new READ. The firmware reapplies the compressor macro to its child controls. The 294 individual restores therefore establish the addressed values only. [Firmware macro setter](https://github.com/gobbajogger/DnBOX/blob/246ea3718c6c72ba80bbd1aafcd5356f871c78c8/firmware/src/app/ui.c#L725)

R6 remains open for stock USB/BLE. The archived host uses test-only stdio and reports `nativeAdmitted: false`. Its SET acknowledgment records queue acceptance, and the reads observe the real stored target. The physical keyboard, audio-applied parameter values and Remote Undo button are outside this run. [Host receiver and supported commands](https://github.com/gobbajogger/DnBOX/blob/246ea3718c6c72ba80bbd1aafcd5356f871c78c8/tests/host/dnr2_reference/README.md) · [Per-control results](roundtrip.json)

## Reproduce

Run from a clean checkout of firmware commit `246ea3718c6c72ba80bbd1aafcd5356f871c78c8`. The script takes the firmware checkout as its argument. Replace the example script path with its location in the nightly repository.

```sh
python3 tools/check_original_inputs.py
sh tests/host/remote_actual_core_test.sh
node /path/to/this/evidence/wire-roundtrip.mjs "$PWD" > /tmp/dnbox-roundtrip.json
```

The recorded JSON SHA-256 is `de807261e1d955c2298cf5dfc5228a4084a3fd26d9e85ab32ce560c8287d6729`. A rebuilt host executable can have a different binary digest because it contains build-directory debug information. [Replay script](wire-roundtrip.mjs)
