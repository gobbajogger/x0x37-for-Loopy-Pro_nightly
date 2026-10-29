/* SPDX-License-Identifier: GPL-3.0-only */
/* X0X project: the settings, the sound, the 32 patterns, the song and the motion lanes.
 *
 * The settings and the sound are one storage object each, as they are. The patterns, the song and
 * the lanes (~30 KB, mostly empty steps) are one stream packed with lz.c across the four objects
 * OBJ_PAT0, OBJ_PAT1, OBJ_SONG, OBJ_MOTION (PROJ_STREAM). The first carries the raw length and a
 * CRC of the raw bytes, so a stream torn by a power cut between two objects, or one that does not
 * unpack, loads as the defaults rather than as garbage. A save packs once to measure (nothing is
 * written if it would not fit: "MEMORY FULL") and once to write; an object whose bytes did not
 * change is not written again.
 *
 * Every object carries its format number. The original-engine profile accepts only
 * revision/stream 13. In the legacy profile, a project saved before the stream (format 1: 16
 * patterns of 32 steps in OBJ_PAT0/1, the song and 32-step lanes in OBJ_SONG/OBJ_MOTION) is
 * converted as it loads: its steps land on steps 1-32, its patterns on 1-16. */
#include "x0x.h"
#if !X0X_ORIGINAL_SYNTH
#include "../dsp/drum909.h"            /* DR_SD (the sound's revisions) */
#include "../dsp/master.h"             /* MST_* (the sound's revisions) */
#include "../dsp/bass303.h"            /* BASS303_* (sound rev 5–7) */
#include "chicago_arp.h"               /* CHI_ARP_* (snd rev 8) */
#include "chicago_fx.h"                /* CHI_FX_* (snd rev 9) */
#include "chicago_aux.h"               /* CHI_PBEND / CHI_DAMPER (snd rev 10) */
#endif
#include "lz.c"
#include "../crc32_nibble.h"           /* one nibble table shared with storage.c */

project_t proj;
/* Reuses the UI undo shadow while an exclusive project operation is active. */
project_t project_stage X0X_POOL;

#if X0X_ORIGINAL_SYNTH
#define PROJ_STREAM 13u                 /* compact Chicago schema2; current raw patterns/arrangement */
static int stream_known(uint32_t format) { return format == PROJ_STREAM; }
#else
#if X0X_BASS_NOTE_SOUND
#define PROJ_STREAM 9u                  /* adaptive BREAK counts plus tagged per-note product sounds */
#else
#define PROJ_STREAM 8u                  /* adaptive BREAK counts plus release endpoints, no snapshots */
#endif
static int stream_known(uint32_t format)
{return format==2u || format==3u || format==6u || format==8u || (X0X_BASS_NOTE_SOUND && (format==7u || format==9u));}
#endif
#define PROJ_STREAM_PREV 3u             /* velocity steps, legacy gates */
#define PROJ_STREAM_OLD 2u
static const uint8_t STREAM_OBJ[] = {OBJ_PAT0, OBJ_PAT1, OBJ_SONG, OBJ_MOTION};
#define NSTREAM ((int)sizeof STREAM_OBJ)
#define STREAM_HDR 16u                  /* in the first object: format, raw length, raw CRC, packed length */
#define STREAM_CAP (NSTREAM * (PLAT_STORE_MAX - 4u) - (STREAM_HDR - 4u))
#define RAW_OFF __builtin_offsetof(project_t, pat)
#define RAW_LEN (sizeof(project_t) - RAW_OFF)   /* the patterns and the arrangement, contiguous */
typedef char raw_fits[(RAW_LEN < 0xFFFFu) ? 1 : -1];
typedef char raw_contiguous[(__builtin_offsetof(project_t, arr) == RAW_OFF + sizeof proj.pat) ? 1 : -1];

static void arrange_defaults(project_t *pr);
static int project_validate_for(const project_t *pr);
static uint8_t project_incompatible; /* retain unsupported stored bytes until explicit staged adoption */
static uint32_t packed_len;             /* the last save's (or load's) packed stream, bytes */

/* SMK-37 clip mode keybed settings (main_fm1.c), ck_ch .. ck_x2: channel 2, C MAJOR NEAR, MAJ root position,
 * ARP UP 1/16, 1 octave, gate 50 %, no swing, human, rhythm or strum; and the highest values. A value out of
 * range (for example an older object): all go back to the defaults. An older object without ck_x1/ck_x2 loads
 * zeros there: the defaults. */
static const uint8_t CK_DEF[12] = {2, 0, 0, 0, 0, 0, 9, 0, 4, 0, 0, 0},
                     CK_MAX[12] = {15, 11, 23, 1, 29, 5, 12, 3, 9, 3, 63, 127};
#if !X0X_ORIGINAL_SYNTH
static void project_ck_check(project_t *pr, int force)
{
    uint8_t *v = &pr->set.ck_ch;
    for (int i = 0; i < 12; i++)
        force |= v[i] > CK_MAX[i];
    if (force || v[0] < 2)
        __builtin_memcpy(v, CK_DEF, 12);
}
#endif
typedef char ck_set_size[sizeof(settings_t) == 40u ? 1 : -1];   /* the new bytes use the old padding */

static void project_defaults_for(project_t *pr, uint8_t device_bt)
{
    int i;
    __builtin_memset(pr, 0, sizeof *pr);
    pr->set.magic = PROJ_MAGIC;
    pr->set.format = PROJ_FORMAT;
    pr->set.palette = 1;                /* amber */
    pr->set.keyled = 1;
    pr->set.keysound = 0;
    pr->set.autosave_off = 0;
    pr->set.clk_out = 1;
    pr->set.bt = (uint8_t)((device_bt & PROJ_DEVICE_BT) | PROJ_BT_CLK_IN);   /* CLOCK SOURCE AUTO */
    pr->set.notes_out = 0;
    pr->set.bpm_x10 = 1250;
    pr->set.accent_q7 = 88;
    pr->set.stereo = PROJ_STEREO;
    pr->set.snd_rev = PROJ_SND_REV;
    __builtin_memcpy(&pr->set.ck_ch, CK_DEF, sizeof CK_DEF);
    engine_sound_defaults(&pr->sound);
    arrange_defaults(pr);
    /* the 303 lines start empty, like the drums: OCT+ on TB-3PO (or keyboard mode) writes one */
    for (i = 0; i < NPAT; i++)
        pattern_init(&pr->pat[i], 0x3B0u + (uint32_t)i * 977u, 0x5A1u + (uint32_t)i * 613u);
}

/* how full the stream's room is, in % (GLO > ABOUT) */
int project_mem_pct(void) { return (int)((packed_len * 100u + STREAM_CAP - 1u) / STREAM_CAP); }

/* object payload: format word + body. The device aliases this to st_buf
 * (x0x.c PROJECT_IO_BUFFER). Host builds keep a private buffer. */
#ifdef PROJECT_IO_BUFFER
#define io_buf PROJECT_IO_BUFFER
#else
static uint8_t io_buf[PLAT_STORE_MAX] __attribute__((aligned(4)));
#endif

/* what each object last held on the flash (a hash of its payload), so a save writes only the
 * objects that changed: an autosave usually erases one or two sectors, not six */
