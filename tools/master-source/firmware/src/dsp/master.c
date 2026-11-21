/* SPDX-License-Identifier: GPL-3.0-only */
/* X0X master: bus compressor (+ PUMP), resonant multimode filter, volume, limiter.
 *
 * Compressor: feed-forward, peak detector, gain computed in dB with a 6 dB soft knee
 * (Giannoulis / Massberg / Reiss's "smooth decoupled" design: the gain reduction itself is
 * smoothed, attack and release independent), makeup gain and a dry / wet mix for parallel
 * compression. At RATIO 1:1 with PUMP at 0 the stage is bypassed sample for sample.
 * PUMP: a 909 / 808 kick ducks the whole mix by its depth, rising in 3 ms and swelling back
 * with the release: the sidechain pump of these styles, keyed by the sequencer rather than by
 * audio, so it needs no kick on the master and has no detector lag.
 *
 * Filter: Zavalishin's TPT state-variable filter (stable at any cutoff), the coefficient
 * glides so a fast sweep does not zipper (ReBirth's PCF idea: sweep the whole mix).
 * Limiter: instant-attack peak follower, ~150 ms release, then a tanh knee above -1 dBFS. */
#include "master.h"
#include "../x0x_cold.h"
#include "fastmath.h"

#define FS 44100.0f

static const char *const RATIO_N[] = {"1:1", "1.5:1", "2:1", "3:1", "4:1", "6:1", "8:1", "12:1", "20:1", "INF"};
static const float RATIO_V[] = {1.0f, 1.5f, 2.0f, 3.0f, 4.0f, 6.0f, 8.0f, 12.0f, 20.0f, 1e6f};
static const char *const SRC_N[] = {"909", "808", "BOTH"};
static const char *const MODE_N[] = {"OFF", "LP", "BP", "HP"};
static const char *const ONOFF_N[] = {"OFF", "ON"};
static const x0x_param_t MST_P[MST_NPARAMS] = {
    {"THRESH", 127, 95, 0},           /* -48 .. 0 dB: 95 = -12 dB */
    {"RATIO", 9, 0, RATIO_N},         /* 1:1 = off */
    {"ATTACK", 127, 60, 0},           /* 0.1 .. 100 ms, exponential: 60 = ~2.6 ms */
    {"RELEAS", 127, 60, 0},           /* 10 .. 1500 ms, exponential: 60 = ~110 ms */
    {"MAKEUP", 127, 0, 0},            /* 0 .. 24 dB */
    {"MIX", 127, 127, 0},             /* dry .. wet */
    {"PUMP", 127, 0, 0},              /* 0 .. 24 dB of kick-keyed ducking */
    {"PUMP BY", 2, 0, SRC_N},
    {"FILTER", 3, 0, MODE_N},
    {"CUTOFF", 127, 127, 0},
    {"RESO", 127, 20, 0},
    {"LIMIT", 1, 1, ONOFF_N},
    {"COMP", 127, 0, 0},              /* X0X: one knob over THRESH, RATIO, MAKEUP (0 = off) */
    {"FILTER", 127, 64, 0},           /* X0X: one knob over MODE, CUTOFF (64 = off) */
};

int master_nparams(void) { return MST_NPARAMS; }
const x0x_param_t *master_param(int i) { return (i >= 0 && i < MST_NPARAMS) ? &MST_P[i] : 0; }

/* Pot/format maps only — audio reads precomputed master_t fields (X0X_COLD) */
X0X_COLD static float thresh_db(int p) { return -48.0f + 48.0f * (float)p / 127.0f; }
X0X_COLD static float attack_ms(int p) { return 0.1f * fm_exp2f((float)p * (9.966f / 127.0f)); }     /* 0.1 .. 100 */
X0X_COLD static float release_ms(int p) { return 10.0f * fm_exp2f((float)p * (7.229f / 127.0f)); }   /* 10 .. 1500 */
X0X_COLD static float makeup_db(int p) { return 24.0f * (float)p / 127.0f; }
X0X_COLD static float pump_db(int p) { return 24.0f * (float)p / 127.0f; }

/* PUMP's duck rises over this: 12 ms lets the kick's attack through and then ducks. At 3 ms it
 * dropped the whole mix 4 dB inside a cycle of the bass: measured, the fast gain movement at the
 * kick was 6 dB louder than at 10 ms, and it was heard as a click on every kick. */
