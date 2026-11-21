/* SPDX-License-Identifier: GPL-3.0-only */
/* Send reverb, synced delay and master stage: a port of 9W9's er99_verb_tick,
 * er99_dly_tick, master distortion and master_glue (GPL-3.0). See fxbus.h. */
#include "fxbus.h"
#include "../x0x_cold.h"          /* X0X_COLD: fxbus_init is boot only, not the send/render */

static const int32_t fx_cl[4] = { 1116, 1188, 1277, 1356 };
static const int32_t fx_al[2] = { 556, 441 };
static const int32_t fx_alr[2] = { 579, 457 };
#define FX_RV_QUIET (1356 + 8192)          /* combs silent this long: the allpass tail is < -140 dB */

/* 1/32 1/16T 1/16 1/8T 1/16. 1/8 1/4T 1/8. 1/4 1/2T 1/4. 1/2 1/2. (in beats) */
static const float fx_beats[13] = {
    0.125f, 1.0f / 6.0f, 0.25f, 1.0f / 3.0f, 0.375f, 0.5f, 2.0f / 3.0f,
    0.75f, 1.0f, 4.0f / 3.0f, 1.5f, 2.0f, 3.0f
};

/* ---- parameters ---- */
enum { CV_LIN, CV_EXP, CV_SW };
typedef struct {
    x0x_param_t ui;
    uint8_t curve, exp;
    float lo, hi;
} fx_pspec_t;

static const char *const fx_div_names[13] = {
    "1/32", "1/16T", "1/16", "1/8T", "1/16.", "1/8", "1/4T", "1/8.", "1/4", "1/2T", "1/4.", "1/2", "1/2."
};
static const char *const fx_type_names[2] = { "DIGI", "TAPE" };
static const char *const fx_onoff_names[2] = { "OFF", "ON" };

/* pot defaults: the positions 9W9 seeds from its defaults (the engine itself
 * starts on the exact defaults) */
static const fx_pspec_t fx_p[FX_NPARAMS] = {
    [FX_VOLUME]   = { { "Volume", 127, 44, 0 }, CV_LIN, 0, 0.0f, 1.0f },
    [FX_DIST]     = { { "Dist", 7, 0, x0x_dist_names }, CV_SW, 0, 0.0f, 0.0f },
    [FX_DRIVE]    = { { "Drive", 127, 41, 0 }, CV_EXP, X0X_EXP_DRIVE, 0.0f, 0.0f },
    [FX_COMP]     = { { "Comp", 127, 0, 0 }, CV_LIN, 0, 0.0f, 1.0f },
    [FX_RV_DECAY] = { { "RvDec", 127, 73, 0 }, CV_LIN, 0, 0.2f, 0.93f },
    [FX_RV_TONE]  = { { "RvTone", 127, 57, 0 }, CV_LIN, 0, 0.0f, 1.0f },
    [FX_RV_HPF]   = { { "RvHPF", 127, 62, 0 }, CV_EXP, X0X_EXP_FX_HPF, 0.0f, 0.0f },
    [FX_RV_LEVEL] = { { "RvLvl", 127, 85, 0 }, CV_LIN, 0, 0.0f, 1.2f },
    [FX_DL_TIME]  = { { "DlTime", 12, 7, fx_div_names }, CV_SW, 0, 0.0f, 0.0f },
    [FX_DL_FDBK]  = { { "DlFdbk", 127, 52, 0 }, CV_LIN, 0, 0.0f, 0.85f },
    [FX_DL_TONE]  = { { "DlTone", 127, 51, 0 }, CV_LIN, 0, 0.0f, 1.0f },
    [FX_DL_LEVEL] = { { "DlLvl", 127, 85, 0 }, CV_LIN, 0, 0.0f, 1.2f },
    [FX_DL_HPF]   = { { "DlHPF", 127, 62, 0 }, CV_EXP, X0X_EXP_FX_HPF, 0.0f, 0.0f },
    [FX_DL_TYPE]  = { { "DlType", 1, 0, fx_type_names }, CV_SW, 0, 0.0f, 0.0f },
    [FX_DL_WEAR]  = { { "Wear", 127, 64, 0 }, CV_LIN, 0, 0.0f, 1.0f },
    [FX_DL_PING]  = { { "Ping", 1, 0, fx_onoff_names }, CV_SW, 0, 0.0f, 0.0f },
};

