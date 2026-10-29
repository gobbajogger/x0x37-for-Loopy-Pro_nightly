#!/usr/bin/env python3
"""Compile the real revision-13 read_project() with deterministic device flash stubs.

No SDK, reference headers, or physical keyboard are needed. A rejected project
must not silently disable the SMC central when device settings are unavailable.
"""
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
project = (ROOT / 'firmware/src/app/project.c').read_text()
boot = (ROOT / 'firmware/src/app/main_fm1.c').read_text()
ble = (ROOT / 'firmware/src/ble.c').read_text()

def function(source: str, signature: str) -> str:
    start = source.index(signature + '\n{')
    end = source.find('\n}\n', start)
    if end < 0:
        raise AssertionError(f'missing end of {signature}')
    return source[start:end + 3]

# A's boot contract: the requested radio state is passed to the guarded early
# initialization. No later setter may silently clear a blocked guard at boot.
assert re.search(r'ble_prepare\(proj\.set\.bt\s*&\s*1u\)\s*;\s*ble_start\(\)', boot)
assert 'plat_ble_set(proj.set.bt & 1u)' not in boot
assert re.search(r'ble_guard_boot\(&ble_guard,\s*ble_img == BLE_IMG_OK,\s*1\)', ble)

src = r'''
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#define X0X_ORIGINAL_SYNTH 1
#define BOARD_SMK37 1
#define PROJ_MAGIC 0x50305830u
#define PROJ_FORMAT 1u
#define PROJ_SND_REV 13u
#define PROJ_STEREO 2u
#define PROJ_BT_CLK_IN 8u
#define PROJ_BT_SMC_CENTRAL 16u
#define PROJ_BT_SMC_USER 32u
#define PROJ_DEVICE_BT (1u | PROJ_BT_SMC_CENTRAL | PROJ_BT_SMC_USER)
#define NPAT 1
#define OBJ_PAT0 0
#define __builtin_memset memset
#define __builtin_memcpy memcpy

typedef struct {
    uint32_t magic, format;
    uint8_t palette, keyled, keysound, autosave_off, clk_out, bt, notes_out;
    uint16_t bpm_x10;
    uint8_t accent_q7, stereo, snd_rev;
    uint8_t ck_ch, ck_tail[11];
} settings_t;
typedef struct { int placeholder; } sound_t;
typedef struct { int placeholder; } pattern_t;
typedef struct { int placeholder; } arrange_t;
typedef struct { settings_t set; sound_t sound; pattern_t pat[NPAT]; arrange_t arr; } project_t;
static project_t proj;
static unsigned packed_len, writes;
static uint8_t io_buf[32];
static const uint8_t CK_DEF[12] = {2, 0, 0, 0, 0, 0, 9, 0, 4, 0, 0, 0};
static int settings_rc, sound_rc, pattern_rc, verify_rc;
static settings_t saved;
static void engine_sound_defaults(sound_t *p) { memset(p, 0, sizeof *p); }
static void arrange_defaults(project_t *p) { memset(&p->arr, 0, sizeof p->arr); }
static void pattern_init(pattern_t *p, uint32_t a, uint32_t b)
{ (void)a; (void)b; p->placeholder = 0; }
static int load_settings(settings_t *p) { if (!settings_rc) *p = saved; return settings_rc; }
static int load_sound(sound_t *p) { (void)p; return sound_rc; }
static int plat_store_load(unsigned obj, void *dst, unsigned max)
{ (void)obj; (void)dst; (void)max; return pattern_rc; }
static uint32_t get32(const uint8_t *p) { (void)p; return pattern_rc == 1 ? 12u : 13u; }
static int stream_known(uint32_t x) { return x == 13u; }
static int load_stream(project_t *p, int n, uint32_t format)
{ (void)p; (void)n; (void)format; return 0; }
static void patterns_defaults(project_t *p) { (void)p; }
static int project_validate_for(const project_t *p) { (void)p; return verify_rc; }
'''
src += function(project, 'static void project_defaults_for(project_t *pr, uint8_t device_bt)') + '\n'
src += function(project, 'static int read_project(project_t *pr)') + '\n'
src += r'''
static void scenario(int settings, unsigned bt, int sound, int pattern, int expected_rc,
                     unsigned expected_device, unsigned expected_write, int invalid_magic)
{
    memset(&proj, 0, sizeof proj);
    memset(&saved, 0, sizeof saved);
    settings_rc = settings;
    sound_rc = sound;
    pattern_rc = pattern;
    writes = 0;
    verify_rc = 0;
    saved.magic = invalid_magic ? 0u : PROJ_MAGIC;
    saved.format = PROJ_FORMAT;
    saved.snd_rev = PROJ_SND_REV;
    saved.stereo = PROJ_STEREO;
    saved.bt = (uint8_t)bt;
    int rc = read_project(&proj);
    assert(rc == expected_rc);
    assert((proj.set.bt & PROJ_DEVICE_BT) == expected_device);
    assert(writes == expected_write);
}
int main(void)
{
    /* Missing and rejected old-revision data both need fresh SMC connection. */
    scenario(-1, 0, 1, -1, -1, 1u | PROJ_BT_SMC_CENTRAL, 0, 0);
    scenario(-9, 0, 1, -1, -9, 1u | PROJ_BT_SMC_CENTRAL, 0, 0);
    /* A saved revision-13 OFF/DEVICE choice must NEVER be overridden. */
    scenario(0, PROJ_BT_CLK_IN, 1, -1, -1, 0, 0, 0);
    scenario(0, 1u | PROJ_BT_SMC_CENTRAL, 1, -1, -1, 1u | PROJ_BT_SMC_CENTRAL, 0, 0);
    /* A sound or stream failure must preserve an otherwise valid saved OFF. */
    scenario(0, PROJ_BT_CLK_IN, -9, -1, -9, 0, 0, 0);
    scenario(0, PROJ_BT_CLK_IN, 0, 1, -9, 0, 0, 0);
    /* Invalid magic goes through the same no-device fallback. */
    scenario(0, 0, 1, -1, -9, 1u | PROJ_BT_SMC_CENTRAL, 0, 1);
    puts("PASS: original-rev13 boot SMC intent, rejected/missing settings and saved OFF");
    return 0;
}
'''
with tempfile.TemporaryDirectory(prefix='x0x-ble-boot-') as d:
    file = Path(d) / 'test.c'
    executable = Path(d) / 'test'
    file.write_text(src)
    subprocess.run(['cc', '-std=c99', '-O1', '-Wall', '-Wextra', '-Werror',
                    '-Wno-unused-function', str(file), '-o', str(executable)], check=True)
    subprocess.run([str(executable)], check=True)