#ifndef MASTER_PUMP_RISE_MS
#define MASTER_PUMP_RISE_MS 12.0f
#endif

/* Pot/init path only via comp_coefs — not the audio render (X0X_COLD) */
X0X_COLD static float coef_ms(float t) { return fm_expf(-1000.0f / (t * FS)); }

/* Pot/init path only — master_process reads precomputed coefs (X0X_COLD) */
X0X_COLD static void comp_coefs(master_t *m)
{
    float ratio = RATIO_V[m->pot[MST_RATIO] % 10];
    m->thr_db = thresh_db(m->pot[MST_THRESH]);
    m->slope = 1.0f - 1.0f / ratio;
    m->knee = 6.0f;
    m->a_att = coef_ms(attack_ms(m->pot[MST_ATTACK]));
    m->a_rel = coef_ms(release_ms(m->pot[MST_RELEASE]));
    m->a_det = coef_ms(8.0f);
    m->makeup = fm_db2lin(makeup_db(m->pot[MST_MAKEUP]));
    m->mix = (float)m->pot[MST_MIX] / 127.0f;
    m->pump_db = pump_db(m->pot[MST_PUMP]);
    m->a_pump = coef_ms(MASTER_PUMP_RISE_MS);
    {
        uint8_t was = m->comp_on;
        m->comp_on = m->pot[MST_RATIO] != 0 || m->pot[MST_PUMP] != 0;
        if (m->comp_on && !was) {                        /* switched on: the ramp starts at the makeup */
            m->g_lin = m->makeup;
            m->g_step = 0.0f;
            m->cr = 0;
        }
    }
}

/* Pot/init path only — master_process reads precomputed coefs (X0X_COLD) */
X0X_COLD static void filt_coefs(master_t *m)
{
    float fc = 30.0f * fm_exp2f((float)m->pot[MST_CUTOFF] * (9.23f / 127.0f));   /* 30 Hz .. 18 kHz */
    float q = 0.5f + (float)m->pot[MST_RESO] * (11.5f / 127.0f);
    m->g_t = fm_tanf(FM_PI * fm_minf(fc, 19000.0f) / FS);
    m->k = 1.0f / q;
    m->a1 = 1.0f / (1.0f + m->g * (m->g + m->k));       /* the resonance may have changed */
}

/* Boot only (engine_init). master_process is the audio path and stays -O2. */
X0X_COLD void master_init(master_t *m)
{
    int i;
    uint8_t *z = (uint8_t *)m;
    for (i = 0; i < (int)sizeof *m; i++)
        z[i] = 0;
    for (i = 0; i < MST_NPARAMS; i++)
        m->pot[i] = MST_P[i].def;
    m->gain = 1.0f;
    m->vol_cur = -1.0f;                               /* unset: the first block takes the volume as it is */
    comp_coefs(m);
    m->g = m->g_t = 0.0f;
    filt_coefs(m);
    m->g = m->g_t;
    m->a1 = 1.0f / (1.0f + m->g * (m->g + m->k));
}

/* COMP x: the threshold falls (-4 .. -32 dB), the ratio climbs (1.5:1 .. 6:1), makeup follows (0.85 of
 * the reduction at the threshold, at most 24 dB); 3/4 is the factory's -24 dB, 4:1, +16 dB */
/* UI / master_set COMP macro only — not the audio render (X0X_COLD) */
X0X_COLD void master_comp1_pots(int v, uint8_t *thresh, uint8_t *ratio, uint8_t *makeup)
{
    float x = (float)v * (1.0f / 127.0f), thr = -4.0f - 28.0f * x, mk;
    int ri = v ? 1 + (int)(x * 4.0f + 0.5f) : 0;
    mk = ri ? fm_minf(-thr * (1.0f - 1.0f / RATIO_V[ri]) * 0.85f, 24.0f) : 0.0f;
    *thresh = (uint8_t)((thr + 48.0f) * (127.0f / 48.0f) + 0.5f);
    *ratio = (uint8_t)ri;
    *makeup = (uint8_t)(mk * (127.0f / 24.0f) + 0.5f);
}
/* UI / master_set DJF macro only — not the audio render (X0X_COLD) */
X0X_COLD void master_djf_pots(int v, uint8_t *mode, uint8_t *cutoff)
{
    if (v < 60) {                                     /* low-pass: right of 0, the cutoff falls to the left */
        *mode = 1;
        *cutoff = (uint8_t)(8 + v * 119 / 59);
    } else if (v > 68) {                              /* high-pass: the cutoff rises to the right */
        *mode = 3;
        *cutoff = (uint8_t)((v - 69) * 120 / 58);
    } else {
        *mode = 0;
        *cutoff = 127;
    }
}

