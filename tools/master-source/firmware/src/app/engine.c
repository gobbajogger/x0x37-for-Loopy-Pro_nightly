/* SPDX-License-Identifier: GPL-3.0-only */
/* X0X audio engine; see engine.h. */
#include "engine.h"
#include "../seq/held_chord.h"
#include "plat.h"
#include "../x0x_cold.h"
#include "../dsp/drum909.h"
#include "../dsp/drum808.h"
#include "original_runtime.h"
#include "bass_303_adapt.h"
#include "../../../experiments/original_synth/chicago_fx2_compact.h"
#include "../dsp/breaks.h"
#include "../dsp/fxbus.h"
#include "../dsp/master.h"
#include "../dsp/fastmath.h"
#include "../dsp/busfx.h"
#include "smc_fx_map.h"
#include "../dsp/ima_adpcm.h"              /* shared IMA tables + ima_decode (outline) */
#if X0X_BASS_PRESET_PREVIEW
#include "bass_presets.h"
#endif

#define POOL X0X_POOL


/* time per stage of the render, in plat_cycles() units (the CPU's cycles, or the 24 MHz timer):
 * running totals (wrapping; the PERF screen takes differences) and the frames rendered. */
volatile uint32_t eng_prof[ENG_PROF_N], eng_prof_frames;
#define PROF_T(v) uint32_t v = plat_cycles()
#define PROF_ADD(k, t0) (eng_prof[k] += plat_cycles() - (t0))

/* ---------------------------------------------------------------- state --- */
seq_t seq;
volatile uint8_t eng_step[NTRACKS];
volatile uint16_t eng_peak[NPARTS];
volatile uint8_t eng_hit[NKIT][NDRUM];
static volatile uint32_t eng_hit_ms[NKIT][NDRUM];     /* UI glyph motion: when each track last hit */
static float eng_hit_pk[NKIT][NDRUM];                 /* the envelope's peak since that hit (UI side) */
static uint32_t eng_hit_seen[NKIT][NDRUM];
int16_t eng_scope[SCOPE_N] X0X_POOL;
volatile uint32_t eng_scope_w;

static drum909_t d909 POOL;
static drum808_t d808 POOL;
static volatile uint8_t project_hold;
static original_runtime_part original_bass[NBASS] POOL;
static uint16_t original_quiet_samples[NBASS], original_switch_gain[NBASS];
#ifdef X0X_HOST
/* Read-only host diagnostics for the actual adoption boundary. */
#define ENGINE_ORIGINAL_TAIL_OWNED (1u << 16)
unsigned engine_original_tail_state(int v)
{
    return (unsigned)v < NBASS ? original_quiet_samples[v] |
        (original_runtime_owned(&original_bass[v]) ? ENGINE_ORIGINAL_TAIL_OWNED : 0u) | ((unsigned)original_switch_gain[v] << 17) : UINT32_MAX;
}
#endif
static original_runtime_workspace original_workspace POOL;
_Static_assert(sizeof(original_runtime_workspace) >= 4 * 256 * sizeof(float),
               "808 metal raw fits in the Chicago workspace");
static original_chicago_tuning original_tuning POOL;
static original_chicago_fx2_compact original_fx[NBASS] POOL;
static original_chicago_fx2_cold_owner original_fx_owner[NBASS];
static uint8_t original_fx_ready;
static uint8_t original_key_pitch[NBASS][38]; /* token -> pitch+1; zero is released */
static uint8_t original_midi_channel[NBASS];
static int16_t original_seq_note[NBASS];
static uint8_t bass_accent[NBASS], bass_slide[NBASS];
static int8_t bass_tune_steps;          /* 0 = concert pitch; set from settings.rsv_bright */
int engine_bass_status(int v) { return (unsigned)v < NBASS ? original_bass[v].status : 0; }
/* UI glyph motion: ms since the track's last hit and its live amplitude envelope
 * (909: the voice's EG; 808: lane output over the hit peak), 0..1 of that hit's
 * peak. 0 when it has never hit or the tail has ended. */
static float eng_hit_e[NDRUM];
static uint32_t eng_hit_e_at[NDRUM], eng_hit_e_t[NDRUM];
X0X_COLD int engine_drum_view(int kit, int v, uint32_t *age_ms, float *env)
{
    if ((unsigned)kit >= NKIT || (unsigned)v >= NDRUM) return 0;
    uint32_t at = eng_hit_ms[kit][v];
    if (!at) return 0;
    float e = kit == 0 ? drum909_env(&d909, v) : drum808_env(&d808, v);
    if (at != eng_hit_seen[kit][v]) { eng_hit_seen[kit][v] = at; eng_hit_pk[kit][v] = 0.0f; }
    if (e < 0.0f) return 0;                          /* 808 without the lane meter */
    if (e > eng_hit_pk[kit][v]) eng_hit_pk[kit][v] = e;
    e = eng_hit_pk[kit][v] > 0.0f ? e / eng_hit_pk[kit][v] : 0.0f;
    if (kit == 1) {   /* the 808 lane peak is per audio block and ripples with the wave: follow it
                       * up at once and down no faster than -6 dB per 20 ms, so the glyph moves smoothly */
        uint32_t t = plat_ms();
        float p = eng_hit_e[v];
        if (at != eng_hit_e_at[v]) { eng_hit_e_at[v] = at; p = e; }
        else p *= fm_exp2f(-(float)(t - eng_hit_e_t[v]) / 20.0f);
        if (e < p) e = p;
        eng_hit_e[v] = e; eng_hit_e_t[v] = t;
    }
    if (e > 1.0f) e = 1.0f;
    *age_ms = plat_ms() - at;
    *env = e;
    return e > 0.001f || *age_ms < 40u;
}
X0X_COLD float engine_bd909_hz(float tau, float m, float pm, float t_ms) { return drum909_bd_hz(tau, m, pm, t_ms); }
int engine_bass_filter_view(int v, float *eg, float *depth)
{ return (unsigned)v < NBASS && original_runtime_filter_view(&original_bass[v], eg, depth); }
int engine_bass_voice_view(int v, float *level, float *modulation, unsigned *state, unsigned *key_down)
{ return (unsigned)v < NBASS && original_runtime_voice_view(&original_bass[v],level,modulation,state,key_down); }
int engine_bass_adsr_view(int v, float values[4], unsigned *gate)
{ return (unsigned)v < NBASS && original_runtime_adsr_view(&original_bass[v],values,gate); }
int engine_bass_motion_view(int v, float *phase, float *bipolar, float *current, float *target, int *active)
{ return (unsigned)v < NBASS && original_runtime_motion_view(&original_bass[v], phase, bipolar, current, target, active); }
int engine_bass_env_view(int v, float adsr[4], float *level, int *state)
{ return (unsigned)v < NBASS && original_runtime_env_view(&original_bass[v], adsr, level, state); }
static void original_prepare_all(void)
{
    for (int v = 0; v < NBASS; ++v) (void)original_runtime_prepare(&original_bass[v], seq_tempo(&seq));
}
#ifdef X0X_HOST
unsigned engine_original_keys(int v, int latched)
{
    if ((unsigned)v >= NBASS || original_bass[v].status != ORIGINAL_RUNTIME_OK) return 0;
    if (original_bass[v].kind == ORIGINAL_SOUND_JUNO || original_bass[v].kind == ORIGINAL_SOUND_DRONE) return 0; /* no arp */
    const chicago_arp_control *keys = original_bass[v].kind == ORIGINAL_SOUND_MIAMI ?
        &original_bass[v].dsp.miami.keys : &original_bass[v].dsp.chicago.keys;
    return latched ? keys->latched_count : keys->physical_count;
}
uint32_t engine_original_value_bits(int v, unsigned parameter)
{
    if ((unsigned)v >= NBASS || parameter >= original_sound_count(original_bass[v].kind) ||
        original_bass[v].status != ORIGINAL_RUNTIME_OK ||
        !original_runtime_kind_available(original_bass[v].kind)) return UINT32_MAX;
    float value = original_bass[v].kind == ORIGINAL_SOUND_JUNO ? original_bass[v].dsp.juno.synth.macro[parameter] :
#if X0X_DRONE_RUNTIME_ENABLED
        original_bass[v].kind == ORIGINAL_SOUND_DRONE ? original_bass[v].dsp.drone.macro[parameter] :
#endif
        original_bass[v].kind == ORIGINAL_SOUND_MIAMI ?
        original_bass[v].dsp.miami.program.macro[parameter] : original_bass[v].dsp.chicago.program.macro[parameter];
    uint32_t bits; __builtin_memcpy(&bits, &value, sizeof bits); return bits;
}
#endif
static uint8_t bass_held[NBASS], bass_held_count[NBASS], bass_held_src[NBASS];
/* Eligible physical Free Play has its own bounded FIFO. Epoch validation is
 * audio-side: a queued old release cannot affect a newer gate or ARP mode. */
#define LIVE_KEY_Q 32u
typedef struct { uint32_t generation, word; } live_key_command_t;
typedef struct { uint32_t generation, context; uint8_t gate, token, pitch, arp, blocked; } live_key_owner_t;
static live_key_command_t live_key_q[LIVE_KEY_Q] POOL;
static live_key_owner_t live_key_owner[NBASS] POOL;
static volatile uint8_t live_key_w, live_key_r, live_key_cancel;
static void live_key_retire(int voice,int release);
static void live_key_context_retire(int voice,int release);
static void live_key_drain(void);

void engine_live_key_state(int voice,uint32_t *generation,int *arp,uint32_t *context)
{
    if((unsigned)voice>=NBASS) { *generation=0;*arp=0;if(context)*context=0;return; }
    uint32_t flags=plat_cq_lock();
    *generation=live_key_owner[voice].generation;
    if(context)*context=live_key_owner[voice].context;
    *arp=0; /* The original allocator owns ARP; UI submits every physical key. */
    if(live_key_owner[voice].blocked)*arp=-1; /* fail closed until cold boot */
    plat_cq_unlock(flags);
}
void engine_live_key_cancel(int voice)
{
    if((unsigned)voice>=NBASS)return;
    uint32_t flags=plat_cq_lock();
    live_key_cancel|=(uint8_t)(1u<<voice);
    plat_cq_unlock(flags);
}
int engine_live_key(int voice,uint32_t generation,int token,int pitch,int velocity,int accent,int slide)
{
    if((unsigned)voice>=NBASS || token<1 || token>37 || pitch<1 || pitch>127 || velocity<0 || velocity>127)return 0;
    if (velocity && SEQ_PART_OFF(&seq, TRK_BASS0 + voice)) return 0;
    uint32_t flags=plat_cq_lock();
    if(live_key_owner[voice].blocked){plat_cq_unlock(flags);return 0;}
    unsigned w=live_key_w,next=(w+1u)%LIVE_KEY_Q;
    if(next==live_key_r) {
        live_key_cancel|=(uint8_t)(1u<<voice);plat_cq_unlock(flags);return 0;
    }
    live_key_q[w].generation=generation;
    live_key_q[w].word=(uint32_t)voice|((uint32_t)token<<1)|((uint32_t)pitch<<7)|
        ((uint32_t)velocity<<14)|((uint32_t)!!accent<<21)|((uint32_t)!!slide<<22);
    __asm__ volatile("" ::: "memory");live_key_w=(uint8_t)next;
    plat_cq_unlock(flags);return 1;
}

static breaks_t brk POOL;
/* Latest-value physical wheel mailbox: centre cannot be dropped by a full CQ.
 * Only audio writes the DSP bend and the external MIDI owner. */
static volatile int16_t brk_wheel;
static int16_t brk_wheel_seen;
static int8_t brk_bend_owner;
void engine_brk_bend(int value)
{
    brk_wheel = (int16_t)(value < -8192 ? -8192 : value > 8191 ? 8191 : value);
}
#ifdef X0X_HOST
int engine_brk_bend_value(void) { return brk.bend; }
#endif
static fxbus_t fx POOL;
static volatile uint8_t tape_signal_seen;
static volatile uint32_t tape_signal_at;
/* The original ca8299b6 visual activity observer. No DSP output change. */
uint8_t engine_tape_active(void)
{
    uint32_t at = tape_signal_at;
    return tape_signal_seen && (uint32_t)(plat_ms() - at) < 80u;
}
void engine_fx_mute(uint8_t mask) { fx.muted = mask & 7u; }
uint8_t engine_fx_muted(void) { return fx.muted; }
static master_t mst POOL; /* was BSS; pool after Chicago-insert union frees headroom */
/* Mix delay ring: 1.80 s @ 44.1 kHz (was 2.00 s / 88200). Recovers pool for product WBL1 + ≥8192 free. */
#define DLY_LEN 79200
static int16_t dly_buf[DLY_LEN] POOL;
static volatile uint8_t project_hold, project_midi_drop;
void engine_project_hold(int hold)
{
    __asm__ volatile("" ::: "memory");
    project_hold = (uint8_t)(hold != 0);
    __asm__ volatile("" ::: "memory");
}
void engine_project_release(void)
{
    project_midi_drop = 1;             /* no MIDI received during the transaction starts the new project */
    engine_project_hold(0);
}
static motion_t mot;
static const sound_t *mot_base_snd;    /* the knobs' own values (the project's mirror) */
static uint8_t mot_playing;
static volatile uint8_t mot_on = 1;
static uint8_t mot_was_on = 1;
void engine_motion_enable(int on) { mot_on = (uint8_t)(on != 0); }   /* the ISR releases the knobs */
static volatile uint8_t mot_release_req;
void engine_motion_reset(void) { mot_release_req = 1; }   /* lanes changed under it (undo): knobs back */

/* overload guard: past the CPU (a block over 92%, or 85% on average) the two 303s drop their
 * oversampling (~12% of the CPU: a little aliasing on bright notes) and the 808's voices end at
 * -50 dB instead of -90 (~2%); after 3 s back under 65% both return. The platform reports each
 * block's load after rendering it (engine_load, same context as engine_render); the change is
 * made at the start of the next block. Off during the PERF test, which measures the full cost. */
/* Diagnostic only: lock adaptive load shedding off for paired native audio
 * comparisons. The default keeps release behavior and timing policy unchanged. */
#ifndef X0X_DIAG_DISABLE_LOAD_GUARD
#define X0X_DIAG_DISABLE_LOAD_GUARD 0
#endif
#if X0X_DIAG_DISABLE_LOAD_GUARD != 0 && X0X_DIAG_DISABLE_LOAD_GUARD != 1
#error "X0X_DIAG_DISABLE_LOAD_GUARD must be 0 or 1"
#endif
#define GUARD_ON_LAST 92u
#define GUARD_ON_AVG 85u
#define GUARD_OFF 65u
#define GUARD_CALM_FRAMES (3u * 44100u)
extern float drum808_quiet;
static uint8_t guard_on, guard_applied, guard_enabled = !X0X_DIAG_DISABLE_LOAD_GUARD;
static uint32_t guard_avg_q8, guard_calm;
volatile uint32_t eng_guard_count;
void engine_guard_enable(int on) { guard_enabled = (uint8_t)(!X0X_DIAG_DISABLE_LOAD_GUARD && on != 0); }
int engine_guard_active(void) { return guard_on; }
void engine_load(uint32_t pct, uint32_t frames)
{
    guard_avg_q8 = (guard_avg_q8 * 15u + pct * 256u) / 16u;
    if (!guard_enabled) {
        guard_on = 0;
        guard_calm = 0;
    } else if (!guard_on) {
        if (pct > GUARD_ON_LAST || guard_avg_q8 > GUARD_ON_AVG * 256u) {
            guard_on = 1;
            guard_calm = 0;
            eng_guard_count++;
        }
    } else if (pct >= GUARD_OFF || guard_avg_q8 >= GUARD_OFF * 256u) {
        guard_calm = 0;
    } else if ((guard_calm += frames) >= GUARD_CALM_FRAMES) {
        guard_on = 0;
    }
}
static void guard_apply(void)
{
    if (guard_on == guard_applied)
        return;
    guard_applied = guard_on;
    drum808_quiet = guard_on ? 3.2e-3f : 3.2e-5f;
}

/* mixer: per part Level, Rev send, Dly send (a drum machine's add to its voices' own sends) */
static const x0x_param_t MIX_P[MX_NPARAMS] = {{"LEVEL", 127, 100, 0}, {"REV", 127, 0, 0}, {"DLY", 127, 0, 0},
                                               {"PAN", 127, 64, 0}, {"CUT", 127, 127, 0}};
static const char *const PART_NAMES[NPARTS] = {"909", "808", "BASS A", "BASS B", "BREAK"};
static float mix_level[NPARTS], mix_rev[NPARTS], mix_dly[NPARTS], mix_cut[NPARTS];
#ifdef X0X_HOST
/* Read-only actual mixer target; archive bytes alone cannot prove that a
 * refused unavailable note lock left the audio-side mixer untouched. */
uint32_t engine_mix_level_bits(int part)
{
    uint32_t bits;
    if ((unsigned)part >= NPARTS) return UINT32_MAX;
    __builtin_memcpy(&bits,&mix_level[part],sizeof bits);
    return bits;
}
#endif
/* Momentary bus FX, snapshotted once per stretch so both cores see the same hold. */
static volatile uint8_t bfx_down_pub;
static volatile uint8_t bfx_fx_pub[SMCFX_N];
static uint8_t bfx_hold[NPARTS], bfx_eff[NPARTS];
static busfx_t bfx_st[NPARTS];
/* Send throws and master filter use the same busfx_t + busfx_apply as the parts
 * (one outlined body). Extra channel slots stay unused for nch=1 / nch=2. */
static busfx_t bfx_send_st[2] X0X_POOL;
static busfx_t bfx_flt_st;
static busfx_stut_hub_t bfx_stut_hub X0X_POOL;

enum {
    BFX_STUT_SEND_RVB = 0,
    BFX_STUT_SEND_DLY = 1,
    BFX_STUT_909 = 2,
    BFX_STUT_808 = 6,
    BFX_STUT_FLT = 10,
    BFX_STUT_BRK = 12
};

static int bfx_part_stut_base(int part)
{
    if (part == PART_909)
        return BFX_STUT_909;
    if (part == PART_808)
        return BFX_STUT_808;
    if (part == PART_BRK)
        return BFX_STUT_BRK;   /* mono: one ring channel */
    return -1;
}
static float bfx_bpm_snap;
static uint32_t bfx_phase_snap;
static uint8_t bfx_send_hold[2], bfx_send_eff[2];
static uint8_t bfx_flt_hold, bfx_flt_eff;
/* Main-loop publication is one aligned word; each render stretch snapshots it
 * once for both audio cores. This never changes the sequencer's saved mutes. */
static volatile uint32_t smc_solo_state;
void engine_smc_solo_targets(uint8_t parts, uint16_t kit909, uint16_t kit808)
{
    smc_solo_state = (uint32_t)(parts & 0x1Fu) | (uint32_t)(kit909 & 0x7FFu) << 5 |
                     (uint32_t)(kit808 & 0x7FFu) << 16;
}
void engine_smc_solo(uint8_t mask) { engine_smc_solo_targets(mask, 0, 0); }
/* SMC main-loop publish — render reads the published words (X0X_COLD) */
X0X_COLD void engine_smc_busfx(uint8_t down, const uint8_t effect[8])
{
    int i;
    bfx_down_pub = down;
    if (!effect)
        return;
    for (i = 0; i < SMCFX_N; i++)
        bfx_fx_pub[i] = effect[i];
}

static uint16_t smc_audible_drums(uint32_t solo, int kit)
{
    /* Whole-part Solo alone retains its existing part-gain glide. A whole kit
     * in the union also includes all of its voices beside any drum targets. */
    return !(solo & ~0x1Fu) || (solo & (1u << kit)) ? 0x7FFu :
           (uint16_t)(solo >> (5 + kit * 11) & 0x7FFu);
}
/* pan: a balance law. Centre is full level on both sides (a centred mix is the mono one exactly);
 * turning toward a side fades the other out along a quarter cosine, the near side stays at 1 */
static float mix_pl[NPARTS] = {1, 1, 1, 1, 1}, mix_pr[NPARTS] = {1, 1, 1, 1, 1};

/* ------------------------------------------------------- command queue --- */
/* uint32 commands, single producer (main loop) / single consumer (audio ISR):
 * type:4 | a:8 | b:8 | c:12 */
/* C_REC reservation/priority matches the separately reviewed atomic REC unit; C_BASE is #684's exact base restore. */
enum { C_PARAM_T0 = 0, C_DRUM = 8, C_BON, C_BOFF, C_BRK, C_NOP, C_REC, C_BASE, C_MOD };
#define CQ 1024u
static uint32_t cq[CQ];
static volatile uint32_t cq_w, cq_r;
/* Only active across a PANIC boundary. One bit follows each accepted payload,
 * including overflow replacement in an older queue position. Main is the sole
 * producer and request caller; ALNK0 is the consumer. No per-sample work. */
static uint32_t cq_panic_fresh[CQ / 32u];
static volatile uint8_t cq_panic_active;
static void cq_mark_fresh(uint32_t position)
{
    if (cq_panic_active)
        cq_panic_fresh[(position % CQ) / 32u] |= 1u << (position & 31u);
}