static uint64_t stored_hash[OBJ_NOBJ];
static uint8_t stored_known[OBJ_NOBJ];
__attribute__((noinline)) static uint64_t hash_of(const uint8_t *p, uint32_t n)        /* FNV-1a, 64-bit */
{
    uint64_t h = UINT64_C(14695981039346656037);
    while (n--)
        h = (h ^ *p++) * UINT64_C(1099511628211);
    return h;
}

__attribute__((noinline)) static uint32_t get32(const uint8_t *p)
{
    return (uint32_t)p[0] | (uint32_t)p[1] << 8 | (uint32_t)p[2] << 16 | (uint32_t)p[3] << 24;
}
__attribute__((noinline)) static void put32(uint8_t *p, uint32_t v)
{
    p[0] = (uint8_t)v;
    p[1] = (uint8_t)(v >> 8);
    p[2] = (uint8_t)(v >> 16);
    p[3] = (uint8_t)(v >> 24);
}

#define crc32_of x0x_crc32                               /* zlib CRC-32, 4 bits per step */

/* the object is the n bytes of io_buf, format word included; written only if they changed */
static int save_buf(uint32_t obj, uint32_t n)
{
    uint64_t h = hash_of(io_buf, n);
    int rc;
    if (stored_known[obj] && stored_hash[obj] == h)
        return 0;                                    /* the flash already holds exactly this */
    rc = plat_store_save(obj, io_buf, n);
    stored_known[obj] = rc == 0;
    stored_hash[obj] = h;
    return rc;
}

/* the settings may have grown since they were saved: a shorter payload of this format loads into
 * the front of dst, and the rest keeps what dst held (zeros: the new settings' defaults) */
static int load_settings(settings_t *dst)
{
    int n = plat_store_load(OBJ_SET, io_buf, sizeof io_buf);
#if X0X_ORIGINAL_SYNTH
    if (n < 0) return -1;
    if ((uint32_t)n != sizeof *dst + 4u || get32(io_buf) != PROJ_FORMAT ||
        io_buf[4u + __builtin_offsetof(settings_t, snd_rev)] != PROJ_SND_REV) return -9;
#endif
    if (n < 20 || (uint32_t)n > sizeof *dst + 4u || io_buf[0] != (uint8_t)PROJ_FORMAT || io_buf[1] || io_buf[2] || io_buf[3])
        return -1;
    __builtin_memcpy(dst, io_buf + 4u, (uint32_t)n - 4u);
    if ((uint32_t)n == sizeof *dst + 4u) {           /* exactly what a save of these settings writes */
        stored_known[OBJ_SET] = 1;
        stored_hash[OBJ_SET] = hash_of(io_buf, (uint32_t)n);
    }
    return 0;
}

static int save_obj(uint32_t obj, const void *src, uint32_t len)
{
    if (len + 4u > sizeof io_buf)
        return -1;
    put32(io_buf, PROJ_FORMAT);
    __builtin_memcpy(io_buf + 4u, src, len);
    return save_buf(obj, len + 4u);
}

typedef char sound_fits[(sizeof(sound_t) + 4u <= PLAT_STORE_MAX) ? 1 : -1];
#define SOUND_BYTES_V10 (NTARGETS * NVOICES_MAX * NPARAMS_MAX)
#define SOUND_CELL_V4 16u
#define SOUND_BYTES_V4 (NTARGETS * NVOICES_MAX * SOUND_CELL_V4)
#define SOUND_CELL_V7 24u
#define SOUND_BYTES_V7 (NTARGETS * NVOICES_MAX * SOUND_CELL_V7)
#define SOUND_CELL_V8 28u
#define SOUND_BYTES_V8 (NTARGETS * NVOICES_MAX * SOUND_CELL_V8)

#if X0X_BASS_TAGGED_SOUND && !X0X_ORIGINAL_SYNTH
static uint8_t loaded_sound_tagged;
static uint32_t loaded_sound_bytes;
#endif
static int load_sound(sound_t *dst)
{
    int n = plat_store_load(OBJ_SOUND, io_buf, sizeof io_buf);
#if X0X_ORIGINAL_SYNTH
    if (n < 0) return -1;
    if ((uint32_t)n != sizeof *dst + 4u || get32(io_buf) != PROJ_FORMAT) return -9;
    __builtin_memcpy(dst, io_buf + 4u, sizeof *dst);
    if (engine_bass_sound_validate(dst)) return -9;
    stored_known[OBJ_SOUND] = 1;
    stored_hash[OBJ_SOUND] = hash_of(io_buf, (uint32_t)n);
    return 0;
#else
#if X0X_BASS_TAGGED_SOUND
    loaded_sound_tagged=0;loaded_sound_bytes=0;
#endif
    uint32_t t, v, p, body, cell;
    if (n < 4 || get32(io_buf) != PROJ_FORMAT)
        return -1;
    body = (uint32_t)n - 4u;
#if X0X_BASS_TAGGED_SOUND
    loaded_sound_bytes=body;
#endif
    if (body == sizeof *dst) {
#if X0X_BASS_TAGGED_SOUND
        loaded_sound_tagged=1;
#endif
        __builtin_memcpy(dst, io_buf + 4u, body);
        stored_known[OBJ_SOUND] = 1;
        stored_hash[OBJ_SOUND] = hash_of(io_buf, (uint32_t)n);
        return 0;
    }
#if X0X_BASS_TAGGED_SOUND
    __builtin_memset(dst->bass,0,sizeof dst->bass); /* unknown, no identity inference */
    if(body==SOUND_BYTES_V10) {
        __builtin_memcpy(dst->v,io_buf+4u,body);stored_known[OBJ_SOUND]=0;return 0;
    }
#endif
    if (body == SOUND_BYTES_V4)
        cell = SOUND_CELL_V4;
    else if (body == SOUND_BYTES_V7)
        cell = SOUND_CELL_V7;
    else if (body == SOUND_BYTES_V8)
        cell = SOUND_CELL_V8;
    else
        return -1;
    for (t = 0; t < NTARGETS; t++)
        for (v = 0; v < NVOICES_MAX; v++)
            for (p = 0; p < cell; p++)
                dst->v[t][v][p] = io_buf[4u + (t * NVOICES_MAX + v) * cell + p];
    stored_known[OBJ_SOUND] = 0;
    return 0;
#endif
}

__attribute__((noinline)) static void arrange_defaults(project_t *pr)
{
    uint32_t i;
    uint8_t *z = (uint8_t *)&pr->arr;
    for (i = 0; i < sizeof pr->arr; i++)
        z[i] = 0;
}

/* ---- the packed stream ---------------------------------------------------------------------- */

/* the writer: fills io_buf after the object's header and writes it when full (measure: counts only) */
typedef struct {
    int measure, k, err;
    uint32_t fill, total;
} st_out_t;

static int st_flush(st_out_t *o)
{
    int rc = save_buf(STREAM_OBJ[o->k], o->fill);
    o->k++;
    o->fill = 4u;
    put32(io_buf, PROJ_STREAM);
    return rc;
}

static int st_put(void *ctx, const uint8_t *p, uint32_t n)
{
    st_out_t *o = ctx;
    o->total += n;
    if (o->measure)
        return o->total > STREAM_CAP ? -1 : 0;
    while (n) {
        if (o->fill == PLAT_STORE_MAX) {
            if (o->k + 1 >= NSTREAM || st_flush(o)) {
                o->err = 1;
                return -1;
            }
        }
        io_buf[o->fill++] = *p++;
        n--;
    }
    return 0;
}

