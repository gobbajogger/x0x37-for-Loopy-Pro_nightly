// SPDX-License-Identifier: GPL-3.0-only
// Compile against stock firmware/src/seq/{sequencer,pattern,tb3po}.c with its
// include directory on the search path. This host test only observes callbacks.
#include "sequencer.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

enum { TRACK_SAMPLES = 88199, MIDI_CAPACITY = 256, STEP_CAPACITY = 32 };
struct packet { unsigned sample; uint8_t status, data1, data2; };
struct trace {
    unsigned sample, packets, steps;
    struct packet midi[MIDI_CAPACITY];
    int bass_steps[STEP_CAPACITY];
};

static void observe_midi(void *context, uint8_t status, uint8_t a, uint8_t b)
{
    struct trace *t = context;
    assert(t->packets < MIDI_CAPACITY);
    t->midi[t->packets++] = (struct packet) {t->sample, status, a, b};
}

static void observe_step(void *context, int part, int step)
{
    struct trace *t = context;
    if (part == TRK_BASS0) {
        assert(t->steps < STEP_CAPACITY);
        t->bass_steps[t->steps++] = step;
    }
}

static void capture(int direction, struct trace *t)
{
    static pattern_t patterns[NPAT];
    seq_t seq;
    seq_sink_t sink = {.midi = observe_midi, .step = observe_step, .ctx = t};
    for (unsigned i = 0; i < NPAT; ++i)
        pattern_init(&patterns[i], 0x100 + i, 0x200 + i);
    seq_init(&seq, patterns);
    seq.send_notes = 0;
    seq.send_clock = 1;
    seq.bpm = 120;
    patterns[0].bass[0].dir = direction;
    seq_start(&seq);
    while (t->sample < TRACK_SAMPLES) {
        seq_advance(&seq, 0, &sink);
        uint32_t left = TRACK_SAMPLES - t->sample;
        uint32_t count = seq_until_event(&seq, left < 256 ? left : 256);
        assert(count > 0);
        t->sample += count;
        seq_advance(&seq, count, &sink);
    }
    seq_stop(&seq);
    seq_advance(&seq, 0, &sink);
}

int main(void)
{
    struct trace forward = {0}, reverse = {0};
    capture(DIR_FWD, &forward);
    capture(DIR_REV, &reverse);
    assert(forward.packets == reverse.packets && forward.packets > 2);
    assert(forward.steps == 16 && reverse.steps == 16);
    unsigned ticks = 0;
    for (unsigned i = 0; i < forward.packets; ++i) {
        struct packet a = forward.midi[i], b = reverse.midi[i];
        assert(a.sample == b.sample && a.status == b.status);
        assert(a.data1 == b.data1 && a.data2 == b.data2);
        if (a.status == 0xF8) ++ticks;
    }
    assert(forward.midi[0].status == 0xFA);
    assert(forward.midi[forward.packets - 1].status == 0xFC);
    assert(ticks == 96 && forward.packets == ticks + 2);
    for (unsigned i = 0; i < forward.steps; ++i) {
        assert(forward.bass_steps[i] == (int)i);
        assert(reverse.bass_steps[i] == 15 - (int)i);
    }
    printf("{\"source\":\"stock sequencer callbacks\",\"inputSamples\":%u,"
           "\"bpm\":120,\"timestampedMidiPacketsIdentical\":%u,\"clockTicks\":%u,"
           "\"firstStatus\":250,\"lastStatus\":252,\"forwardBassSteps\":[",
           TRACK_SAMPLES, forward.packets, ticks);
    for (unsigned i = 0; i < forward.steps; ++i) printf("%s%d", i ? "," : "", forward.bass_steps[i]);
    printf("],\"reverseBassSteps\":[");
    for (unsigned i = 0; i < reverse.steps; ++i) printf("%s%d", i ? "," : "", reverse.bass_steps[i]);
    puts("]}");
}