int fxbus_nparams(void) { return FX_NPARAMS; }

const x0x_param_t *fxbus_param(int i)
{
    return i >= 0 && i < FX_NPARAMS ? &fx_p[i].ui : 0;
}

/* UI readout: a pot's engine value and unit (X0X_U_*). RvDec is a feedback
 * coefficient and Drive a gain curve: no confirmed unit. */
X0X_COLD int fxbus_param_si(int i, int pot, float *val)
{
    if (i < 0 || i >= FX_NPARAMS)
        return X0X_U_NONE;
    const fx_pspec_t *s = &fx_p[i];
    if (s->curve == CV_SW)
        return X0X_U_NONE;
    float v = s->curve == CV_EXP ? x0x_pot_exp_value(s->exp, pot) : s->lo + (s->hi - s->lo) * (float)pot / 127.0f;
    *val = v;
    switch (i) {
    case FX_VOLUME: case FX_RV_LEVEL: case FX_DL_LEVEL: return X0X_U_GAIN;
    case FX_COMP: case FX_RV_TONE: case FX_DL_TONE: case FX_DL_WEAR: case FX_DL_FDBK: *val = v * 100.0f; return X0X_U_PCT;
    case FX_RV_HPF: case FX_DL_HPF: return X0X_U_HZ;
    default: return X0X_U_NONE;
    }
}

int fxbus_get(const fxbus_t *f, int i)
{
    return i >= 0 && i < FX_NPARAMS ? f->pots[i] : 0;
}

__attribute__((noinline)) static void fx_retime(fxbus_t *f)
{
    int32_t i = f->dl_div;
    if (i < 0) i = 0;
    if (i > 12) i = 12;
    const float bpm = f->bpm >= 20.0f ? f->bpm : 120.0f;
    float ms = fx_beats[i] * 60000.0f / bpm;
    const float max_ms = (float)(f->dlen - 256) / D9_SR * 1000.0f;
    while (ms > max_ms)                 /* longer than the line (1/2. under 90 BPM): half of it, */
        ms *= 0.5f;                     /* which is still on the beat; cutting it short is not */
    f->dl_time_ms = ms;
}

/* Pot/init path only — not the send/render (X0X_COLD) */
X0X_COLD static void fx_comp_prep(fxbus_t *f)
{
    const float a = f->comp;
    const float ratio = 2.0f + 3.0f * a;
    f->c_thr = 10.0f - 18.0f * a;
    f->c_slope = 1.0f - 1.0f / ratio;
    f->c_makeup = a * 2.2f + a * a * 6.6f;
}

/* Pot path only — not the send/render (X0X_COLD) */
X0X_COLD static void fx_apply(fxbus_t *f, int i, float v)
{
    switch (i) {
    case FX_VOLUME: f->volume = v; break;
    case FX_DIST: f->dist_mode = (int32_t)v; break;
    case FX_DRIVE: f->drive = v; break;
    case FX_COMP: f->comp = v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); fx_comp_prep(f); break;
    case FX_RV_DECAY: f->rv_decay = v; break;
    case FX_RV_TONE: f->rv_damp = 0.75f - v * 0.55f; break;
    case FX_RV_HPF: d9_biquad_set(&f->rv_hp, D9_HP, v, 0.7071f); break;
    case FX_RV_LEVEL: f->rv_level = v; break;
    case FX_DL_TIME: f->dl_div = (int32_t)v; fx_retime(f); break;
    case FX_DL_FDBK: f->dl_fdbk = v; break;
    case FX_DL_TONE: f->dl_tc = 0.06f + v * 0.6f; break;
    case FX_DL_LEVEL: f->dl_level = v; break;
    case FX_DL_HPF: d9_biquad_set(&f->dl_hp, D9_HP, v, 0.7071f); break;
    case FX_DL_TYPE: f->dl_type = (int32_t)v; break;
    case FX_DL_WEAR: f->wear = v; break;
    case FX_DL_PING: f->dl_ping = (int32_t)v; break;
    default: break;
    }
    if (i == FX_DIST || i == FX_DRIVE)
        d9_shape_prep(&f->shape, f->drive, f->dist_mode - 1);
}