/* Check capacity before any project object is changed, including settings and sound. */
static int measure_project(const project_t *pr, uint32_t *length)
{
    const uint8_t *raw = (const uint8_t *)pr + RAW_OFF;
    st_out_t o = {1, 0, 0, 0, 0};
    lz_sink_t sink = {st_put, &o};
    if (lz_compress(raw, RAW_LEN, &sink))
        return -7;
    *length = o.total;
    return 0;
}

static int save_stream(void)
{
    const uint8_t *raw = (const uint8_t *)&proj + RAW_OFF;
    uint32_t crc = crc32_of(raw, RAW_LEN);
    st_out_t o = {0, 0, 0, 0, 0};
    lz_sink_t sink = {st_put, &o};
    o.fill = STREAM_HDR;
    put32(io_buf, PROJ_STREAM);
    put32(io_buf + 4, RAW_LEN);
    put32(io_buf + 8, crc);
    put32(io_buf + 12, packed_len);
    if (lz_compress(raw, RAW_LEN, &sink) || o.err || st_flush(&o))
        return -3;
    while (o.k < NSTREAM)                             /* the objects past the stream: empty */
        if (st_flush(&o))
            return -3;
    return 0;
}

/* the reader: the objects in turn, from io_buf */
typedef struct {
    int k, n;
    uint32_t pos, left;
    uint32_t format;
    uint8_t unsupported; /* a consumed segment must retain its format classification */
} st_in_t;

static int st_get(void *ctx)
{
    st_in_t *s = ctx;
    if (!s->left)
        return -1;
    while (s->pos >= (uint32_t)s->n) {
        if (++s->k >= NSTREAM)
            return -1;
        s->n = plat_store_load(STREAM_OBJ[s->k], io_buf, sizeof io_buf);
        if (s->n < 4)
            return -1;
        uint32_t format = get32(io_buf);
        if (!stream_known(format)
#if !X0X_ORIGINAL_SYNTH
            && format >= 4u
#endif
            ) {
            s->unsupported = 1;
            return -1;
        }
        if (format != s->format)
            return -1;
        stored_known[STREAM_OBJ[s->k]] = 1;
        stored_hash[STREAM_OBJ[s->k]] = hash_of(io_buf, (uint32_t)s->n);
        s->pos = 4u;
    }
    s->left--;
    return io_buf[s->pos++];
}

/* 0 = loaded; -1 = not there or not good (proj's patterns and arrangement then hold garbage) */
#if !X0X_ORIGINAL_SYNTH
/* The old stream's 303 step was note+flags. Expand patterns back-to-front in
 * the already allocated new raw area; move the unchanged arrangement first. */
typedef struct { uint8_t note, flags; } bstep2_t;
typedef struct {
    bstep2_t step[NSTEPS];
    uint8_t len, rate, dir, transpose;
    tb3po_cfg_t gen;
} bpart2_t;
typedef struct {
    dpart_t drum[NKIT];
    bpart2_t bass[NBASS];
    brkpart_t brk;
    uint8_t swing, rsv[3];
} pattern2_t;
#define RAW_LEN_2 (NPAT * sizeof(pattern2_t) + sizeof(arrange_t))
static void stream_from2(project_t *pr)
{
    uint8_t *raw = (uint8_t *)pr + RAW_OFF;
    int p, b, s;
    uint32_t i;
    /* The destination is higher and overlaps the old pattern data. Copy from the
     * end so this also works with the firmware link, which has no libc memmove. */
    for (i = sizeof(arrange_t); i > 0; i--)
        raw[NPAT * sizeof(pattern_t) + i - 1u] = raw[NPAT * sizeof(pattern2_t) + i - 1u];
    for (p = NPAT - 1; p >= 0; p--) {
        pattern2_t old;
        pattern_t *dst = &pr->pat[p];
        __builtin_memcpy(&old, raw + (uint32_t)p * sizeof old, sizeof old);
        __builtin_memset(dst, 0, sizeof *dst);
        __builtin_memcpy(dst->drum, old.drum, sizeof old.drum);
        for (b = 0; b < NBASS; b++) {
            bpart_t *bp = &dst->bass[b];
            for (s = 0; s < NSTEPS; s++) {
                bp->step[s].note = old.bass[b].step[s].note;
                bp->step[s].flags = old.bass[b].step[s].flags;
            }
            bp->len = old.bass[b].len;
            bp->rate = old.bass[b].rate;
            bp->dir = old.bass[b].dir;
            bp->transpose = old.bass[b].transpose;
            bp->gen = old.bass[b].gen;
        }
        dst->brk = old.brk;
        dst->swing = old.swing;
        __builtin_memcpy(dst->rsv, old.rsv, sizeof old.rsv);
    }
    for (p = 0; p < NSTREAM; p++)
        stored_known[STREAM_OBJ[p]] = 0;             /* next save writes format 3 */
}

#endif

/* No frozen snapshot layout is reinterpreted as ordinary motion or endpoints.
 * Streams 1/2/3 never assigned the upper flags nibble. */
static int stream_parts_ok(const pattern_t *pat,const arrange_t *arr,uint32_t format)
{
#if X0X_ORIGINAL_SYNTH
    int p, b, k;
    for (p = 0; p < NPAT; p++) {
        /* Validate old meanings before migration: old mode 1 is not count code 1. */
        if (pat[p].brk.slice_mode > (format < 8u ? 1u : 15u)) return 0;
        for (k = 0; k < 16; k++)
            if (pat[p].brk.slice[k] > (format < 8u ? 8u : 32u)) return 0;
    }
    for (p = 0; p < NPAT; p++)
        for (b = 0; b < NBASS; b++)
            for (k = 0; k < NSTEPS; k++) {
                unsigned f = pat[p].bass[b].step[k].flags;
                if ((f & BS_GATE_MASK) > G_TIE ||
                    (format < 6u && (f >> BS_END_SHIFT)) ||
                    ((f >> BS_END_SHIFT) && (f & BS_GATE_MASK) == G_REST))
                    return 0;
            }
    for (k = 0; k < NLANE; k++) {
        const lane_t *l=&arr->lane[k];
        if(!l->used)continue;
        if(l->t==0xfeu)return 0; /* frozen historical contract remains unsupported */
        if(l->t==0xfdu) {
#if X0X_BASS_NOTE_SOUND
            if((format!=7u && format!=9u) || engine_bass_note_validate(l) ||
               bstep_gate(&pat[l->pat].bass[l->part-PART_303A].step[l->v])!=G_NOTE)return 0;
            for(int j=0;j<k;j++)if(arr->lane[j].used && arr->lane[j].t==l->t &&
                arr->lane[j].pat==l->pat && arr->lane[j].part==l->part && arr->lane[j].v==l->v)return 0;
#else
            return 0;
#endif
        }
    }
#else
    (void)format;
    /* The release step layout remains unchanged. Reserved upper bits do not
     * acquire recorder/snapshot semantics from another development branch. */
    for (int p=0;p<NPAT;p++) for (int b=0;b<NBASS;b++) for (int k=0;k<NSTEPS;k++) {
        unsigned flags=pat[p].bass[b].step[k].flags;
        if ((flags & ~15u) || (flags & BS_GATE_MASK)>G_TIE) return 0;
    }
    for (int k=0;k<NLANE;k++)
        if (arr->lane[k].used && (arr->lane[k].t==0xfdu || arr->lane[k].t==0xfeu)) return 0;
#endif
    return 1;
}
static int stream_layout_ok(const project_t *pr,uint32_t format)
{return stream_parts_ok(pr->pat,&pr->arr,format);}

