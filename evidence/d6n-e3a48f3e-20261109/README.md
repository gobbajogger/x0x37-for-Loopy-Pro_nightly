# D6-N preview evidence — NOT a publish

UNREVIEWED · DEVICE NOT TESTED

Timestamp: 2026-11-09 04:57:20 Asia/Vladivostok

## Frozen source
- Refs (same object): lane/build-698-ask-idle-poll-20261109; lane/dev-ui-ask-idle-poll-20261109
- SHA: e3a48f3e5f284d7b36b8623137919436bbbfd4ed
- Tree: b829b2c2184cbbbfc107cdb80614cba895ed2800
- Parent: c97587c8cea40a8f6e534ec13d9690feb555486d
- Initial local rev-parses matched; initial status --porcelain was empty. Final checks match; final status is recorded in logs/local-freeze.txt without committing generated files.
- Read-only verify-freeze result:
```
PASS head lane/build-698-ask-idle-poll-20261109 = e3a48f3e
PASS tree b829b2c2
PASS author 255244738+gobbajogger@users.noreply.github.com
PASS no trailers

exit_code=0
```

## Full default host suite
Command: `sh tests/run_tests.sh` (no named subset), exit 1.
Measured result: **331 ok / 1 FAIL / 14 NOT_RUN**.
The runner emitted 2 not-run lines. The normalized 14 NOT_RUN total also includes 9 named conditional omissions (the explicit skipped SMK package block plus unadmitted file-guarded package checks) and panic-clear, panic-route and panic-notes, confirmed absent from tests/run_tests.sh. Thus the raw result-line count is 331 ok / 1 FAIL / 2 not-run; the evidence inventory is 331 ok / 1 FAIL / 14 NOT_RUN. None of the omitted tests was rerun after native build. Counts are suite test names, not assertions. Complete log: logs/host-suite.txt.

### Every FAIL
- optimization-equivalence: (see build/host/optimization-equivalence.log); required host compiler missing: clang (host clang, not the cached pi32v2 cross compiler)
Full failure logs are retained under logs/host-fail-*.txt.

### Every NOT_RUN
- drum909: (../schwung-9W9/src/dsp/er99_engine.c)
- drum808: (../schwung-8W8/src/dsp/sc808_engine.cpp)
- smk-package: Runner skipped SMK-37 Pro package block: needs build/smk37 app/loader and AC79_SDK at host-suite time; native build was intentionally later
- smk-ota-entry: Runner skipped SMK-37 Pro package block: needs build/smk37 app/loader and AC79_SDK at host-suite time; native build was intentionally later
- smk-ota-entry-model1: Runner skipped SMK-37 Pro package block: needs build/smk37 app/loader and AC79_SDK at host-suite time; native build was intentionally later
- smk-ota-entry-model2: Runner skipped SMK-37 Pro package block: needs build/smk37 app/loader and AC79_SDK at host-suite time; native build was intentionally later
- smk-update-loader: Runner skipped SMK-37 Pro package block: needs build/smk37 app/loader and AC79_SDK at host-suite time; native build was intentionally later
- smk-build-package: Conditional test not admitted in host suite; required build/x0x-smk37.fwsc did not satisfy runner file guard then (native build followed host suite)
- smk-build-package-elite: Conditional test not admitted in host suite; required build/x0x-smk37-elite.fwsc did not satisfy runner file guard then (native build followed host suite)
- smk-build-package-mke: Conditional test not admitted in host suite; required build/x0x-smk37-mke.fwsc did not satisfy runner file guard then (native build followed host suite)
- ble-package: Conditional test not admitted in host suite; required build/x0x-smk37.fwsc did not satisfy runner file guard then (native build followed host suite)
- panic-clear: Absent on frozen lineage; not registered in tests/run_tests.sh
- panic-route: Absent on frozen lineage; not registered in tests/run_tests.sh
- panic-notes: Absent on frozen lineage; not registered in tests/run_tests.sh

## Native Elite + Pro + ARM controller
Overall: PASS.
All cached toolchain and SDK file pins matched; clang version starts with clang version 4.0.1. SDK HEAD unverifiable-via-git: `.git` exists but git rev-parse HEAD returns `fatal: not a git repository (or any of the parent directories): .git` (exit 128). Explicit parent clarification permits the build on the three matching SDK file pins. No replacement/download was performed.

- locked-settings: PASS (exit 0)
- native-elite: PASS (exit 0)
- native-pro: PASS (exit 0)
- ARM-ctl: PASS (exit 0)
- compose-pro: PASS (exit 0)
- compose-elite: PASS (exit 0)

Full native log: logs/native-build.txt. On a failing step the native sequence stops; subsequent steps are NOT_RUN. Exact diagnostics are retained in that log.

