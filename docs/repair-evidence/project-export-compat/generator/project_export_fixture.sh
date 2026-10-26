#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
set -e
cd "$(dirname "$0")/../.."
case "$(uname -s)" in
    Darwin) GC=-Wl,-dead_strip ;;
    *) GC=-Wl,--gc-sections ;;
esac
mkdir -p build/host build/gen
[ -f build/gen/x0x_drum_tables.h ] || python3 tools/gen_drum_samples.py build/gen/x0x_drum_samples.h >/dev/null
[ -f build/gen/x0x_break_bank.h ] || sh tools/gen_builtin_break.sh build/gen >/dev/null
${CC:-cc} -std=c99 -O2 -ffp-contract=off -Wall -Wextra -Werror -Wno-unused-function ${SAN_FLAGS:-} \
    -ffunction-sections -fdata-sections -DX0X_HOST -DBOARD_SMK37=1 -DX0X_WOBBLE=1 -DX0X_DEV_WOBBLE=1 \
    -Ibuild/gen -Ifirmware/src tests/host/project_export_fixture.c \
    firmware/src/app/engine.c firmware/src/app/chicago_param_tables.c \
    firmware/src/seq/pattern.c firmware/src/seq/tb3po.c \
    firmware/src/seq/sequencer.c firmware/src/seq/motion.c \
    firmware/src/dsp/drum909.c firmware/src/dsp/drum808.c firmware/src/dsp/x0x_param.c firmware/src/dsp/bass303.c \
    firmware/src/dsp/breaks.c firmware/src/dsp/fxbus.c firmware/src/dsp/master.c \
    experiments/wobble/wobble.c "$GC" -lm -o build/host/project_export_fixture
build/host/project_export_fixture "${FIXTURE_OUTPUT:?}"
