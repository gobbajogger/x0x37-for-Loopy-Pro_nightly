/* Verify the Remote's authored positions against the stock motion storage and playback. */
#include <assert.h>
#include <stdio.h>
#include "motion.h"

static int observed[4][2][10];

static int base(void *ctx, int target, int voice, int parameter)
{
    (void)ctx;
    (void)voice;
    if (target == 3) return 127;
    return parameter == 9 ? 76 : 32;
}

static void apply(void *ctx, int target, int voice, int parameter, int value)
{
    (void)ctx;
    observed[target][voice][parameter] = value;
}

int main(void)
{
    static lane_t lanes[NLANE];
    static motion_t motion;
    static const struct { int part, target, voice, parameter; } fields[] = {
        {2, 2, 0, 2}, {3, 2, 1, 2}, {4, 3, 0, 0}, {2, 2, 0, 9}, {3, 2, 1, 9}
    };
    int positions = 0;
    motion_init(&motion, lanes);
    motion.base = base;
    motion.apply = apply;
    for (unsigned field = 0; field < sizeof(fields)/sizeof(fields[0]); ++field) {
        int part = fields[field].part, t = fields[field].target;
        int v = fields[field].voice, p = fields[field].parameter;
        for (int pattern = 0; pattern < 32; ++pattern) {
            int lane = motion_alloc(lanes, pattern, part, t, v, p);
            assert(lane >= 0 && motion_find(lanes, pattern, part, t, v, p) == lane);
            /* The engine suppresses repeat callbacks. Preserve the observed value between steps. */
            observed[t][v][p] = -1;
            for (int step = 0; step < 16; ++step) {
                for (int value = 0; value <= 127; ++value) {
                    lanes[lane].val[step] = value;
                    motion_step(&motion, part, pattern, step, (step+1)%16, 16);
                    assert(observed[t][v][p] == value);
                    lanes[lane].val[step] = MOT_NONE;
                    motion_step(&motion, part, pattern, step, (step+1)%16, 16);
                    assert(observed[t][v][p] == base(NULL, t, v, p));
                    ++positions;
                }
            }
        }
    }
    assert(motion_count(lanes) == 160 && positions == 327680);
    printf("PASS 160 lanes, %d applied values and %d cleared values\n", positions, positions);
    return 0;
}
