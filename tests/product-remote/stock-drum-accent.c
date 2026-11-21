// SPDX-License-Identifier: GPL-3.0-only
// Link against stock firmware/src/seq/{sequencer,pattern,tb3po}.c.
// Observe the real drum sink and outgoing MIDI for two different stored masks.
#include "sequencer.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

struct observations {
    int step[NKIT];
    int drum[NKIT][4][3];
    int midi[NKIT][4][3];
};

static void observe_step(void *ctx, int track, int step)
{
    struct observations *observed = ctx;
    if (track < NKIT) observed->step[track] = step;
}

static int observe_drum(void *ctx, int kit, int voice, float velocity)
{
    struct observations *observed = ctx;
    assert(voice < 3 && observed->step[kit] < 4);
    observed->drum[kit][observed->step[kit]][voice] = (int)(velocity * 127 + 0.5f);
    return 1;
}

static void observe_midi(void *ctx, uint8_t status, uint8_t note, uint8_t velocity)
{
    struct observations *observed = ctx;
    if ((status & 0xf0) != 0x90 || !velocity) return;
    int kit = (status & 15) - 9; // stock 909/808 channels
    assert(kit == 0 || kit == 1);
    int voice = note == 36 ? 0 : note == 38 ? 1 : note == 41 ? 2 : -1;
    assert(voice >= 0);
    observed->midi[kit][observed->step[kit]][voice] = velocity;
}

static void capture(int change_unobservable_bits, struct observations *observed)
{
    static pattern_t patterns[NPAT];
    seq_t seq;
    seq_sink_t sink = {.ctx = observed, .step = observe_step, .drum = observe_drum, .midi = observe_midi};
    for (int i = 0; i < NPAT; ++i) pattern_init(&patterns[i], 100 + i, 200 + i);
    seq_init(&seq, patterns);
    seq.bpm = 120;
    seq.send_notes = 1;
    for (int kit = 0; kit < NKIT; ++kit) {
        dpart_t *d = &patterns[0].drum[kit];
        d->accent[0] = (1u << kit) | (change_unobservable_bits ? 12u : 0u);
        d->hit[0][0] = d->hit[1][0] = 3u; // both voices on steps 1 and 2
        d->hit[2][0] = 11u; // T_VEL override on steps 1, 2 and 4
        seq.drum_vel[kit][2] = 71 + kit;
    }
    seq_start(&seq);
    for (unsigned elapsed = 0; elapsed < 20000;) {
        seq_advance(&seq, 0, &sink);
        unsigned n = seq_until_event(&seq, 128);
        assert(n > 0);
        seq_advance(&seq, n, &sink);
        elapsed += n;
    }
    for (int kit = 0; kit < NKIT; ++kit) {
        assert(observed->step[kit] == 3);
        for (int step = 0; step < 4; ++step) {
            for (int voice = 0; voice < 3; ++voice) {
                int expected = 0;
                if (voice == 2 && step != 2) expected = 71 + kit;
                if (voice < 2 && step < 2) expected = step == kit ? 127 : seq.accent_q7;
                assert(observed->drum[kit][step][voice] == expected);
                assert(observed->midi[kit][step][voice] == expected);
            }
        }
    }
}

int main(void)
{
    struct observations baseline = {0}, changed = {0};
    capture(0, &baseline);
    capture(1, &changed);
    assert(memcmp(&baseline, &changed, sizeof baseline) == 0);
    puts("PASS stock 909/808 independent step masks, shared across voices, T_VEL override, "
         "identical drum and MIDI events from different stored accents on silent/overridden steps.");
}
