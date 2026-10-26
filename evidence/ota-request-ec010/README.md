EC010 OTA read request integrity

The exact test-only PR35 regression fails against both frozen combined baselines (1pass/2fail) and passes after source repair. Added malformed frames are refused by the actual production parser and Updater.serve before any firmware-data reply; the canonical finish response remains allowed. Python production parser/serve parity is checked offline.

See receipt.json and immutable logs for exact source pins, hashes, results and limits. No hardware actions. Independent review and qualified combined integration remain pending. Raw negative diagnostic whitespace is preserved if present; source diffcheck is checked separately.