/* One slot already copied toward the head (42de2893 accept-order repair). The
 * drain skips it. The copy and this index are published together, while the
 * audio source is masked. */
static uint32_t cq_hole_at;
static uint8_t cq_hole_on;
static void cq_move_fresh(uint32_t to, uint32_t from)
{
    if (!cq_panic_active)
        return;
    uint32_t bit = 1u << (to & 31u);
    if (cq_panic_fresh[(from % CQ) / 32u] & (1u << (from & 31u)))
        cq_panic_fresh[(to % CQ) / 32u] |= bit;
    else
        cq_panic_fresh[(to % CQ) / 32u] &= ~bit;
}

/* The scan may be preempted after choosing a victim. Revalidate under the
 * audio mask, then either publish the new command or copy one later command
 * into the victim. The ring stays in accept order: the victim leaves, later
 * commands move one slot toward the head and the new command goes last. A full
 * queue walks at most CQ-2 steps, and each step masks one copy. Audio runs
 * between steps and never sees that command twice. A command's PANIC freshness
 * bit moves with it. */
static int cq_replace(uint32_t i, uint32_t w, uint32_t word)
{
    for (;;) {
        uint32_t state = plat_cq_lock();
        uint32_t r = cq_r;
        int live = (i - r < w - r);
        int publish = 0;
        if (cq_hole_on && (cq_hole_at - r >= w - r))
            cq_hole_on = 0;
        if (live) {
            if (i == r) {
                cq_r = r + 1u;
                i = w;
                cq_w = w + 1u;
                publish = 1;
            } else if (i + 1u == w) {
                publish = 1;
            } else {
                uint32_t src = i + 1u;
                /* SHIFT */
                cq[i % CQ] = cq[src % CQ];
                cq_hole_at = src;
                cq_move_fresh(i, src);
                cq_hole_on = 1;
                i = src;
            }
            if (publish) {
                cq[i % CQ] = word;
                if (cq_panic_active) {
                    uint32_t bit = 1u << (i & 31u);
                    cq_panic_fresh[(i % CQ) / 32u] &= ~bit;
                }
                cq_mark_fresh(i);
                cq_hole_on = 0;
            }
        }
        plat_cq_unlock(state);
        if (!live || publish)
            return live;
    }
}

__attribute__((noinline)) static void cq_put(uint32_t type, uint32_t a, uint32_t b, uint32_t c)
{
    uint32_t w = cq_w;
    uint32_t word = (type << 28) | ((a & 0xFFu) << 20) | ((b & 0xFFu) << 12) | (c & 0xFFFu);
retry:
    if (w - cq_r >= CQ) {
        /* Full: params may drop (mirror still has them). Never drop C_BON,
         * C_BOFF, C_BRK, or C_DRUM — missing a live drum hit or break press
         * under param flood is a silent loss; a retained release without its
         * press is rare but must not displace an already-queued release. */
        uint32_t i, keep = (type == C_BON) || (type == C_BOFF) || (type == C_BRK) || (type == C_DRUM) || (type == C_REC) || (type == C_BASE) || (type == C_MOD);
        if (!keep)
            return;
        uint32_t r = cq_r;
        for (i = r; i != w; i++) {
            uint32_t t = cq[i % CQ] >> 28;
            if (t < C_DRUM || t == C_DRUM) {
                if (cq_replace(i, w, word)) return;
                goto retry;
            }
        }
        for (i = cq_r; i != w; i++) {
            uint32_t tw = cq[i % CQ], t = tw >> 28, bb = (tw >> 12) & 0xFFu;
            if (t != C_BOFF && !(t == C_BRK && bb == 0u)) {
                if (cq_replace(i, w, word)) return;
                goto retry;
            }
        }
        if (cq_r != r) goto retry; /* consumer freed room during the scan */
        return;
    }
    cq[w % CQ] = word;
    cq_mark_fresh(w);
    __asm__ volatile("" ::: "memory");
    cq_w = w + 1;
}

/* ------------------------------------------------------------ params --- */
int engine_nvoices(int t)
{
    switch (t) {
    case T_909: return DR_NUM + 1;
    case T_808: return D8_NUM + 1;
    case T_303: return NBASS;
    case T_MIX: return NPARTS;
    default: return 1;
    }
}

int engine_nparams(int t, int v)
{
    switch (t) {
    case T_909: return drum909_nparams(v);
    case T_808: return drum808_nparams(v);
    case T_303:
        return (int)original_sound_count((unsigned)engine_bass_bank(v));
    case T_BRK: return 2;                                /* Level, Pitch (sends: the mixer's; the rest: the pattern's) */
    case T_FX: return fxbus_nparams();
    case T_MIX: return MX_NPARAMS;                       /* every part: Level, Rev send, Dly send */
    case T_MST: return master_nparams();
    default: return 0;
    }
}

/* Pot metadata for the UI / project — not the audio render (X0X_COLD). */
X0X_COLD const x0x_param_t *engine_param(int t, int v, int i)
{
    switch (t) {
    case T_909: return drum909_param(v, i);
    case T_808: return drum808_param(v, i);
    case T_303:
        return original_sound_param((unsigned)engine_bass_bank(v), (unsigned)i);
    case T_BRK: return breaks_param(BRK_NSET + i);
    case T_FX: return fxbus_param(i);
    case T_MIX: return (i >= 0 && i < MX_NPARAMS) ? &MIX_P[i] : 0;
    case T_MST: return master_param(i);
    default: return 0;
    }
}

X0X_COLD int engine_param_si(int t, int v, int i, int pot, float *val)
{
    switch (t) {
    case T_909: return drum909_param_si(v, i, pot, val);
    case T_808: return drum808_param_si(v, i, pot, val);
    case T_FX: return fxbus_param_si(i, pot, val);
    case T_BRK:                                      /* breaks.c: lvl = set/127 */
        if (i == 0) { *val = (float)pot / 127.0f; return X0X_U_GAIN; }
        return X0X_U_NONE;
    default: return X0X_U_NONE;
    }
}

static const char *const N909[DR_NUM + 1] = {"BD", "SD", "LT", "MT", "HT", "RS", "CP", "CH", "OH", "CR", "RD", "KIT"};
static const char *const N808[D8_NUM + 1] = {"BD", "SD", "LT", "MT", "HT", "RS", "CP", "CB", "CY", "OH", "CH", "KIT"};

const char *engine_voice_name(int t, int v)
{
    switch (t) {
    case T_909: return (v >= 0 && v <= DR_NUM) ? N909[v] : "";
    case T_808: return (v >= 0 && v <= D8_NUM) ? N808[v] : "";
    case T_303: return v ? "BASS B" : "BASS A";
    case T_MIX: return (v >= 0 && v < NPARTS) ? PART_NAMES[v] : "";
    case T_BRK: return "BREAK";
    case T_FX: return "FX";
    case T_MST: return "MASTER";
    default: return "";
    }
}

int engine_bass_is_wobble(int v)
{ return (unsigned)v < NBASS && original_bass[v].kind == ORIGINAL_SOUND_MIAMI; }

/* Live/MIDI note-off: damper sustains the gate; pattern s_boff never calls this. */
__attribute__((noinline)) static void chi_live_note_off(int v)
{
    if ((unsigned)v >= NBASS)
        return;
    (void)original_runtime_release_source(&original_bass[v], ORIGINAL_INPUT_KEYS);
    __builtin_memset(original_key_pitch[v], 0, sizeof original_key_pitch[v]);
}

/* Called by audio only, before effective-mode changes or another source's
 * gate write. Do not issue an old keyboard off against the new owner's gate. */
static void live_key_retire(int v,int release)
{
    live_key_owner_t *o=&live_key_owner[v];
    if(release && o->gate==1) chi_live_note_off(v);
    if(o->token || o->arp) {
        bass_held[v]=bass_held_count[v]=0;
    }
    o->gate=o->token=o->pitch=o->arp=0;
    /* Never recycle a capability or discard another lane's queued release.
     * Saturation blocks this lane until cold boot; warm reset does not rearm. */
    if(o->generation==UINT32_MAX)o->blocked=1;
    else o->generation++;
}

static void live_key_context_retire(int v,int release)
{
    live_key_retire(v,release);
    if(live_key_owner[v].context==UINT32_MAX)live_key_owner[v].blocked=1;
    else live_key_owner[v].context++;
}


static void perf_apply(int v, int i, int val, int live);
static uint8_t perf_ctl[NBASS][2];
#ifdef X0X_HOST
static uint8_t perf_seen[NBASS][3] = {{64, 0, 0}, {64, 0, 0}};
#endif
/* Mod wheel / CC1 (owner 2026-10-30): Chicago cutoff, Miami wobble depth. While the
 * wheel owns the param, mod_ctl is its value so a REC lane records the wheel, not the
 * saved knob; a knob edit of that param gives it back (-1). */
static int16_t mod_ctl[NBASS] = {-1, -1};
static volatile uint8_t ext_touch[NBASS];           /* ISR -> UI: bit0 bend, bit1 mod moved by ext MIDI */
static int mod_param(int v)
{ return original_bass[v].kind == ORIGINAL_SOUND_JUNO ? 2 : original_bass[v].kind == ORIGINAL_SOUND_DRONE ? 1 :
    original_bass[v].kind == ORIGINAL_SOUND_MIAMI ? ORIGINAL_MIAMI_WOBBLE_DEPTH : ORIGINAL_CHICAGO_CUTOFF; }
static const float mix_level_values[128] = {
    0x0p+0f,     0x1.a36e2ep-14f,     0x1.a36e2ep-12f,     0x1.d7dbf4p-11f,
    0x1.a36e2ep-10f,     0x1.47ae14p-9f,     0x1.d7dbf4p-9f,     0x1.41205cp-8f,
    0x1.a36e2ep-8f,     0x1.096bbap-7f,     0x1.47ae14p-7f,     0x1.8c7e28p-7f,
    0x1.d7dbf4p-7f,     0x1.14e3bcp-6f,     0x1.41205cp-6f,     0x1.70a3d8p-6f,
    0x1.a36e2ep-6f,     0x1.d97f62p-6f,     0x1.096bbap-5f,     0x1.27bb3p-5f,
    0x1.47ae14p-5f,     0x1.694468p-5f,     0x1.8c7e28p-5f,     0x1.b15b58p-5f,
    0x1.d7dbf4p-5f,     0x1p-4f,     0x1.14e3bcp-4f,     0x1.2a993p-4f,
    0x1.41205cp-4f,     0x1.58793ep-4f,     0x1.70a3d8p-4f,     0x1.89a028p-4f,
    0x1.a36e2ep-4f,     0x1.be0deep-4f,     0x1.d97f62p-4f,     0x1.f5c29p-4f,
    0x1.096bbap-3f,     0x1.185f06p-3f,     0x1.27bb3p-3f,     0x1.378034p-3f,
    0x1.47ae14p-3f,     0x1.5844dp-3f,     0x1.694468p-3f,     0x1.7aacdap-3f,
    0x1.8c7e28p-3f,     0x1.9eb852p-3f,     0x1.b15b58p-3f,     0x1.c46738p-3f,
    0x1.d7dbf4p-3f,     0x1.ebb98cp-3f,     0x1p-2f,     0x1.0a57a8p-2f,
    0x1.14e3bcp-2f,     0x1.1fa44p-2f,     0x1.2a993p-2f,     0x1.35c29p-2f,
    0x1.41205cp-2f,     0x1.4cb296p-2f,     0x1.58793ep-2f,     0x1.647454p-2f,
    0x1.70a3d8p-2f,     0x1.7d07c8p-2f,     0x1.89a028p-2f,     0x1.966cf4p-2f,
    0x1.a36e2ep-2f,     0x1.b0a3d8p-2f,     0x1.be0deep-2f,     0x1.cbac72p-2f,
    0x1.d97f62p-2f,     0x1.e786c2p-2f,     0x1.f5c29p-2f,     0x1.021966p-1f,
    0x1.096bbap-1f,     0x1.10d844p-1f,     0x1.185f06p-1f,     0x1.2p-1f,
    0x1.27bb3p-1f,     0x1.2f9096p-1f,     0x1.378034p-1f,     0x1.3f8a0ap-1f,
    0x1.47ae14p-1f,     0x1.4fec56p-1f,     0x1.5844dp-1f,     0x1.60b78p-1f,
    0x1.694468p-1f,     0x1.71eb86p-1f,     0x1.7aacdap-1f,     0x1.838866p-1f,
    0x1.8c7e28p-1f,     0x1.958e22p-1f,     0x1.9eb852p-1f,     0x1.a7fcbap-1f,
    0x1.b15b58p-1f,     0x1.bad42cp-1f,     0x1.c46738p-1f,     0x1.ce147ap-1f,
    0x1.d7dbf4p-1f,     0x1.e1bda6p-1f,     0x1.ebb98cp-1f,     0x1.f5cfaap-1f,
    0x1p+0f,     0x1.052546p+0f,     0x1.0a57a8p+0f,     0x1.0f9724p+0f,
    0x1.14e3bcp+0f,     0x1.1a3d7p+0f,     0x1.1fa44p+0f,     0x1.25182ap+0f,
    0x1.2a993p+0f,     0x1.302752p+0f,     0x1.35c29p+0f,     0x1.3b6ae8p+0f,
    0x1.41205cp+0f,     0x1.46e2ecp+0f,     0x1.4cb296p+0f,     0x1.528f5cp+0f,
    0x1.58793ep+0f,     0x1.5e703ap+0f,     0x1.647454p+0f,     0x1.6a8588p+0f,
    0x1.70a3d8p+0f,     0x1.76cf42p+0f,     0x1.7d07c8p+0f,     0x1.834d6ap+0f,
    0x1.89a028p+0f,     0x1.9p+0f,     0x1.966cf4p+0f,     0x1.9ce704p+0f,

};
static const float mix_send_values[128] = {
    0x0p+0f,     0x1.020408p-7f,     0x1.020408p-6f,     0x1.83060cp-6f,
    0x1.020408p-5f,     0x1.42850ap-5f,     0x1.83060cp-5f,     0x1.c3870ep-5f,
    0x1.020408p-4f,     0x1.22448ap-4f,     0x1.42850ap-4f,     0x1.62c58cp-4f,
    0x1.83060cp-4f,     0x1.a3468ep-4f,     0x1.c3870ep-4f,     0x1.e3c79p-4f,
    0x1.020408p-3f,     0x1.122448p-3f,     0x1.22448ap-3f,     0x1.3264cap-3f,
    0x1.42850ap-3f,     0x1.52a54ap-3f,     0x1.62c58cp-3f,     0x1.72e5ccp-3f,
    0x1.83060cp-3f,     0x1.93264cp-3f,     0x1.a3468ep-3f,     0x1.b366cep-3f,
    0x1.c3870ep-3f,     0x1.d3a74ep-3f,     0x1.e3c79p-3f,     0x1.f3e7dp-3f,
    0x1.020408p-2f,     0x1.0a1428p-2f,     0x1.122448p-2f,     0x1.1a3468p-2f,
    0x1.22448ap-2f,     0x1.2a54aap-2f,     0x1.3264cap-2f,     0x1.3a74eap-2f,
    0x1.42850ap-2f,     0x1.4a952ap-2f,     0x1.52a54ap-2f,     0x1.5ab56ap-2f,
    0x1.62c58cp-2f,     0x1.6ad5acp-2f,     0x1.72e5ccp-2f,     0x1.7af5ecp-2f,
    0x1.83060cp-2f,     0x1.8b162cp-2f,     0x1.93264cp-2f,     0x1.9b366cp-2f,
    0x1.a3468ep-2f,     0x1.ab56aep-2f,     0x1.b366cep-2f,     0x1.bb76eep-2f,
    0x1.c3870ep-2f,     0x1.cb972ep-2f,     0x1.d3a74ep-2f,     0x1.dbb76ep-2f,
    0x1.e3c79p-2f,     0x1.ebd7bp-2f,     0x1.f3e7dp-2f,     0x1.fbf7fp-2f,
    0x1.020408p-1f,     0x1.060c18p-1f,     0x1.0a1428p-1f,     0x1.0e1c38p-1f,
    0x1.122448p-1f,     0x1.162c58p-1f,     0x1.1a3468p-1f,     0x1.1e3c78p-1f,
    0x1.22448ap-1f,     0x1.264c9ap-1f,     0x1.2a54aap-1f,     0x1.2e5cbap-1f,
    0x1.3264cap-1f,     0x1.366cdap-1f,     0x1.3a74eap-1f,     0x1.3e7cfap-1f,
    0x1.42850ap-1f,     0x1.468d1ap-1f,     0x1.4a952ap-1f,     0x1.4e9d3ap-1f,
    0x1.52a54ap-1f,     0x1.56ad5ap-1f,     0x1.5ab56ap-1f,     0x1.5ebd7ap-1f,
    0x1.62c58cp-1f,     0x1.66cd9cp-1f,     0x1.6ad5acp-1f,     0x1.6eddbcp-1f,
    0x1.72e5ccp-1f,     0x1.76eddcp-1f,     0x1.7af5ecp-1f,     0x1.7efdfcp-1f,
    0x1.83060cp-1f,     0x1.870e1cp-1f,     0x1.8b162cp-1f,     0x1.8f1e3cp-1f,
    0x1.93264cp-1f,     0x1.972e5cp-1f,     0x1.9b366cp-1f,     0x1.9f3e7cp-1f,
    0x1.a3468ep-1f,     0x1.a74e9ep-1f,     0x1.ab56aep-1f,     0x1.af5ebep-1f,
    0x1.b366cep-1f,     0x1.b76edep-1f,     0x1.bb76eep-1f,     0x1.bf7efep-1f,
    0x1.c3870ep-1f,     0x1.c78f1ep-1f,     0x1.cb972ep-1f,     0x1.cf9f3ep-1f,
    0x1.d3a74ep-1f,     0x1.d7af5ep-1f,     0x1.dbb76ep-1f,     0x1.dfbf7ep-1f,
    0x1.e3c79p-1f,     0x1.e7cfap-1f,     0x1.ebd7bp-1f,     0x1.efdfcp-1f,
    0x1.f3e7dp-1f,     0x1.f7efep-1f,     0x1.fbf7fp-1f,     0x1p+0f,

};
static float mix_level_from_pot(int v) { return (unsigned)v < 128u ? mix_level_values[v] : (float)v * (float)v / (100.0f * 100.0f); }
static float mix_send_from_pot(int v) { return (unsigned)v < 128u ? mix_send_values[v] : (float)v / 127.0f; }
static void apply_param(int t, int v, int i, int val)    /* ISR */
{
    switch (t) {
    case T_909: drum909_set(&d909, v, i, val); break;
    case T_808: drum808_set(&d808, v, i, val); break;
    case T_303:
        if (v < 0 || v >= NBASS)
            break;
        if (original_sound_is_performance(original_bass[v].kind, (unsigned)i)) { perf_apply(v, i, val, 1); break; }
        if (i == mod_param(v)) {
            mod_ctl[v] = -1;
#ifdef X0X_HOST
            perf_seen[v][2] = (uint8_t)val;
#endif
        }
        {
            float value;
            if (original_sound_control_value(original_bass[v].kind, (unsigned)i, (unsigned)val, &value))
                (void)original_runtime_param(&original_bass[v], (unsigned)i, value);
        }
        break;
    case T_BRK: breaks_set(&brk, BRK_NSET + i, val); break;
    case T_FX: fxbus_set(&fx, i, val); break;
    case T_MIX:
        if (v < 0 || v >= NPARTS)
            break;
        if (i == MX_LEVEL)
            mix_level[v] = mix_level_from_pot(val);     /* 100 = unity, square law */
        else if (i == MX_REV)
            mix_rev[v] = mix_send_from_pot(val);
        else if (i == MX_DLY)
            mix_dly[v] = mix_send_from_pot(val);
        else if (i == MX_PAN)
            x0x_pan_gains(val, &mix_pl[v], &mix_pr[v]);
        else if (i == MX_CUT)
            mix_cut[v] = (float)val;
        break;
    case T_MST: master_set(&mst, i, val); break;
    default: break;
    }
}

void engine_set(int t, int v, int i, int val) { cq_put((uint32_t)t, (uint32_t)v, (uint32_t)i, (uint32_t)val); }
void engine_set_base(int t, int v, int i) { cq_put(C_BASE, (uint32_t)t, (uint32_t)v, (uint32_t)i); }
static void apply_base(int t, int v, int i)
{
    if (!mot_base_snd || (unsigned)t >= NTARGETS || (unsigned)v >= NVOICES_MAX || (unsigned)i >= NPARAMS_MAX) return;
    if (t == T_303 && (unsigned)v < NBASS) {
        float value;
        if (original_sound_is_performance(original_bass[v].kind, (unsigned)i)) {
            perf_apply(v, i, (unsigned)i == original_sound_count(original_bass[v].kind) - 2u ? 64 : 0, 1);
            return;
        }
        if (original_sound_value(mot_base_snd->v[t][v], (unsigned)i, &value))
            (void)original_runtime_param(&original_bass[v], (unsigned)i, value);
        return;
    }
    apply_param(t, v, i, mot_base_snd->v[t][v][i]);
}

