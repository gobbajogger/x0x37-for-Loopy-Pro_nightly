/* SPDX-License-Identifier: GPL-3.0-only */
/* Run from the pinned firmware root with the compile command in miami-wave.test.mjs. */
#include <stdio.h>
#include "firmware/src/app/ui_original_controls.h"
#include "firmware/src/app/ui_original_wave.h"

int main(void)
{
    const unsigned parameters[] = {0, 6, 11};
    ui_original_control_cache controls = {0};
    ui_original_wave_cache wave = {0};
    uint8_t cell[ORIGINAL_SOUND_BYTES], preview[22] = {0};
    for (unsigned factory = 0; factory < original_sound_factories(ORIGINAL_SOUND_MIAMI); ++factory) {
        if (!original_sound_init(cell, ORIGINAL_SOUND_MIAMI, factory)) return 1;
        for (unsigned voice = 0; voice < 2; ++voice) {
            for (unsigned slot = 0; slot < 3; ++slot) {
                unsigned parameter = parameters[slot];
                for (int raw = -1; raw < 128; ++raw) {
                    unsigned mask = raw < 0 ? 0 : 1u << parameter;
                    preview[parameter] = raw < 0 ? 0 : (uint8_t)raw;
                    if (!ui_original_controls_update(&controls, voice, cell, preview, mask) ||
                        !ui_original_wave_update(&wave, voice, cell, preview, mask)) return 2;
                    printf("%u %u %u %d %u %u %u", factory, voice, parameter, raw,
                           cell[parameter], controls.view.shape[slot], wave.zero[slot]);
                    for (unsigned i = 0; i < UI_ORIGINAL_WAVE_W; ++i)
                        printf(" %u", wave.wave[slot][i]);
                    putchar('\n');
                }
            }
        }
    }
    return 0;
}