/* UI/MIDI pot path — not the master audio render (X0X_COLD) */
X0X_COLD void master_set(master_t *m, int i, int v)
{
    if (i < 0 || i >= MST_NPARAMS)
        return;
    if (i == MST_COMP1) {                             /* the macros: their pots, then as those */
        m->pot[i] = (uint8_t)(v < 0 ? 0 : v > 127 ? 127 : v);
        master_comp1_pots(m->pot[i], &m->pot[MST_THRESH], &m->pot[MST_RATIO], &m->pot[MST_MAKEUP]);
        comp_coefs(m);
        return;
    }
    if (i == MST_DJF) {
        m->pot[i] = (uint8_t)(v < 0 ? 0 : v > 127 ? 127 : v);
        master_djf_pots(m->pot[i], &m->pot[MST_MODE], &m->pot[MST_CUTOFF]);
        filt_coefs(m);
        return;
    }
    /* Bypass does not advance the look-ahead ring. Re-enabling the limiter must not
     * replay audio left in that ring before it was switched off. */
    if (i == MST_LIMIT && v > 0 && !m->pot[MST_LIMIT]) {
        int j;
        for (j = 0; j < MST_LA; ++j)
            m->la[j] = m->la_r[j] = 0.0f;
        m->la_pos = m->hold = 0;
        m->env = m->inv_env = 0.0f;
        m->gain = 1.0f;
    }
    m->pot[i] = (uint8_t)(v < 0 ? 0 : v > MST_P[i].max ? MST_P[i].max : v);
    if (i <= MST_PUMPSRC)
        comp_coefs(m);
    else
        filt_coefs(m);
}

int master_get(const master_t *m, int i) { return (i >= 0 && i < MST_NPARAMS) ? m->pot[i] : 0; }

void master_key(master_t *m, int kit, float vel)
{
    int src = m->pot[MST_PUMPSRC];
    if (!m->pot[MST_PUMP] || (src == PUMP_909 && kit != 0) || (src == PUMP_808 && kit != 1))
        return;
    m->pump_tgt = m->pump_db * (0.5f + 0.5f * vel);   /* an accented kick pumps deeper */
}

/* static curve: gain reduction (dB, >= 0) for a level (dB), soft knee */
static float gr_of(const master_t *m, float lv)
{
    float over = lv - m->thr_db, h = 0.5f * m->knee;
    if (over <= -h)
        return 0.0f;
    if (over >= h)
        return m->slope * over;
    over += h;
    return m->slope * over * over / (2.0f * m->knee);
}

/* Limiter soft knee over 0.89. Outlined once for mono + L/R stereo (pi32: one
 * body beats two inlined tanh copies inside master_process_st). */
/* The knee itself (tanh) stays outlined once for mono + stereo; the common
 * case, |s| <= 0.89, is an inline compare (no call per sample). */
__attribute__((noinline)) static float soft_knee(float s)
{
    float a = 0.89f + 0.11f * fm_tanhf((fm_fabsf(s) - 0.89f) * 9.0f);
    return s < 0.0f ? -a : a;
}
static inline __attribute__((always_inline)) float soft_ceiling(float s)
{
    return fm_fabsf(s) > 0.89f ? soft_knee(s) : s;
}