/* UI/MIDI pot path — not the send/render (X0X_COLD) */
X0X_COLD void fxbus_set(fxbus_t *f, int i, int value)
{
    if (i < 0 || i >= FX_NPARAMS)
        return;
    const fx_pspec_t *s = &fx_p[i];
    if (value < 0) value = 0;
    if (value > s->ui.max) value = s->ui.max;
    /* First default-pot writes still replace the exact unrounded boot values. */
    if (i == FX_RV_TONE && f->pots[i] == value &&
        (value != fx_p[FX_RV_TONE].ui.def || f->rv_damp != 0.75f - 0.45f * 0.55f)) return;
    if (i == FX_DL_TONE && f->pots[i] == value &&
        (value != fx_p[FX_DL_TONE].ui.def || f->dl_tc != 0.06f + 0.4f * 0.6f)) return;
    f->pots[i] = (uint8_t)value;
    float v;
    if (s->curve == CV_EXP)
        v = x0x_pot_exp_value(s->exp, value);
    else if (s->curve == CV_SW)
        v = (float)value;
    else
        v = s->lo + (s->hi - s->lo) * ((float)value / 127.0f);
    fx_apply(f, i, v);
}

void fxbus_set_bpm(fxbus_t *f, float bpm)
{
    if (bpm >= 20.0f && bpm != f->bpm) {
        f->bpm = bpm;
        fx_retime(f);
    }
}

/* Boot only (engine_init). fxbus_process and the reverb/delay ticks stay -O2. */
X0X_COLD void fxbus_init(fxbus_t *f, int16_t *dly_buf, int dly_len)
{
    uint8_t *p = (uint8_t *)f;
    for (unsigned i = 0; i < sizeof(*f); ++i)
        p[i] = 0;
    for (int i = 0; i < dly_len; ++i)
        dly_buf[i] = 0;
    f->dbuf = dly_buf;
    f->dlen = dly_len;

    f->rv_decay = 0.62f; f->rv_damp = 0.75f - 0.45f * 0.55f; f->rv_level = 0.8f;
    d9_biquad_set(&f->rv_hp, D9_HP, 150.0f, 0.7071f);
    f->rv_quiet = FX_RV_QUIET;

    f->dl_div = 7;
    f->bpm = 120.0f;
    f->dl_fdbk = 0.35f; f->dl_tc = 0.06f + 0.4f * 0.6f; f->dl_level = 0.8f;
    fx_retime(f);
    f->dcur = f->dl_time_ms * 0.001f * D9_SR;
    d9_biquad_set(&f->dl_hp, D9_HP, 150.0f, 0.7071f);
    f->dl_quiet = dly_len;
    f->dl_type = 0;
    f->wear = 64.0f / 127.0f;

    f->comp = 0.0f;
    f->drive = 2.0f;
    f->dist_mode = 0;
    f->volume = 0.35f;
    d9_shape_prep(&f->shape, f->drive, -1);
    fx_comp_prep(f);
    f->c_drel = d9_exp_small(-1.0f / (0.035f * D9_SR));
    f->c_atk = d9_exp_small(-1.0f / (0.003f * D9_SR));
    f->c_rel = d9_exp_small(-1.0f / (0.120f * D9_SR));

    for (int i = 0; i < FX_NPARAMS; ++i)
        f->pots[i] = fx_p[i].ui.def;
}