/* the output's scale: Felucca's -6 dBFS ceiling of the 24-bit codec (2^22), or its full scale (LOUD); the
 * clamp keeps an over from wrapping (normal: the codec's own full scale, as before) */
static volatile float out_scale = 4194303.0f, out_lim = 2.0f;
void engine_out_loud(int on)
{
    out_scale = on ? 8388607.0f : 4194303.0f;
    out_lim = on ? 1.0f : 2.0f;
}

/* USB AUDIO FULL (#12): the render at full level, for the USB tap, and the MASTER knob after it, for
 * the speaker, headphones and line out (with the master's ~10 ms glide). The limiter then works at
 * full level too: turned down, the FM-1 plays what it sends, quieter. */
static volatile int usb_full;
static float vol_after = -1.0f;
void engine_usb_full(int on) { usb_full = on; }

void engine_volume(int32_t *out_lr, uint32_t n)
{
    float vol = (float)plat_master() / 4096.0f, v = vol_after < 0.0f ? vol : vol_after;
    uint32_t i;
    if (!usb_full) {
        vol_after = -1.0f;
        return;
    }
    if (v == vol) {
        for (i = 0; i < n; i++) {
            out_lr[2u * i] = (int32_t)((float)out_lr[2u * i] * v);
            out_lr[2u * i + 1u] = (int32_t)((float)out_lr[2u * i + 1u] * v);
        }
    } else {
        for (i = 0; i < n; i++) {
            if (v != vol) {
                v += (vol - v) * 0.0022651f;
                if (fm_fabsf(vol - v) < 1e-5f)
                    v = vol;
            }
            out_lr[2u * i] = (int32_t)((float)out_lr[2u * i] * v);
            out_lr[2u * i + 1u] = (int32_t)((float)out_lr[2u * i + 1u] * v);
        }
    }
    vol_after = v;
}

#if X0X_BASS_TAGGED_SOUND
static void bass_tag_set(sound_t *,int,int,int,int);
static void bass_restore_sound(const sound_t *);
#endif
X0X_COLD void engine_sound_defaults(sound_t *s)
{
    int t, v, i;
    uint8_t *z = (uint8_t *)s;
    for (i = 0; i < (int)sizeof *s; i++)
        z[i] = 0;
    for (t = 0; t < NTARGETS; t++)
        for (v = 0; v < engine_nvoices(t) && v < NVOICES_MAX; v++)
            for (i = 0; i < engine_nparams(t, v) && i < NPARAMS_MAX; i++) {
                const x0x_param_t *p = engine_param(t, v, i);
                s->v[t][v][i] = p ? p->def : 0;
            }
#if X0X_BASS_TAGGED_SOUND
    for(v=0;v<NBASS;v++) {
        int bank = v == 0 ? ORIGINAL_SOUND_MIAMI : ORIGINAL_SOUND_CHICAGO;
        (void)original_sound_init(s->v[T_303][v], (unsigned)bank, 0);
        bass_tag_set(s, v, bank, 0, 0);
    }
#endif
    /* the factory mix: big beat (Chemical Brothers, Fatboy Slim), balanced by tools/mix_report.py
     * against a funk break, a 909 kick under it and a 303 line. The break leads, the kick sits
     * under it, the 303 screams through its RAT; the master squeezes and pumps. Each engine's
     * own voicing (its pot defaults) is left as its original; only these are X0X's. */
    s->v[T_MIX][PART_909][MX_LEVEL] = 75;            /* 9W9's kit is hot (it drives its own glue): -5 dB */
    s->v[T_909][DR_BD][3] = 61;                      /* its kick under the break, its clap and hats over */
    s->v[T_909][DR_BD][2] = 80;                      /* the kick: a little shorter, and driven. Its Attack */
    s->v[T_909][DR_BD][6] = 30;                      /* stays 9W9's 13: at 50 its tick was 12 dB louder, a click on every kick */
    s->v[T_909][DR_OH][1] = 60;
    s->v[T_MIX][PART_808][MX_LEVEL] = 112;
    s->v[T_808][D8_KIT][0] = 127;                    /* kit level */
    s->v[T_BRK][0][0] = 127;                         /* the break: full level, part a little over unity */
    s->v[T_MIX][PART_BRK][MX_LEVEL] = 120;
    s->v[T_MIX][PART_BRK][MX_REV] = 25;
    for (v = 0; v < NBASS; v++) {                    /* acid: low cutoff, high resonance, a long sweep, RAT */
        s->v[T_MIX][PART_303A + v][MX_LEVEL] = 100;
        s->v[T_MIX][PART_303A + v][MX_DLY] = 0;
        s->v[T_MIX][PART_303A + v][MX_REV] = 0;
    }
    s->v[T_909][DR_CP][5] = 50;                      /* the clap in the room (90 drowned it) */
    s->v[T_909][DR_LT][1] = 92;                      /* the toms: shorter than 9W9's (its low tom rang */
    s->v[T_909][DR_MT][1] = 88;                      /* on for 1.7 s, which reads as reverb) */
    s->v[T_909][DR_HT][1] = 90;
    s->v[T_FX][0][FX_DL_TYPE] = 1;                   /* tape delay, dotted eighths */
    s->v[T_MST][0][MST_RATIO] = 4;                   /* 4:1 */
    s->v[T_MST][0][MST_THRESH] = 64;                 /* -24 dB */
    s->v[T_MST][0][MST_MAKEUP] = 85;                 /* +16 dB: into the limiter */
    s->v[T_MST][0][MST_ATTACK] = 85;                 /* 10 ms: faster grabbed each kick hard enough to click */
    s->v[T_MST][0][MST_RELEASE] = 58;                /* 100 ms: it breathes with the beat */
    s->v[T_MST][0][MST_PUMP] = 21;                   /* 4 dB of 909-keyed pump */
    s->v[T_MST][0][MST_COMP1] = 95;                  /* the one-knob COMP's nearest to the squash above */
    s->v[T_FX][1][0] = (uint8_t)(16 + s->v[T_FX][0][FX_DL_WEAR] * 111 / 127);   /* TAPE (ui.c R_TAPE): on, its wear */
}

X0X_COLD void engine_sound_centre_drum_pans(sound_t *s)
{
    int t, v;
    for (t = T_909; t <= T_808; t++)
        for (v = 0; v < NDRUM && v < NVOICES_MAX; v++) {
            int i = engine_nparams(t, v) - 1;           /* PAN is every voice's last pot */
            const x0x_param_t *p = engine_param(t, v, i);
            if (p && p->def == 64 && p->max == 127)
                s->v[t][v][i] = 64;
        }
}

X0X_COLD void engine_apply_sound(const sound_t *s)
{
    int t, v, i;
#if X0X_BASS_TAGGED_SOUND
    bass_restore_sound(s); /* called only at full-project initialization/adoption */
#endif
    engine_set(T_MST, 0, MST_COMP1, s->v[T_MST][0][MST_COMP1]);   /* the macros first: the pots they set */
    engine_set(T_MST, 0, MST_DJF, s->v[T_MST][0][MST_DJF]);       /* follow as saved (a project's own sound) */
    for (t = 0; t < NTARGETS; t++)
        for (v = 0; v < engine_nvoices(t) && v < NVOICES_MAX; v++)
            for (i = 0; i < engine_nparams(t, v) && i < NPARAMS_MAX; i++)
                if ((t != T_MST || i < MST_COMP1)
                    && t != T_303 /* already restored from exact factory + explicit edits */
#if X0X_BASS_TAGGED_SOUND
                    && (t!=T_303 || engine_bass_sound_bank(s,v)>=0)
#endif
                    ) engine_set(t, v, i, s->v[t][v][i]);
}

#if X0X_DIAG_STATE_TRACE
static uint32_t diag_consume, diag_command, diag_offset;
uint32_t engine_diag_render_offset;
#endif

void engine_drum(int kit, int voice, float vel)
{
    if ((unsigned)kit < NKIT && SEQ_PART_OFF(&seq, kit)) return;
    cq_put(C_DRUM, (uint32_t)kit, (uint32_t)voice, (uint32_t)(vel * 4095.0f));
}
void engine_bass_on(int part, int note, int accent, int slide)
{
    engine_bass_on_velocity(part, note, accent, slide, 100);
}
void engine_bass_on_velocity(int part, int note, int accent, int slide, int velocity)
{
    if ((unsigned)part < NBASS && SEQ_PART_OFF(&seq, TRK_BASS0 + part)) return;
    if (velocity < 1) velocity = 1;
    if (velocity > 127) velocity = 127;
    cq_put(C_BON, (uint32_t)part, (uint32_t)note,
           (uint32_t)((accent ? 1 : 0) | (slide ? 2 : 0) | (velocity << 2)));
}
void engine_bass_record(int part, int note, int velocity, int flags)
{
    if ((unsigned)part < NBASS && SEQ_PART_OFF(&seq, TRK_BASS0 + part)) return;
    if (velocity < 1) velocity = 1;
    if (velocity > 127) velocity = 127;
    cq_put(C_REC, (uint32_t)(part | ((seq.rec_epoch & 127u) << 1)), (uint32_t)note,
           (uint32_t)((flags & BS_ACCENT ? 1 : 0) | (velocity << 2) | (flags & BS_SLIDE ? 512 : 0)));
}
void engine_bass_off(int part) { cq_put(C_BOFF, (uint32_t)part, 0, 0); }
static volatile uint8_t notes_off_req;
static volatile uint32_t notes_off_requested_cutoff;
static uint32_t notes_off_cutoff;
static uint8_t notes_off_discard;
static uint32_t notes_off_midi_epoch;
static uint8_t notes_off_midi_valid;
void engine_request_notes_off(void)
{
    /* Keyboard and SMC request from the CPU0 main loop. Publish the three
     * queue boundaries together while audio is excluded; the MIDI primitive
     * also excludes TIMER5 while capturing packet identity. */
    uint32_t flags = plat_cq_lock();
    __builtin_memset(cq_panic_fresh, 0, sizeof cq_panic_fresh);
    cq_panic_active = 1;
    notes_off_requested_cutoff = cq_w;
    notes_off_midi_epoch = plat_midi_cut();
    notes_off_midi_valid = 1;
    /* Retire capabilities now, not on the later audio consume: a fresh key
     * pressed after this return must acquire the new generation and survive.
     * Only metadata/FIFO cursors change here; audio alone clears DSP owners. */
    live_key_r = live_key_w;
    live_key_cancel = 0;
    for (int v = 0; v < NBASS; ++v) {
        live_key_owner_t *o = &live_key_owner[v];
        if (o->generation == UINT32_MAX || o->context == UINT32_MAX)
            o->blocked = 1;
        else { ++o->generation; ++o->context; }
    }
    __asm__ volatile("" ::: "memory");
    notes_off_req = 1;
    plat_cq_unlock(flags);
}
void engine_bass_off_note(int part, int note)
{
    if (note <= 0)
        engine_bass_off(part);
    else
        cq_put(C_BOFF, (uint32_t)part, (uint32_t)(note & 127), 1u);
}
void engine_brk_live(int key, int down) { if (down && SEQ_PART_OFF(&seq, TRK_BRK)) return; cq_put(C_BRK, (uint32_t)key, (uint32_t)(down != 0), 0); }

/* Opt-in bounded trace: ordinary RAM, never the audio pool. No raw struct
 * bytes, addresses, wall clock, or DSP floating-point arithmetic enter hashes. */
#ifndef X0X_DIAG_STATE_TRACE
#define X0X_DIAG_STATE_TRACE 0
#endif
#if X0X_DIAG_STATE_TRACE != 0 && X0X_DIAG_STATE_TRACE != 1
#error "X0X_DIAG_STATE_TRACE must be 0 or 1"
#endif
#if X0X_DIAG_STATE_TRACE
struct diag_row { uint32_t half, late, key18_tick, key22_tick, consume_tick, command, offset; };
volatile struct { uint32_t written; struct diag_row row[48]; } x0x_state_trace;

#define diag_event(data) ((void)0)

#else
#define diag_event(data) ((void)0)
#endif

/* ------------------------------------------------------- sequencer sink --- */
/* probability: each part's (and drum track's) chance on the step playing now, set by its T_PROB lane
 * before the step fires (motion_step runs first); 100 = always */
static uint8_t prob[NPARTS][NDRUM];
static uint32_t prob_rng = 0x2545F491u;
__attribute__((noinline)) static int prob_skip(int part, int v)                 /* ISR: 1 = this hit does not play */
{
    uint32_t p = prob[part][v];
    if (p > 100u && p < PROB_COND + PROB_NCOND) {      /* A:B: the A-th of every B passes (seq_track_t.bars) */
        int a, b;
        prob_cond((int)p - PROB_COND, &a, &b);
        return (int)(seq.t[part].bars % (uint32_t)b) != a - 1;
    }
    if (p >= 100u)
        return 0;
    prob_rng ^= prob_rng << 13;
    prob_rng ^= prob_rng >> 17;
    prob_rng ^= prob_rng << 5;
    return prob_rng % 100u >= p;
}
static void s_drum(void *x, int kit, int v, float vel);
static int s_drum_seq(void *x, int kit, int v, float vel)
{
    if (prob_skip(kit, v))
        return 0;
    s_drum(x, kit, v, vel);
    return 1;
}
__attribute__((noinline)) static void s_drum(void *x, int kit, int v, float vel)
{
    (void)x;

    if (v == 0)                          /* BD (both kits' track 1): the master's PUMP key */
        master_key(&mst, kit, vel);
    if ((unsigned)kit < NKIT && (unsigned)v < NDRUM)   /* MIX's drum pages: the track's meter jumps */
    {
        eng_hit[kit][v] = (uint8_t)(vel >= 1.0f ? 255 : (int)(vel * 255.0f));
        eng_hit_ms[kit][v] = plat_ms() | 1u;          /* 0 = never hit */
    }
    if (kit == 0)
        drum909_trigger(&d909, v, vel);
    else                                 /* the 808's unaccented hit sits at D8_VEL_NORMAL, not at our 909 level */
        drum808_trigger(&d808, v, vel >= 0.999f ? 1.0f : vel * (D8_VEL_NORMAL / (88.0f / 127.0f)));
}

static void bass_adapt_flags(int p, int acc, int sl)
{
    if ((unsigned)p >= NBASS) return;
    if (original_bass[p].kind == ORIGINAL_SOUND_CHICAGO) {
        bass_accent[p] = (uint8_t)!!acc;
        bass_slide[p] = (uint8_t)!!sl;
    } else {
        bass_accent[p] = 0;
        bass_slide[p] = 0;
    }
}

typedef struct {
    uint8_t used, chicago;
    float master_tune, cutoff, env_depth, portamento, output, vcf_decay;
} bass_adapt_saved_t;
static bass_adapt_saved_t bass_adapt_saved[NBASS];
/* Accent make-up after the voice (run_job's quiet scan): current, target. */
static float bass_accent_mk[NBASS] = {1.0f, 1.0f}, bass_accent_mk_to[NBASS] = {1.0f, 1.0f};
static float bass_c13[NBASS];          /* accent sweep charge (bass_303_sweep_step) */

void engine_bass_tune(int steps)
{
    if (steps > 63) steps = 63;
    if (steps < -64) steps = -64;
    bass_tune_steps = (int8_t)steps;
}

static float bass_adapt_tune_semitones(void)
{
    return bass_303_tune_semitones(bass_tune_steps);
}

static void bass_adapt_pre(int b, unsigned n)
{
    float semis;
    if ((unsigned)b >= NBASS) return;
    bass_adapt_saved[b].used = 0;
    bass_accent_mk_to[b] = 1.0f;
    semis = bass_adapt_tune_semitones();
    if (original_bass[b].kind == ORIGINAL_SOUND_CHICAGO) {
        original_chicago_voice_controls *c = &original_bass[b].dsp.chicago.controls;
        int accent = bass_accent[b], slide = bass_slide[b];
        if (accent || bass_c13[b] != 0.0f) {
            const original_chicago_backend *k = &original_bass[b].dsp.chicago;
            float meg = accent && k->voice.active ? k->voice.vcf.level : 0.0f;
            bass_c13[b] = bass_303_sweep_step(bass_c13[b], BASS_303_ACCENT_AMT * fm_clampf(meg, 0.0f, 1.0f), n);
        }
        if (semis == 0.0f && !accent && !slide && bass_c13[b] == 0.0f) return;
        bass_adapt_saved[b].used = 1;
        bass_adapt_saved[b].chicago = 1;
        bass_adapt_saved[b].master_tune = c->pitch.master_tune;
        bass_adapt_saved[b].cutoff = c->cutoff;
        bass_adapt_saved[b].env_depth = c->env_depth;
        bass_adapt_saved[b].portamento = c->pitch.portamento;
        bass_adapt_saved[b].output = c->gain.output;
        bass_adapt_saved[b].vcf_decay = c->vcf[1];
        if (semis != 0.0f) c->pitch.master_tune += semis;
        bass_303_accent_controls(accent, &c->cutoff, &c->env_depth);
        bass_303_accent_decay(accent, &c->vcf[1]);
        if (bass_c13[b] != 0.0f)
            c->cutoff = fm_clampf(c->cutoff + bass_303_sweep_cutoff(bass_c13[b], c->resonance), 0.0f, 1.0f);
        bass_accent_mk_to[b] = bass_303_accent_output(accent, &c->gain.output);
        bass_303_slide_porta(slide, &c->pitch.portamento);
    } else if (original_bass[b].kind == ORIGINAL_SOUND_MIAMI && semis != 0.0f) {
        original_miami_voice_controls *c = &original_bass[b].dsp.miami.controls;
        bass_adapt_saved[b].used = 1;
        bass_adapt_saved[b].chicago = 0;
        bass_adapt_saved[b].master_tune = c->pitch.master_tune;
        c->pitch.master_tune += semis;
    }
    if (original_bass[b].kind != ORIGINAL_SOUND_CHICAGO) bass_c13[b] = 0.0f;  /* Miami: no sweep */
}

static void bass_adapt_post(int b, float *left, float *right, unsigned n)
{
    (void)left; (void)right; (void)n;
    if ((unsigned)b >= NBASS || !bass_adapt_saved[b].used) return;
    if (bass_adapt_saved[b].chicago) {
        original_chicago_voice_controls *c = &original_bass[b].dsp.chicago.controls;
        c->pitch.master_tune = bass_adapt_saved[b].master_tune;
        c->cutoff = bass_adapt_saved[b].cutoff;
        c->env_depth = bass_adapt_saved[b].env_depth;
        c->pitch.portamento = bass_adapt_saved[b].portamento;
        c->gain.output = bass_adapt_saved[b].output;
        c->vcf[1] = bass_adapt_saved[b].vcf_decay;
    } else
        original_bass[b].dsp.miami.controls.pitch.master_tune = bass_adapt_saved[b].master_tune;
    bass_adapt_saved[b].used = 0;
}

#ifdef X0X_HOST
int engine_bass_accent(int p) { return (unsigned)p < NBASS ? bass_accent[p] : 0; }
int engine_bass_slide(int p) { return (unsigned)p < NBASS ? bass_slide[p] : 0; }
#endif

/* Only admitted runtime kinds are polyphonic. Persisted unavailable kinds
 * retain their identity without claiming a live held-chord/recorder path. */
int seq_bass_poly(seq_t *s,int b)
{ (void)s;return (unsigned)b<NBASS && original_bass[b].status==ORIGINAL_RUNTIME_OK &&
    original_runtime_kind_available(original_bass[b].kind) &&
    original_bass[b].kind>=ORIGINAL_SOUND_DRONE && original_bass[b].kind<=ORIGINAL_SOUND_JUNO; }
int seq_bass_chord_keys(seq_t *s,int b,uint8_t *notes)
{
    (void)s;int n=0;
    for(unsigned key=0;key<128;key++) {
        unsigned held=0;
        for(unsigned src=0;src<ORIGINAL_INPUT_SEQUENCE;src++)held|=original_bass[b].keys[src][key];
        if(held) { if(n==HELD_CHORD_NOTES)return -1;notes[n++]=(uint8_t)key; }
    }
    return n;
}
int seq_bass_chord_get(seq_t *s,int b,int pat,int step,uint8_t *notes)
{ return held_chord_get(mot.lane,pat,b,step,s->pat[pat].bass[b].step[step].note,notes); }
int seq_bass_chord_set(seq_t *s,int b,int pat,int step,const uint8_t *notes,int count)
{
    (void)s;
    /* This is the live recorder's admission/publication hook. Archive edits
     * use the storage codec directly and do not claim an audible capture. */
    if((unsigned)b>=NBASS || original_bass[b].status!=ORIGINAL_RUNTIME_OK ||
       !original_runtime_kind_available(original_bass[b].kind))return 0;
    if(!mot.lane)return 0;
    /* Audio owns both operations. A new sound lock can consume one lane
     * between admission and the chord write, so reserve it in the same check. */
    int reserve=count<0 && engine_note_lock_capture_on() && bass_note_find(mot.lane,pat,b,step)<0;
    return held_chord_write(mot.lane,pat,b,step,notes,count,reserve);
}
void seq_bass_chord_on(seq_t *s,int b,int note,int velocity)
{
    if(seq_bass_poly(s,b))
        (void)original_runtime_key(&original_bass[b],ORIGINAL_INPUT_SEQUENCE,(unsigned)note,(unsigned)velocity);
}