/* Compressor/pump gain advance after ms is updated — one body for mono + stereo. */
static inline __attribute__((always_inline)) void comp_tick(master_t *m, float *grmax, float att_in, float rel_in, float pump_in)
{
    float lv, want, total;
    if (m->cr == 0) {                                /* the static curve, every MST_CR samples */
        lv = 2.0f * m->ms;
        m->want = (lv > 1e-12f && m->slope > 0.0f) ? gr_of(m, 3.0103f * fm_log2f(lv)) : 0.0f;
    }
    want = m->want;
    m->gr = want > m->gr ? m->a_att * m->gr + att_in * want
                         : m->a_rel * m->gr + rel_in * want;
    if (m->pump_tgt > m->pump) {                     /* PUMP: rise to the kick's depth ... */
        m->pump = m->a_pump * m->pump + pump_in * m->pump_tgt;
        if (m->pump_tgt - m->pump < 0.05f)
            m->pump_tgt = 0.0f;                      /* ... then let go: the release swells back */
    } else {
        m->pump = fm_flush(m->a_rel * m->pump);
    }
    total = m->gr + m->pump;
    if (total > *grmax)
        *grmax = total;
    if (m->cr == 0) {                                /* the gain, linear, ramped over MST_CR samples */
        m->g_step = (m->makeup * fm_db2lin(-total) - m->g_lin) * (1.0f / MST_CR);
        m->cr = MST_CR;
    }
    m->cr--;
    m->g_lin += m->g_step;
}

/* Look-ahead limiter envelope + gain — one body for mono and stereo. */
static inline __attribute__((always_inline)) void limit_env(master_t *m, float a)
{
    if (a >= m->env) {
        m->env = a;
        m->hold = MST_LA;
        m->inv_env = a > 0.8f ? 1.0f / a : 0.0f;
    } else if (m->hold) {
        m->hold--;
    } else {
        m->env *= 0.99985f;
        m->inv_env *= 1.0001500225f;                 /* 1 / 0.99985 */
    }
    {
        float want = m->env > 0.8f ? 0.8f * m->inv_env : 1.0f;
        m->gain += (want - m->gain) * (want < m->gain ? (5.0f / MST_LA) : 0.002f);
    }
}

/* One DJF SVF channel step — shared by mono and L/R stereo (same pattern as soft_ceiling). */
__attribute__((noinline)) static float djf_tick(float s, float *ic1, float *ic2, int mode, float g,
                                                float a1, float k)
{
    float v3 = s - *ic2;
    float v1 = a1 * *ic1 + g * a1 * v3;
    float v2 = *ic2 + g * v1;
    *ic1 = fm_flush(2.0f * v1 - *ic1);
    *ic2 = fm_flush(2.0f * v2 - *ic2);
    return mode == 1 ? v2 : mode == 2 ? v1 : s - k * v1 - v2;
}

/* Smooth DJF cutoff g toward g_t and refresh a1 — shared by mono/stereo process. */
__attribute__((noinline)) static float djf_gsmooth(master_t *m, float k)
{
    float g = m->g;
    if (g != m->g_t) {                               /* the cutoff moving: its coefficient too */
        g = m->g += (m->g_t - m->g) * 0.0625f;
        if (fm_fabsf(m->g_t - g) < 1e-6f * m->g_t)
            g = m->g = m->g_t;
        m->a1 = 1.0f / (1.0f + g * (g + k));
    }
    return g;
}

/* ±1 clamp when the limiter is off (inline: two compares). */
static inline __attribute__((always_inline)) float clamp_pm1(float s)
{
    return fm_clampf(s, -1.0f, 1.0f);
}

void master_process(master_t *m, float *x, int n, float volume)
{
    int i, mode = m->pot[MST_MODE], comp_on = m->comp_on, limit = m->pot[MST_LIMIT];
    float k = m->k, grmax = 0.0f;
    float det_in = 0.0f, att_in = 0.0f, rel_in = 0.0f, pump_in = 0.0f;
    if (comp_on) {
        det_in = 1.0f - m->a_det;
        att_in = 1.0f - m->a_att;
        rel_in = 1.0f - m->a_rel;
        pump_in = 1.0f - m->a_pump;
    }
    for (i = 0; i < n; i++) {
        float s = x[i];
        if (comp_on) {
            float wet;
            /* the level: mean square over ~8 ms, x2 so a sine reads its peak. Read sample by sample
             * (|x|), the reduction chased every cycle of a bass note and grabbed each kick within a
             * millisecond: audio-rate gain movement, heard as clicks */
            m->ms = fm_flush(m->a_det * m->ms + det_in * s * s);
            comp_tick(m, &grmax, att_in, rel_in, pump_in);
            wet = s * m->g_lin;
            s = s + (wet - s) * m->mix;
        }
        if (mode) {
            float g = m->g != m->g_t ? djf_gsmooth(m, k) : m->g, a1 = m->a1;
            s = djf_tick(s, &m->ic1, &m->ic2, mode, g, a1, k);
        }
        s *= volume;
        if (limit) {
            /* look ahead MST_LA samples: a peak is seen when it enters, the gain eases down over the
             * MST_LA samples it takes to come out, and is held for them. (It used to halve the
             * distance every sample: a step in the waveform, a click on every limited kick.) */
            float a = fm_fabsf(s), d;
            limit_env(m, a);
            d = m->la[m->la_pos];
            m->la[m->la_pos] = s;
            m->la_pos = (m->la_pos + 1) & (MST_LA - 1);   /* MST_LA: a power of two */
            s = soft_ceiling(d * m->gain);
        } else {
            s = clamp_pm1(s);
        }
        x[i] = s;
    }
    m->gr_view = grmax > m->gr_view ? grmax : m->gr_view * 0.93f;   /* the meter: peak, falling */
}