/* 12-bit sat store (toward zero). Shared by reverb combs + delay DIGI/TAPE writes. */
static inline __attribute__((always_inline)) int32_t sat12_store_i(int16_t *cell, float v)
{
    int32_t k = (int32_t)(v * 2048.0f);
    if (k > 32767) k = 32767;
    if (k < -32767) k = -32767;
    *cell = (int16_t)k;
    return k;
}
__attribute__((noinline)) static int32_t sat12_store(int16_t *cell, float v) { return sat12_store_i(cell, v); }

/* Distortion sample — one body; stereo process_st calls this for L and R. */
static inline __attribute__((always_inline)) float dist_one(const d9_shape_t *sh, float x, float k, float *crush)
{
    return d9_shape(sh, x * k, crush) * 0.7f;
}

/* One Schroeder allpass step — shared by L/R reverb (mono 2×, stereo 4×). Inlined: per sample,
 * a call and its register saves cost more than the step (fm1-emu cost table, TPROF 2026-11-12). */
static inline __attribute__((always_inline)) float rv_ap(float *ab, int32_t *pos, int32_t alen, float y)
{
    const int32_t p = *pos;
    const float bo = ab[p];
    ab[p] = y + bo * 0.5f;
    *pos = p + 1 >= alen ? 0 : p + 1;
    return bo - y * 0.5f;
}

/* One Schroeder comb step — 4 combs a sample; inlined (see rv_ap). */
static inline __attribute__((always_inline)) float rv_comb(fxbus_t *f, int16_t *b, int c, float x, float damp, float fb, int32_t *wr)
{
    const int32_t p = f->cpos[c];
    const float y = (float)b[p] * (1.0f / 2048.0f);
    f->cdmp[c] = y + (f->cdmp[c] - y) * damp;
    *wr |= sat12_store_i(&b[p], x + f->cdmp[c] * fb);
    f->cpos[c] = p + 1 >= fx_cl[c] ? 0 : p + 1;
    return y;
}

/* ===================================================================== */
/* Reverb (er99_verb_tick), adds its return into out                      */
/* ===================================================================== */
static void fx_reverb(fxbus_t *f, const float *in, float *out, float *out_r, int n)
{
    if (f->rv_quiet >= FX_RV_QUIET) {
        int any = 0;
        for (int i = 0; i < n; ++i)
            if (in[i] != 0.0f) { any = 1; break; }
        if (!any)
            return;                         /* silent in, silent lines: 0 out */
    }
    const float damp = f->rv_damp;
    const float fb = f->rv_decay;
    const float lvl = f->muted & 1u ? 0.0f : f->rv_level;
    int16_t *cb[4];
    cb[0] = f->comb;
    cb[1] = cb[0] + fx_cl[0];
    cb[2] = cb[1] + fx_cl[1];
    cb[3] = cb[2] + fx_cl[2];
    float *ab0 = f->ap, *ab1 = f->ap + fx_al[0];
    float *ar0 = f->apr, *ar1 = f->apr + fx_alr[0];
    int32_t quiet = f->rv_quiet;
    for (int i = 0; i < n; ++i) {
        const float x = d9_biquad_tick(&f->rv_hp, in[i]);
        float acc = 0.0f, acc_r = 0.0f;
        int32_t wr = 0;
        for (int c = 0; c < 4; ++c) {
            const float y = rv_comb(f, cb[c], c, x, damp, fb, &wr);
            acc += y;
            acc_r += (c & 1) ? -y : y;
        }
        float y = acc * 0.25f;
        y = rv_ap(ab0, &f->apos[0], fx_al[0], y);
        y = rv_ap(ab1, &f->apos[1], fx_al[1], y);
        out[i] += y * lvl;
        if (out_r) {                        /* the right: the combs, alternate signs, its own allpasses */
            float yr = acc_r * 0.25f;
            yr = rv_ap(ar0, &f->aposr[0], fx_alr[0], yr);
            yr = rv_ap(ar1, &f->aposr[1], fx_alr[1], yr);
            out_r[i] += yr * lvl;
        }
        quiet = (wr == 0 && in[i] == 0.0f) ? quiet + 1 : 0;
    }
    f->rv_quiet = quiet;
}

