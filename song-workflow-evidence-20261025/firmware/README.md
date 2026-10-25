# Firmware source semantics verification

Source: `gobbajogger/X0X37-for-Loopy-Pro` at
`08d3164a265123cb4c84e5104642fd93257d63d7`.
Read-only source stage; generated build outputs only. No firmware source mutation,
GUI, owner project, real sample, hardware write, merge or publication occurred.
`git status --short` was empty after execution.

## Environment and commands

Executed on macOS, Apple command-line-tools `cc`, zsh, Python 3 and the checked-out
repository scripts. Run every command below from the firmware checkout root.
Compiler scripts use their existing defaults except the explicitly identified
host portability defines. Do not treat these defines as changes to target firmware.

```sh
X0X_HOST_DEFS=-D_DARWIN_C_SOURCE sh tests/host/project_runtime_test.sh
sh tests/host/run_project_protocol.sh
sh tests/host/run_project_stage.sh
```

Runtime generated required host tables using its existing
`sh host/build_host.sh --generate-only` call. All commands exited zero.

The song-action script does not expose a general flags variable, so its compile
command was executed with one extra host portability define:

```sh
cc -D_DARWIN_C_SOURCE -O2 -ffp-contract=off -std=c99 -w -DX0X_HOST \
  -Ifirmware/src -Ifirmware/src/dsp -Ibuild/gen \
  -o build/host/song_actions_test tests/host/song_actions_test.c \
  firmware/src/dsp/drum909.c firmware/src/dsp/drum808.c \
  firmware/src/dsp/bass303.c firmware/src/dsp/breaks.c \
  firmware/src/dsp/fxbus.c firmware/src/dsp/master.c \
  firmware/src/seq/sequencer.c firmware/src/seq/tb3po.c \
  firmware/src/seq/pattern.c firmware/src/seq/motion.c \
  firmware/src/app/engine.c -lm
build/host/song_actions_test
```

The save-preflight script was equivalently compiled with its required host define:

```sh
cc -DX0X_HOST -std=c99 -O2 -Wall -Wextra -Werror \
  -ffunction-sections -fdata-sections -Ibuild/gen \
  tests/host/project_save_preflight_test.c -Wl,-dead_strip -lm \
  -o build/host/project_save_preflight_test
build/host/project_save_preflight_test
```

## Results

| Check | Result | Log |
| --- | --- | --- |
| Project update guard | PASS: held restart, BEGIN/COMMIT update discard, idle updates | runtime-darwin.log |
| Project runtime | PASS: reset, load, cancel, invalid, transfer, save, samples/calibration | runtime-darwin.log |
| SMC runtime | PASS: reset drops queued routes; lock/abort/solo/pickup state | runtime-darwin.log |
| Project protocol | PASS: staging, exact chunks, CRC/capacity, confirmation, timeout, full sample headers | protocol.log |
| Project staging | PASS: 24,446 checks, zero failures; real storage/defaults/sample metadata | stage.log |
| Song actions | PASS: clear confirmation/cancel and action no-op truthfulness | song-darwin.log |
| Save preflight | PASS: memory-full rejection performs no writes; saved project survives reboot | save-preflight-host.log |
| Extended arrangement byte invariants | PASS: all project bytes except song length, plus complete sample-image CRC, unchanged | arrangement_byte_invariants.log |
| Extended reset lifecycle | PASS: external-clock/recording reset, stopped runtime, autosave defaults/quiet save, reboot state and samples/calibration | reset_lifecycle_invariants.log |

The runtime fixtures seed synthetic sample bytes and compare full sample CRC and
panel calibration. Staging checks protected NOR ranges, all complete sample slots
(including unused tail bytes), live state and write counts. These are host checks,
not physical flash, MIDI, power-loss or per-model device proof.

## Initial failures and disposition

- `sh tests/host/project_runtime_test.sh` exited 1: strict POSIX feature selection
  hid macOS libproc definitions (`u_short`, `SOCK_MAXADDRLEN`, `rusage_info_t`,
  `RUSAGE_INFO_V4`). `runtime.log` retains the error. Re-execution with the
  script-supported `X0X_HOST_DEFS=-D_DARWIN_C_SOURCE` passed.
- `sh tests/host/song_actions_test.sh` exited 1 for the same macOS feature macro
  issue. `song.log` retains the error. Equivalent compile above passed.