static void bass_onset(int v);          /* original_presets.inc: pattern preset, note lock */
static int s_bon(void *x, int p, int note, int acc, int sl, int velocity)
{
    if ((unsigned)p >= NBASS) return 0;
    (void)x;
    if (prob_skip(PART_303A + p, 0)) {
        (void)original_runtime_release_source(&original_bass[p], ORIGINAL_INPUT_SEQUENCE);
        original_seq_note[p] = -1;
        bass_accent[p] = bass_slide[p] = 0;
        return 0;
    }
    bass_onset(p);
    if (original_bass[p].status != ORIGINAL_RUNTIME_OK ||
        !original_runtime_kind_available(original_bass[p].kind) ||
        (unsigned)note > 127u || velocity < 1 || velocity > 127) return 0;
    if(seq_bass_poly(&seq,p)) {
        (void)original_runtime_release_source(&original_bass[p],ORIGINAL_INPUT_SEQUENCE);
        original_seq_note[p]=-1;
    }
    int previous = original_seq_note[p];
    if (!sl && previous >= 0)
        (void)original_runtime_key(&original_bass[p], ORIGINAL_INPUT_SEQUENCE, (unsigned)previous, 0);
    int rc = original_runtime_key(&original_bass[p], ORIGINAL_INPUT_SEQUENCE, (unsigned)note, (unsigned)velocity);
    if (rc != ORIGINAL_RUNTIME_OK) return 0;
    if (sl && previous >= 0)
        (void)original_runtime_key(&original_bass[p], ORIGINAL_INPUT_SEQUENCE, (unsigned)previous, 0);

    original_seq_note[p] = (int16_t)note;
    bass_adapt_flags(p, acc, sl);
    return 1;
}
static void s_boff(void *x, int p)
{
    diag_event((48u << 24) ^ (uint32_t)p);
    (void)x;
    if ((unsigned)p >= NBASS) return;
    (void)original_runtime_release_source(&original_bass[p], ORIGINAL_INPUT_SEQUENCE);
    original_seq_note[p] = -1;
    bass_slide[p] = 0;
}
static uint8_t brk_applied[BRK_NSET];  /* the pattern settings the break was last given */
/* Audio-owned control boundary, independent of the bounded CQ drain. Quiet
 * alone only saves decoding after the gate closes; retire the old step too so
 * the existing 88-sample gate ramp can close before this buffer ends. Held
 * slices keep their established live-audition override. Unmute waits for the
 * next real step, including its enable/probability decision. No new state or
 * per-sample work; this adds a mute read and bounded control stores per stretch. */
static void brk_mute_boundary(void)
{
    if (seq.mute & (1u << MUTE_BRK)) {
        breaks_set_quiet(&brk, 1);
        brk.step_on = 0;
        brk.gate_to = brk.perf.count ? 1.0f : 0.0f;
    }
}

static void s_brk(void *x, int s16, int bar, float spb, int en)
{
    const brkpart_t *bp = &seq.pat[seq.ppat[TRK_BRK]].brk;
    int i;
    if (en && prob_skip(PART_BRK, 0))
        en = 0;
    (void)x;
    breaks_set_quiet(&brk, bp->steps == 0 || (seq.mute & (1u << MUTE_BRK)));   /* unheard: stop decoding */
    for (i = 0; i < BRK_NSET; i++)       /* follow the playing pattern's settings (12 compares) */
        if (bp->set[i] != brk_applied[i]) {
            brk_applied[i] = bp->set[i];
            breaks_set(&brk, i, bp->set[i]);
        }
    breaks_pin(&brk, (int)bp->slice[s16 & 15] - 1);   /* the step's own slice, if it has one */
    breaks_step(&brk, s16, bar, spb, en);
}
static void brk_midi_discard(void);
static void s_brkstop(void *x) { (void)x; breaks_stop(&brk); brk_midi_discard(); }
static void s_midi(void *x, uint8_t st, uint8_t d1, uint8_t d2)
{
    uint32_t cin = st >= 0xF0 ? 0x0Fu : (uint32_t)(st >> 4);
    (void)x;
    plat_midi_out(cin | ((uint32_t)st << 8) | ((uint32_t)d1 << 16) | ((uint32_t)d2 << 24));
}
/* Accepted hits can originate on CPU1 during its BREAK render job. Append
 * descriptors only: transport rings belong exclusively to CPU0. CPU0 sequencing
 * and CPU1 rendering are serialized by plat_cpu2_run/wait, whose native CSYNC
 * job/done handoff already publishes the audio buffers. No spin/IRQ change here. */
enum { BRK_MIDI_EVENTS = 8 };
typedef struct { uint8_t note, channel, bank, generation; } brk_midi_event_t;
static brk_midi_event_t brk_midi_events[BRK_MIDI_EVENTS];
static volatile uint8_t brk_midi_count;
static void brk_midi_discard(void) { brk_midi_count = 0; }
static void s_brk_accepted(void *ctx, int slice, int bank, unsigned gen)
{
    (void)ctx;
    if (seq.send_notes && seq.ch[TRK_BRK] != SEQ_CH_OFF && seq.playing &&
        !(seq.mute & (1u << MUTE_BRK))) {
        unsigned n = brk_midi_count;
        if (n >= BRK_MIDI_EVENTS) return; /* bounded overload: drop the whole pulse */
        brk_midi_events[n] = (brk_midi_event_t){(uint8_t)(12 + slice), seq.ch[TRK_BRK],
                                             (uint8_t)bank, (uint8_t)gen};
        brk_midi_count = (uint8_t)(n + 1u);
    }
}
/* CPU0 only, after the render job's full synchronization or local fallback. */
static void brk_midi_drain(void)
{
    unsigned n = brk_midi_count;
    for (unsigned i = 0; i < n; i++)
        (void)plat_midi_pulse(brk_midi_events[i].channel, brk_midi_events[i].note, 100);
    brk_midi_count = 0;
}
static void s_step(void *x, int t, int p)
{
    (void)x;
    eng_step[t] = (uint8_t)p;
    if (mot_on)
        motion_step(&mot, t, seq.ppat[t], p, seq_next_step(&seq, t, p), seq_part_len(&seq, t));
}

/* --------------------------------------------------------------- motion --- */
/* Pitch bend and damper are runtime performance inputs, not patch edits.
 * Port of the bass303-era chi_aux_apply: clamp the 0..127 control and hand
 * it to the runtime. perf_ctl keeps the live wheel/MIDI position, which a
 * motion lane records and returns to when it ends. */
static uint8_t perf_ctl[NBASS][2] = {{64, 0}, {64, 0}};
static void apply_param(int t, int v, int i, int val);
static void mod_apply(int v, int val)              /* ISR */
{
    if ((unsigned)v >= NBASS) return;
    val = val < 0 ? 0 : val > 127 ? 127 : val;
    apply_param(T_303, v, mod_param(v), val);      /* the knob's own path */
    mod_ctl[v] = (int16_t)val;                     /* after: apply_param from a knob clears it */
}
void engine_bass_mod(int v, int val) { cq_put(C_MOD, (uint32_t)v, 0, (uint32_t)val); }
int engine_bass_ext_touch(int v)                   /* UI: take the ext-MIDI bend/mod moves */
{ if ((unsigned)v >= NBASS) return 0; int t = ext_touch[v]; ext_touch[v] = 0; return t; }
int engine_bass_mod_param(int v) { return (unsigned)v < NBASS ? mod_param(v) : -1; }
#ifdef X0X_HOST
int engine_bass_perf(int v, int which, int live) /* host test: 0 bend, 1 damper, 2 mod; last applied or live */
{
    if ((unsigned)v >= NBASS || (unsigned)which > 2) return -1;
    if (which == 2) return live ? mod_ctl[v] : perf_seen[v][2];
    return live ? perf_ctl[v][which] : perf_seen[v][which];
}
#endif
static void perf_apply(int v, int i, int val, int live)
{
    float value;
    if ((unsigned)v >= NBASS) return;
    unsigned first = original_sound_count(original_bass[v].kind) - 2u;
    if ((unsigned)i < first || (unsigned)i > first + 1u) return;
    if (val < 0) val = 0;
    if (val > 127) val = 127;
    if (live) perf_ctl[v][(unsigned)i - first] = (uint8_t)val;
#ifdef X0X_HOST
    perf_seen[v][(unsigned)i - first] = (uint8_t)val;
#endif
    if (original_sound_control_value(original_bass[v].kind, (unsigned)i, (unsigned)val, &value))
        (void)original_runtime_param(&original_bass[v], (unsigned)i, value);
}
static int original_motion_performance(int t, int v, int i)
{
    return t == T_303 && (unsigned)v < NBASS &&
        original_sound_is_performance(original_bass[v].kind, (unsigned)i);
}
static int mot_base(void *x, int t, int v, int i)
{
    (void)x;
    if (t == T_PROB)
        return 100;                                   /* always */
    if (t == T_VEL)
        return 0;                                     /* legacy accent / accent_q7 */
    if (t >= NTARGETS)
        return 100;
    if (t == T_303 && (unsigned)v < NBASS && i == mod_param(v) && mod_ctl[v] >= 0)
        return mod_ctl[v];
    if (original_motion_performance(t, v, i))
        return perf_ctl[v][(unsigned)i - (original_sound_count(original_bass[v].kind) - 2u)];
    return mot_base_snd ? mot_base_snd->v[t][v][i] : 0;
}
static void mot_apply(void *x, int t, int v, int i, int val)
{
    (void)x;
    PARAM_TRACE(PARAM_MOTION, t, v, i, val);
    if (original_motion_performance(t, v, i)) { perf_apply(v, i, val, 0); return; }
    if (t == T_PROB) {
        if ((v >> 4) < NPARTS && (v & 15) < NDRUM)
            prob[v >> 4][v & 15] = (uint8_t)val;
    } else if (t == T_VEL) {
        int kit = v >> 4, voice = v & 15;
        if ((unsigned)kit < NKIT && (unsigned)voice < NDRUM)
            seq.drum_vel[kit][voice] = (uint8_t)(val < 0 ? 0 : val > 127 ? 127 : val);
    } else if (t < NTARGETS)
        apply_param(t, v, i, val);
}
static void mot_restore(void *x, int t, int v, int i)
{
    /* -1 means restore the exact base, which need not be a rounded pot. */
    PARAM_TRACE(PARAM_MOTION_RESTORE, t, v, i, -1);
    if (original_motion_performance(t, v, i)) { perf_apply(v, i, mot_base(x, t, v, i), 0); return; }
    if (t < NTARGETS) apply_base(t, v, i);
    else mot_apply(x, t, v, i, mot_base(x, t, v, i));
}

int engine_motion_part(int t, int v)
{
    switch (t) {
    case T_909: return PART_909;
    case T_808: return PART_808;
    case T_303: return PART_303A + (v & 1);
    case T_BRK: return PART_BRK;
    case T_MIX: return v < NPARTS ? v : PART_909;
    case T_PROB:
    case T_VEL: return (v >> 4) < NPARTS ? v >> 4 : PART_909;
    default: return PART_909;                     /* FX, master: the bar */
    }
}
int engine_motion_value(int k) { return motion_value(&mot, k); }
void engine_motion_rec(int k) { motion_req_rec(&mot, k); }
void engine_motion_hold(int k) { motion_req_hold(&mot, k); }
void engine_motion_clear(int k)
{
    /* Main-loop removal publishes unused BEFORE the queued restore. An IRQ
     * between them can keep the old value for one block, but cannot run the
     * removed ramp after the restoration or interleave DSP program writes. */
    if (k < 0 || k >= NLANE || !mot.lane) return;
    lane_t *lane = &mot.lane[k];
    int restore = lane->used && lane->t != 0xfdu && lane->t != HELD_CHORD_TARGET;
    int t = lane->t, v = lane->v, i = lane->i;
    if (original_motion_performance(t, v, i)) restore = 0;
    lane->used = 0;
    __asm__ volatile("" ::: "memory");
    mot.rt[k].applied = MOT_NONE;
    mot.rt[k].ramp = mot.rt[k].rec_req = mot.rt[k].hold_req = 0;
    if (restore) engine_set_base(t, v, i);
}
static void s_transport(void *, int);
static const seq_sink_t SINK = {s_drum_seq, s_bon, s_boff, s_brk, s_brkstop, s_midi, s_step, 0
    , s_transport
};

#if BOARD_SMK37
/* Called with audio interrupts disabled at both clip-mode boundaries. */
void engine_clip_midi_flush(void)
{
    seq_midi_flush(&seq, &SINK);
}
#endif


/* ---------------------------------------------------------------- MIDI in --- */
#ifdef X0X_HOST
static uint8_t bass_attacked[NBASS];
#endif
/* Accepted physical edges, not the DSP gate, decide recorder legato. */
static int live_rec_legato(int part, int src)
{
    const seq_bass_rec_t *r = &seq.rec_bass[part];
    return r->own_ok && r->own_gen == r->gen && r->own_src == (uint8_t)src &&
           r->own_note == bass_held[part] && bass_held_count[part] && bass_held_src[part] == (uint8_t)src;
}
static void live_rec_accept(int part, int src, int note)
{
    seq_bass_rec_t *r = &seq.rec_bass[part];
    r->own_ok = 1; r->own_gen = r->gen;
    r->own_src = (uint8_t)src; r->own_note = (uint8_t)note;
}
static uint16_t src_held[3];           /* USB/Bluetooth/TRS: bass owners only; BREAK has independent raw-note owners. */
static uint32_t brk_local;
/* External MIDI record events: lock-free single-producer (midi_in) / single-consumer (ui_frame) ring,
 * as midi_in_q. Full: the event is dropped (the note still sounds). */
#define REC_Q 16u
static struct { uint32_t event, generation; } rec_q[REC_Q];
static volatile uint32_t rec_w, rec_r;
static void rec_ev_put(uint32_t ev)
{
    /* Keep the actual audio/UI boundary generation, not a display-frame tag.
     * New-run and new-pattern onsets can arrive before the next UI drain. */
    if (!seq.playing || !seq.rec_ext_mask || rec_w - rec_r >= REC_Q) return;
    rec_q[rec_w % REC_Q].event = ev;
    rec_q[rec_w % REC_Q].generation = seq.rec_ev_gen;
    __asm__ volatile("" ::: "memory");   /* compiler barrier, as midi_in_q */
    rec_w++;
}
int engine_rec_ev_get(uint32_t *ev)
{
    while (rec_r != rec_w) {
        uint32_t event, generation;
        __asm__ volatile("" ::: "memory");   /* compiler barrier, as midi_in_q */
        event = rec_q[rec_r % REC_Q].event;
        generation = rec_q[rec_r % REC_Q].generation;
        __asm__ volatile("" ::: "memory");
        rec_r++;
        if (generation == seq.rec_ev_gen) {
            *ev = event;
            return 1;
        }
    }
    return 0;
}
static uint8_t brk_input_channel;
static uint8_t brk_down[3][16];        /* 8 SLICES: bit n of source 0/1/2 is MIDI note n held */
enum { MIDI_NSRC = 3 };
static void s_transport(void *ctx, int running)
{
    (void)ctx;
    if (running) return;
    /* Explicit firmware Stop policy: release existing notes, including pedal
     * holds, through the original all-off lifecycle. New input after this
     * event is accepted immediately; idle clocks and effect tails still run. */
    for (int v = 0; v < NBASS; ++v) {
        (void)original_runtime_all_off(&original_bass[v]);
        /* Stop retires sounding keys, not the Free Play UI context. Its
         * already accepted FIFO follows this transport boundary; changing
         * generation here would discard the first new press after Stop.
         * Modal/cancel boundaries still revoke generation separately. */
        live_key_owner[v].gate = live_key_owner[v].token = 0;
        live_key_owner[v].pitch = live_key_owner[v].arp = 0;
        __builtin_memset(original_key_pitch[v], 0, sizeof original_key_pitch[v]);
        original_seq_note[v] = -1;
        bass_held[v] = bass_held_count[v] = 0;

    }
    src_held[0] = src_held[1] = src_held[2] = 0;
}
#if BOARD_SMK37
#include "app/smk_apc40.h"
void smk_apc_led_set(uint8_t note, uint8_t type, uint8_t velocity);
void smk_apc_transport_led_set(uint8_t note, uint8_t velocity);
uint8_t smk_clip_mode_on(void);
void smk_apc_clock_tick(void);
void smk_apc_clock_start(void);
void smk_apc_clock_position(uint32_t sixteenths);
void smk_ck_midi_stop(void);
__attribute__((weak)) void smk_ck_midi_stop(void) {}
#endif

X0X_COLD int engine_project_notes(void)
{
    uint32_t r = cq_r;
    int k;
    /* A physical strike is already accepted before the audio owner drains its
     * FIFO. Do not start a project transfer in that publication window. */
    if (live_key_r != live_key_w || live_key_cancel)
        return 1;
    if (brk.keys || brk.slices || src_held[0] || src_held[1] || src_held[2])
        return 1;
    for (k = 0; k < NBASS; k++)
        if (original_runtime_active(&original_bass[k]))
            return 1;
    while (r != cq_w) {
        uint32_t c = cq[r++ % CQ], t = c >> 28;
        if (t == C_DRUM || t == C_BON || t == C_REC || (t == C_BRK && ((c >> 12) & 0xFFu)))
            return 1;
    }
    return 0;
}

X0X_COLD void engine_project_flush(void)
{
    seq_midi_flush(&seq, &SINK);
    if (seq.playing && !seq.ext && seq.send_clock
#if BOARD_SMK37
        && !smk_clip_mode_on()
#endif
    )
        s_midi(0, 0xFC, 0, 0);
}

static int brk_note_down(int src, int note)
{
    return (brk_down[src][note >> 3] >> (note & 7)) & 1;
}
static void brk_note_set(int src, int note, int on)
{
    uint8_t m = (uint8_t)(1u << (note & 7));
    if (on)
        brk_down[src][note >> 3] |= m;
    else
        brk_down[src][note >> 3] &= (uint8_t)~m;
}
/* Held MIDI notes map through bank 0's current live slice count.
 * TODO(F3 row 24): review held-note identity for the second slicer. */
static int brk_note_slice(int note)
{
    int count = breaks_count(&brk, 0);
    return (note + 128 - 12) % count;
}
/* Same answer as testing all 128 notes in order: a byte with no held note
 * has no note that can match, so it is skipped (16 byte tests when idle). */
__attribute__((noinline)) static int brk_src_slice(int src, int slice)
{
    for (int j = 0; j < 16; j++) {
        unsigned d = brk_down[src][j];
        for (int n = j * 8; d; n++, d >>= 1)
            if ((d & 1u) && brk_note_slice(n) == slice) return 1;
    }
    return 0;
}
/* Bit s (s < 32) set when brk_any_slice(s) would return 1. One pass over
 * the held notes instead of one 3 x 128 scan per slice. */
static uint32_t brk_held_slices(void)
{
    uint32_t m = brk_local;
    for (int src = 0; src < MIDI_NSRC; src++)
        for (int j = 0; j < 16; j++) {
            unsigned d = brk_down[src][j];
            for (int n = j * 8; d; n++, d >>= 1)
                if (d & 1u) {
                    unsigned sl = (unsigned)brk_note_slice(n);
                    if (sl < 32u) m |= 1u << sl;
                }
        }
    return m;
}
static int brk_any_slice(int slice)
{
    if (brk_local & (1u << slice)) return 1;
    for (int src = 0; src < MIDI_NSRC; src++)
        if (brk_src_slice(src, slice)) return 1;
    return 0;
}
static void brk_midi_wrap(int src, int on, int note)
{
    int slice = brk_note_slice(note);
    if ((unsigned)src >= MIDI_NSRC) return;
    if (!on) {
        if (!brk_note_down(src, note)) return;
        brk_note_set(src, note, 0);
        if (!brk_any_slice(slice)) breaks_slice_hold(&brk, slice, 0);
    } else {
        brk_note_set(src, note, 1);
        breaks_slice_on(&brk, slice);
        rec_ev_put(REC_EV(PART_BRK, slice, 127, seq_rec_step(&seq, TRK_BRK)));
    }
}
static void brk_local_event(int key, int on)
{
    /* Legacy physical macro numbers stay8..10. Paged slices use32..63. */
    if ((unsigned)(key - 8) < 3u) { breaks_live(&brk, key, on); return; }
    int slice = key >= 32 ? key - 32 : key;
    if ((unsigned)slice >= 32u) return;
    if (on) {
        if (slice >= breaks_count(&brk, 0)) return;
        brk_local |= 1u << slice;
        breaks_slice_on(&brk, slice);
    } else {
        brk_local &= ~(1u << slice);
        if (!brk_any_slice(slice)) breaks_slice_hold(&brk, slice, 0);
    }
}
__attribute__((noinline)) static void brk_link_end(int src, uint16_t owned)
{
    (void)owned;
    for (int n = 0; n < 16; n++) brk_down[src][n] = 0;
    /* breaks_slice_hold changes only brk.slices, never brk_local, brk_down or
     * the slice count, so the held set is the same for every sl in the loop. */
    uint32_t held = brk_held_slices();
    for (int sl = 0; sl < 32; sl++)
        if (!(held & (1u << sl))) breaks_slice_hold(&brk, sl, 0);
}

