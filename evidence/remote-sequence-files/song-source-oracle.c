#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "sequencer.c"

int main(void)
{
    static song_t song;
    static seq_t seq;
    _Static_assert(NTRACKS == 5 && TRK_DRUM == 0 && NKIT == 2 && TRK_BASS0 == 2 && NBASS == 2 && TRK_BRK == 4, "track order");
    seq.song = &song;
    for (unsigned repeats = 1; repeats <= 8; ++repeats) {
        for (unsigned off = 0; off < 32; ++off) {
            uint8_t next[NTRACKS] = {0};
            const uint8_t patterns[NTRACKS] = {0, 1, 15, 30, 31};
            song_bar_t *bar = &song.bar[0];
            memcpy(bar->pat, patterns, sizeof(patterns));
            bar->mute = (uint8_t)(((repeats - 1) << 5) | off);
            assert(SONG_REP(bar) == repeats);
            song_read(&seq, 0, next);
            assert(memcmp(next, patterns, sizeof(next)) == 0);
            for (unsigned part = 0; part < NTRACKS; ++part)
                assert(seq_part_muted(&seq, part) == ((off >> part) & 1u));
            song_write(&seq, 1, next);
            assert(song.bar[1].mute == off);
            assert(memcmp(song.bar[1].pat, patterns, sizeof(next)) == 0);
        }
    }
    puts("PASS stock song_read/song_write: 256 packed rows, 1280 per-part mute observations; repeats 1-8 and track order verified.");
}