/* Call only after checking the original bytes' CRC and old semantic ranges.
 * The packed count's zero means A8/B8; the reserved byte and pin intent survive. */
static void migrate_break_counts(project_t *pr, uint32_t format)
{
    if (format < 8u)
        for (int p = 0; p < NPAT; p++) pr->pat[p].brk.slice_mode = 0;
}


static int load_stream(project_t *pr, int n, uint32_t format)
{
    uint8_t *raw = (uint8_t *)pr + RAW_OFF;
    uint32_t crc = get32(io_buf + 8), plen = get32(io_buf + 12);
#if X0X_ORIGINAL_SYNTH
    uint32_t raw_len = RAW_LEN;
#else
    uint32_t raw_len = format == PROJ_STREAM_OLD ? RAW_LEN_2 : RAW_LEN;
#endif
    st_in_t s = {0, n, STREAM_HDR, plen, format, 0};
    lz_src_t src = {st_get, &s};
    if (n < (int)STREAM_HDR || get32(io_buf + 4) != raw_len || plen > STREAM_CAP)
        return -1;
    stored_known[STREAM_OBJ[0]] = 1;
    stored_hash[STREAM_OBJ[0]] = hash_of(io_buf, (uint32_t)n);
    int decode_rc = lz_decompress(&src, raw, raw_len);
    /* Only st_get encounters used continuation objects; stale unused tails are
     * deliberately irrelevant. Do not turn newer data into ordinary corruption
     * and allow the boot-default autosave path to overwrite it. */
    if (s.unsupported)
        return -9;
    if (decode_rc || s.left || crc32_of(raw, raw_len) != crc)
        return -1;
#if !X0X_ORIGINAL_SYNTH
    if (format == PROJ_STREAM_OLD)
        stream_from2(pr);
#endif
    if (!stream_layout_ok(pr, format))
        return -9;
    migrate_break_counts(pr, format);
    if (format != PROJ_STREAM)
        for (int k = 0; k < NSTREAM; k++) stored_known[STREAM_OBJ[k]] = 0;
    packed_len = plen;
    return 0;
}

#if !X0X_ORIGINAL_SYNTH
/* ---- format 1: 16 patterns of 32 steps, 32-step lanes ---------------------------------------- */

#define NSTEPS1 32
#define NPAT1 16
typedef struct {
    uint32_t hit[NDRUM];
    uint32_t accent;
    uint8_t len, rate, rsv[2];
} dpart1_t;
typedef struct {
    bstep2_t step[NSTEPS1];
    uint8_t len, rate, dir, transpose;
    tb3po_cfg_t gen;
} bpart1_t;
typedef struct {
    uint32_t steps;
    uint8_t set[BRK_NSET];
    uint8_t slot_a, slot_b, rsv[2];
} brkpart1_t;
typedef struct {
    dpart1_t drum[NKIT];
    bpart1_t bass[NBASS];
    brkpart1_t brk;
    uint8_t swing, rsv[3];
} pattern1_t;
typedef struct {
    uint8_t used, gen, pat, part, t, v, i, rsv;
    uint8_t val[NSTEPS1];
} lane1_t;
#define ARR1_LEN (sizeof(song_t) + NLANE * sizeof(lane1_t))
#define ARR1_A (PLAT_STORE_MAX - 4u)                 /* format 1's arrangement bytes in OBJ_SONG; the rest in OBJ_MOTION */
typedef char arr1_room[(ARR1_LEN <= sizeof(arrange_t)) ? 1 : -1];   /* it unpacks in proj.arr */

__attribute__((noinline)) static void pattern_from1(pattern_t *p, const pattern1_t *o)
{
    int k, s, v;
    for (k = 0; k < NKIT; k++) {
        for (v = 0; v < NDRUM; v++)
            p->drum[k].hit[v][0] = o->drum[k].hit[v];
        p->drum[k].accent[0] = o->drum[k].accent;
        p->drum[k].len = o->drum[k].len;
        p->drum[k].rate = o->drum[k].rate;
    }
    for (k = 0; k < NBASS; k++) {
        for (s = 0; s < NSTEPS1; s++) {
            p->bass[k].step[s].note = o->bass[k].step[s].note;
            p->bass[k].step[s].flags = o->bass[k].step[s].flags;
        }
        p->bass[k].len = o->bass[k].len;
        p->bass[k].rate = o->bass[k].rate;
        p->bass[k].dir = o->bass[k].dir;
        p->bass[k].transpose = o->bass[k].transpose;
        p->bass[k].gen = o->bass[k].gen;
    }
    p->brk.steps = o->brk.steps;
    for (k = 0; k < BRK_NSET; k++)
        p->brk.set[k] = o->brk.set[k];
    p->brk.slot_a = o->brk.slot_a;
    p->brk.slot_b = o->brk.slot_b;
    p->swing = o->swing;
}

/* OBJ_PAT0 + OBJ_PAT1, format 1 (eight patterns each) onto patterns 1-16 (the defaults are in place) */
static int load_patterns1(project_t *pr)
{
    int h, i;
    for (h = 0; h < 2; h++) {
        int n = plat_store_load(h ? OBJ_PAT1 : OBJ_PAT0, io_buf, sizeof io_buf);
        if (n != (int)(8u * sizeof(pattern1_t) + 4u) || get32(io_buf) != PROJ_FORMAT)
            return -1;
        for (i = 0; i < 8; i++) {
            pattern1_t o;
            uint32_t b;
            for (b = 0; b < sizeof o; b++)
                ((uint8_t *)&o)[b] = io_buf[4u + (uint32_t)i * sizeof o + b];
            pattern_from1(&pr->pat[h * 8 + i], &o);
        }
    }
    return 0;
}

/* OBJ_SONG + OBJ_MOTION, format 1: the song as it is, the lanes widened to 64 steps (in place, last
 * first: lane k's new place never reaches below its old one) */
__attribute__((noinline)) static int load_arrange1(project_t *pr)
{
    uint8_t *a = (uint8_t *)&pr->arr;
    int k, i, song_n, motion_n, bad;
    /* Older projects may predate both arrangement objects. Inspect both: a
     * readable malformed object or a partial pair is not an absent arrangement.
     * The storage API cannot distinguish absent from unreadable/corrupt objects. */
    song_n = plat_store_load(OBJ_SONG, io_buf, sizeof io_buf);
    bad = song_n != (int)(ARR1_A + 4u) || get32(io_buf) != PROJ_FORMAT;
    if (!bad)
        __builtin_memcpy(a, io_buf + 4, ARR1_A);
    motion_n = plat_store_load(OBJ_MOTION, io_buf, sizeof io_buf);
    if (song_n < 0 && motion_n < 0)
        return 1;                                  /* pre-arrangement compatibility */
    if (bad || motion_n != (int)(ARR1_LEN - ARR1_A + 4u) || get32(io_buf) != PROJ_FORMAT)
        return -1;
    __builtin_memcpy(a + ARR1_A, io_buf + 4, ARR1_LEN - ARR1_A);
    for (k = NLANE - 1; k >= 0; k--) {
        lane1_t o;
        lane_t *l = &pr->arr.lane[k];
        uint32_t b;
        for (b = 0; b < sizeof o; b++)
            ((uint8_t *)&o)[b] = a[sizeof(song_t) + (uint32_t)k * sizeof o + b];
        l->used = o.used;
        l->gen = o.gen;
        l->pat = o.pat;
        l->part = o.part;
        l->t = o.t;
        l->v = o.v;
        l->i = o.i;
        l->rsv = 0;
        for (i = 0; i < NSTEPS; i++)
            l->val[i] = i < NSTEPS1 ? o.val[i] : MOT_NONE;
    }
    stored_known[OBJ_SONG] = stored_known[OBJ_MOTION] = 0;   /* the next save writes the stream */
    return 0;
}