static void brk_channel_reconcile(void)
{
    uint8_t channel = seq.ch[TRK_BRK];
    if (channel == brk_input_channel) return;
    /* A channel edit retires external owners, not local keys or macros. */
    for (int src = 0; src < MIDI_NSRC; src++) brk_link_end(src, 0);
    if (brk_bend_owner >= 0 && brk_bend_owner < MIDI_NSRC) {
        breaks_bend(&brk, 0); brk_bend_owner = -1;
    }
    brk_input_channel = channel;
}

/* A cancelled external-MIDI capture (REC off, stop, pattern change) also
 * ends the voice it was recording; key counts stay for the later release. */
static uint8_t rec_seen_gen[NBASS], rec_seen_src[NBASS] = {0xFF, 0xFF};
static void original_rec_cancel_cut(void)
{
    for (int v = 0; v < NBASS; ++v) {
        const seq_bass_rec_t *r = &seq.rec_bass[v];
        if (r->gen != rec_seen_gen[v] && rec_seen_src[v] < MIDI_NSRC)
            (void)original_runtime_cut_source(&original_bass[v], rec_seen_src[v]);
        rec_seen_gen[v] = r->gen;
        rec_seen_src[v] = r->active ? r->src : 0xFF;
    }
}
/* A pending ambiguous off may time out during rendering rather than MIDI
 * input. Keep the recorder's endpoint/cache and disconnect ownership in sync.
 * REC's own generation and source/pitch ownership rules stay authoritative. */
static void original_rec_recover_off(int voice)
{
    unsigned src = bass_held_src[voice];
    if (src >= MIDI_NSRC || !bass_held_count[voice]) return;
    unsigned pitch = bass_held[voice];
    uint8_t now = original_bass[voice].keys[src][pitch];
    if (now == bass_held_count[voice]) return;
    bass_held_count[voice] = now;
    if (now) return;
    seq_bass_rec_t *r = &seq.rec_bass[voice];
    if (r->own_ok && r->own_gen == r->gen && r->own_src == src && r->own_note == pitch) {
        seq_rec_bass(&seq, voice, pitch, 0, 0, src, 0);
        r->own_ok = 0;
    }
    bass_held[voice] = 0;
    unsigned any = 0;
    for (unsigned key = 0; key < 128; ++key) any |= original_bass[voice].keys[src][key];
    if (!any) src_held[src] &= (uint16_t)~(1u << voice);
}

/* Retire only original-synth MIDI owners when their channel changes. */
static void original_midi_context(void)
{
    original_rec_cancel_cut();
    for (int v = 0; v < NBASS; ++v) if (original_midi_channel[v] != seq.ch[TRK_BASS0 + v]) {
        for (unsigned source = 0; source < MIDI_NSRC; ++source) {
            (void)original_runtime_release_source(&original_bass[v], source);
            src_held[source] &= (uint16_t)~(1u << v);
        }
        if (bass_held_src[v] < MIDI_NSRC) bass_held[v] = bass_held_count[v] = 0;
        original_midi_channel[v] = seq.ch[TRK_BASS0 + v];
    }
}

/* noinline: keeps GM_DRUM lookup out of engine_render when the map is shared with seq */
__attribute__((noinline)) static void midi_in(uint32_t pkt)
{
    uint8_t st = (uint8_t)(pkt >> 8), d1 = (uint8_t)(pkt >> 16) & 0x7F, d2 = (uint8_t)(pkt >> 24) & 0x7F;
    uint8_t ch = st & 0x0F, ty = st & 0xF0;
    int k, v, src = (int)PLAT_MIDI_SRC(pkt);
    if (src < 0 || src >= MIDI_NSRC) return; /* source 3 is internal keyboard ownership only */
    if (!(pkt & ~0x30u)) {                      /* CIN 0, no message: the link of an input ended (usb.c midi_link_check) */
        seq_clk_drop(&seq, (uint32_t)src);      /* MID-15: another input can get the clock at once */
        v = src_held[src];
        for (k = 0; k < NBASS; ++k) {
            (void)original_runtime_release_source(&original_bass[k], (unsigned)src);
            if ((v >> k) & 1) {

                if (bass_held_src[k] == (uint8_t)src) bass_held[k] = bass_held_count[k] = 0;
                seq_rec_cancel(&seq, k);
            }
        }
        if (brk_bend_owner == src) { breaks_bend(&brk, 0); brk_bend_owner = -1; }
        brk_link_end(src, (uint16_t)v);   /* slices this input held; the other input's slices stay */
        src_held[src] = 0;
        return;
    }
    if (!seq_clk_take(&seq, st, PLAT_MIDI_SRC(pkt)))
        return;                     /* another input has the clock: its Clock, Start, Continue, Stop, Song Position (MID-15) */
#if BOARD_SMK37
    /* Count MIDI Clock for the clip-mode PLAY blink. The sequencer path below is unchanged. */
    if (st == 0xF8)
        smk_apc_clock_tick();
    else if (st == 0xFA)
        smk_apc_clock_start();
    else if (st == 0xF2)
        smk_apc_clock_position((uint32_t)d1 | (uint32_t)d2 << 7);   /* Song Position: 6 ticks per unit */
    else if (st == 0xFC)
        smk_ck_midi_stop();         /* clip mode keybed: the arp stops its notes (main_fm1.c) */
    /* Clip mode: Loopy Start, Continue and Stop must not go back to the host as
     * X0X transport (no echo). With clip mode off, nothing changes (agent-rules 2). */
    if (st >= 0xFA && st <= 0xFC && smk_clip_mode_on())
        seq.midi_req = 1;
#endif
    if (seq_midi_rt(&seq, st))      /* Clock, Start, Continue, Stop: GLO > MIDI > CLOCK SOURCE */
        return;
#if BOARD_SMK37
    /* Only USB and peripheral BLE can carry a host-routed SMC User preset.
     * TRS input (or an invalid source) must retain normal instrument routing.
     * Direct SMC central input has its own callback. */
    {
        extern int smc_midi_host(uint32_t pkt);
        if (src < 2 && smc_midi_host(pkt))
            return;
    }
#endif
#if BOARD_SMK37
    /* The USB interrupt stores APC feedback at all times. Keep these notes from the
     * sound engine only while clip mode is on. When clip mode is off, the original
     * MIDI input path stays the same (agent-rules 2). */
    if (ty == 0x90 || ty == 0x80) {
        uint8_t vel = (ty == 0x80) ? 0u : d2;
        if (d1 < SMK_APC40_CLIP_COUNT) {
            /* The USB interrupt (smk_apc_usb_event) already stored this clip feedback.
             * Do not store it again: a second store breaks the flash detection. */
            /* A note on the break's own channel is the break, not a clip pad. */
            if (smk_clip_mode_on() && ch != seq.ch[TRK_BRK])
                return;
        } else if (smk_apc40_transport_feedback_note(d1)) {
            smk_apc_transport_led_set(d1, vel);
            if (smk_clip_mode_on())
                return;
        }
    }
#endif
    if (ty == 0x90 && d2 == 0)
        ty = 0x80;
    /* Transport packets precede the next note for every part, including kits
     * whose dispatch returns before the bass path below. */
    if ((ty == 0x90 || ty == 0x80) && (seq.ext_pending || seq.req_start || seq.req_stop || seq.req_cont))
        seq_advance(&seq, 0, &SINK);
    if (ty == 0xe0 && seq.ch[TRK_BRK] == ch) {
        /* Physical gestures own bend until release, otherwise last external
         * source wins. BREAK consumes its channel without live MIDI echo. */
        if (!brk_wheel) {
            breaks_bend(&brk, ((int)d1 | (int)d2 << 7) - 8192);
            brk_bend_owner = brk.bend ? (int8_t)src : -1;
        }
        return;
    }
    if ((ty == 0x90 || ty == 0x80) && seq.ch[TRK_BRK] == ch) {
        /* The break's channel owns the note. Drums and the 303s do not also play it. */
        if (!(ty == 0x90 && SEQ_PART_OFF(&seq, TRK_BRK))) brk_midi_wrap(src, ty == 0x90, d1);
        return;
    }
    /* Kit MIDI channel owns the note (GLO remap). Same consume rule as BREAK:
     * a Note On/Off on a kit channel must not also hit a 303 that shares that channel. */
    {
        int kit_own = 0;
        for (k = 0; k < NKIT; k++) {
            if (seq.ch[k] != ch)
                continue;
            kit_own = 1;
            if (ty == 0x90 && !SEQ_PART_OFF(&seq, k)) { /* machines on GM drum notes (GM_DRUM) */
                for (v = 0; v < NDRUM; v++)
                    if (GM_DRUM[k][v] == d1) {
                        s_drum(0, k, v, (float)d2 / 127.0f);
                        rec_ev_put(REC_EV(k, v, d2, seq_rec_step(&seq, TRK_DRUM + k)));
                    }
            }
        }
        if (kit_own && (ty == 0x90 || ty == 0x80))
            return;
    }
    for (k = 0; k < NBASS; k++)                         /* the 303s: overlapping notes slide */
        if (seq.ch[TRK_BASS0 + k] == ch) {
            if (ty == 0x90 && SEQ_PART_OFF(&seq, TRK_BASS0 + k)) continue;
            if (ty == 0x90 || ty == 0x80) {
                unsigned velocity = ty == 0x90 ? d2 : 0;
                /* External MIDI recording: accepted physical edges, as the pads do. */
                int slide = velocity && live_rec_legato(k, src) && bass_held[k] != d1;
                if (original_runtime_key(&original_bass[k], (unsigned)src, d1, velocity) != ORIGINAL_RUNTIME_OK) continue;
                if (velocity) {
#ifdef X0X_HOST
                    bass_attacked[k] = (uint8_t)!slide;
#endif
                    seq_rec_bass(&seq, k, d1, d2, 1, src, (d2 >= 100 ? BS_ACCENT : 0) | (slide ? SEQ_REC_LEGATO : 0));
                    bass_held[k] = d1; bass_held_src[k] = (uint8_t)src;
                    bass_held_count[k] = original_bass[k].keys[src][d1];
                    live_rec_accept(k, src, d1);
                } else if (seq_bass_poly(&seq,k)) {
                    seq_rec_bass(&seq,k,d1,0,0,src,0);
                    if(bass_held_src[k]==src && bass_held[k]==d1) {
                        bass_held_count[k]=original_bass[k].keys[src][d1];
                        if(!bass_held_count[k])seq.rec_bass[k].own_ok=0;
                    }
                } else if (bass_held_src[k] == (uint8_t)src && bass_held[k] == d1) {
                    bass_held_count[k] = original_bass[k].keys[src][d1];
                    if (!bass_held_count[k]) {
                        seq_rec_bass(&seq, k, d1, 0, 0, src, 0);
                        seq.rec_bass[k].own_ok = 0;
                        bass_held[k] = 0;
                    }
                }
                int held = 0;
                for (unsigned key = 0; key < 128; ++key) held |= original_bass[k].keys[src][key];
                if (held) src_held[src] |= (uint16_t)(1u << k);
                else src_held[src] &= (uint16_t)~(1u << k);
            } else if (ty == 0xb0 && d1 == 1) {
                PARAM_TRACE(PARAM_MIDI, T_303, k, mod_param(k), d2);
                mod_apply(k, d2);                      /* mod wheel CC1: cutoff / wobble depth */
                ext_touch[k] |= 2u;
            } else if (ty == 0xb0 && d1 == 64) {
                /* damper: sustain pedal CC64 (no wheel mapping) */
                PARAM_TRACE(PARAM_MIDI, T_303, k,
                            (int)original_sound_count(original_bass[k].kind) - 1, d2);
                perf_apply(k, (int)original_sound_count(original_bass[k].kind) - 1, d2, 1);
            } else if (ty == 0xe0) {
                unsigned bend = (unsigned)d1 | (unsigned)d2 << 7;
                float value = bend < 8192 ? (float)bend / 16384.0f : 0.5f + (float)(bend - 8192) / 16382.0f;
                unsigned parameter = original_sound_count(original_bass[k].kind) - 2;
                PARAM_TRACE(PARAM_MIDI, T_303, k, (int)parameter, (int)(bend >> 7));
                perf_ctl[k][0] = (uint8_t)(bend >> 7);
                ext_touch[k] |= 1u;
                (void)original_runtime_param(&original_bass[k], parameter, value);
            }
        }
}
#ifdef X0X_HOST
int engine_bass_attacked(int part) { return (unsigned)part < NBASS && bass_attacked[part]; }
int engine_bass_keys_held(void) /* host test: bit k when 303 k holds any key (MIDI, pads or sequencer), not the DSP release tail */
{
    int k, r = 0;
    for (k = 0; k < NBASS; k++)
        for (unsigned input = 0; input < ORIGINAL_INPUT_COUNT && !(r >> k & 1); ++input)
            for (unsigned key = 0; key < 128; ++key)
                if (original_bass[k].keys[input][key]) { r |= 1 << k; break; }
    return r;
}
/* Host oracle: bit 0 a 909 voice is inside its mute window; bit 1/2 bass A/B gates. */
int engine_part_sounding(void)
{
    int k, on = drum909_active(&d909) ? 1 : 0;
    for (k = 0; k < NBASS; k++)
        on |= original_runtime_active(&original_bass[k]) ? (2 << k) : 0;
    return on;
}
int engine_midi_held(void)   /* host test: bit k the 303 k gate, bit 8 + s the break slice key s */
{
    int k, r = (int)((brk.keys | brk.slices) << 8 & 0xFF00u);   /* held slices 0..7 (adaptive slicing keeps them in brk.slices) */
    for (k = 0; k < NBASS; k++)
        r |= original_runtime_active(&original_bass[k]) ? 1 << k : 0;
    return r;
}
#endif

#include "original_presets.inc"

/* ---------------------------------------------------------------- render --- */
static void engine_notes_off_apply(void)
{
    int v, src, s;
    /* PANIC_APPLY */
    seq_notes_off(&seq, &SINK);
    for (v = 0; v < NBASS; v++) {
        (void)original_runtime_all_off(&original_bass[v]);
        s_boff(0, v);
        live_key_owner[v].gate = live_key_owner[v].token = 0;
        live_key_owner[v].pitch = live_key_owner[v].arp = 0;
        __builtin_memset(original_key_pitch[v], 0, sizeof original_key_pitch[v]);
        bass_held[v] = 0;
        bass_held_count[v] = 0;
    }
    for (src = 0; src < MIDI_NSRC; src++) {
        src_held[src] = 0;
        for (s = 0; s < 16; s++)
            brk_down[src][s] = 0;
    }
    brk_local = 0;
    for (s = 0; s < 32; s++) breaks_slice_hold(&brk, s, 0);
    brk.keys = 0;
    brk.restart = 0;
    drum909_all_off(&d909);
    drum808_all_off(&d808);
#if BOARD_SMK37
    smk_ck_midi_stop();
#endif
}

static void drain(void)
{
    original_midi_context();
    /* A UI Stop precedes a newly queued manual press, just as a MIDI Stop
     * precedes the following MIDI note. Retire old owners before CQ notes. */
    if (seq.req_stop) seq_advance(&seq, 0, &SINK);
    uint32_t r = cq_r, pkt;
    int guard = 64;
    __asm__ volatile("" ::: "memory");
    if (notes_off_req) {
        notes_off_req = 0;
        notes_off_cutoff = notes_off_requested_cutoff;
        notes_off_discard = (uint8_t)((int32_t)(notes_off_cutoff - cq_r) > 0);
        cq_panic_active = notes_off_discard;
        /* Retire the old audible/recording owners before any fresh onset. */
        engine_notes_off_apply();
    }
    brk_channel_reconcile();
    /* Finish old contexts before a queued new press can acquire note ownership. */
    for (int k = 0; k < NBASS; k++) {
        const seq_bass_rec_t *rec = &seq.rec_bass[k];
        if (seq.req_stop || ((seq.req_start || seq.req_cont) && seq.rec_mask) || (rec->active &&
            (!((seq.rec_mask | (rec->src < 3 ? seq.rec_ext_mask : 0u)) & (1u << k)) || rec->pat != seq.ppat[TRK_BASS0 + k])) ||
            (seq.t[TRK_BASS0 + k].to_off == 1 && bass_held_count[k])) {
            seq_advance(&seq, 0, &SINK);
            break;
        }
    }
    unsigned budget = 128; /* bound parameter floods to this audio boundary */
    while (r != cq_w && budget--) {
        if (cq_hole_on && r == cq_hole_at) {   /* already copied toward the head */
            r++;
            if (notes_off_discard && r == notes_off_cutoff)
                notes_off_discard = cq_panic_active = 0;
            continue;
        }
        uint32_t c = cq[r % CQ], type = c >> 28, a = (c >> 20) & 0xFFu, b = (c >> 12) & 0xFFu, v = c & 0xFFFu;
        int discard = notes_off_discard &&
            !(cq_panic_fresh[(r % CQ) / 32u] & (1u << (r & 31u)));
        r++;
        if (notes_off_discard && r == notes_off_cutoff)
            notes_off_discard = cq_panic_active = 0;
        /* PANIC_DROP_QUEUED: old releases cannot silence a fresh replacement
         * admitted into an earlier full-queue slot. Controls still execute. */
        if (discard && (type == C_DRUM || type == C_BON || type == C_REC ||
                        type == C_BOFF || type == C_BRK))
            continue;
        uint32_t rec_epoch = a >> 1;
        if (type == C_REC) a &= 1u;
        if (type < 8u)
            apply_param((int)type, (int)a, (int)b, (int)v);
        else if (type == C_MOD)
            mod_apply((int)a, (int)v);
        else if (type == C_BASE) {
            if (a < NTARGETS) apply_base((int)a, (int)b, (int)v);
            else mot_apply(0, (int)a, (int)b, (int)v, mot_base(0, (int)a, (int)b, (int)v));
        } else if (type == C_DRUM) {
#if X0X_DIAG_STATE_TRACE
            diag_consume = plat_ticks24(); diag_command = c; diag_offset = engine_diag_render_offset;
#endif
            s_drum(0, (int)a, (int)b, (float)v / 4095.0f);
        }
        else if ((type == C_BON || type == C_REC) && a < NBASS) {
            int slide = type == C_REC ? live_rec_legato((int)a, 3) && bass_held[a] != b : (int)((v >> 1) & 1u);
            /* Runtime acceptance precedes recorder writes and live ownership.
             * In particular, a retained unavailable archive is not a press. */
            if (original_runtime_key(&original_bass[a], ORIGINAL_INPUT_KEYS, b, (v >> 2) & 127u) != ORIGINAL_RUNTIME_OK)
                continue;
#ifdef X0X_HOST
            bass_attacked[a] = (uint8_t)!slide;
#endif
            if (type == C_REC && rec_epoch == (seq.rec_epoch & 127u))
                seq_rec_bass(&seq, (int)a, (int)b, (int)((v >> 2) & 127u), 1, 3,
                    ((v & 1u) ? BS_ACCENT : 0) | ((v & 512u) ? BS_SLIDE : 0) | (slide ? SEQ_REC_LEGATO : 0));
            v &= 511u; /* the outgoing manual-slide flag is recorder metadata only */
            bass_adapt_flags((int)a, (int)(v & 1u), slide);
            bass_held[a] = (uint8_t)b;
            bass_held_count[a] = 1; bass_held_src[a] = 3;
            src_held[0] &= (uint16_t)~(1u << a); src_held[1] &= (uint16_t)~(1u << a); src_held[2] &= (uint16_t)~(1u << a);
            live_rec_accept((int)a, 3, (int)b);
        } else if (type == C_BOFF && a < NBASS && bass_held_src[a] == 3) {
            if (!seq_bass_poly(&seq,(int)a) && (!v || b == bass_held[a]) && seq.rec_bass[a].own_src == 3) {
                seq_rec_bass(&seq, (int)a, seq.rec_bass[a].own_note, 0, 0, 3, 0);
                seq.rec_bass[a].own_ok = 0;
                bass_held_count[a] = 0;
            }
            if (v) (void)original_runtime_key(&original_bass[a], ORIGINAL_INPUT_KEYS, b, 0);
            else {
                (void)original_runtime_release_source(&original_bass[a], ORIGINAL_INPUT_KEYS);
                __builtin_memset(original_key_pitch[a], 0, sizeof original_key_pitch[a]);
            }
            if(seq_bass_poly(&seq,(int)a))seq_rec_bass(&seq,(int)a,(int)b,0,0,3,0);
            if (!v || b == bass_held[a]) { bass_held[a] = bass_held_count[a] = 0; bass_slide[a] = 0; }
        } else if (type == C_BOFF && a < NBASS) {
            /* another input owns the voice: still drop the keyboard's own keys,
             * which never ends the owner's note (counts are per source) */
            if (v) (void)original_runtime_key(&original_bass[a], ORIGINAL_INPUT_KEYS, b, 0);
            else {
                (void)original_runtime_release_source(&original_bass[a], ORIGINAL_INPUT_KEYS);
                __builtin_memset(original_key_pitch[a], 0, sizeof original_key_pitch[a]);
            }
            if(seq_bass_poly(&seq,(int)a))seq_rec_bass(&seq,(int)a,(int)b,0,0,3,0);
        } else if (type == C_BRK)
            brk_local_event((int)a, (int)b);
    }
    cq_r = r;
    int16_t wheel = brk_wheel;
    if (wheel != brk_wheel_seen) {
        breaks_bend(&brk, wheel);
        brk_bend_owner = wheel ? 3 : -1;
        brk_wheel_seen = wheel;
    }
    uint32_t epoch;
    while (guard-- > 0 && plat_midi_in_epoch(&pkt, &epoch)) {
        unsigned type = (pkt >> 8) & 0xF0u, cc = (pkt >> 16) & 127u;
        int old_note = notes_off_midi_valid && epoch != notes_off_midi_epoch &&
            (type == 0x80u || type == 0x90u || (type == 0xB0u && (cc == 120u || cc == 123u)));
        if (!project_midi_drop && !old_note) midi_in(pkt);
    }
    if (guard >= 0) { project_midi_drop = 0; notes_off_midi_valid = 0; }
}

