#!/bin/sh
# Full production UI/project/engine + SMC input/render regression. No device I/O.
# Optional CC, SAN_FLAGS, SMC_UI_OUT and SMC_UI_SOURCE_FILE support independent replay.
set -eu
cd "$(dirname "$0")/../.."
OUT=${SMC_UI_OUT:-build/host/smc-ui}
mkdir -p "$OUT"
awk '/^static const char CK_FLD_N\[\] = /{print}
     /^static uint32_t ck_page_on\(void\)$/ || /^int smk_ck_smc_(turn|nav)\(/{on=1}
     on{print} on && /^}/{on=0}' firmware/src/app/main_fm1.c > "$OUT/clip_smc.inc"
test -s "$OUT/clip_smc.inc"
sh host/build_host.sh --generate-only > "$OUT/generate.log" 2>&1 || { cat "$OUT/generate.log"; exit 1; }
U="firmware/src/dsp/drum909.c firmware/src/dsp/drum808.c firmware/src/dsp/bass303.c firmware/src/dsp/breaks.c
firmware/src/dsp/fxbus.c firmware/src/dsp/master.c firmware/src/seq/sequencer.c firmware/src/seq/tb3po.c
firmware/src/seq/pattern.c firmware/src/seq/motion.c firmware/src/app/engine.c"
DARWIN=
[ "$(uname -s)" != Darwin ] || DARWIN=-D_DARWIN_C_SOURCE
SOURCE=${SMC_UI_SOURCE_FILE:-$PWD/firmware/src/app/smc_mixer.c}
# shellcheck disable=SC2086
${CC:-cc} -O1 -g -ffp-contract=off -std=c99 -Wall -Wextra -Wno-unused-function -Wno-unused-parameter \
    -DX0X_HOST $DARWIN ${X0X_HOST_DEFS:-} ${SAN_FLAGS:-} \
    -DSMC_SOURCE_FILE=\"$SOURCE\" -Ifirmware/src -Ifirmware/src/app -Ifirmware/src/dsp -Ibuild/gen -I"$OUT" \
    tests/host/catalog_capture.c $U -lm -o "$OUT/test"
SMC_UI_SHOTS="$OUT" "$OUT/test"