/* ---- load, save ----------------------------------------------------------------------------- */

/* the 909 SD gained DECAY at pot 3: what was 3.. (LEVEL, DRIVE, DIST, REV, DLY, PAN) moves up one,
 * the knobs' motion with it, and DECAY takes its default (9W9's 340 ms) */
static void sound_rev1(project_t *pr)
{
    uint8_t *sd = pr->sound.v[T_909][DR_SD];
    int i, n = engine_nparams(T_909, DR_SD);
    for (i = n - 1; i > 3; i--)
        sd[i] = sd[i - 1];
    sd[3] = engine_param(T_909, DR_SD, 3)->def;
    for (i = 0; i < NLANE; i++) {
        lane_t *l = &pr->arr.lane[i];
        if (l->used && l->t == T_909 && l->v == DR_SD && l->i >= 3)
            l->i++;
    }
}

/* the master's one-knob COMP and FILTER and the delay's TAPE arrived: each set to its nearest to what
 * the details say (the details themselves stay, and are applied after: the sound is as it was) */
static void sound_rev2(project_t *pr)
{
    uint8_t *m = pr->sound.v[T_MST][0];
    int th = m[MST_THRESH], cut = m[MST_CUTOFF];
    float thr = (float)th * (48.0f / 127.0f) - 48.0f, x = (-thr - 4.0f) / 28.0f;
    m[MST_COMP1] = (uint8_t)(!m[MST_RATIO] ? 0 : x <= 0.0f ? 1 : x >= 1.0f ? 127 : (int)(x * 127.0f + 0.5f));
    if (m[MST_MODE] == 3 && cut > 120)   /* HP macro ends at cutoff 120 (value 127) */
        cut = 120;
    m[MST_DJF] = (uint8_t)(m[MST_MODE] == 0 ? 64 : m[MST_MODE] == 3 ? 69 + cut * 58 / 120
                           : (cut < 8 ? 0 : (cut - 8) * 59 / 119));
    pr->sound.v[T_FX][1][0] = (uint8_t)(pr->sound.v[T_FX][0][FX_DL_TYPE] ? 16 + pr->sound.v[T_FX][0][FX_DL_WEAR] * 111 / 127 : 0);
}

/* a BD gained REV and DLY before its PAN (909: 8 -> 10, 808: 7 -> 9): the pan value moves, the sends start
 * at none (as the kick had). Motion-lane remap is separate: lanes load after OBJ_SOUND. */
static void sound_bd_sends(project_t *pr, int t, int pan)
{
    uint8_t *bd = pr->sound.v[t][0];
    bd[pan + 2] = bd[pan];
    bd[pan] = bd[pan + 1] = 0;
}

/* BF-007: remap BD PAN motion only after arrangement/lanes exist (909: 8->10, 808: 7->9) */
static void sound_bd_sends_lanes(project_t *pr, int t, int pan)
{
    int i;
    for (i = 0; i < NLANE; i++) {
        lane_t *l = &pr->arr.lane[i];
        if (l->used && l->t == t && l->v == 0 && l->i == pan)
            l->i = (uint8_t)(pan + 2);
    }
}

/* PROJ_SND_REV 6: Wave became continuous 0..127. Remap discrete square (1) in the base
 * sound and in used T_303 / BASS303_WAVE motion lanes after the arrangement is loaded. */
static void sound_rev6_wave_motion(project_t *pr)
{
    int k, s, b;
    for (b = 0; b < NBASS; b++)
        if (pr->sound.v[T_303][b][BASS303_WAVE] == 1)
            pr->sound.v[T_303][b][BASS303_WAVE] = 127;
    for (k = 0; k < NLANE; k++) {
        lane_t *l = &pr->arr.lane[k];
        if (!l->used || l->t != T_303 || l->i != BASS303_WAVE)
            continue;
        for (s = 0; s < NSTEPS; s++)
            if (l->val[s] == 1)
                l->val[s] = 127;
    }
}

#endif

static void patterns_defaults(project_t *pr)
{
    int i;
    for (i = 0; i < NPAT; i++)
        pattern_init(&pr->pat[i], 0x3B0u + (uint32_t)i * 977u, 0x5A1u + (uint32_t)i * 613u);
}

#if !X0X_ORIGINAL_SYNTH
/* CLOCK SOURCE (MID-13) is in bt bits 1-2. An object without PROJ_BT_CLK_IN comes from a74 or older. a74 kept
 * the value 0-2 in byte 38, and byte 39 was 0. Byte 38 is ck_x1 in the clip keys (ARP SWING and HUMAN), so the
 * value moves to bt, and byte 38 becomes 0 (no SWING, no HUMAN). Other bytes there stay, and CLOCK SOURCE is AUTO. */
typedef char a74_clk_in_set[(PROJ_A74_CLK_OFF + 2u == sizeof(settings_t)) ? 1 : -1];
static void project_clk_check(project_t *pr)
{
    uint8_t *raw = (uint8_t *)&pr->set, b = pr->set.bt, v = raw[PROJ_A74_CLK_OFF];
    if (!(b & PROJ_BT_CLK_IN)) {
        b &= 1u;
        if (v <= SEQ_CLK_EXT && !raw[PROJ_A74_CLK_OFF + 1u]) {
            b |= (uint8_t)(v << 1);
            raw[PROJ_A74_CLK_OFF] = 0;
        }
        b |= PROJ_BT_CLK_IN;
    } else if (PROJ_CLK_SRC(b) > SEQ_CLK_EXT)
        b &= (uint8_t)~PROJ_BT_CLK_MASK;
    pr->set.bt = b;
}

#endif

/* Objects are read into the candidate project; the original profile admits only
 * a completely validated candidate and leaves safe defaults on every failure. */