/* ===================================================================== */
/* Delay (er99_dly_tick), adds its return into out                        */
/* ===================================================================== */
__attribute__((noinline)) static float fx_psin(uint32_t ph)                 /* parabolic sine of a turn */
{
    const float x = (float)(int32_t)ph * (1.0f / 2147483648.0f);
    return 4.0f * x * (1.0f - fm_fabsf(x));
}

/* the line at d samples behind w, interpolated (X0X: the ping-pong tap).
 * Outlined once: fx_delay calls this many times (mono + stereo / PING taps);
 * one body beats N inlined copies on pi32 (-O2). */
__attribute__((noinline)) static float dl_tap(const int16_t *buf, int32_t len, float flen, int32_t w, float d)
{
    float rp = (float)w - d;
    while (rp < 0.0f) rp += flen;
    int32_t i0 = (int32_t)rp;
    const float fr = rp - (float)i0;
    if (i0 >= len) i0 -= len;
    const int32_t i1 = i0 + 1 >= len ? 0 : i0 + 1;
    const float b0 = (float)buf[i0] * (1.0f / 2048.0f), b1 = (float)buf[i1] * (1.0f / 2048.0f);
    return b0 + (b1 - b0) * fr;
}

/* out_r 0: 9W9's mono delay. Else both sides get the echo, or with PING the left reads at the time and
 * the right at twice it, the loop fed from the right: echoes alternate L R L R, one time apart. The
 * line holds both, so PING needs twice the time to fit (a 2 s line: 1 s); past that it plays centred. */