static void live_key_drain(void)
{
    for(;;) {
        uint32_t flags=plat_cq_lock();
        unsigned cancel=live_key_cancel;live_key_cancel=0;
        plat_cq_unlock(flags);
        for(int v=0;v<NBASS;v++)if(cancel&(1u<<v))live_key_context_retire(v,1);
        if(live_key_r==live_key_w)break;
        __asm__ volatile("" ::: "memory");
        live_key_command_t c=live_key_q[live_key_r];
        __asm__ volatile("" ::: "memory");
        live_key_r=(uint8_t)((live_key_r+1u)%LIVE_KEY_Q);
        unsigned v=c.word&1u,token=(c.word>>1)&63u,pitch=(c.word>>7)&127u;
        unsigned velocity=(c.word>>14)&127u,accent=(c.word>>21)&1u,slide=(c.word>>22)&1u;
        live_key_owner_t *o=&live_key_owner[v];
        if(o->blocked || c.generation!=o->generation)continue;
        if (velocity && SEQ_PART_OFF(&seq, TRK_BASS0 + v)) continue;
        if (velocity) bass_adapt_flags((int)v, (int)accent, (int)slide);
        uint8_t previous = original_key_pitch[v][token];
        if (velocity) {
            if (previous && !slide) (void)original_runtime_key(&original_bass[v], ORIGINAL_INPUT_KEYS, previous - 1u, 0);
            if (original_runtime_key(&original_bass[v], ORIGINAL_INPUT_KEYS, pitch, velocity) != ORIGINAL_RUNTIME_OK) continue;
            if (previous && slide) (void)original_runtime_key(&original_bass[v], ORIGINAL_INPUT_KEYS, previous - 1u, 0);
            original_key_pitch[v][token] = (uint8_t)(pitch + 1u);
            o->token = (uint8_t)token; o->pitch = (uint8_t)pitch; o->gate = 1;
            bass_held[v] = (uint8_t)pitch; bass_held_count[v] = 1; bass_held_src[v] = 3;
        } else if (previous == pitch + 1u) {
            bass_slide[v] = 0;
            (void)original_runtime_key(&original_bass[v], ORIGINAL_INPUT_KEYS, pitch, 0);
            original_key_pitch[v][token] = 0;
            if (o->token == token) o->token = o->pitch = 0;
            unsigned held = 0;
            for (unsigned key = 1; key <= 37; ++key) held |= original_key_pitch[v][key];
            o->gate = held != 0;
            if (!held) bass_held[v] = bass_held_count[v] = 0;
        }
    }}

static float part_peak[NPARTS];
__attribute__((noinline)) static void meter(int p, const float *x, float g, uint32_t n)
{
    uint32_t i;
    float pk = part_peak[p];
    for (i = 0; i < n; i++) {
        float a = fm_fabsf(x[i]) * g;
        if (a > pk)
            pk = a;
    }
    part_peak[p] = pk;
}

/* dry into L and R by the part's pan; the sends stay mono (the reverb and delay make the width) */
/* a mix gain that glides to its target (one pole, ~10 ms) instead of stepping each block, which
 * zippered on quick turns of LEVEL, PAN or a send. cur < 0: never used, takes the target at once
 * (no fade-in at boot); settled, cur IS the target, so the product is the unsmoothed one exactly */
typedef struct { float cur, tgt; } glide_t;
#define GLIDE_A 0.0022651f                                /* 1 - exp(-1 / (10 ms * 44.1 kHz)) */
__attribute__((noinline)) static void glide_set(glide_t *g, float t)
{
    g->tgt = t;
    if (g->cur < 0.0f)
        g->cur = t;
}
__attribute__((noinline)) static void add_glide(float *dst, const float *src, glide_t *g, uint32_t n)
{
    uint32_t i;
    float c = g->cur, t = g->tgt;
    if (c == t) {
        if (c != 0.0f)
            for (i = 0; i < n; i++)
                dst[i] += src[i] * c;
        return;
    }
    for (i = 0; i < n; i++) {
        c += (t - c) * GLIDE_A;
        dst[i] += src[i] * c;
    }
    if (fm_fabsf(t - c) < 1e-5f)
        c = t;
    g->cur = c;
}
/* each part's gains: dry left and right, its reverb and delay sends, and (drums) the voices' own sends */
enum { GL_L, GL_R, GL_REV, GL_DLY, GL_VREV, GL_VDLY, GL_N };
static glide_t mix_glide[NPARTS][GL_N] = {
    {{-1, 0}, {-1, 0}, {-1, 0}, {-1, 0}, {-1, 0}, {-1, 0}}, {{-1, 0}, {-1, 0}, {-1, 0}, {-1, 0}, {-1, 0}, {-1, 0}},
    {{-1, 0}, {-1, 0}, {-1, 0}, {-1, 0}, {-1, 0}, {-1, 0}}, {{-1, 0}, {-1, 0}, {-1, 0}, {-1, 0}, {-1, 0}, {-1, 0}},
    {{-1, 0}, {-1, 0}, {-1, 0}, {-1, 0}, {-1, 0}, {-1, 0}}};
__attribute__((noinline)) static void mix_targets(int p, float g, uint8_t solo)        /* g: the part level */
{
    /* Synth mute gates only this bus's dry/send gains. MIDI, allocator, ARP,
     * envelopes and insert histories keep advancing, so unmute needs no note. */
    if ((p == PART_303A || p == PART_303B) && seq_part_muted(&seq, p))
        g = 0.0f;
    if (solo && !(solo & (1u << p)))
        g = 0.0f;
    glide_set(&mix_glide[p][GL_L], g * mix_pl[p]);
    glide_set(&mix_glide[p][GL_R], g * mix_pr[p]);
    /* A throw opens the existing send. Release glides back; the fxbus tail stays. */
    glide_set(&mix_glide[p][GL_REV], g * busfx_send(mix_rev[p], bfx_hold[p], bfx_eff[p], BFX_REV));
    glide_set(&mix_glide[p][GL_DLY], g * busfx_send(mix_dly[p], bfx_hold[p], bfx_eff[p], BFX_DLY));
    glide_set(&mix_glide[p][GL_VREV], g);
    glide_set(&mix_glide[p][GL_VDLY], g);
}

#if X0X_DEBUG
/* development: what one block cost, for the worst-block record (main_fm1.c render_block) */
volatile uint32_t eng_dbg_wait, eng_dbg_nsub;  /* 24 MHz ticks waiting for core 1, stretches */
#endif

/* the mix of one stretch between two events: dry left and right, the reverb and delay sends;
 * t0..tr the 808's scratch, kbuf the break's, mono the 909's kit send */
static float dry_l[256], dry_r[256], rev[256], dly[256], t1[256], t2[256], kbuf[256], mono[256];
/* The 808's L/R scratch is the stretch's own out_l/out_r window (saves 2 KiB).
 * Lifetime: core 2 writes it while core 1 only touches dry_l..mono; core 1
 * reads it after plat_cpu2_wait and before the 303s overwrite that window;
 * fxbus_process_st then writes the final mix there. A failed core 2 is held. */
static float *t0, *tr;

/* a glide applied in place to a buffer that started at zero: buf * c is 0 + buf * c exactly, so this
 * is add_glide(zeros, buf) to the bit (the same steps of c) */
__attribute__((noinline)) static void scale_glide(float *buf, glide_t *g, uint32_t n)
{
    uint32_t i;
    float c = g->cur, t = g->tgt;
    if (c == t) {
        for (i = 0; i < n; i++)
            buf[i] *= c;
        return;
    }
    for (i = 0; i < n; i++) {
        c += (t - c) * GLIDE_A;
        buf[i] *= c;
    }
    if (fm_fabsf(t - c) < 1e-5f)
        c = t;
    g->cur = c;
}

static void bfx_snapshot(void)
{
    uint8_t down = bfx_down_pub;
    int i, p;
    bfx_bpm_snap = seq_tempo(&seq);
    bfx_phase_snap = seq.playing ? seq.ext_now - seq.start_at : 0u;
    bfx_send_hold[0] = bfx_send_hold[1] = 0;
    bfx_flt_hold = 0;
    for (p = 0; p < NPARTS; p++) {
        bfx_hold[p] = 0;
        bfx_eff[p] = 0;
    }
    for (i = 0; i < SMCFX_N; i++) {
        if (i < SMCFX_SRC_N)
            bfx_eff[SMCFX_PART[i]] = bfx_fx_pub[i];
        else if (i == SMCFX_RVB)
            bfx_send_eff[0] = bfx_fx_pub[i];
        else if (i == SMCFX_MDLY)
            bfx_send_eff[1] = bfx_fx_pub[i];
        else
            bfx_flt_eff = bfx_fx_pub[i];
        if (!(down & (uint8_t)(1u << i)))
            continue;
        if (i < SMCFX_SRC_N)
            bfx_hold[SMCFX_PART[i]] = 1;
        else if (i == SMCFX_RVB)
            bfx_send_hold[0] = 1;
        else if (i == SMCFX_MDLY)
            bfx_send_hold[1] = 1;
        else
            bfx_flt_hold = 1;
    }
}

__attribute__((noinline)) static void bfx_shape(int part, float *a, float *b, float *c, float *d, int nch, int n)
{
    if (!bfx_hold[part] && !busfx_settling(&bfx_st[part]))
        return;
    busfx_apply(&bfx_st[part], &bfx_stut_hub, bfx_part_stut_base(part), a, b, c, d, nch, (int)n, mix_cut[part],
                bfx_hold[part], bfx_eff[part], (int)n, (int)n, bfx_bpm_snap, bfx_phase_snap);
}

static void bfx_send_shape(int which, float *buf, int n)
{
    busfx_t *st = &bfx_send_st[which];
    uint8_t hold = bfx_send_hold[which], eff = bfx_send_eff[which];
    int throw_id = which ? BFX_DLY : BFX_REV;
    uint32_t i;
    float g;
    if (!hold && !busfx_settling(st))
        return;
    g = busfx_send(BFX_SEND_NOM, hold, eff, throw_id);
    for (i = 0; i < (uint32_t)n; i++)
        buf[i] *= g;
    busfx_apply(st, &bfx_stut_hub, which ? BFX_STUT_SEND_DLY : BFX_STUT_SEND_RVB, buf, 0, 0, 0, 1, n, 127.0f,
                hold, eff, n, n, bfx_bpm_snap, bfx_phase_snap);
}

static void bfx_flt_shape(float *l, float *r, int n)
{
    if (!bfx_flt_hold && !busfx_settling(&bfx_flt_st))
        return;
    busfx_apply(&bfx_flt_st, &bfx_stut_hub, BFX_STUT_FLT, l, r, 0, 0, 2, n, 127.0f, bfx_flt_hold, bfx_flt_eff, n,
                n, bfx_bpm_snap, bfx_phase_snap);
}

/* a drum machine's mix, from its render (L, R, voice sends; mono, its kit send) */
__attribute__((noinline)) static void kit_sends(int b, const float *m, uint32_t n)
{
    add_glide(rev, m, &mix_glide[b][GL_REV], n);
    add_glide(dly, m, &mix_glide[b][GL_DLY], n);
    meter(b, m, mix_level[b], n);
}

/* ---- the two cores' jobs, balanced per stretch ----
 * Five jobs: the 909 (renders straight into dry_l..dly, the mix's first term), the 808
 * (its L/R in the stretch's out_l/out_r window, its sends in t1/t2), bass A and bass B
 * (each its own workspace and L/R in XPOOL) and the break (kbuf). Recorder state shared
 * with the sequencer stays on core 0 (before and after the jobs).
 * Each job mixes itself on the core that rendered it, in the one-core order (909, 808,
 * bass A, bass B, then the break by core 0), so every sum is the one the single core
 * made: the same bits wherever a job runs. eng_stage counts the mixes done; a job waits
 * only for lower stages, and each core runs its jobs in that order, so no core waits
 * for the other's later work. A job and its state belong to one core for a whole
 * stretch: the plan changes only between stretches, while core 1 is idle.
 * The plan: each job's cost per 256 frames is measured where it runs (24 MHz timer,
 * fast rise, slow fall); before a stretch every split is costed against the stage
 * order, and the cheapest is taken only when it beats the current one by 1/8
 * (sticky: no flip-flop, and a job stays in one core's cache). */
enum { JB_909, JB_808, JB_A, JB_B, JB_BRK, JB_N };
static int brk_silent_now = 1;
static uint8_t d808_was_active;
/* each bass's L/R, and bass B's own workspace (A keeps original_workspace): XPOOL, which
 * either core may write (core 0's stacks are closed to core 1's writes, fm1_guard.h) */
static float eng_bass_buf[2 * NBASS][256] X0X_XPOOL;
static original_runtime_workspace original_workspace_b X0X_XPOOL;
static uint32_t bass_quiet_next[NBASS];               /* the quiet count after this stretch's render */
static uint8_t bass_render_ok[NBASS];
static volatile uint32_t eng_stage;                    /* mixes done this stretch: 1 909, 2 808, 3 basses */
static volatile uint8_t eng_c1_next;                   /* core 1: the next of its jobs to start */
static uint8_t eng_c1_mask;                            /* jobs on core 1 this stretch (bit per JB_*) */
static uint8_t eng_plan;                               /* the plan in force (the same bits) */
static uint32_t eng_job_cost[JB_N];                    /* ticks per 256 frames when active */
static uint32_t eng_job_arg;                           /* this stretch's n, 808 mask and window offset */
static uint8_t eng_job_solo;
static uint8_t eng_c1_waited;                          /* core 0 has called plat_cpu2_wait this stretch */
static uint8_t eng_brk_mark;                           /* brk_midi_count before core 1 could add any */
/* same-block 808 split: BD+SD (a prefix of the mix, about 1.2 ms) on core 1,
 * metals' voices on core 0 in parallel, mid lanes and metal mix after the body
 * is visible. No added audio latency; the sums are the same bits. */
static uint8_t eng_808_split;
static volatile uint8_t eng_808_body;                  /* 1: BD+SD is in left808/right808 */
static volatile uint8_t eng_808_metal_done;            /* 1: core 0 is done with the metal raw (Chicago workspace) */
static float eng_vol;                                  /* this callback's master volume (render_sub may master) */
static uint8_t eng_master_done;                        /* 1: this stretch ran the master */
static uint8_t eng_do_master;                          /* pipeline this stretch */
static uint32_t eng_mastered;                          /* contiguous prefix already mastered */
static volatile uint32_t eng_fx_done;                  /* frames of FX visible to core 0 (tail pipeline) */
static float *eng_fx_ol, *eng_fx_or;
static uint32_t eng_fx_n;
static void c1_take_over(uint32_t s);
static void d808_body_run(void);
static void core2_fx(uint32_t arg);

/* the second core still working: 1, done: 0, it failed: -1 (fm1: plat_fm1.c). One core: done. */
__attribute__((weak)) int plat_cpu2_busy(void) { return 0; }
/* both cores see each other's writes (fm1: csync; one core: the call is the barrier) */
__attribute__((weak)) void plat_cpu2_sync(void) {}
#define eng_sync() plat_cpu2_sync()

static void job_cost(int j, uint32_t ticks, uint32_t n)
{
    uint32_t c, e = eng_job_cost[j];
    if (n < 64u)
        return;                                         /* a short stretch is mostly set-up */
    c = ticks * 256u / n;
    eng_job_cost[j] = c > e ? c : e - ((e - c) >> 4);   /* rise at once, fall over ~16 stretches */
}

static void mix_808(float *left808, float *right808, uint32_t n, uint8_t solo_parts)
{
    uint32_t i;
    if (!d808_was_active)
        return;
    mix_targets(PART_808, mix_level[PART_808], solo_parts);
    add_glide(dry_l, left808, &mix_glide[PART_808][GL_L], n);
    add_glide(dry_r, right808, &mix_glide[PART_808][GL_R], n);
    add_glide(rev, t1, &mix_glide[PART_808][GL_VREV], n);
    add_glide(dly, t2, &mix_glide[PART_808][GL_VDLY], n);
    for (i = 0; i < n; i++)
        left808[i] = (left808[i] + right808[i]) * 0.5f;
    kit_sends(PART_808, left808, n);
}

/* wait for a stage. Core 1 spins (core 0 never stops). Core 0: 0 = reached, 1 = core 1
 * will not reach it (it failed, or on the host it runs lazily): run its jobs here. */
static int stage_wait(uint32_t s, int core)
{
    uint32_t t0;
    if (eng_stage >= s)
        return 0;
    if (core) {
#ifdef X0X_HOST
        return 1;                                        /* host: core 0 resumes it in order */
#else
        while (eng_stage < s)
            eng_sync();
        return 0;
#endif
    }
    t0 = plat_ticks24();
    for (;;) {
        eng_sync();
        if (eng_stage >= s)
            return 0;
        if (plat_cpu2_busy() <= 0 || plat_ticks24() - t0 > 24000u * 24u) {
            c1_take_over(s);                             /* failed, or the host: run its jobs here */
            return eng_stage >= s ? 0 : 1;
        }
    }
}

/* BD+SD into zeroed buses. Core 1 runs this at the start of the stretch; core 0
 * only if core 1 did not (it failed, or one core). */
static void d808_body_run(void)
{
    uint32_t arg = eng_job_arg, n = arg & 0xFFu ? arg & 0xFFu : 256u, i;
    uint32_t offset = (arg >> 20) & 0xFFu;
    float *left808 = t0 + offset, *right808 = tr + offset;
    for (i = 0; i < n; i++)
        left808[i] = right808[i] = t1[i] = t2[i] = 0.0f;
    drum808_render_st_lanes(&d808, left808, right808, t1, t2, (int)n,
                            (uint16_t)(arg >> 9 & 0x7FFu), D8_LANES_BODY);
    eng_sync();
    eng_808_body = 1;
    eng_sync();
}

/* 0 = body visible, 1 = it will not be (caller must not mix mid/metals onto it). */
static int body_wait(int core)
{
    uint32_t t0;
    if (eng_808_body)
        return 0;
    if (core) {
#ifdef X0X_HOST
        return 1;
#else
        while (!eng_808_body)
            eng_sync();
        return 0;
#endif
    }
    t0 = plat_ticks24();
    for (;;) {
        eng_sync();
        if (eng_808_body)
            return 0;
        if (plat_cpu2_busy() <= 0 || plat_ticks24() - t0 > 24000u * 24u) {
            if (!eng_c1_waited) {
                eng_c1_waited = 1;
                (void)plat_cpu2_wait();
            }
            if (!eng_808_body)
                d808_body_run();
            return eng_808_body ? 0 : 1;
        }
    }
}

