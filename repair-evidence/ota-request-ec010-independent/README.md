# Independent EC010 request-envelope review

PASS for the bounded source repair. Exact reviewed site head `cd6a4b92bcb39c594c371d58ab39e77fdcd80b2b`, tree `8bb468121145f409d83054f083df7d867cfcdb33`; firmware mirror/Python head `6e08cf42e10d1d0d47d1df8471cb1294e86fdbed`, tree `2802cb5cf78635a162ecc8d3f3a3f83f5a023a6e`. Both checkouts clean.

The actual request producer `firmware/src/ota.c` emits an eight-byte body through `ota_send_msg(0x30,q,8)`. There is no protocol-version header field: bytes3..5 declare payload length. Both JS parser bodies match; Python applies equivalent guards before actual serving. Framing, seven-bit packing, exact decoded body/count, command, full declared length, canonical padding and body checksum are checked. Existing flags/address/requested-length interpretation, serve bounds/finish behavior and identity parser remain unchanged. Two old mock request headers change0 to8; the separately owned slot-test mock file is unchanged.

Independent execution passed21 focused Node tests in each repository,3 actual Python tests, and generated-site parity. `cross-request.py/.mjs` independently generate533 cases with the actual primary desktop-analysis encoder:105 valid field/boundary cases and428 malformed cases. Every wire bit of canonical data and finish requests is mutated, all prefixes and inserted-zero boundaries are checked, and all24 declared-length bits are tested. All three actual parsers agree. Both actual serve paths ignore the entire malformed batch before any data/progress, and two valid chunks retain flags/address/data and produce byte-identical JS/Python wire replies.

All10 author evidence log hashes match. The exact PR35 reproducer bytes are preserved. Author full npm reports94edge passes; firmware46 focused cases and7 installer commands passed in the hashed author logs. Those larger runs were not duplicated. Every current public-source provenance blob matches and generator check passes.

Source/generated/test/provenance diff checks pass. Full diff checks exit2 solely for preserved raw negative-log whitespace: four lines18,20,35,37 in each repository's EC010 before log. The raw logs and hashes are retained; this is an explicit evidence-only exception.

No source blocker found in this scope. Static desktop encoding and synthetic production-path execution do not prove physical stock/loader compatibility. No source edits, native rebuilds, device/USB access, GUI/headless retry, recovery, push, merge or publication. Broader pre-existing native harness failures and composite mock follow-up remain separate. The envelope checksum does not authenticate requests or establish freshness.

See `receipt.json`, `commands.json`, `closure-verification.json`, `author-log-verification.json`, raw diff/test logs and runnable independent probes.