static void fx_delay(fxbus_t *f, const float *in, float *out, float *out_r, int n)
{
    f->dl_signal = 0;
    const float target = f->dl_time_ms * 0.001f * D9_SR;
    const int32_t len = f->dlen;
    const int tape = f->dl_type == 1;
    if (f->dl_quiet >= len) {
        int any = 0;
        for (int i = 0; i < n; ++i)
            if (in[i] != 0.0f) { any = 1; break; }
        if (!any) {
            /* the line is all zeros: nothing to read, but time moves on */
            f->w = (f->w + n) % len;
            /* the time slew, sample by sample as 9W9 runs it: in float it stalls
             * ~1 sample short of the target (the step rounds away), and that
             * stalled value is where 9W9's echoes land. It stops at once
             * when it has stalled, so an idle line costs nothing. */
            {
                float dc = f->dcur;
                for (int i = 0; i < n; ++i) {
                    const float nd = dc + (target - dc) * 0.0008f;
                    if (nd == dc)
                        break;
                    dc = nd;
                }
                f->dcur = dc;
            }
            f->wow_ph += d9_inc(0.5f) * (uint32_t)n;
            f->flut_ph += d9_inc(6.1f) * (uint32_t)n;
            return;
        }
    }
    int16_t *buf = f->dbuf;
    const float flen = (float)len;
    const int ping = out_r && f->dl_ping && 2.0f * fm_maxf(f->dcur, target) + 4.0f < flen;
    const float lvl = f->muted & 2u ? 0.0f : f->dl_level;
    int32_t quiet = f->dl_quiet;
    unsigned signal = 0;
    int32_t w = f->w;
    float dcur = f->dcur, lp = f->lp;

    /* Digi and tape share one sample loop; tape adds wow/flutter read mod,
     * darker fdbk/tc, and tanh+HP inside the feedback path. */
    float fdbk, tc, wow_a = 0.0f, flut_a = 0.0f, g = 1.0f, inv_g = 1.0f, hp = 0.0f;
    uint32_t wow_i = 0, flut_i = 0, wp = 0, fp = 0;
    if (!tape) {
        fdbk = f->dl_fdbk;
        tc = f->dl_tc;
    } else {
        /* TAPE: wow (0.5 Hz) and flutter (6.1 Hz) on the read, a darker loop,
         * saturation and a 30 Hz DC block inside it, feedback up to 1.15 */
        const float wear = f->wear;
        const float depth = 0.1f + 1.9f * wear;                  /* x nominal; 1 at wear ~0.5 */
        wow_a = 1.5f * D9_MS * depth;
        flut_a = 0.15f * D9_MS * depth;
        wow_i = d9_inc(0.5f);
        flut_i = d9_inc(6.1f);
        fdbk = f->dl_fdbk * (1.15f / 0.85f);
        tc = f->dl_tc * (0.6f - 0.3f * wear);
        g = 1.0f + 1.5f * wear;
        inv_g = 1.0f / g;
        wp = f->wow_ph;
        fp = f->flut_ph;
        hp = f->tape_hp;
    }
    for (int i = 0; i < n; ++i) {
        const float x = d9_biquad_tick(&f->dl_hp, in[i]);
        dcur += (target - dcur) * 0.0008f;
        float d = dcur;
        if (tape) {
            wp += wow_i;
            fp += flut_i;
            d = dcur + wow_a * fx_psin(wp) + flut_a * fx_psin(fp);
        }
        const float y = dl_tap(buf, len, flen, w, d);
        const float y2 = ping ? dl_tap(buf, len, flen, w, 2.0f * d) : y;
        signal |= in[i] != 0.0f || y != 0.0f || (out_r && y2 != 0.0f);
        lp += (y2 * fdbk - lp) * tc;
        if (fm_fabsf(lp) < 1e-20f) lp = 0.0f;
        float write = lp;
        if (tape) {
            float s = d9_tanh(lp * g) * inv_g;                   /* tape saturation holds the loop */
            hp += (s - hp) * 0.0042725f;                          /* 30 Hz: no DC latch-up past unity */
            s -= hp;
            write = s;
        }
        int32_t k = sat12_store(&buf[w], x + write);       /* 12-bit, toward zero */
        if (++w >= len) w = 0;
        out[i] += y * lvl;
        if (out_r)
            out_r[i] += y2 * lvl;
        quiet = (k == 0 && in[i] == 0.0f) ? quiet + 1 : 0;
    }
    if (tape) {
        f->wow_ph = wp;
        f->flut_ph = fp;
        f->tape_hp = fm_flush(hp);
    }
    f->w = w;
    f->dcur = dcur;
    f->lp = lp;
    f->dl_quiet = quiet;
    f->dl_signal = (uint8_t)signal;
}

/* Soft-knee glue gain reduction — one body for mono + stereo (same pattern as
 * master soft_ceiling / djf_gsmooth). */
__attribute__((noinline)) static float fx_comp_gr(float over, float slope)
{
    if (over >= 3.0f)
        return -over * slope;
    if (over > -3.0f) {
        const float t = over + 3.0f;
        return -(t * t) * (1.0f / 12.0f) * slope;
    }
    return 0.0f;
}

/* One glue sample: update det/env, return linear gain (mono + stereo). */
static inline __attribute__((always_inline)) float fx_comp_gain(float mag, float thr, float slope, float drel,
                                                    float atk, float rel, float makeup,
                                                    float *det, float *env)
{
    *det = mag > *det ? mag : *det * drel;
    const float in_db = *det > 1e-9f ? 6.0205999f * fm_log2f(*det) : -120.0f;
    const float gr = fx_comp_gr(in_db - thr, slope);
    *env = gr + (*env - gr) * (gr < *env ? atk : rel);
    return fm_db2lin(*env + makeup);
}

