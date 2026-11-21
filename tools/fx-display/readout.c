/* SPDX-License-Identifier: GPL-3.0-only */
#include <stdio.h>
#include "fxbus.h"

/* UI formatters */

int main(void) {
    for (int slot = FX_RV_DECAY; slot <= FX_DL_LEVEL; ++slot) {
        const x0x_param_t *param = fxbus_param(slot);
        for (int raw = 0; raw <= param->max; ++raw) {
            char number[32] = {0}, unit[32] = {0};
            if (param->names) {
                put_s(number, param->names[raw]);
            } else {
                float value = 0;
                int kind = fxbus_param_si(slot, raw, &value);
                if (kind == X0X_U_NONE) return 1;
                unit_value(kind, value, number, unit);
            }
            printf("%d\t%s%s\n", slot, number, unit);
        }
    }
    return 0;
}