static int read_project(project_t *pr)
{
#if X0X_ORIGINAL_SYNTH
    uint8_t device_bt = proj.set.bt;
#if BOARD_SMK37
    uint8_t device_bt_valid = 0;  /* set only after revision-13 settings validate */
#endif
    project_defaults_for(pr, device_bt);
    packed_len = 0;
    settings_t set = pr->set;
    int bad = 0, rc = load_settings(&set);
    if (rc == -9) goto unsupported;
    if (!rc) {
        if (set.magic != PROJ_MAGIC || set.format != PROJ_FORMAT ||
            set.snd_rev != PROJ_SND_REV || set.stereo != PROJ_STEREO) goto unsupported;
        pr->set = set;
        device_bt = set.bt;                       /* retain explicit ON/OFF and role */
#if BOARD_SMK37
        device_bt_valid = 1;
#endif
    } else bad = 1;
    rc = load_sound(&pr->sound);
    if (rc == -9) goto unsupported;
    if (rc) bad = 1;
    int n = plat_store_load(OBJ_PAT0, io_buf, sizeof io_buf);
    if (n >= 0 && (n < 4 || !stream_known(get32(io_buf)))) goto unsupported;
    if (n >= 4) {
        rc = load_stream(pr, n, get32(io_buf));
        if (rc == -9) goto unsupported;
        if (rc) {
            patterns_defaults(pr);
            arrange_defaults(pr);
            bad = 1;
        }
    } else bad = 1;
    rc = bad ? -1 : project_validate_for(pr);
    if (!rc) return 0;
    goto failed;
unsupported:
    rc = -9;
failed:
#if BOARD_SMK37
    /* An incompatible older project is NOT a valid device setting. The old
     * settings path returns -9 before the missing-settings default could run.
     * Enable the single SMC central on this safe fallback, without loading or
     * migrating any legacy project bytes. Respect every valid revision-13 OFF
     * or DEVICE selection, even if its sound/pattern object was damaged. */
    if (!device_bt_valid && !(device_bt & PROJ_DEVICE_BT))
        device_bt = (uint8_t)(1u | PROJ_BT_SMC_CENTRAL);
#endif
    project_defaults_for(pr, device_bt);
    packed_len = 0;
    return rc;
#else
    int bad = 0, i, sound_ok, n;
    settings_t set;
    project_defaults_for(pr, proj.set.bt);
    packed_len = 0;
    __builtin_memcpy(&set, &pr->set, sizeof set);    /* (memcpy: the padding bytes 38-39 too, project_clk_check) */
    if (load_settings(&set) == 0 && set.magic == PROJ_MAGIC && set.format == PROJ_FORMAT && set.snd_rev <= PROJ_SND_REV)
        __builtin_memcpy(&pr->set, &set, sizeof set);
    else
        bad = 1;
    project_clk_check(pr);                              /* (first: it can clear the a74 byte 38) */
    project_ck_check(pr, 0);                              /* (main_fm1.c trusts the clip keys settings) */
    sound_ok = load_sound(&pr->sound) == 0;
    if (!sound_ok)
        bad = 1;
    n = plat_store_load(OBJ_PAT0, io_buf, sizeof io_buf);
    if (n >= 4 && !stream_known(get32(io_buf)) && get32(io_buf) >= 4u)
        return -9; /* unsupported/ambiguous stream: no legacy fallback or rewrite */
    if (n >= 4 && (stream_known(get32(io_buf)))) {
        int rc = load_stream(pr, n, get32(io_buf));
        if (rc == -9) return -9;
        if (rc) {          /* torn or broken: the defaults, not garbage */
            patterns_defaults(pr);
            arrange_defaults(pr);
            bad = 1;
        }
    } else {
        if (load_patterns1(pr)) {                       /* half a set is no set: the defaults */
            patterns_defaults(pr);
            bad = 1;
        }
        /* Both unavailable can predate arrangements; a partial/malformed pair
         * must reject explicit Load rather than silently discard song/motion. */
        i = load_arrange1(pr);
        if (i) {
            arrange_defaults(pr);
            if (i < 0)
                bad = 1;
        }
        stored_known[OBJ_PAT0] = stored_known[OBJ_PAT1] = 0;
        if (!stream_layout_ok(pr, PROJ_FORMAT)) return -9;
    }
    if (pr->arr.song.len > NSONG) {
        bad = 1;
        pr->arr.song.len = NSONG;
    }
    /* BF-007/BF-020: after stream/arrange load, migrate BD PAN sound pots and motion lanes */
    if (sound_ok && pr->set.snd_rev < 3) {            /* before the 909 BD's sends: its pan moves up two */
        sound_bd_sends(pr, T_909, 8);                     /* (first: the pans' own fixes below see the new place) */
        sound_bd_sends_lanes(pr, T_909, 8);
    }
    if (sound_ok && pr->set.snd_rev < 4) {            /* the 808 BD's, the same */
        sound_bd_sends(pr, T_808, 7);
        sound_bd_sends_lanes(pr, T_808, 7);
    }
    if (!X0X_BASS_TAGGED_SOUND && sound_ok && pr->set.snd_rev < 5) {
        for (i = 0; i < NBASS; i++)
            pr->sound.v[T_303][i][BASS303_AMPMODE] = bass303_param(BASS303_AMPMODE)->def;
    }
    if (!X0X_BASS_TAGGED_SOUND && sound_ok && pr->set.snd_rev < 6)
        sound_rev6_wave_motion(pr);
    if (!X0X_BASS_TAGGED_SOUND && sound_ok && pr->set.snd_rev < 7) {
        for (i = 0; i < NBASS; i++) {
            pr->sound.v[T_303][i][BASS303_BITE] = bass303_param(BASS303_BITE)->def;
            pr->sound.v[T_303][i][BASS303_AATTACK] = bass303_param(BASS303_AATTACK)->def;
            pr->sound.v[T_303][i][BASS303_ADECAY] = bass303_param(BASS303_ADECAY)->def;
            pr->sound.v[T_303][i][BASS303_ASUSTAIN] = bass303_param(BASS303_ASUSTAIN)->def;
            pr->sound.v[T_303][i][BASS303_ARELEASE] = bass303_param(BASS303_ARELEASE)->def;
        }
    }
    if (!X0X_BASS_TAGGED_SOUND && sound_ok && pr->set.snd_rev < 8) {
        for (i = 0; i < NBASS; i++) {
            int k;
            for (k = 0; k < 4; k++)
                pr->sound.v[T_303][i][CHI_ARP_SWITCH + k] = CHI_ARP_PARAMS[k].def;
        }
    }
    if (!X0X_BASS_TAGGED_SOUND && sound_ok && pr->set.snd_rev < 9) {
        for (i = 0; i < NBASS; i++) {
            pr->sound.v[T_303][i][CHI_FX_TYPE] = CHI_FX_OFF;
            pr->sound.v[T_303][i][CHI_FX_EDIT1] = CHI_FX_PARAMS[1].def;
            pr->sound.v[T_303][i][CHI_FX_EDIT2] = CHI_FX_PARAMS[2].def;
        }
    }
    if (!X0X_BASS_TAGGED_SOUND && sound_ok && pr->set.snd_rev < 10) {
        for (i = 0; i < NBASS; i++) {
            pr->sound.v[T_303][i][CHI_PBEND] = CHI_AUX_PARAMS[0].def;
            pr->sound.v[T_303][i][CHI_DAMPER] = CHI_AUX_PARAMS[1].def;
        }
    }
    if (pr->set.stereo < 1)                          /* saved mono: no pans there (zeros = hard left) */
        for (i = 0; i < NPARTS; i++)
            pr->sound.v[T_MIX][i][MX_PAN] = 64;
    if (pr->set.stereo < 2)                          /* saved before the drum voices had pans */
        engine_sound_centre_drum_pans(&pr->sound);
    pr->set.stereo = PROJ_STEREO;
    if (sound_ok && pr->set.snd_rev < 1)             /* saved before the 909 SD's DECAY: its pots move up one */
        sound_rev1(pr);
    if (sound_ok && pr->set.snd_rev < 2)             /* before the one-knob COMP, FILTER, TAPE */
        sound_rev2(pr);
#if X0X_BASS_TAGGED_SOUND
    if(sound_ok && ((pr->set.snd_rev==11)!=!!loaded_sound_tagged ||
       (pr->set.snd_rev==10 && loaded_sound_bytes!=SOUND_BYTES_V10)))return -9;
    if(pr->set.snd_rev<11) {
        /* Untagged legacy cells remain byte-for-byte as decoded, quarantined.
         * No old part number or value range supplies an engine identity. */
        __builtin_memset(pr->sound.bass,0,sizeof pr->sound.bass);
    } else if(engine_bass_sound_validate(&pr->sound)) return -9;
#else
    pr->set.snd_rev = PROJ_SND_REV;
#endif
    return bad ? -1 : 0;
#endif
}

