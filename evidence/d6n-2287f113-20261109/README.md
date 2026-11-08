# UNREVIEWED · DEVICE NOT TESTED — D6-N preview evidence

2026-11-09 05:38:04 Asia/Vladivostok

D6-N preview evidence for combined UI+PANIC source 2287f113 (parent e3a48f3e UI/ask-idle-poll + #853 PANIC from fc0669cc). NOT a publish; NOT a live NIGHTLY catalog entry; no version allocation or ledger. Decision (A): 6ccc91ca and b01fb2d6 not applied. PR #698 / wip/one-build not updated. No remote writes, owner devices, secrets, SDK/toolchain downloads, or firmware patches.

## Source
HEAD: 2287f113fa4bf74757b4e6d758c2e5464eb47036 PASS
HEAD^{tree}: fc4ac8ba6145451dfa8886e7050759cf848da2d5 PASS
HEAD^: e3a48f3e5f284d7b36b8623137919436bbbfd4ed PASS
origin/wip/one-build: 48e92b76c2f476cf40771e00a04e1838136bb55d PASS
origin/main: 1a6bc3fe0245277b5ae31ab554c73d74b9ab4d83 PASS
origin/lane/build-25-m1-port-20261106: b2b929f46f1b7868dfa569d0d0989f5ab91aa16e PASS
status --porcelain: empty
PANIC donor: local remote-tracking ref is stale b2b929f4; sanctioned GitHub get_branch read confirms live branch fc0669ccbabf9a7def1e3a4ba6b7660c7ad12249 PASS. No donor ref update performed.
author=gobbajogger <255244738+gobbajogger@users.noreply.github.com>
committer=gobbajogger <255244738+gobbajogger@users.noreply.github.com>
subject=Add panic chords that silence sounding notes and keep HOME+PLAY redo
trailers=

verify-freeze: PASS; see logs/verify-freeze.txt.

## Host
Host 344 ok / 1 FAIL / 3 NOT_RUN (raw runner 2, conditional omissions 1).
Full suite exit 1. Host executed AFTER native with AC79_SDK configured. Counts are selector result lines, not assertions.

FAIL:
- optimization-equivalence: (see build/host/optimization-equivalence.log); ENV: missing host clang (no installation attempted)

NOT_RUN:
- drum909: (../schwung-9W9/src/dsp/er99_engine.c)
- drum808: (../schwung-8W8/src/dsp/sc808_engine.cpp)
- smk-build-package-mke: Conditional package guard not satisfied; MKE was not built

Targeted measured exits:
[
  {
    "name": "target-ui",
    "exit_code": 0
  },
  {
    "name": "target-panic",
    "exit_code": 0
  },
  {
    "name": "host-suite",
    "exit_code": 1
  }
]

## Native
[
  {
    "name": "locked-settings",
    "status": "PASS",
    "exit_code": 0
  },
  {
    "name": "native-elite",
    "status": "PASS",
    "exit_code": 0
  },
  {
    "name": "native-pro",
    "status": "PASS",
    "exit_code": 0
  },
  {
    "name": "ARM-ctl",
    "status": "PASS",
    "exit_code": 0
  },
  {
    "name": "compose-pro",
    "status": "PASS",
    "exit_code": 0
  },
  {
    "name": "compose-elite",
    "status": "PASS",
    "exit_code": 0
  }
]
Cached compiler and three SDK tool-file pins PASS; SDK git identity unavailable (see logs/build-inputs.txt). No cached products reused: ignored build/ and ble/ctl/out removed before rebuilding. Warning: miami_decimator_adapter.c missing braces, nonfatal.

## Hashes (bytes)
- x0x-smk37-elite.fwsc: 651457 bytes; SHA256 afd16eb3bf4cbb4371ea79cae70943579952abad4e6d6f1da1b921825d759990
- x0x-smk37.fwsc: 651457 bytes; SHA256 2655eb272fc21d1ba8261f18f5c7c2d3776729a9c4ed07810cdea080c643890d
- x0x-smk37-elite-ble.fwsc: 651457 bytes; SHA256 df0b1f82ffd374ee1628e7cd1b9f0276a761abeb45770f06616bbceb7838560a
- x0x-smk37-ble.fwsc: 651457 bytes; SHA256 2a7ddfcab3299367354f4263efa5ec93710c494f9895362f9f418948b033a770
- ctl.img: 61088 bytes; SHA256 aafb4542336d7ed192d97052b2effa3929cc3740a0e4051ec43b21be26866af7

## Budgets
  ok    app code area 552672 B, 70200 B free (Bluetooth block at app.bin 0x86ee0)
  ok    image 482472 B; RAM .data+.bss 95380 B of 98304; pool 335464 B of 344064
  ok    app code area 552672 B, 70216 B free (Bluetooth block at app.bin 0x86ee0)
  ok    image 482456 B; RAM .data+.bss 95380 B of 98304; pool 335464 B of 344064
/workspace/plan-all/wt/ble/ctl/out/ctl.img: 61088 B of 65536, crc32 9aa7f77f, RAM 0x1c01800..0x1c07ee0 (26336 B of 26368)

## Package structural checks
- elite: exit 0; product SMK-37 Elite_900; firmware_version=None; release_display=None
- pro: exit 0; product SMK-37 Pro_900; firmware_version=None; release_display=None
No --firmware-version supplied; legacy _900 identities do not allocate canonical X.Y.Z.

## Device
NOT_RUN. hardware_tested=false. Binary artifacts remain only in build paths, not this directory. Standalone catalog-draft.json has pkg=null.