/* one job, render and mix; core 1: not timed by the cycle counter (core 0's) */
static int run_job(int j, int core)
{
    uint32_t arg = eng_job_arg, n = arg & 0xFFu ? arg & 0xFFu : 256u, i;
    uint32_t offset = (arg >> 20) & 0xFFu, tk = plat_ticks24(), wt = 0, w0;
    uint8_t solo_parts = eng_job_solo;
    uint32_t solo = smc_solo_state;
    int active = 1;
    float *left808 = t0 + offset, *right808 = tr + offset;
    if (j == JB_909) {
        PROF_T(p9);
        for (i = 0; i < n; i++)
            dry_l[i] = dry_r[i] = rev[i] = dly[i] = 0.0f;
        if (!drum909_active(&d909)) {
            active = 0;
            drum909_advance_noise(&d909, (int)n);       /* retain the exact restart noise/history */
            drum909_pan_settle(&d909);                    /* silent: pans move at once, no glide */
        } else {
            drum909_render_st_masked(&d909, dry_l, dry_r, rev, dly, (int)n, smc_audible_drums(solo, PART_909));
            mix_targets(PART_909, mix_level[PART_909], solo_parts);
            bfx_shape(PART_909, dry_l, dry_r, rev, dly, 4, (int)n);
            for (i = 0; i < n; i++)                       /* kit send: filtered sides, still centred */
                mono[i] = (dry_l[i] + dry_r[i]) * 0.5f;
            scale_glide(dry_l, &mix_glide[PART_909][GL_L], n);   /* then the part's PAN over the kit */
            scale_glide(dry_r, &mix_glide[PART_909][GL_R], n);
            scale_glide(rev, &mix_glide[PART_909][GL_VREV], n);
            scale_glide(dly, &mix_glide[PART_909][GL_VDLY], n);
            kit_sends(PART_909, mono, n);
        }
        if (!core)
            PROF_ADD(PR_909, p9);
        eng_sync();
        eng_stage = 1;
    } else if (j == JB_808) {
        PROF_T(p8);
        d808_was_active = (uint8_t)drum808_active(&d808);
        if (d808_was_active) {                            /* silent, it does nothing (and is not mixed) */
            if (eng_808_split) {
                /* metal voices (and the bank) while core 1 mixes BD+SD into the buses.
                 * raw sits in Chicago's workspace: Miami A on core 1 waits on
                 * eng_808_metal_done before it uses the same union. */
                float (*raw)[256] = (float (*)[256])(void *)&original_workspace;
                uint16_t aud = (uint16_t)(arg >> 9 & 0x7FFu);
                drum808_metal_prepare(&d808, raw, (int)n, aud);
                if (body_wait(core)) {
                    eng_sync();
                    eng_808_metal_done = 1;
                    eng_sync();
                    return 0;
                }
                drum808_finish_rest(&d808, (const float (*)[256])raw, left808, right808, t1, t2,
                                    (int)n, aud);
                bfx_shape(PART_808, left808, right808, t1, t2, 4, (int)n);
                eng_sync();
                eng_808_metal_done = 1;
                eng_sync();
            } else {
                for (i = 0; i < n; i++)
                    left808[i] = t1[i] = t2[i] = right808[i] = 0.0f;
                drum808_render_st_masked(&d808, left808, right808, t1, t2, (int)n, (uint16_t)(arg >> 9 & 0x7FFu));
                bfx_shape(PART_808, left808, right808, t1, t2, 4, (int)n);
            }
        } else {
            active = 0;
            drum808_pan_settle(&d808);
        }
        w0 = plat_ticks24();
        if (stage_wait(1, core))
            return 0;
        wt = plat_ticks24() - w0;
        mix_808(left808, right808, n, solo_parts);
        if (!core)
            PROF_ADD(PR_808, p8);
        eng_sync();
        eng_stage = 2;
    } else if (j == JB_A || j == JB_B) {
        /* one bass: its own workspace and L/R, so A and B may run at once on the two cores */
        int bv = j - JB_A, p = PART_303A + bv;
        /* bass A uses original_workspace; the 808 split parks metal raw there.
         * Core 1 waits only when 909 was short (the heavy 909 case is already past). */
        if (core && j == JB_A) {
#ifdef X0X_HOST
            if (!eng_808_metal_done)
                return 0;                             /* host: core 0 finishes 808, then takes A */
#else
            while (!eng_808_metal_done)
                eng_sync();
#endif
        }
        float *bl = eng_bass_buf[2 * bv], *br = eng_bass_buf[2 * bv + 1];
        float *bb[NBASS];
        bb[bv] = bl; bb[1 - bv] = br;                     /* bass B renders right-left, as always */
        PROF_T(pb);
        (void)original_runtime_prepare(&original_bass[bv], seq_tempo(&seq));
        bass_adapt_pre(bv, (unsigned)n);
        int status = original_runtime_render(&original_bass[bv], bv ? &original_workspace_b : &original_workspace,
                                             bb[bv], bb[1-bv], n);
        bass_adapt_post(bv, bb[bv], bb[1-bv], (unsigned)n);
        if (!core)
            PROF_ADD(2 + bv, pb);
        bass_render_ok[bv] = (uint8_t)(status == ORIGINAL_RUNTIME_OK);   /* recorder: core 0, after */
        if (status == ORIGINAL_RUNTIME_OK) {
            /* One coherent request decision per sub-block. Once note ownership is
             * gone, fade residual insert output over 512 samples. Cancellation or
             * a fresh owner ramps back smoothly; DSP histories keep advancing. */
            int fade = engine_bass_preset_pending(bv) == 2 && !original_runtime_owned(&original_bass[bv]);
            if (fade || original_switch_gain[bv] != 512u)    /* else fused below */
                bass_303_accent_makeup(bb[bv], bb[1-bv], (unsigned)n, &bass_accent_mk[bv], bass_accent_mk_to[bv]);
            if (!fade && original_switch_gain[bv] == 512u) {
                /* Settled gain 1.0: x * 1.0f == x for every float, so only the
                 * quiet count runs (the same per-sample result). */
                uint32_t q = original_quiet_samples[bv];
                float g = bass_accent_mk[bv], t = bass_accent_mk_to[bv];
                if (g == 1.0f && t == 1.0f) {
                    for (i = 0; i < n; ++i) {
                        if (fm_fabsf(bb[bv][i]) > 1.0f/65536.0f || fm_fabsf(bb[1-bv][i]) > 1.0f/65536.0f) q = 0;
                        else if (q < 512u) ++q;
                    }
                } else {
                    /* Accent make-up (bass_303_accent_makeup), fused into this
                     * scan: one pass over the part, the same samples. */
                    for (i = 0; i < n; ++i) {
                        if (g != t) {
                            float d = t - g;
                            g = d > BASS_303_MAKEUP_SLEW ? g + BASS_303_MAKEUP_SLEW
                              : d < -BASS_303_MAKEUP_SLEW ? g - BASS_303_MAKEUP_SLEW : t;
                        }
                        float l = bb[bv][i] * g, r = bb[1-bv][i] * g;
                        bb[bv][i] = l; bb[1-bv][i] = r;
                        if (fm_fabsf(l) > 1.0f/65536.0f || fm_fabsf(r) > 1.0f/65536.0f) q = 0;
                        else if (q < 512u) ++q;
                    }
                    bass_accent_mk[bv] = g;
                }
                bass_quiet_next[bv] = q;
            } else {
                uint32_t q = original_quiet_samples[bv];
                for (i = 0; i < n; ++i) {
                    if (fade) { if (original_switch_gain[bv]) --original_switch_gain[bv]; }
                    else if (original_switch_gain[bv] < 512u) ++original_switch_gain[bv];
                    float gain = (float)original_switch_gain[bv] * (1.0f/512.0f);
                    bb[bv][i] *= gain; bb[1-bv][i] *= gain;
                    if (fm_fabsf(bb[bv][i]) > 1.0f/65536.0f || fm_fabsf(bb[1-bv][i]) > 1.0f/65536.0f)
                        q = 0;
                    else if (q < 512u) ++q;
                }
                bass_quiet_next[bv] = q;
            }
            bfx_shape(p, bb[bv], bb[1-bv], 0, 0, 2, (int)n);
        }
        w0 = plat_ticks24();
        if (stage_wait((uint32_t)(2 + bv), core))         /* A mixes after the 808, B after A */
            return 0;
        wt = plat_ticks24() - w0;
        if (status == ORIGINAL_RUNTIME_OK) {
            /* A part that was silent when Solo excluded it must not leak a new
             * note through the 10 ms mix glide-out: start its glides at zero.
             * (The quiet count from before this stretch, as the one-core order read it.) */
            int solo_out = solo_parts && !(solo_parts & (1u << p)) && original_quiet_samples[bv] >= 512u;
            original_quiet_samples[bv] = bass_quiet_next[bv];
            mix_targets(p, mix_level[p], solo_parts);
            if (solo_out) for (i = 0; i < GL_N; ++i) mix_glide[p][i].cur = 0.0f;
            add_glide(dry_l, bb[bv], &mix_glide[p][GL_L], n);
            add_glide(dry_r, bb[1-bv], &mix_glide[p][GL_R], n);
            {
                float pk = part_peak[p], g = mix_level[p];
                for (i = 0; i < n; ++i) {
                    float l = bb[bv][i], r = bb[1-bv][i];
                    float a = fm_fabsf(l) * g;
                    if (a > pk) pk = a;
                    a = fm_fabsf(r) * g;
                    if (a > pk) pk = a;
                    bb[bv][i] = .5f * (l + r);
                }
                part_peak[p] = pk;
            }
            add_glide(rev, bb[bv], &mix_glide[p][GL_REV], n);
            add_glide(dly, bb[bv], &mix_glide[p][GL_DLY], n);
        }
        eng_sync();
        eng_stage = (uint32_t)(3 + bv);
    } else {
        PROF_T(pk);
        brk_silent_now = breaks_silent(&brk);             /* the render writes zeros: nothing to mix */
        breaks_render(&brk, kbuf, (int)n);
        if (!brk_silent_now)
            bfx_shape(PART_BRK, kbuf, 0, 0, 0, 1, (int)n);
        else
            active = 0;
        if (!core)
            PROF_ADD(PR_BRK, pk);
    }
    if (active)
        job_cost(j, plat_ticks24() - tk - wt, n);
    return 1;
}

/* core 1's share: its jobs in stage order (arg: unused, the plan is in eng_*).
 * eng_c1_next: the job it is on, then the one after it once that is done */
static void core2_jobs(uint32_t arg)
{
    int j;
    (void)arg;
    if (eng_808_split && !eng_808_body)
        d808_body_run();
    for (j = eng_c1_next; j < JB_N; j++) {
        if (!(eng_c1_mask & (1u << j)))
            continue;
        eng_c1_next = (uint8_t)j;
        eng_sync();
#ifdef X0X_HOST
        /* the host runs this at once, inside plat_cpu2_run: a job whose mix needs core 0's
         * stages is left whole for core 0 to run in order (the same sums) */
        if (eng_stage < (j == JB_808 ? 1u : j == JB_A ? 2u : j == JB_B ? 3u : 0u))
            return;
#endif
        if (!run_job(j, 1))
            return;
        eng_c1_next = (uint8_t)(j + 1);
        eng_sync();
    }
    eng_c1_next = JB_N;
    eng_sync();
}

/* core 0 runs what core 1 did not finish, in order, up to stage s (JB_N + 1: all of it).
 * The device: core 1 failed (plat_cpu2_wait holds it; a job it was inside runs again, as
 * the one-job fallback always did). The host: core 1 runs lazily, and here is where. */
static void c1_take_over(uint32_t s)
{
    int j;
    if (!eng_c1_waited) {
        eng_c1_waited = 1;
        (void)plat_cpu2_wait();
    }
    eng_sync();
    for (j = eng_c1_next; j < JB_N && eng_stage < s; j++) {
        if (!(eng_c1_mask & (1u << j)))
            continue;
        eng_c1_next = (uint8_t)j;
        if (j == JB_BRK)
            brk_midi_count = eng_brk_mark;               /* drop a failed remote job's descriptors */
        (void)run_job(j, 0);
        eng_c1_next = (uint8_t)(j + 1);
    }
}

#define ENG_C1_LAT (24u * 10u)                         /* ticks: a hand-over and its wait, about */
/* the stretch's cost (ticks) of a split m (bit j: job j on core 1), in the stage order.
 * A job renders as soon as its core is free; only its mix (about 1/16 of it) waits for the
 * part before it (run_job: render, stage_wait, mix). Counting the whole job as waiting made
 * every split with the 303s apart cost the same as one core, so 909-only won the tie. */
static uint32_t plan_cost(uint32_t m, const uint32_t *c)
{
    uint32_t t[2] = {0u, m ? ENG_C1_LAT : 0u}, s, x;
    int k, j;
    k = (int)(m & 1u); t[k] += c[JB_909]; s = t[k];
    for (j = JB_808; j <= JB_B; j++) {
        k = (int)(m >> j & 1u);
        x = c[j] >> 4;
        t[k] += c[j] - x;                               /* render */
        if (t[k] < s) t[k] = s;                         /* the part before it mixed */
        t[k] += x; s = t[k];                            /* its mix */
    }
    k = (int)(m >> 4 & 1u); t[k] += c[JB_BRK];          /* mixed by core 0 after both */
    return t[0] > t[1] ? t[0] : t[1];
}
/* jobs core 1 may take: a Chicago part stays on core 0. Its note start (voice resume, the
 * full note mask) goes about 3 KB deep, more than core 1's 2,816-byte stack (fm1-emu stack
 * mark: 2,988 B with Chicago there; static path 2,384 B plus indirect calls). */
static uint32_t c1_allowed(void)
{
    uint32_t m = (1u << JB_909) | (1u << JB_808) | (1u << JB_BRK);
    if (original_bass[0].kind == ORIGINAL_SOUND_MIAMI) m |= 1u << JB_A;
    if (original_bass[1].kind == ORIGINAL_SOUND_MIAMI) m |= 1u << JB_B;
    return m;
}
/* before a stretch of n frames: the split to use (sticky; idle jobs stay on core 0) */
static uint32_t plan_pick(uint32_t n)
{
    uint32_t c[JB_N], act = 0, best = eng_plan, cost, bc, m, nn = n < 64u ? 64u : n, ok = c1_allowed();
    int j;
#ifdef X0X_CORE_PLAN                                  /* development: one fixed split, for A/B trials */
    (void)c; (void)best; (void)cost; (void)bc; (void)m; (void)nn; (void)j;
    if (drum909_active(&d909)) act |= 1u << JB_909;
    if (drum808_active(&d808)) act |= 1u << JB_808;
    act |= 1u << JB_A | 1u << JB_B;
    if (!breaks_silent(&brk)) act |= 1u << JB_BRK;
    return (uint32_t)(X0X_CORE_PLAN) & act & ok;
#endif
    if (drum909_active(&d909)) act |= 1u << JB_909;
    if (drum808_active(&d808)) act |= 1u << JB_808;
    act |= 1u << JB_A | 1u << JB_B;
    if (!breaks_silent(&brk)) act |= 1u << JB_BRK;
    for (j = 0; j < JB_N; j++)                         /* a short stretch still pays a call's set-up */
        c[j] = (act >> j & 1u) ? eng_job_cost[j] * nn / 256u : 0u;
    best &= act & ok;
    bc = plan_cost(best, c);
    cost = bc;
    for (m = 0; m < (1u << JB_N); m++) {
        uint32_t k;
        if (m & ~(act & ok))
            continue;
        k = plan_cost(m, c);
        if (k < bc) { bc = k; best = m; }
    }

    if (bc * 8u < cost * 7u || (eng_plan & ~(act & ok)))   /* 1/8 better, or a job of it went idle */
        eng_plan = (uint8_t)best;
    return eng_plan & act & ok;
}

/* post-mix tail on both cores. L and R cannot be split: the reverb's four combs
 * and the HP are shared (the right is those combs with alternate signs, then its
 * own allpasses); the delay is one line (PING feeds the loop from the right tap);
 * the glue reads the louder side and moves both; the master compressor and the
 * limiter are linked (both sides' power, max abs). FX and master have no
 * cross-feed, so core 1 runs FX in 32-frame chunks and core 0 runs the filter
 * and the master on each chunk once it is visible. Same sample order, same
 * bits, same block, no added latency. A stretch of ENG_TAIL_CS or more is
 * pipelined when it continues the already-mastered prefix (sample order). */
#define ENG_TAIL_CS 32u
static void core2_fx(uint32_t arg)
{
    uint32_t n = eng_fx_n, off = 0, cs = ENG_TAIL_CS;
    float *ol = eng_fx_ol, *orr = eng_fx_or;
    (void)arg;
    while (off < n) {
        uint32_t m = n - off;
        if (m > cs)
            m = cs;
        fxbus_process_st(&fx, dry_l + off, dry_r + off, rev + off, dly + off,
                         ol + off, orr + off, (int)m);
        off += m;
        eng_sync();
        eng_fx_done = off;
        eng_sync();
    }
}
static void tape_after_fx(void)
{
    if (fx.dl_type != 1 || fx.dl_level <= 0.0f || (fx.muted & 2u))
        tape_signal_seen = 0;
    else if (fx.dl_signal) {
        tape_signal_at = plat_ms();
        tape_signal_seen = 1;
    }
}
/* one stretch: the jobs split between the cores by plan_pick (see above), each mixed in the
 * order one core always used (909, 808, bass A, bass B, break): the same sums either way */
__attribute__((noinline)) static void render_sub(float *out_l, float *out_r, uint32_t n, uint32_t offset)
{
    uint32_t solo = smc_solo_state, m;
    uint8_t solo_parts = (uint8_t)(solo & 0x1Fu);
    int j;
    if (solo & (0x7FFu << 5)) solo_parts |= 1u << PART_909;
    if (solo & (0x7FFu << 16)) solo_parts |= 1u << PART_808;
    t0 = out_l; tr = out_r;                           /* before the second core reads them */
    bfx_snapshot();                                   /* before the second core reads the holds */
    eng_job_arg = (n & 0xFFu) | (uint32_t)smc_audible_drums(solo, PART_808) << 9 | (offset << 20);
    eng_job_solo = solo_parts;
    eng_brk_mark = brk_midi_count;
    eng_stage = 0;
    eng_c1_next = 0;
    eng_c1_waited = 0;
    bass_render_ok[0] = bass_render_ok[1] = 0;
    original_rec_cancel_cut();                        /* both basses' recorder state: here, before the jobs */
    m = plan_pick(n);
    eng_c1_mask = (uint8_t)m;
    /* 808 stays on core 0 and core 1 has other work: move the BD+SD prefix */
    eng_808_split = (uint8_t)(!(m & (1u << JB_808)) && m && drum808_active(&d808));
    eng_808_body = (uint8_t)!eng_808_split;
    eng_808_metal_done = (uint8_t)!eng_808_split;
    eng_sync();
    if (m && !plat_cpu2_run(core2_jobs, 0u)) {
        eng_c1_mask = 0;                              /* one core: all of it here */
        eng_808_split = 0;
        eng_808_body = 1;
        eng_808_metal_done = 1;
    }
#if X0X_DEBUG
    eng_dbg_nsub++;
    uint32_t w0 = plat_ticks24();
#endif
    for (j = 0; j < JB_N; j++)
        if (!(eng_c1_mask & (1u << j)))
            (void)run_job(j, 0);
    if (eng_c1_mask) {
        uint32_t pt = plat_cycles();
        if (!eng_c1_waited) {
            eng_c1_waited = 1;
            if (plat_cpu2_wait())
                eng_c1_waited = 2;
        }
        c1_take_over(JB_N + 1u);                      /* failed, or the host: the rest here */
        PROF_ADD(PR_808, pt);                         /* core 0's wait for core 1 (as before) */
    }
#if X0X_DEBUG
    eng_dbg_wait += plat_ticks24() - w0;              /* now: core 0's whole job span */
#endif
    brk_midi_drain();
    for (j = 0; j < NBASS; j++)                       /* the recorder (shared with the sequencer): core 0 */
        if (bass_render_ok[j]) original_rec_recover_off(j);
    if (!brk_silent_now) {
        float g = mix_level[PART_BRK];
        mix_targets(PART_BRK, g, solo_parts);
        add_glide(dry_l, kbuf, &mix_glide[PART_BRK][GL_L], n);
        add_glide(dry_r, kbuf, &mix_glide[PART_BRK][GL_R], n);
        add_glide(rev, kbuf, &mix_glide[PART_BRK][GL_REV], n);
        add_glide(dly, kbuf, &mix_glide[PART_BRK][GL_DLY], n);
        meter(PART_BRK, kbuf, g, n);
    }
    bfx_send_shape(0, rev, (int)n);
    bfx_send_shape(1, dly, (int)n);
    if (eng_do_master && n >= ENG_TAIL_CS) {
        uint32_t done = 0, waited = 0, first = 1;
        PROF_T(pf);
#ifdef X0X_HOST
        /* host: the same chunks, in order (core 1 is lazy). Proves the bits. */
        while (done < n) {
            uint32_t m = n - done;
            if (m > ENG_TAIL_CS)
                m = ENG_TAIL_CS;
            fxbus_process_st(&fx, dry_l + done, dry_r + done, rev + done, dly + done,
                             out_l + done, out_r + done, (int)m);
            if (first) { PROF_ADD(5, pf); first = 0; }
            bfx_flt_shape(out_l + done, out_r + done, (int)m);
            {
                PROF_T(pt);
                master_process_st(&mst, out_l + done, out_r + done, (int)m, eng_vol);
                PROF_ADD(6, pt);
            }
            done += m;
        }
        (void)waited;
#else
        eng_fx_ol = out_l;
        eng_fx_or = out_r;
        eng_fx_n = n;
        eng_fx_done = 0;
        eng_sync();
        if (!plat_cpu2_run(core2_fx, 0u)) {
            fxbus_process_st(&fx, dry_l, dry_r, rev, dly, out_l, out_r, (int)n);
            PROF_ADD(5, pf);
            tape_after_fx();
            bfx_flt_shape(out_l, out_r, (int)n);
            {
                PROF_T(pt);
                master_process_st(&mst, out_l, out_r, (int)n, eng_vol);
                PROF_ADD(6, pt);
            }
            eng_master_done = 1;
            return;
        }
        while (done < n) {
            uint32_t ready;
            eng_sync();
            ready = eng_fx_done;
            if (ready <= done) {
                if (plat_cpu2_busy() <= 0) {
                    if (!waited) {
                        waited = 1;
                        (void)plat_cpu2_wait();
                    }
                    ready = eng_fx_done;
                    if (ready < n) {
                        fxbus_process_st(&fx, dry_l + ready, dry_r + ready, rev + ready, dly + ready,
                                         out_l + ready, out_r + ready, (int)(n - ready));
                        eng_sync();
                        eng_fx_done = n;
                        ready = n;
                    }
                } else
                    continue;
            }
            if (first) { PROF_ADD(5, pf); first = 0; }
            bfx_flt_shape(out_l + done, out_r + done, (int)(ready - done));
            {
                PROF_T(pt);
                master_process_st(&mst, out_l + done, out_r + done, (int)(ready - done), eng_vol);
                PROF_ADD(6, pt);
            }
            done = ready;
        }
        if (!waited)
            (void)plat_cpu2_wait();
#endif
        tape_after_fx();
        eng_master_done = 1;
    } else {
        PROF_T(pf);
        fxbus_process_st(&fx, dry_l, dry_r, rev, dly, out_l, out_r, (int)n);
        tape_after_fx();
        PROF_ADD(5, pf);
        bfx_flt_shape(out_l, out_r, (int)n);
    }
}