/* Byte-zero guards preserve signed zeros and all limiter history. */
static int master_zero_bytes(const void *p, unsigned n)
{
    const unsigned char *b = p;
    for (unsigned i = 0; i < n; ++i) if (b[i]) return 0;
    return 1;
}
static int master_settled_zero(master_t *m, const float *l, const float *r, int n, float volume)
{
    if (n < 32 || m->comp_on || m->pot[MST_MODE] ||
        !(volume > 0.0f && volume <= 1.0f) || m->vol_cur != volume) return 0;
    if (m->pot[MST_LIMIT] &&
        (m->gain != 1.0f || !master_zero_bytes(&m->env, sizeof m->env) ||
         !master_zero_bytes(&m->inv_env, sizeof m->inv_env) ||
         !master_zero_bytes(m->la, sizeof m->la) ||
         !master_zero_bytes(m->la_r, sizeof m->la_r))) return 0;
    if (!master_zero_bytes(l, (unsigned)n * sizeof *l) ||
        !master_zero_bytes(r, (unsigned)n * sizeof *r)) return 0;
    if (m->pot[MST_LIMIT]) {
        m->la_pos = (m->la_pos + (n & (MST_LA - 1))) & (MST_LA - 1);
        m->hold = MST_LA;
    }
    m->gr_view = 0.0f > m->gr_view ? 0.0f : m->gr_view * 0.93f;
    return 1;
}

void master_process_st(master_t *m, float *xl, float *xr, int n, float volume)
{
    if (master_settled_zero(m, xl, xr, n, volume)) return;
    int i, mode = m->pot[MST_MODE], comp_on = m->comp_on, limit = m->pot[MST_LIMIT];
    float k = m->k, grmax = 0.0f, vc = m->vol_cur < 0.0f ? volume : m->vol_cur;
    float det_in = 0.0f, att_in = 0.0f, rel_in = 0.0f, pump_in = 0.0f;
    if (comp_on) {
        det_in = 1.0f - m->a_det;
        att_in = 1.0f - m->a_att;
        rel_in = 1.0f - m->a_rel;
        pump_in = 1.0f - m->a_pump;
    }
    for (i = 0; i < n; i++) {
        float s = xl[i], sr = xr[i];
        if (comp_on) {
            float wet;
            /* the level: mean square over ~8 ms, x2 so a sine reads its peak. Read sample by sample
             * (|x|), the reduction chased every cycle of a bass note and grabbed each kick within a
             * millisecond: audio-rate gain movement, heard as clicks */
            /* both sides' power, each term as master_process forms it, so l == r gives its value */
            m->ms = fm_flush(m->a_det * m->ms + 0.5f * (det_in * s * s + det_in * sr * sr));
            comp_tick(m, &grmax, att_in, rel_in, pump_in);
            wet = s * m->g_lin;
            s = s + (wet - s) * m->mix;
            wet = sr * m->g_lin;
            sr = sr + (wet - sr) * m->mix;
        }
        if (mode) {
            float g = m->g != m->g_t ? djf_gsmooth(m, k) : m->g, a1 = m->a1;
            s = djf_tick(s, &m->ic1, &m->ic2, mode, g, a1, k);
            sr = djf_tick(sr, &m->ic1r, &m->ic2r, mode, g, a1, k);
        }
        if (vc != volume) {                          /* the MASTER knob glides (~10 ms): no zipper */
            vc += (volume - vc) * 0.0022651f;
            if (fm_fabsf(volume - vc) < 1e-5f)
                vc = volume;
        }
        s *= vc;
        sr *= vc;
        if (limit) {
            /* look ahead MST_LA samples: a peak is seen when it enters, the gain eases down over the
             * MST_LA samples it takes to come out, and is held for them. (It used to halve the
             * distance every sample: a step in the waveform, a click on every limited kick.) */
            float a = fm_maxf(fm_fabsf(s), fm_fabsf(sr)), d, dr;
            limit_env(m, a);
            d = m->la[m->la_pos];
            dr = m->la_r[m->la_pos];
            m->la[m->la_pos] = s;
            m->la_r[m->la_pos] = sr;
            m->la_pos = (m->la_pos + 1) & (MST_LA - 1);   /* MST_LA: a power of two */
            s = soft_ceiling(d * m->gain);
            sr = soft_ceiling(dr * m->gain);
        } else {
            s = clamp_pm1(s);
            sr = clamp_pm1(sr);
        }
        xl[i] = s;
        xr[i] = sr;
    }
    m->vol_cur = vc;
    m->gr_view = grmax > m->gr_view ? grmax : m->gr_view * 0.93f;   /* the meter: peak, falling */
}