### Firmware/controller hashes and byte sizes
- `/workspace/plan-all/wt/build/x0x-smk37-elite.fwsc` — 651457 bytes — sha256 `f48527b7fec97bacf80b160e0999efa4fff9753a10c1d5e717b6e127a6bd0484`
- `/workspace/plan-all/wt/build/x0x-smk37.fwsc` — 651457 bytes — sha256 `7fddd143a346ac0787ccb3d4e1948a96f0aae8084c80d8c6580a53fe774f8d00`
- `/workspace/plan-all/wt/build/x0x-smk37-elite-ble.fwsc` — 651457 bytes — sha256 `630f433ca8b1b4b8e71147d412ac8e1de2fecaa0e9ba31cb26492ea3836da8e0`
- `/workspace/plan-all/wt/build/x0x-smk37-ble.fwsc` — 651457 bytes — sha256 `c477d930e619784e6c501e987c4bca5ae641123a2555da95b7e067f7d336528e`
- `/workspace/plan-all/wt/ble/ctl/out/ctl.img` — 61088 bytes — sha256 `aafb4542336d7ed192d97052b2effa3929cc3740a0e4051ec43b21be26866af7`

Built binaries remain in the worktree paths above; none is in this evidence directory. catalog-draft.json pkg=null means no published/staged downloadable package URL; measured local artifacts are separate records.

### Budgets/headroom
```
  ok    app code area 552672 B, 71576 B free (Bluetooth block at app.bin 0x86ee0)
  ok    image 481096 B; RAM .data+.bss 95380 B of 98304; pool 335464 B of 344064
  ok    app code area 552672 B, 71576 B free (Bluetooth block at app.bin 0x86ee0)
  ok    image 481096 B; RAM .data+.bss 95380 B of 98304; pool 335464 B of 344064
/workspace/plan-all/wt/ble/ctl/out/ctl.img: 61088 B of 65536, crc32 9aa7f77f, RAM 0x1c01800..0x1c07ee0 (26336 B of 26368)
```
No estimated budget values.

## Device
NOT_RUN: owner devices are out of scope. hardware_tested=false.

## package_nightly --check
No version was invented or allocated. The optional --firmware-version argument was omitted to inspect the true embedded package identity. No ledger writes.

```
elite: PASS (exit 0)
{
  "controller": {
    "abi": 2,
    "block_crc32": "012bf7ea",
    "block_size": 65536,
    "bundled": true,
    "crc32": "9aa7f77f",
    "flash_offset": 569344,
    "header_version": 2,
    "sha256": "aafb4542336d7ed192d97052b2effa3929cc3740a0e4051ec43b21be26866af7",
    "size": 61088,
    "strategy": "bundled"
  },
  "controller_sha256": "aafb4542336d7ed192d97052b2effa3929cc3740a0e4051ec43b21be26866af7",
  "controller_size": 61088,
  "controller_strategy": "bundled",
  "firmware_version": null,
  "model": "elite",
  "product": "SMK-37 Elite_900",
  "release_display": null,
  "schema": "x0x37-bundled-controller-v1",
  "sha256": "630f433ca8b1b4b8e71147d412ac8e1de2fecaa0e9ba31cb26492ea3836da8e0",
  "size": 651457
}
```
```
pro: PASS (exit 0)
{
  "controller": {
    "abi": 2,
    "block_crc32": "012bf7ea",
    "block_size": 65536,
    "bundled": true,
    "crc32": "9aa7f77f",
    "flash_offset": 569344,
    "header_version": 2,
    "sha256": "aafb4542336d7ed192d97052b2effa3929cc3740a0e4051ec43b21be26866af7",
    "size": 61088,
    "strategy": "bundled"
  },
  "controller_sha256": "aafb4542336d7ed192d97052b2effa3929cc3740a0e4051ec43b21be26866af7",
  "controller_size": 61088,
  "controller_strategy": "bundled",
  "firmware_version": null,
  "model": "pro",
  "product": "SMK-37 Pro_900",
  "release_display": null,
  "schema": "x0x37-bundled-controller-v1",
  "sha256": "c477d930e619784e6c501e987c4bca5ae641123a2555da95b7e067f7d336528e",
  "size": 651457
}
```

## Boundaries
this evidence package documents the frozen UI/ask-idle-poll tree e3a48f3e5f284d7b36b8623137919436bbbfd4ed ONLY. It is NOT the combined 0.0.25 NIGHTLY candidate — it lacks #853 PANIC firmware and tests from fc0669ccbabf9a7def1e3a4ba6b7660c7ad12249.

hardware_tested=false; NOT a NIGHTLY catalog entry. Standalone catalog-draft.json is NOT a versions.json splice and is not based on gh-pages. No publish, push, force-push, PR, GitHub post, cloud agent, owner device, secrets, toolchain/SDK download or firmware-checkout commit. wip/one-build left at 48e92b76c2f476cf40771e00a04e1838136bb55d; origin/main unchanged. Decision (A): 6ccc91ca and panic recut b01fb2d6 not applied. PR #698 untouched.

Package check qualification: both check invocations succeeded for legacy `SMK-37 Elite_900` / `SMK-37 Pro_900`; receipts report firmware_version=null and release_display=null. This is structural/hash validation, NOT a canonical X.Y.Z allocation, release approval or publish readiness.