#if X0X_DIAG_STATE_TRACE
__attribute__((noinline, minsize)) void engine_diag_half(uint32_t half, uint32_t late)
{
    if (half >= 174u && half < 222u) {
        volatile struct diag_row *r = &x0x_state_trace.row[half - 174u];
        r->half = half; r->late = late;
        r->key18_tick = plat_diag_key_tick(13); r->key22_tick = plat_diag_key_tick(17);
        r->consume_tick = diag_consume; r->command = diag_command; r->offset = diag_offset;
        ++x0x_state_trace.written;
    }
    diag_consume = 0;
}
#endif

void engine_render(int32_t *out_lr, uint32_t n)
{
    static float out_l[256], out_r[256];
    uint32_t done = 0, i;
    float vol = usb_full ? 1.0f : (float)plat_master() / 4096.0f;   /* (FULL: engine_volume) */
    int p;
    if (n > 256u)
        n = 256u;
    if (!n) return;
    eng_vol = vol;
    eng_master_done = 0;
    eng_mastered = 0;
    if (project_hold) {
        tape_signal_seen = 0;
        for (i = 0; i < n * 2u; i++)
            out_lr[i] = 0;
        return;
    }
    eng_prof_frames += n;
    original_prepare_all(); /* precedes every serial frame-zero edit and key */
    if ((mot_was_on && !mot_on) || mot_release_req) {   /* motion off, or its lanes replaced: knobs back */
        mot_release_req = 0;
        motion_release(&mot);
    }
    mot_was_on = mot_on;
    guard_apply();
    {
        PROF_T(pt);
        drain();
        /* A final MIDI Stop may have no following MIDI note to consume it.
         * Complete transport before the independent physical-key FIFO. */
        if (seq.ext_pending || seq.req_start || seq.req_stop || seq.req_cont)
            seq_advance(&seq, 0, &SINK);
        live_key_drain();
#if X0X_BASS_PRESET_PREVIEW
        bass_preset_boundary();
#endif
        fxbus_set_bpm(&fx, seq_tempo(&seq));
        unsigned pat_a=seq.ppat[TRK_BASS0],pat_b=seq.ppat[TRK_BASS0+1];
        seq_advance(&seq, 0, &SINK);
#if X0X_BASS_PRESET_PREVIEW
        bass_pattern_boundary(pat_a,pat_b);
#endif
        brk_midi_drain();
        if (mot_on && seq.playing && !seq_clock_waiting(&seq))
            motion_tick(&mot, n);
        PROF_ADD(7, pt);
    }
    while (done < n) {
        uint32_t k = seq_until_event(&seq, n - done);
        brk_mute_boundary(); /* also follows song mutes at an in-buffer event */
        /* any stretch of ENG_TAIL_CS or more: pipeline. Mastered frames
         * must be a prefix (the master's state is in sample order). */
        eng_do_master = (k >= ENG_TAIL_CS && done == eng_mastered);
        render_sub(out_l + done, out_r + done, k, 0);
        if (eng_do_master && eng_master_done)
            eng_mastered = done + k;
        {
            PROF_T(pt);
            original_prepare_all(); /* next actual sequencer stretch, before its events */
            unsigned pat_a=seq.ppat[TRK_BASS0],pat_b=seq.ppat[TRK_BASS0+1];
            seq_advance(&seq, k, &SINK);
#if X0X_BASS_PRESET_PREVIEW
            bass_pattern_boundary(pat_a,pat_b);
#endif
            brk_midi_drain();
            PROF_ADD(7, pt);
        }
        done += k;
    }
    if (mot_playing && !seq.playing) {                   /* stopped: every knob back to its own value */
        motion_release(&mot);
#if X0X_BASS_NOTE_SOUND
        note_lock_stop();
#endif
    }
    mot_playing = seq.playing;
    if (eng_mastered < n) {
        PROF_T(pt);
        master_process_st(&mst, out_l + eng_mastered, out_r + eng_mastered,
                          (int)(n - eng_mastered), vol);
        PROF_ADD(6, pt);
    }
    {   /* globals in registers: the stores below cannot reload them per sample */
        const float lim = out_lim, scale = out_scale;
        for (i = 0; i < n; i++) {
            float l = out_l[i], r = out_r[i];        /* (out_scale: NORMAL 2^22, Felucca's; LOUD 2^23) */
            l = l > lim ? lim : l < -lim ? -lim : l;
            r = r > lim ? lim : r < -lim ? -lim : r;
            out_lr[2u * i] = (int32_t)(l * scale);
            out_lr[2u * i + 1u] = (int32_t)(r * scale);
        }
    }
    {
        uint32_t w = eng_scope_w;
        for (i = 1; i < n; i += 2u)
            eng_scope[w++ & (SCOPE_N - 1u)] = (int16_t)((out_l[i] + out_r[i]) * 16383.5f);
        eng_scope_w = w;
    }
    for (p = 0; p < NPARTS; p++) {                      /* meters: peak hold, ~300 ms decay at the UI */
        uint32_t q = (uint32_t)(fm_minf(part_peak[p], 1.0f) * 32767.0f);
        if (q > eng_peak[p])
            eng_peak[p] = (uint16_t)q;
        part_peak[p] = 0.0f;
    }
}

/* -------------------------------------------------------------- loops --- */
/* a user loop's length in bars: 1, 2, 4 or 8, whichever puts its tempo nearest 120 BPM
 * inside 80..180 (breaks are recorded at their own tempo; the player stretches to ours) */
X0X_COLD static uint8_t loop_bars(uint32_t ns, uint32_t rate)
{
    float sec = (float)ns / (float)(rate ? rate : 22050u), best = 1e9f;
    uint8_t bars = 1, b;
    for (b = 1; b <= 8; b = (uint8_t)(b * 2)) {
        float bpm = (float)b * 240.0f / sec, d = bpm > 120.0f ? bpm - 120.0f : 120.0f - bpm;
        if (bpm >= 80.0f && bpm <= 180.0f && d < best) {
            best = d;
            bars = b;
        }
    }
    return bars;
}

#include "x0x_break_bank.h"              /* empty by default; factory or X0X_BREAK_BANK fills it */
#include "app/brk_pack.h"                 /* optional pack in the free tail of the app image */

#if X0X_NBREAKS == 0 && !defined(X0X_HOST)
extern const uint8_t _start[];            /* crt0: app.bin offset 0, the XIP image */
static brk_pack_loop_t pack_loops[BRK_PACK_MAX];
static int pack_n = -1;

static int load_pack(void)
{
#if defined(BOARD_SMK37) && BOARD_SMK37
    const uint32_t limit = 0x86EE0u;      /* FL_APP_CODE_MAX: code ends where Bluetooth begins */
#else
    const uint32_t limit = 0x8DFBCu;
#endif
    pack_n = brk_pack_parse(_start, limit, pack_loops, BRK_PACK_MAX);
    return pack_n;
}
#endif

static int builtin_count(void)
{
#if X0X_NBREAKS > 0
    return X0X_NBREAKS;                   /* compiled into the image */
#else
#ifndef X0X_HOST
    if (pack_n < 0)
        load_pack();
    return pack_n > 0 ? pack_n : 0;
#else
    return 0;
#endif
#endif
}

X0X_COLD static const brk_loop_t *brk_builtin(int k)
{
    static brk_loop_t L[2];
    static int which;
    brk_loop_t *l = &L[which ^= 1];      /* two: A and B are set one after the other */
    int n = builtin_count();
    if (k < 0 || k >= n)
        return 0;
#if X0X_NBREAKS > 0
    l->adpcm = X0X_BREAKS[k].adpcm;
    l->nsamples = X0X_BREAKS[k].n;
    l->rate = X0X_BREAK_RATE;
    l->bars = X0X_BREAKS[k].bars;
#else
#ifndef X0X_HOST
    l->adpcm = pack_loops[k].adpcm;
    l->nsamples = pack_loops[k].n;
    l->rate = pack_loops[k].rate;
    l->bars = pack_loops[k].bars;
#else
    (void)l;
    return 0;
#endif
#endif
    return l;
}

/* the LOOP choices: the built-in bank, then every loop (zone) of the user slots, in order.
 * The list follows uploads: engine_brk_loops() rescans it. Room for a pack of 8 when the
 * image itself has fewer built-in loops. */
#define NLOOPS_MAX ((X0X_NBREAKS > BRK_PACK_MAX ? X0X_NBREAKS : BRK_PACK_MAX) + PLAT_NSLOTS * PLAT_SLOT_ZONES)
static const char *loop_names[NLOOPS_MAX];
static char user_names[PLAT_NSLOTS * PLAT_SLOT_ZONES][8];
static uint8_t loop_slot[NLOOPS_MAX], loop_zone[NLOOPS_MAX];
static int nloops, loops_ready;

X0X_COLD __attribute__((noinline)) static void scan_loops(void)
{
    int i, k, z, u = 0, nb = builtin_count();
    nloops = 0;
    for (i = 0; i < nb; i++) {
#if X0X_NBREAKS > 0
        loop_names[nloops++] = X0X_BREAKS[i].name;
#else
#ifndef X0X_HOST
        loop_names[nloops++] = pack_loops[i].name;
#else
        break;
#endif
#endif
    }
    for (k = 0; k < PLAT_NSLOTS; k++) {                 /* yours: BR1, BR2 ... in order, whatever slot */
        int nz = plat_slot_zones(k);                    /* holds them (the break page packs the list) */
        for (z = 0; z < nz && z < PLAT_SLOT_ZONES; z++) {
            char *n = user_names[k * PLAT_SLOT_ZONES + z];
            int j = 2;
            u++;
            n[0] = 'B';
            n[1] = 'R';
            if (u >= 10)
                n[j++] = (char)('0' + u / 10);
            n[j++] = (char)('0' + u % 10);
            n[j] = 0;
            loop_slot[nloops] = (uint8_t)k;
            loop_zone[nloops] = (uint8_t)z;
            loop_names[nloops++] = n;
        }
    }
    loops_ready = 1;
}

X0X_COLD int engine_brk_nslots(void)
{
    if (!loops_ready)
        scan_loops();
    return nloops;
}
X0X_COLD const char *const *engine_brk_slot_names(void)
{
    if (!loops_ready)
        scan_loops();
    return loop_names;
}

int engine_brk_slice(void) { return brk.running ? brk.st_slice : -1; }

void engine_brk_state(int *slice, int *bank, int *div, int *running)
{
    *slice = brk.perf.count ? brk.current_slice : brk.st_slice;
    *bank = brk.perf.count ? 0 : brk.st_bank;
    *div = brk.st_div;
    *running = brk.running;
}

/* Peak magnitude → screen column 0..255. IMA can hit -32768; abs is 32768, and
 * (uint8_t)(32768 >> 7) wraps to 0 so a full-scale negative loop drew blank. */
static uint8_t brk_outline_peak_u8(int32_t pk)
{
    return (uint8_t)(pk >= 32768 ? 255 : pk >> 7);
}

/* the loop's outline for the screen: n columns of peak level 0..255 (main loop: decodes the
 * whole loop once, ~20k IMA steps; called when the loop changes, never per frame) */
X0X_COLD int engine_brk_outline(int which, uint8_t *peaks, int n)
{
    const brk_bank_t *bk = &brk.bank[which & 1];
    uint32_t i, ns = bk->n;
    int32_t pred = 0, idx = 0, col = 0, pk = 0;
    uint32_t per;
    if (!bk->adpcm || !ns || n <= 0)
        return 0;
    per = (ns + (uint32_t)n - 1u) / (uint32_t)n;       /* samples per column (32-bit: no __udivdi3) */
    for (i = 0; i < ns; i++) {
        int32_t s = ima_decode(bk->adpcm, i, &pred, &idx), c;
        c = (int32_t)(i / per);
        if (c != col) {
            peaks[col] = brk_outline_peak_u8(pk);
            col = c;
            pk = 0;
        }
        if ((s < 0 ? -s : s) > pk)
            pk = s < 0 ? -s : s;
    }
    peaks[col] = brk_outline_peak_u8(pk);
    for (col++; col < n; col++)
        peaks[col] = 0;
    return 1;
}
float engine_gr_db(void) { return mst.gr_view; }
int engine_master_get(int i) { return master_get(&mst, i); }
void engine_master_format(int i, char *buf) { master_format(&mst, i, buf); }

X0X_COLD void engine_brk_loops(void)
{
    const brkpart_t *bp = &seq.pat[seq.ppat[TRK_BRK]].brk;
    brk_loop_t L[2];
    int w;
    scan_loops();                                       /* an upload may have changed the user loops */
    /* No mute. The voice that is already sounding keeps its snapshot, and the
     * new loop is published for the next trigger. Skipping the break here used
     * to drop a whole buffer. */
    breaks_flush(&brk);                                /* a change that waited for a free snapshot */
    for (w = 0; w < 2; w++) {
        int slot = w ? bp->slot_b : bp->slot_a;
        uint32_t ns = 0, rate = 0;
        char name[9];
        int nb = builtin_count();
        const uint8_t *d = (slot >= nb && slot < nloops)
                               ? plat_slot(loop_slot[slot], loop_zone[slot], &ns, &rate, name) : 0;
        if (d) {
            L[w].adpcm = d;
            L[w].nsamples = ns;
            L[w].rate = rate;
            L[w].bars = loop_bars(ns, rate);
        } else {
            const brk_loop_t *builtin = brk_builtin(slot < nb ? slot : 0);
            if (builtin) L[w] = *builtin;
            else __builtin_memset(&L[w], 0, sizeof L[w]);
        }
        L[w].slices = (uint8_t)brk_slice_count(bp, (unsigned)w);
        breaks_set_loop(&brk, w, &L[w]);
    }
}

uint32_t engine_brk_held(void) { return brk.slices; }
void engine_brk_flush(void) { breaks_flush(&brk); }
void engine_brk_edit_hold(int held) { brk.local_guard = (uint8_t)(held != 0); }
int engine_brk_count(int bank) { return breaks_count(&brk, bank); }

void engine_brk_drop_range(const uint8_t *base, uint32_t nbytes)
{
    breaks_drop_range(&brk, base, nbytes);
}

X0X_COLD void engine_init(pattern_t *patterns, song_t *song, lane_t *lanes, const sound_t *base)
{
#if X0X_BASS_PRESET_PREVIEW
    bass_named_preset[0]=bass_named_preset[1]=-1;
    bass_preview_dirty=bass_wheel_mask=0;
    bass_request_serial=0;
    for(int v=0;v<NBASS;v++) bass_request[v]=bass_applied[v]=bass_publish_seq[v]=bass_midi_mark[v]=bass_cq_mark[v]=0;
#endif
    int p, g;
    cq_w = cq_r = 0;
    cq_hole_on = 0;
    cq_hole_at = 0;
    notes_off_req = notes_off_discard = cq_panic_active = notes_off_midi_valid = 0;
    notes_off_requested_cutoff = notes_off_cutoff = notes_off_midi_epoch = 0;
    __builtin_memset(cq_panic_fresh, 0, sizeof cq_panic_fresh);
    rec_w = rec_r = 0;
    brk_local = 0;
    brk_midi_count = 0;
    brk_input_channel = 255;
    src_held[0] = src_held[1] = src_held[2] = 0;
    for (p = 0; p < MIDI_NSRC; p++)
        for (g = 0; g < 16; g++)
            brk_down[p][g] = 0;
    for (p = 0; p < NBASS; p++) {
        bass_held[p] = bass_held_count[p] = bass_held_src[p] = 0;
        original_seq_note[p] = -1;
        original_midi_channel[p] = 255;
        __builtin_memset(original_key_pitch[p], 0, sizeof original_key_pitch[p]);
    }
    for (p = 0; p < BRK_NSET; p++)
        brk_applied[p] = 0xFFu;
    mot_playing = mot_release_req = 0;
    mot_on = mot_was_on = 1;
    guard_on = guard_applied = 0;
    guard_enabled = !X0X_DIAG_DISABLE_LOAD_GUARD;
    guard_avg_q8 = guard_calm = 0;
    drum808_quiet = 3.2e-5f;
    smc_solo_state = 0;
    bfx_down_pub = 0;
    for (p = 0; p < SMCFX_N; p++)
        bfx_fx_pub[p] = 0;
    for (p = 0; p < NPARTS; p++) {
        mix_cut[p] = 127.0f;
        busfx_init(&bfx_st[p]);
        bfx_hold[p] = 0;
        bfx_eff[p] = 0;
    }
    busfx_init(&bfx_send_st[0]);
    busfx_init(&bfx_send_st[1]);
    busfx_init(&bfx_flt_st);
    busfx_stut_init(&bfx_stut_hub);
    prob_rng = 0x2545F491u;
    brk_silent_now = 1;
    d808_was_active = 0;
    vol_after = -1.0f;
    for (p = 0; p < NPARTS * NDRUM; p++)
        prob[p / NDRUM][p % NDRUM] = 100;             /* every step plays, until a lane says */
    drum909_init(&d909);
    drum808_init(&d808);
    brk_wheel = brk_wheel_seen = 0; brk_bend_owner = -1;
    breaks_init(&brk);
    brk.accepted = s_brk_accepted;
    fxbus_init(&fx, dly_buf, DLY_LEN);
    tape_signal_seen = 0;
    master_init(&mst);
    seq_init(&seq, patterns);
    seq.song = song;
    motion_init(&mot, lanes);
    mot.base = mot_base;
    mot.apply = mot_apply;
    mot.restore = mot_restore;
    mot_base_snd = base;
    if (!original_tuning.ready) (void)original_chicago_tuning_bind(&original_tuning, 0, 0, NULL, 0x6d70);
    if (!original_fx_ready) {
        for (p = 0; p < NBASS; ++p) {
            (void)original_chicago_fx2_compact_init(&original_fx[p]);
            original_fx_owner[p] = original_chicago_fx2_compact_owner(&original_fx[p]);
        }
        original_fx_ready = 1;
    }
    bass_restore_sound(base);
    for (p = 0; p < NPARTS; p++) {
        mix_level[p] = 1.0f;
        mix_rev[p] = mix_dly[p] = 0.0f;
        mix_pl[p] = mix_pr[p] = 1.0f;
        part_peak[p] = 0.0f;
        eng_step[p] = 0;
        eng_peak[p] = 0;
        for (g = 0; g < GL_N; g++) {
            mix_glide[p][g].cur = -1.0f;
            mix_glide[p][g].tgt = 0.0f;
        }
    }
    for (p = 0; p < NKIT * NDRUM; p++)
        eng_hit[p / NDRUM][p % NDRUM] = 0;
    for (p = 0; p < (int)SCOPE_N; p++)
        eng_scope[p] = 0;
    eng_scope_w = 0;
}

#ifdef X0X_HOST
void engine_host_cq_sync(void) { cq_r = cq_w; cq_hole_on = 0; }
void engine_host_cq_at(uint32_t cursor) { cq_r = cq_w = cursor; cq_hole_on = 0; }
#endif

#if defined(X0X_HOST) && defined(X0X_LIVE_KEY_TEST)
void engine_live_key_force_serial(int voice,uint32_t generation,uint32_t context)
{live_key_owner[voice].generation=generation;live_key_owner[voice].context=context;}
unsigned engine_live_key_probe(int voice,int field)
{
    if((unsigned)voice>=NBASS)return 0;
    switch(field) {
    case 0:return live_key_owner[voice].token;
    case 1:return live_key_owner[voice].pitch;
    case 2:return live_key_owner[voice].gate;
    case 3:return engine_original_keys(voice,0);
    case 4:return 0;
    case 5:return bass_held[voice];
    case 7:
        return original_runtime_active(&original_bass[voice]);
    case 8:return 0;
    case 6:return (unsigned)(sizeof live_key_q+sizeof live_key_owner+sizeof live_key_w+sizeof live_key_r+sizeof live_key_cancel);
    default:return 0;
    }
}
#endif

#if defined(X0X_HOST) && defined(X0X_LIVE_KEY_TEST)
void engine_live_key_motion_step(int voice,int step)
{ motion_step(&mot,PART_303A+voice,seq.ppat[PART_303A+voice],step,(step+1)%16,16); }
void engine_live_key_pattern_note(int voice,int note)
{ if(note>=0)s_bon(0,voice,note,0,0,100);else s_boff(0,voice); }
#endif