/* UI text only (master_format). Audio paths never call this — build for size. */
X0X_COLD static void put_num(char *b, float v, int decimals, const char *unit)
{
    int neg = v < 0.0f, n = 0, i;
    char t[16];
    uint32_t scale = decimals ? 10u : 1u, u = (uint32_t)((neg ? -v : v) * (float)scale + 0.5f);
    if (decimals) {
        t[n++] = (char)('0' + u % 10u);
        t[n++] = '.';
        u /= 10u;
    }
    do {
        t[n++] = (char)('0' + u % 10u);
        u /= 10u;
    } while (u);
    i = 0;
    if (neg)
        b[i++] = '-';
    while (n)
        b[i++] = t[--n];
    while (*unit)
        b[i++] = *unit++;
    b[i] = 0;
}

/* the UI text of a master value; the UI calls it, the audio does not (X0X_COLD) */
X0X_COLD void master_format(const master_t *m, int i, char *b)
{
    int p = m->pot[i];
    switch (i) {
    case MST_THRESH: put_num(b, thresh_db(p), thresh_db(p) > -10.0f ? 1 : 0, "dB"); return;
    case MST_ATTACK: { float t = attack_ms(p); put_num(b, t, t < 10.0f ? 1 : 0, "ms"); return; }
    case MST_RELEASE: put_num(b, release_ms(p), 0, "ms"); return;
    case MST_MAKEUP: put_num(b, makeup_db(p), 1, "dB"); return;
    case MST_PUMP: put_num(b, pump_db(p), 1, "dB"); return;
    case MST_MIX: put_num(b, (float)p * (100.0f / 127.0f), 0, "%"); return;
    case MST_COMP1:
        if (!p) {
            b[0] = 'O'; b[1] = 'F'; b[2] = 'F'; b[3] = 0;
        } else
            put_num(b, (float)p * (100.0f / 127.0f), 0, "%");
        return;
    case MST_DJF: {                                   /* OFF, LP 40, HP 20: how far each way */
        int a = p < 60 ? (60 - p) * 100 / 60 : p > 68 ? (p - 68) * 100 / 59 : 0;
        b[0] = a ? (p < 60 ? 'L' : 'H') : 'O';
        b[1] = a ? 'P' : 'F';
        b[2] = a ? ' ' : 'F';
        b[3] = 0;
        if (a)
            put_num(b + 3, (float)a, 0, "%");
        return;
    }
    case MST_CUTOFF: {
        float fc = 30.0f * fm_exp2f((float)p * (9.23f / 127.0f));
        if (fc >= 1000.0f)
            put_num(b, fc / 1000.0f, 1, "k");
        else
            put_num(b, fc, 0, "Hz");
        return;
    }
    default: {
        const x0x_param_t *d = &MST_P[i];
        if (d->names) {
            const char *s = d->names[p];
            while ((*b = *s++) != 0)
                b++;
        } else
            put_num(b, (float)p, 0, "");
        return;
    }
    }
}