void project_defaults(void) { project_defaults_for(&proj, proj.set.bt); }
int project_load(void)
{
    int rc = read_project(&proj);
    project_incompatible = (uint8_t)(rc == -9
#if X0X_BASS_TAGGED_SOUND
        || (!rc && engine_bass_sound_validate(&proj.sound))
#endif
        );
    return rc;
}
int project_storage_unsupported(void) { return project_incompatible; }
void project_reset_stage(void) { project_defaults_for(&project_stage, proj.set.bt); }

/* Validate indices before the UI, sequencer or DSP can see an imported project.
 * Unused sound cells and motion lanes are opaque, just as they are in storage.
 * Break slot indices are resolved against the companion's complete sample manifest:
 * a slot may not exist here yet, because sample restoration follows this check. */
static int project_validate_for(const project_t *p)
{
    const settings_t *s = &p->set;
    uint32_t length;
    int t, v, i, k, b;
#if X0X_BASS_TAGGED_SOUND
    int bass_status=engine_bass_sound_validate(&p->sound);
    if(bass_status)return bass_status;
#endif
    if (s->magic != PROJ_MAGIC || s->format != PROJ_FORMAT || s->stereo != PROJ_STEREO ||
        s->snd_rev != PROJ_SND_REV || s->palette > 4 || s->keyled > 2 || s->clk_out > 1 ||
        s->notes_out > 1 || s->bpm_x10 < 200 || s->bpm_x10 > 2750 || s->accent_q7 > 127 ||
        s->keysound > 1 || s->autosave_off > 1 || s->out_loud > 1 || s->usb_full > 1 ||
        (s->bt & 0xC0u) || !(s->bt & PROJ_BT_CLK_IN) || PROJ_CLK_SRC(s->bt) > SEQ_CLK_EXT ||
        s->ck_ch < 2)
        return -1;
    for (i = 0; i < 12; i++)
        if ((&s->ck_ch)[i] > CK_MAX[i])
            return -1;
    for (i = 0; i < NPARTS; i++)
        if (s->midi_ch[i] > 17)
            return -1;
    if (p->sound.v[T_FX][1][0] > 127)       /* UI's derived TAPE control */
        return -1;
    for (t = 0; t < NTARGETS; t++)
        for (v = 0; v < engine_nvoices(t); v++)
            for (i = 0; i < engine_nparams(t, v); i++)
                if (
#if X0X_BASS_TAGGED_SOUND
                    t!=T_303 &&
#endif
                    p->sound.v[t][v][i] > engine_param(t, v, i)->max)
                    return -1;
    for (k = 0; k < NPAT; k++) {
        const pattern_t *pat = &p->pat[k];
        if (pat->swing > 100)
            return -1;
        for (b = 0; b < NKIT; b++)
            if (!pat->drum[b].len || pat->drum[b].len > NSTEPS || pat->drum[b].rate >= NRATES)
                return -1;
        for (b = 0; b < NBASS; b++) {
            const bpart_t *bp = &pat->bass[b];
            const tb3po_cfg_t *g = &bp->gen;
            if (!bp->len || bp->len > NSTEPS || bp->rate >= NRATES || bp->dir >= NDIRS || bp->transpose > 48 ||
                g->density > 100 || g->accent > 100 || g->slide > 100 || !g->oct_range || g->oct_range > 3 ||
                g->root > 11 || g->scale >= TB3PO_NSCALES || g->base_oct > 4 || g->mutate_bars > 16)
                return -1;
            for (i = 0; i < NSTEPS; i++)
                if (bp->step[i].note > 127 || bp->step[i].velocity > 127 ||
                    bstep_gate(&bp->step[i]) > G_TIE ||
                    ((bp->step[i].flags >> BS_END_SHIFT) && bstep_gate(&bp->step[i]) == G_REST))
                    return -1;
        }
        for (i = 0; i < BRK_NSET; i++)
            if (pat->brk.set[i] > breaks_param(i)->max)
                return -1;
        for (i = 0; i < 16; i++)
            if (pat->brk.slice[i] > 32)
                return -1;
        if (pat->brk.slice_mode > 15)
            return -1;
    }
    if (p->arr.song.len > NSONG)
        return -1;
    for (k = 0; k < p->arr.song.len; k++)
        for (i = 0; i < NPARTS; i++)
            if (p->arr.song.bar[k].pat[i] >= NPAT)
                return -1;
    for (k = 0; k < NLANE; k++) {
        const lane_t *l = &p->arr.lane[k];
        int max;
        if (!l->used)
            continue;
        if (l->used != 1 || l->pat >= NPAT || l->part >= NPARTS)
            return -1;
#if X0X_BASS_NOTE_SOUND
        if(l->t==BASS_NOTE_TARGET) {
            if(engine_bass_note_validate(l))return -1;
            if(bstep_gate(&p->pat[l->pat].bass[l->part-PART_303A].step[l->v])!=G_NOTE)return -1;
            for(int j=0;j<k;j++)if(p->arr.lane[j].used && p->arr.lane[j].t==l->t &&
                p->arr.lane[j].pat==l->pat && p->arr.lane[j].part==l->part && p->arr.lane[j].v==l->v)return -1;
            continue;
        }
#endif
        if (l->t == T_PROB) {
            if ((l->v >> 4) != l->part || (l->v & 15) >= (l->part < NKIT ? NDRUM : 1) || l->i)
                return -1;
            max = PROB_COND + PROB_NCOND - 1;
        } else if (l->t == T_VEL) {
            /* Drum black-key strike velocity only; 303 steps keep bstep.velocity. */
            if (l->part >= NKIT || (l->v >> 4) != l->part || (l->v & 15) >= NDRUM || l->i)
                return -1;
            max = 127;
        } else {
            if (l->t >= NTARGETS || l->v >= engine_nvoices(l->t) ||
#if X0X_BASS_TAGGED_SOUND
                (l->t==T_303?!engine_bass_bank_param(engine_bass_sound_bank(&p->sound,l->v),l->i):l->i>=engine_nparams(l->t,l->v))
#else
                l->i>=engine_nparams(l->t,l->v)
#endif
                )
                return -1;
            max =
#if X0X_BASS_TAGGED_SOUND
                l->t==T_303?engine_bass_bank_param(engine_bass_sound_bank(&p->sound,l->v),l->i)->max:
#endif
                engine_param(l->t, l->v, l->i)->max;
        }
        for (i = 0; i < NSTEPS; i++)
            if (l->val[i] != MOT_NONE && l->val[i] > max)
                return -1;
    }
    return measure_project(p, &length);
}

int project_validate_stage(void) { return project_validate_for(&project_stage); }

