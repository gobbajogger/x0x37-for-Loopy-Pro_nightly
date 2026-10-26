# Independent EC009 OTA identity review

Bounded source/parser verdict: **PASS**; no blocking parser finding.

Exact frozen site head323da53fae16384596eb71e16f2d1d3dcdf542be/treeec5ae1a4b3e41ef0626aae7e81273cd38199f6eb and firmware mirror/Python headd8f2d50c80909f5484d46c549a0805a2b9da2656/tree83e6c66909b6bdebea6e4251f4557cd56aadbd2d were reviewed and left clean.

## Source and contract

The JS parser bodies in site and firmware mirror are byte-identical. Both now verify F0/F7, seven-bit wire data, decoded34-byte shape, 00 59 11 command/header, declared little-endian24-bit length27, complement of payload sum, and canonical final packed bits before admitting the unchanged model/version regex. Python enforces the same conditions. Invalid version syntax is refused, as is a changed version byte with its original checksum. A new version with a recomputed valid checksum remains valid framing; this protocol check is not cryptographic identity authentication.

Current firmware ota.c sends exactly27 identity bytes through ota_send_msg. Its send/identity function bodies are byte-identical to the author's pinned ae269094e311519bdefdae93d0a73fc9ffc86567 contract. The owner-local desktop M-UPGRADE static analysis at firmware-and-sincoota-findings.md142–222 independently documents 00 59 command/length/payload/checksum and bitstream-style7-bit encoding. analysis/scripts/sinco_packet.py computes ~sum(packet[6:]) and supplies the primary independent encoder used by the reviewer probe. These are source/static reverse-engineering contracts, not captured physical stock frames.

Fixture changes only make existing fake identity packets conform to that contract; they do not remove installer/model/binding assertions. The genuine model/version policy and existing copyright/license notices remain unchanged.

## Independent execution

- Site focused production parser/discovery tests25/25PASS.
- Firmware browser-mirror focused tests25/25PASS.
- Site actual-source write boundaries41/41PASS.
- Python parser2tests/21subcasesPASS.
- Python simulated installer integrationPASS; package/image parity is explicitly skipped because no built package is present.
- F02 loader bindingPASS.
- Site generated-page parity and public-source provenance checksPASS.
- Reviewer primary-encoder/cross-language probe334cases per parserPASS: valid contract, all328single-bit mutations of the complete wire frame rejected, malformed model/version syntax refused, correctly checksummed version901 retained. Probe also asserts the two actual JS parser bodies match.
- Firmware full diffcheckPASS; site source/generated/test/provenance diffcheckPASS.

All13 logs referenced by the two author receipts independently match their recorded hashes. The author's exact-head full site npm result is retained as author execution proof, not relabeled independent execution.

## Explicit limits and evidence exception

Full site diffcheck exits2 only because immutable raw before-pr31.log contains six whitespace-only diagnostic lines with trailing spaces at20,23,39,42,58,61. Source diffcheck exits0. Parent explicitly instructed preservation of those raw before-fix bytes/hashes and recording this evidence-only exception; reviewer did not normalize or erase them.

The broader docs/native-midi/tests/transport_test.py remains red:17tests,9failures,2errors on both author-recorded baseline and candidate, including existing API/expectation divergence. It is not claimed passing or repaired here. No broad native-installer readiness follows from this bounded parser approval.

No physical stock/loader compatibility, hardware causal conclusion, actual USB/MIDI, firmware/package build, installed behavior, GUI/headless browser, publication or merge was attempted by reviewer. Synthetic identities are not physical captures. No source edits or external writes were made. receipt.json records exact heads, trees, source/contract hashes, commands/results and log hashes; reviewer probe scripts beside it generate only synthetic data.