- `sh tests/host/run_project_save_preflight.sh` exited 1 because absent
  `X0X_HOST` selected the target `.pool` section, invalid as a Mach-O section
  specifier. `save-preflight.log` retains the error. Equivalent compile with
  `-DX0X_HOST` passed.

No test assertion was removed or modified to obtain the passes.

## Additional external fixtures and rerun

`arrangement_byte_invariants.c` derives from the checked-in song action test,
renames its entrypoint to `original_test_main`, and appends assertions comparing
an entire `project_t` against its pre-clear copy with only song length zeroed,
plus sample-image CRC and selection. It runs the original suite first.

`reset_lifecycle_invariants.c` similarly derives from the runtime test and runs
that original suite first. It then sets external-clock/playing/queued transport
and recording state, executes reset, asserts stopped state/default autosave,
advances quiet time, invokes autosave, reboots and compares project plus samples
and calibration. Synthetic runtime field seeding does not model physical clock
signals.

The original external fixture sources use a local absolute include for
`host/x0x_host.c`. For a portable copy, change that include to:

```c
#include "host/x0x_host.c"
```

Then add `-I.` (the firmware checkout root) to the compile command while running
from that root. Use the song-action compile command above for
`arrangement_byte_invariants.c`, substituting the external source path and output
name. Use the same source list for `reset_lifecycle_invariants.c`, with the
runtime flags:

```sh
cc -D_DARWIN_C_SOURCE -O1 -g -ffp-contract=off -std=c99 \
  -Wall -Wextra -Wno-unused-function -Wno-unused-parameter \
  -DX0X_HOST -D_POSIX_C_SOURCE=200809L \
  -I. -Ifirmware/src -Ifirmware/src/app -Ifirmware/src/dsp -Ibuild/gen \
  /path/to/reset_lifecycle_invariants.c \
  firmware/src/dsp/drum909.c firmware/src/dsp/drum808.c \
  firmware/src/dsp/bass303.c firmware/src/dsp/breaks.c \
  firmware/src/dsp/fxbus.c firmware/src/dsp/master.c \
  firmware/src/seq/sequencer.c firmware/src/seq/tb3po.c \
  firmware/src/seq/pattern.c firmware/src/seq/motion.c \
  firmware/src/app/engine.c -lm -o build/host/reset_lifecycle_invariants
build/host/reset_lifecycle_invariants
```

Retain original GPL provenance when copying these derived fixtures. They are
additional verification artifacts, not changes to firmware source.

## Scope and dependency evidence

- `firmware/src/app/ui.c:1800`: CLEAR SONG changes only song length and selection,
  then marks dirty; stored bar bytes remain. Confirmation is at `ui.c:2571`.
- `ui.c:4683`: project acquisition holds audio and guards concurrent work;
  reset can stop active runtime, while load/transfer require quiet stopped state.
- `ui.c:4707`: successful adoption flushes old notes, resets SMC/SMK runtime,
  adopts staged project, reinitializes engine/UI/undo and marks dirty.
- `ui.c:4761`: full project reset stages defaults and adopts them.
- `ui.c:4776`: ordinary autosave conditions apply after reset.
- `firmware/src/app/project.c:54`: defaults restore autosave ON and retain
  Bluetooth/SMC device role bits.
- `project.c:590`: reset changes only staged project storage.
- `firmware/src/app/editor.c:261`: op 73 invokes full project reset, never
  arrangement-only CLEAR SONG; ops 72/73 require confirmation bytes.
- `BEHAVIOR.md:214` through `:221`: maintained SET-06–13 scope and protections.
- `tests/host/project_stage_test.c:28`: only project-object NOR ranges writable;
  `:95` checks protected NOR ranges and all full sample slots.

`git merge-base --is-ancestor 57beefa7aae0a90e8e2fb57d2410f0bd2b85e8e3 HEAD`
returned 1. PR171 is not installed at this source pin. Legacy arrangement Load
still uses the older `load_obj` path at `project.c:431–457`; the narrow reviewed
malformed legacy-load repair must not be claimed as present. Browser project-file
validation and existing current-format staging tests do not establish that fix.

Compatible project firmware must implement ops 64–74, query protocol version 1,
semantic staging validation and recovery hold plus original 512-byte sample
header writes. Unsupported firmware must remain unavailable. These checks do not
establish what any owner's actual device currently runs.