#if X0X_BASS_TAGGED_SOUND
int project_adopt_legacy_stage(int bank0,int bank1)
{
    /* This is an explicit whole-project identity choice, not a preset change.
     * Only the exact rev10 product surface is admitted in this first unit. */
    if(project_stage.set.snd_rev!=10)return -9;
    bass_sound_tag_t old[NBASS];uint8_t rev=project_stage.set.snd_rev;
    __builtin_memcpy(old,project_stage.sound.bass,sizeof old);
    int rc=engine_bass_sound_adopt(&project_stage.sound,bank0,bank1);
    if(rc)return rc;
    project_stage.set.snd_rev=PROJ_SND_REV;
    rc=project_validate_stage();
    if(rc) {project_stage.set.snd_rev=rev;__builtin_memcpy(project_stage.sound.bass,old,sizeof old);}
    return rc;
}
#endif
int project_load_stage(void)
{
    uint32_t live_length = packed_len;
    int rc = read_project(&project_stage);
    if (rc == -9) project_incompatible = 1;
    packed_len = live_length;
    rc=rc?rc:project_validate_stage();
#if X0X_BASS_TAGGED_SOUND
    if(rc==-10)project_incompatible=1;
#endif
    return rc;
}

void project_commit_stage(void)
{
    /* Device roles belong to this keyboard; loading music must not change its
     * Bluetooth connection or opt-in control surface mode. */
    project_stage.set.bt = (uint8_t)((project_stage.set.bt & ~PROJ_DEVICE_BT) | (proj.set.bt & PROJ_DEVICE_BT));
    __builtin_memcpy(&proj, &project_stage, sizeof proj);
    project_incompatible = 0; /* explicitly validated import/reset is the recovery boundary */
    (void)measure_project(&proj, &packed_len);
}

/* Portable inner file, LE u32 words. The version fixes the pointer-free project_t
 * layout; no sample bytes or device calibration are stored in this payload. */
void project_file_header(uint8_t *h)
{
    put32(h, 0x50583058u);                 /* X0XP */
    put32(h + 4, 1);
    put32(h + 8, sizeof project_stage);
    put32(h + 12, crc32_of((const uint8_t *)&project_stage, sizeof project_stage));
    put32(h + 16, PROJ_FORMAT);
    put32(h + 20, PROJ_STREAM);
    put32(h + 24, PROJ_SND_REV);
    put32(h + 28, 0);
}

#if X0X_BASS_TAGGED_SOUND
int project_prepare_legacy_file(const uint8_t *h)
{
    const uint32_t payload=sizeof(project_stage)-NBASS*BASS_SOUND_TAG_BYTES;
    const uint32_t shift=NBASS*BASS_SOUND_TAG_BYTES;
    const uint32_t tail=__builtin_offsetof(project_t,pat);
    uint8_t *raw=(uint8_t *)&project_stage;
    uint32_t stream=get32(h+20);
    if(get32(h)!=0x50583058u || get32(h+4)!=1 || get32(h+8)!=payload ||
       get32(h+16)!=PROJ_FORMAT || (stream!=3 && stream!=6) || get32(h+24)!=10 || get32(h+28))return -9;
    if(get32(h+12)!=crc32_of(raw,payload))return -4;
    if(project_stage.set.magic!=PROJ_MAGIC || project_stage.set.format!=PROJ_FORMAT || project_stage.set.snd_rev!=10)return -1;
    const pattern_t *pat=(const pattern_t *)(raw+tail-shift);
    const arrange_t *arr=(const arrange_t *)(raw+__builtin_offsetof(project_t,arr)-shift);
    if(!stream_parts_ok(pat,arr,stream))return -9; /* no 4/5/snapshot guessing */
    /* Move toward higher addresses from the end. The empty compiler barrier
     * prevents a libc memmove call, which the firmware cannot link. */
    for(uint32_t i=sizeof project_stage-tail;i>0;i--){
        __asm__ volatile("" ::: "memory");
        raw[tail+i-1u]=raw[tail-shift+i-1u];
    }
    __builtin_memset(project_stage.sound.bass,0,sizeof project_stage.sound.bass);
    migrate_break_counts(&project_stage, stream);
    return -10; /* prepared and quarantined, not adopted or implicitly saved */
}
#endif
int project_file_validate(const uint8_t *h)
{
    if (get32(h) != 0x50583058u || get32(h + 4) != 1 || get32(h + 8) != sizeof project_stage ||
        get32(h + 16) != PROJ_FORMAT ||
#if X0X_ORIGINAL_SYNTH
        get32(h + 20) != PROJ_STREAM ||
#else
        (get32(h+20)!=8u && get32(h+20)!=6u &&
            !(X0X_BASS_NOTE_SOUND && (get32(h+20)==7u || get32(h+20)==9u))) ||
#endif
        get32(h + 24) != PROJ_SND_REV || get32(h + 28))
        return -1;
    if (get32(h + 12) != crc32_of((const uint8_t *)&project_stage, sizeof project_stage))
        return -4;
    if(!stream_layout_ok(&project_stage,get32(h+20)))return -9;
    migrate_break_counts(&project_stage, get32(h+20));
    return project_validate_stage();
}

void project_apply_io(void)
{
    int p;
    seq.send_clock = proj.set.clk_out;
    seq.send_notes = proj.set.notes_out;
    seq.clk_src = PROJ_CLK_SRC(proj.set.bt);
    for (p = 0; p < 5; p++) {
        int v = proj.set.midi_ch[p];
        seq.ch[p] = (uint8_t)(!v ? SEQ_CH_DEFAULT[p] : v > 16 ? (int)SEQ_CH_OFF : v - 1);
    }
    engine_out_loud(proj.set.out_loud);
    engine_usb_full(proj.set.usb_full);
}

static void capture_settings(settings_t *set)
{
    int p;
    for (p = 0; p < 5; p++)
        set->midi_ch[p] = (uint8_t)(seq.ch[p] == SEQ_CH_OFF ? 17 : seq.ch[p] + 1);
    set->bpm_x10 = (uint16_t)(seq.bpm * 10.0f + 0.5f);
    set->accent_q7 = seq.accent_q7;
    set->clk_out = seq.send_clock;
    set->notes_out = seq.send_notes;
    /* The UI stores CLOCK SOURCE in set->bt. Clip mode temporarily forces the
     * runtime sequencer to AUTO; saving must retain the user's stored choice. */
}

void project_capture_stage(void)
{
    __builtin_memcpy(&project_stage, &proj, sizeof proj);
    capture_settings(&project_stage.set);
}

/* 0 = saved and verified; -7 = the patterns, song and motion do not fit (nothing was written) */
int project_save(void)
{
#if X0X_BASS_TAGGED_SOUND
    if(engine_bass_sound_validate(&proj.sound))return -9;
    for(int v=0;v<NBASS;v++)if(engine_bass_preset_pending(v))return -8;
#elif X0X_BASS_PRESET_PREVIEW
    if(engine_bass_preview_changed()) return -9; /* no untagged preview writes */
#endif
    if (project_incompatible || !stream_layout_ok(&proj, PROJ_STREAM))
        return -9; /* not one settings/sound/pattern object may be rewritten */
#ifndef X0X_HOST
    extern int store_stage_held(void);
    if (store_stage_held())                          /* boot upload is using the store buffer */
        return -8;
#endif
    capture_settings(&proj.set);
    if (measure_project(&proj, &packed_len))
        return -7;
    if (save_obj(OBJ_SET, &proj.set, sizeof proj.set))
        return -1;
    if (save_obj(OBJ_SOUND, &proj.sound, sizeof proj.sound))
        return -2;
    return save_stream();
}
