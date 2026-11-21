// SPDX-License-Identifier: GPL-3.0-only
// Measure the production INIT values and envelopes over a 200 ms held note.
#include "s1_dry_voice.h"
#include <assert.h>
#include <stdio.h>

static void print_adsr(const s1_dry_adsr *a)
{
    printf("[%.9g,%.9g,%.9g,%.9g]", a->attack_s, a->decay_s, a->sustain, a->release_s);
}

int main(void)
{
    enum { gate_off = 8820, interval = 441, capture_end = 35280 };
    unsigned stop_sample = 0;
    float final_amp = 0.0f, final_filter = 0.0f;
    s1_dry_controls params;
    s1_dry_voice voice;
    s1_dry_frozen_controls(&params);
    s1_dry_reset(&voice);
    assert(s1_dry_configure(&voice, &params) == S1_DRY_OK);
    assert(s1_dry_start(&voice, 440.0f, 100, 0.0f) == S1_DRY_OK);
    printf("{\"amp\":");
    print_adsr(&params.amp);
    printf(",\"filter\":");
    print_adsr(&params.filter);
    printf(",\"cutoffHz\":%.9g,\"resonance\":%.9g,\"filterDepth\":%.9g,"
           "\"oscillator1Level\":%.9g,\"balance\":%.9g,"
           "\"sampleRate\":%u,\"gateOffSample\":%u,\"intervalSamples\":%u,\"points\":[",
           params.cutoff_hz, params.resonance, params.filter_depth, params.oscillator1_level,
           params.balance, (unsigned)S1_DRY_SAMPLE_RATE, (unsigned)gate_off, (unsigned)interval);
    for (unsigned sample = 0; sample <= capture_end; ++sample) {
        if (sample % 64 == 0) {
            int was_active = voice.started;
            s1_dry_begin_block(&voice);
            if (was_active && !voice.started) {
                stop_sample = sample;
                final_amp = voice.amp.level;
                final_filter = voice.filter.level;
            }
        }
        if (sample == gate_off) assert(s1_dry_note_off(&voice) == S1_DRY_OK);
        float output = s1_dry_sample(&voice);
        if (!voice.started) assert(output == 0.0f);
        if (sample % interval == 0)
            printf("%s[%.8g,%.8g]", sample ? "," : "", voice.amp.level, voice.filter.level);
    }
    assert(stop_sample > gate_off && stop_sample < capture_end);
    printf("],\"voiceStopSample\":%u,\"lastActiveLevels\":[%.8g,%.8g]}\n",
           stop_sample, final_amp, final_filter);
}