/* ===================================================================== */
/* Master: distortion, glue (master_glue), volume                         */
/* ===================================================================== */
/* Skip only a settled positive-zero detector/envelope; sends and tails still run. */
static int fx_comp_zero_bytes(const void *p, unsigned n)
{
    const unsigned char *b = p;
    for (unsigned i = 0; i < n; ++i) if (b[i]) return 0;
    return 1;
}
static int fx_comp_settled_zero(const fxbus_t *f, const float *l, const float *r, int n)
{
    return n >= 32 && fx_comp_zero_bytes(&f->comp_det, sizeof f->comp_det) &&
        fx_comp_zero_bytes(&f->comp_env_db, sizeof f->comp_env_db) &&
        fx_comp_zero_bytes(l, (unsigned)n * sizeof *l) &&
        (!r || fx_comp_zero_bytes(r, (unsigned)n * sizeof *r));
}

void fxbus_process(fxbus_t *f, const float *dry, const float *rev, const float *dly, float *out, int n)
{
    if (n > 256)
        n = 256;
    __builtin_memcpy(out, dry, (unsigned)n * sizeof(float));
    fx_reverb(f, rev, out, 0, n);
    fx_delay(f, dly, out, 0, n);

    if (f->dist_mode >= 1) {
        const float k = f->drive;
        for (int i = 0; i < n; ++i)
            out[i] = dist_one(&f->shape, out[i], k, f->crush_st);
    }
    if (f->comp > 0.001f && !fx_comp_settled_zero(f, out, 0, n)) {
        const float thr = f->c_thr, slope = f->c_slope, makeup = f->c_makeup;
        const float drel = f->c_drel, atk = f->c_atk, rel = f->c_rel;
        float det = f->comp_det, env = f->comp_env_db;
        for (int i = 0; i < n; ++i) {
            const float in = out[i];
            out[i] = in * fx_comp_gain(fm_fabsf(in), thr, slope, drel, atk, rel, makeup, &det, &env);
        }
        f->comp_det = det;
        f->comp_env_db = env;
    }
    const float vol = f->muted & 4u ? 0.0f : f->volume;
    for (int i = 0; i < n; ++i)
        out[i] *= vol;
}

/* X0X stereo: 9W9's chain on L and R. The distortion runs on each side; the glue compressor reads
 * the louder side and moves both together, so the image holds */
void fxbus_process_st(fxbus_t *f, const float *dry_l, const float *dry_r, const float *rev, const float *dly,
                      float *out_l, float *out_r, int n)
{
    if (n > 256)
        n = 256;
    __builtin_memcpy(out_l, dry_l, (unsigned)n * sizeof(float));
    __builtin_memcpy(out_r, dry_r, (unsigned)n * sizeof(float));
    fx_reverb(f, rev, out_l, out_r, n);
    fx_delay(f, dly, out_l, out_r, n);
    if (f->dist_mode >= 1) {
        const float k = f->drive;
        for (int i = 0; i < n; ++i) {
            out_l[i] = dist_one(&f->shape, out_l[i], k, f->crush_st);
            out_r[i] = dist_one(&f->shape, out_r[i], k, f->crush_str);
        }
    }
    if (f->comp > 0.001f && !fx_comp_settled_zero(f, out_l, out_r, n)) {
        const float thr = f->c_thr, slope = f->c_slope, makeup = f->c_makeup;
        const float drel = f->c_drel, atk = f->c_atk, rel = f->c_rel;
        float det = f->comp_det, env = f->comp_env_db;
        for (int i = 0; i < n; ++i) {
            const float ml = fm_fabsf(out_l[i]), mr = fm_fabsf(out_r[i]);
            const float g = fx_comp_gain(ml > mr ? ml : mr, thr, slope, drel, atk, rel, makeup, &det, &env);
            out_l[i] *= g;
            out_r[i] *= g;
        }
        f->comp_det = det;
        f->comp_env_db = env;
    }
    const float vol = f->muted & 4u ? 0.0f : f->volume;
    if (vol != 1.0f)                                  /* x * 1 == x: unity skips the pass */
        for (int i = 0; i < n; ++i) {
            out_l[i] *= vol;
            out_r[i] *= vol;
        }
}
