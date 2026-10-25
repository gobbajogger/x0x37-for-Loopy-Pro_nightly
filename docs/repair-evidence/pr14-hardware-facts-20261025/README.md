# PR14 optional hardware-fact type repair

This is the bounded source-producer response to [independent review
5640953891](https://github.com/gobbajogger/x0x37-for-Loopy-Pro_nightly/pull/14#pullrequestreview-5640953891).
The inherited browser predicate admitted malformed `device_verified` and
`hardware_tested` values. At both version and package scope, supplied values now
must be literal `false` for this DEV path. Absence stays optional; `true` still
denies. This does not require hardware PASS for DEV.

## Input, ownership and scope

Existing PR14 producer lane `lane/catalog-approval-denials-20261025`, baseline
HEAD `7515d147e4817248dece608c73fd7fb171e996f2`, full root
`7db90a3810f790d3b939b4cdc34a768ff6e9200a`. Fresh Git/PR head and review/comment
history matched before writing; the parent handoff identifies the previous
producer as completed. No competing exact-fix producer was found in accessible
PR history or this workspace. This is not a claim of global scheduler liveness.
No scheduler was inspected or modified.

The four-path code/test candidate root is
`0cd10dd54c4eed96d5f038746dee79fdf99705c2`; its complete binary patch SHA256 is
`8279d5bd1097d852176d68ad43e1a133ca24ad8ebd5dd3f492670cee33dbb45c`.
The delivery adds only this nonsecret evidence directory. Source and generated
HTML have the same one-line predicate change; the source provenance pin and
patch record follow it. The existing renderer needs no change: it already
rejects nonboolean hardware facts. Seven approval-hint predicates and receipt,
model, hash, URL, revocation, selection, download and install guards are retained.

## Reproduction and validation

Node `v24.19.0`, npm `11.9.0`, Chromium `154.0.8037.57`, Python Playwright.
The extended registered browser suite executes complete generated HTML and actual
page handlers, with local synthetic package bytes and mocked fetch/MIDI boundaries.
It checks both flags, both models, version/package scope, `null`, `0`, `1`,
`"false"`, `"true"`, arrays, objects, positive absence/false, true refusal and
cached Download/Install mutation before MIDI. Existing public DEV metadata still
admits each model, while metadata alone enables no download or install.

Baseline reproduction:

```sh
git show 7515d147e4817248dece608c73fd7fb171e996f2:web/x0x_installer.html > /tmp/pr14-before-hardware-flags.html
python3 tests/browser-admission.py --approval-only --source /tmp/pr14-before-hardware-flags.html
```

The final matrix produces expected RED exit 1, exactly 56 malformed admissions.
Boolean true refusal and false/absence controls pass. This demonstrates browser
metadata admission, not an unsafe live installation. Before enabling the final
cached test stimulus, an initial run also reproduced those same 56 failures.

Producer commands, exits, result summaries and raw-log hashes/locators are
preserved in `validation.json`: `npm run build`, `npm test`,
`npm run test:browser` all exit 0. The complete installer suite records no
failures, as does the registered responsive/history suite. An initial full Node attempt stopped on the
expected stale source-provenance pin; after updating that pin, validation was
rerun. The old PR14 evidence is preserved as historical evidence for its old SHA.
Independent bounded review and command results are recorded separately here;
they do not replace the existing Independent Website QA's final acceptance.

## Preserved inputs and receiving roles

The manifest records byte-identical library, renderer, package-script, history,
license, empty source catalog and published DEV fixture blobs relative to the
baseline. History remains 125 records. Generated parity is checked by the
registered full-root tests. Qualified firmware/controller bytes and the existing
qualification contract are unchanged; no firmware build or private controller is
needed or used. Source fingerprint changes normally with installer source.

Next owner/action: existing **Independent Website QA** consumes the delivered new
HEAD/root and decides exact-source acceptance; existing **Website Main Merger**
retains its separate integration gate. Their earlier HOLD is not overridden by
producer tests or a bounded helper review. The sole Pages publisher retains its
separate publication/served-byte authority.

No merge, publication, firmware, hardware or scheduler operation. PR12 and its
separately pending publication approval are untouched. Current live installer
and previously qualified firmware are unchanged.
