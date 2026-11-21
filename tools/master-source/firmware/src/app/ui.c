/* SPDX-License-Identifier: GPL-3.0-only */
/* X0X user interface v2 (docs/plans/2026-10-03-ui.md): panel input, screens, the knob strip,
 * lists, questions, the readout, and the key lights.
 *
 * Grammar: ALGORITHM = part, PRESETS = pattern, SELECT = move (page / list row), KNOB 1-4 =
 * the four values in the knob strip (on every screen), SEL = open / run / yes, HOME = back.
 *
 * The screen is four bands (header, main top, main bottom, knob strip), each drawn into
 * Felucca's canvas and blitted only when its pixels changed: SPI time is the scarce thing.
 *
 * Keys: F3..G5; the 16 white keys are steps (HOME: patterns), the 11 black keys a drum
 * machine's tracks or the break's slice pads (HOME: part mutes). */
#include "x0x.h"
#include "../seq/held_chord.h"
#include "panic_chord.h"
#include "play_question.h"
#include "home_pattern_glyph.h" /* HOME complete patterns, per-hit velocity */
#include "ui_pictograms.h"
#include "../x0x_cold.h"                       /* X0X_COLD: input and menu code of the main loop, built for size */
#include "../dsp/fastmath.h"
#include "../dsp/master.h"
#include "ui_original_controls.h"
#include "bass_pattern_preset.h"
#include "original_runtime.h"                    /* profile availability and explicit unavailable status */
#include "ui_original_wave.h"
#include "../dsp/bass_param_ids.h"                    /* BASS303_* (the 303's pages) */
#include "chicago_arp.h"                       /* CHI_ARP_* (Chicago live arp page) */
#include "chicago_fx.h"                        /* CHI_FX_* SEND FX + Crush/Ring/EQ/Cho/Ens/Phaser/SDly/BPM/Hall/GateRev insert */
#include "chicago_aux.h"                       /* CHI_PBEND / CHI_DAMPER */
#include "../dsp/fxbus.h"                      /* FX_* indices for SEND FX commit */
#include "note_names.h"                        /* X0X_NOTE_N: one C…B table with clip/chord */
#include "undo.c"
#include "sound_reset.c"

/* Printed SMK-37 Pro/Elite legends: panel.c + smk_input.h (unit-confirmed).
 * Simulator commands and logical button/encoder roles do not change. */
#ifndef X0X_SMK_CAPTIONS
#define X0X_SMK_CAPTIONS BOARD_SMK37
#endif
#if X0X_SMK_CAPTIONS
#define UI_CAP_HOME "PATCH"
#define UI_CAP_EDIT "PARA"
#define UI_CAP_SEL "SCALE"
#define UI_CAP_LFO "NOTE REPEAT"
#define UI_CAP_GLO "GLOBE"
#define UI_CAP_ENV "CHORD"
#define UI_CAP_SAVE "BT"
#define UI_CAP_REC "SEQ REC"
#define UI_CAP_PLAY "SEQ PLAY"
#define UI_CAP_SELECT "K2"
#define UI_CAP_ALGO "K3"
#define UI_CAP_PRESET "K4"
#define UI_CAP_OCT "OCTAVE"
#define UI_FIRST_KNOB 5
#define UI_CAP_ARROWS "< >"
#else
#define UI_CAP_HOME "HOME"
#define UI_CAP_EDIT "EDIT"
#define UI_CAP_SEL "SEL"
#define UI_CAP_LFO "LFO"
#define UI_CAP_GLO "GLO"
#define UI_CAP_ENV "ENV"
#define UI_CAP_SAVE "SAVE"
#define UI_CAP_REC "REC"
#define UI_CAP_PLAY "PLAY"
#define UI_CAP_SELECT "SELECT"
#define UI_CAP_ALGO "ALGO"
#define UI_CAP_PRESET "PRESET"
#define UI_CAP_OCT "OCT"
#define UI_FIRST_KNOB 1
#define UI_CAP_ARROWS "SELECT"
#endif


/* ================================================================ model === */
static const int8_t KEY_WHITE[NKEYS] = {0, -1, 1, -1, 2, -1, 3, 4, -1, 5, -1, 6, 7, -1, 8, -1, 9, -1, 10, 11, -1, 12, -1, 13, 14, -1, 15};
static const int8_t KEY_BLACK[NKEYS] = {-1, 0, -1, 1, -1, 2, -1, -1, 3, -1, 4, -1, -1, 5, -1, 6, -1, 7, -1, -1, 8, -1, 9, -1, -1, 10, -1};
/* Inverse of KEY_WHITE / KEY_BLACK (was rebuilt into BSS at ui_init).
 * On SMK, x0x.c included smk_input.h first: the pad map is these same 16 indices. */
#if defined(SMK_NPAD)
_Static_assert(SMK_NPAD == 16u, "SMK white-key map is the 16 panel white keys");
#define WHITE_KEY SMK_WHITE_NOTE
#else
static const uint8_t WHITE_KEY[16] = {0, 2, 4, 6, 7, 9, 11, 12, 14, 16, 18, 19, 21, 23, 24, 26};
#endif
static const uint8_t BLACK_KEY[11] = {1, 3, 5, 8, 10, 13, 15, 17, 20, 22, 25};

enum { V_HOME, V_PART, V_GEN, V_FX, V_MIX, V_GLO, V_SONG, V_PERF, V_SEQ, NVIEWS };
static const char *const VIEW_N[NVIEWS] = {"HOME", "", "TB-3PO", "FX", "MIX", "GLOBAL", "SONG", "PERF", "SEQ"};
static const uint16_t PART_COLOURS[2][NPARTS] = {
    {RGB(255,150,40),RGB(255,72,64),RGB(130,240,90),RGB(70,205,255),RGB(214,120,255)},
    {RGB(139,69,0),RGB(172,35,29),RGB(40,104,30),RGB(0,96,132),RGB(117,49,148)}
};
#define PART_COL PART_COLOURS[ui_theme_light]
/* Bass slots are not named 303: Chicago is the 303 engine, Miami is not. Shown names follow the engine (part_name). */
static const char *const PART_N[NPARTS] = {"909", "808", "BASS A", "BASS B", "BREAK"};
/* Presentation only: drums together, then the default Chicago B / Miami A.
 * Project lanes, MIDI channels, engine buses and all saved arrays keep their IDs.
 * Engine changes never move a physical strip or a held gesture's destination. */
static const uint8_t PART_ORDER[NPARTS] = {PART_909, PART_808, PART_BRK, PART_303B, PART_303A};
static int part_is_drum(int part) { return part == PART_909 || part == PART_808; }
static int part_is_303(int part) { return part == PART_303A || part == PART_303B; }
static int part_at(int position) { return PART_ORDER[position]; }
static int part_position(int part)
{
    for (int i = 0; i < NPARTS; i++) if (part_at(i) == part) return i;
    return 0;
}
static int part_neighbor(int part, int direction)
{
    int position = part_position(part) + direction;
    return part_at(position < 0 ? 0 : position >= NPARTS ? NPARTS - 1 : position);
}
/* Lane labels: PART_N except BREAK → BRK (4 chars). Beats a second 5-pointer table. */
#if X0X_BASS_PRESET_PREVIEW
static const char *bass_display_name(int bank,int other,int voice)
{
    if (bank == ORIGINAL_SOUND_JUNO) return bank == other ? (voice?"JUNO B":"JUNO A"):"JUNO";
    if (bank == ORIGINAL_SOUND_DRONE) return bank == other ?
        (voice ? "DRONE B" : "DRONE A") : "DRONE";
    if(bank==other) return bank?(voice?"MIAMI B":"MIAMI A"):(voice?"CHICAGO B":"CHICAGO A");
    return bank?"MIAMI":"CHICAGO";
}
#endif
static const char *part_display(int part)
{
#if X0X_BASS_PRESET_PREVIEW
    if (part_is_303(part)) {
        int voice=part-PART_303A;
#if X0X_BASS_TAGGED_SOUND
        if(engine_bass_sound_bank(&proj.sound,voice)<0)return "CHOOSE ENGINE";
#endif
        return bass_display_name(engine_bass_bank(voice),engine_bass_bank(1-voice),voice);
    }
#endif
    return PART_N[part];
}
/* A part's shown name uses the synth slot's actual engine kind. */
static const char *part_name(int part)
{
#if X0X_BASS_PRESET_PREVIEW
    if (part_is_303(part)) {
        int voice=part-PART_303A;
#if X0X_BASS_TAGGED_SOUND
        if(engine_bass_sound_bank(&proj.sound,voice)<0)return PART_N[part];
#endif
        return bass_display_name(engine_bass_bank(voice),engine_bass_bank(1-voice),voice);
    }
#endif
    return PART_N[part];
}
static const char *part_s(int i)
{
#if X0X_BASS_PRESET_PREVIEW
    if (part_is_303(i)) {
        int v=i-PART_303A,b=engine_bass_bank(v);
#if X0X_BASS_TAGGED_SOUND
        if(engine_bass_sound_bank(&proj.sound,v)<0)return "?";
#endif
        if (b == ORIGINAL_SOUND_JUNO) return b == engine_bass_bank(1-v)?(v?"JU-B":"JU-A"):"JUN";
        if (b == ORIGINAL_SOUND_DRONE) return b == engine_bass_bank(1-v) ?
            (v ? "DR-B" : "DR-A") : "DRN";
        if(b==engine_bass_bank(1-v)) return b?(v?"MI-B":"MI-A"):(v?"CH-B":"CH-A");
        return b?"MIA":"CHI";
    }
#endif
    return i==PART_BRK?"BRK":PART_N[i];
}

/* overlays drawn over the main area */
enum { O_NONE, O_LIST, O_ASK };
enum { ACT_NONE, ACT_SAVE, ACT_LOAD, ACT_CLEAR_PART, ACT_CLEAR_PAT, ACT_COPY, ACT_RESET, ACT_ABOUT, ACT_SONG_INS,
       ACT_SONG_DEL, ACT_SONG_CLR, ACT_PERF, ACT_PERF_TEST,
#if BOARD_SMK37 && X0X_DEV_PADCAL
       ACT_PADCAL,
#endif
       ACT_RESET_SOUND,
};

typedef struct {
    uint8_t view, part, prev_view;
    uint8_t sel[NKIT];
    uint8_t page[NVIEWS][NPARTS];
    uint8_t spage;                     /* the 16 steps the white keys show: 0 = 1-16 .. 3 = 49-64 */
    uint8_t pbank;                     /* the 16 patterns HOME's white keys choose: 0 = 1-16, 1 = 17-32 */
    uint8_t mixsel;                    /* MIX's PARTS: the part the knobs set (black keys 1-5) */
    int8_t oct;
    uint8_t rec;
    uint8_t freeplay[NBASS];           /* SEQ > FREE PLAY: the keys play the 303, nothing written (not saved) */
    uint8_t wpos[NBASS];
    int8_t held_step;
    uint8_t held_step_part, held_step_pat; /* owner at key-down; a pattern can change before key-up */
    uint8_t step_edited;
    uint8_t paste_src[NPARTS];        /* source slots chosen with a paste target; stable through confirmation */
    uint8_t step_preview;              /* the held step is sounding (only while stopped) */
    uint8_t step_created;              /* the press turned the held step on (its release keeps it) */
    int8_t brk_held;                   /* BREAK: the white key (16th) held, -1 none */
    int8_t hold_step;                  /* a drum machine: the step (white key) held, -1 none */
    uint8_t hold_drum, hold_pat;       /* kit/track and pattern at key-down; navigation cannot retarget its release */
    uint8_t hold_created, hold_used;   /* drums / BREAK: the press turned the step on; a knob or a slice used it */
    int8_t chain_first;
    int8_t touched;                    /* knob cell being turned (4 = tempo), -1 none */
    uint8_t touch_view, touch_part, touch_page;
    uint8_t touch_kind, touch_a, touch_b, touch_c; /* exact edited ref for overlays */
    uint32_t step_t0;                  /* when the held 303 step went down: a tap toggles, a hold does not */
    uint32_t hold_t0;                  /* when it went down (a tap takes an old step off) */
    uint8_t brk_page, brk_count_target;
    uint16_t brk_localkeys;
    uint16_t brk_pinkeys;              /* BREAK: black keys used to give a held step its slice (their release is not live) */
    uint8_t gen_stale[NBASS];          /* TB-3PO's knobs changed since the line was written */
    uint32_t btn, keys, btn_used;
    uint32_t enc_t[NE];
    uint8_t enc_run[NE];               /* quick detents in a row (acceleration waits for a spin) */
    char msg[64];                      /* ABOUT long line includes the diagnostic source SHA */
    uint32_t msg_until;
    uint32_t touch_until;
    uint8_t overlay;
    uint8_t list_sel, list_top, list_n;
    int8_t glo_section; /* -1: section index; local navigation, never project state */
    uint8_t glo_index, glo_sel[6], glo_top[6];
    uint8_t ask_act;
    uint8_t ask_overlay;
    uint16_t ask_arg;
    char ask_q[2][28];
    uint32_t frame;
    uint32_t dirty;
    uint32_t act_t;                    /* the last time anything was touched (autosave waits for quiet) */
    uint32_t saved_t;                  /* the last autosave */
    uint8_t last_autosave;             /* AUTOSAVE was just switched off: one more, which keeps that */
    uint8_t save_failed;               /* a failed write stays visible until a save succeeds */
    uint8_t help;                      /* the help card on screen: its button + 1, 0 none */
    uint32_t down_t[NB];               /* when each button went down */
    uint32_t turn_t;                   /* the last encoder turn */
    uint8_t outline[232];              /* the break loop's outline */
    uint8_t outline_ok, outline_slot;
    uint8_t song_sel;                  /* the SONG screen's bar */
} ui_t;
static ui_t ui X0X_POOL;
/* A remote engine edit refreshes the parameter layout without changing the
 * keyboard's remembered page. Keep a SOUND-page selection effective across the
 * asynchronous bank change; only physical keyboard input accepts the new page. */
static uint8_t bass_layout_pending_mask, bass_layout_on_sound_page;
static void bass_layout_note_remote_edit(int voice);
static void bass_layout_accept(void);
/* SMC is a presentation layer; its implementation follows this file in the unity build. */
void smc_ui_cancel(void);
int smc_ui_active(void);
void smc_ui_draw(void);
void smc_ui_clip_show(int n, const char *name, const char *value);
static uint8_t any_button;             /* a button has been pressed since power-on (the footer's first line) */
#define FOOT_GAP 7                     /* between the footer's parts */
static uint16_t footer_text(const char **a, const char **b, const char **c);
static int division_pad_owner(void);
static int division_pad_index(void);
static const char *division_pad_label(void);

/* something the project keeps changed: SAVE (or the autosave) has work to do */
static void mark_dirty(void) { ui.dirty = 1; }

static uint8_t save_wait;
static void live_boundary(int entry);
static void keyboard_panic_reset(uint32_t btn);
static uint8_t project_busy, project_revision;
/* Per-pattern recall observations belong to the currently adopted engine state. */
static uint8_t pattern_sound_seen_pat[NBASS] = {0xFF, 0xFF}, pattern_sound_seen_val[NBASS];
static uint32_t pattern_sound_seen_epoch[NBASS];
static uint32_t song_structure_revision; /* runtime identity epoch for frozen song-bar controls */
int ui_project_busy(void) { return project_busy != 0; }
X0X_COLD static void project_input_sync(void)
{
    int i;
    ui.btn = ui.btn_used = plat_buttons();
    keyboard_panic_reset(ui.btn);
    ui.keys = plat_keys();
    for (i = 0; i < NE; i++) {
        (void)plat_enc(i);
        ui.enc_run[i] = 0;
    }
    /* Project end still owns project_busy here: revoke the old physical epoch
     * and suppress keys held across the transfer before input is enabled. */
    live_boundary(0);
}
enum { SAVE_SAVED, SAVE_UNSAVED, SAVE_QUEUED, SAVE_FAILED };
static int save_state(void)
{
    if (project_storage_unsupported() == 2)
        return SAVE_FAILED;
    if (save_wait)
        return SAVE_QUEUED;
    if (ui.save_failed)
        return SAVE_FAILED;
    return ui.dirty ? SAVE_UNSAVED : SAVE_SAVED;
}
static const char *queued_save_label(void)
{
    if (!seq.playing && !seq.req_start && !seq.req_cont && !seq.req_stop)
        return ui.rec ? "REC OFF TO SAVE" : "SAVE WHEN QUIET";
    return "SAVE AT STOP";
}
static const char *queued_save_message(void)
{
    if (!seq.playing && !seq.req_start && !seq.req_cont && !seq.req_stop)
        return ui.rec ? "REC OFF TO SAVE" : "SAVES WHEN QUIET";
    return "SAVES WHEN STOPPED";
}

/* the encoders, read for the UI: a turn counts as being touched (the autosave waits for quiet) */
static int32_t enc(int role)
{
    int32_t v = plat_enc(role);
    if (v) {
        bass_layout_accept();
#if BOARD_SMK37
        smc_ui_cancel();
#endif
        ui.act_t = ui.turn_t = plat_ms();
    }
    return v;
}

/* PERF (the performance screen and its test; see "performance" below) */
enum { PT_IDLE = -1, PT_DONE = 3 };
static struct {
    uint32_t t_ms, ticks, cyc, frames, prof[ENG_PROF_N], st[3];
    uint16_t mhz10;                    /* the CPU clock x 10; 0 = not known (no cycle counter) */
    uint8_t load, peak, stalls_on, have;
    uint16_t stage[ENG_PROF_N];        /* each stage's share of the CPU, x 10 (%) */
    uint16_t cps;                      /* the render's cycles per sample (cycle counter only) */
    uint8_t stall[3];                  /* fetch / read / write stall cycles, % */
    int8_t test, phase;                /* test: PT_IDLE, a scenario 0..2, PT_DONE (when phase is 4);
                                        * phase: 0 stop, 1 settle, 2 measure, 3 put back, 4 done */
    uint32_t test_t0;
    uint16_t res_load[3], res_cps[3];  /* per scenario: the render's share x 10, cycles per sample */
    uint8_t res_peak[3];
    pattern_t *pat;                    /* what the test changes, to put back */
    uint8_t ppat[NPARTS], song_on, ca, cb;
    uint32_t mute;
    float bpm;
} perf = {.test = PT_IDLE};

static pattern_t *pat_of(int part) { return &proj.pat[seq.ppat[part]]; }
static pattern_t *cur_pat(void) { return pat_of(ui.part); }    /* the pattern the part on screen plays */
static int part_view(void) { return ui.view == V_PART || ui.view == V_SEQ || ui.view == V_GEN; }
static int steps_view(void) { return ui.view == V_PART || ui.view == V_SEQ; }
static song_t *song(void) { return &proj.arr.song; }
static int is_303(void) { return part_is_303(ui.part); }
static int is_drum(void) { return part_is_drum(ui.part); }
static int bidx(void) { return ui.part == PART_303B ? 1 : 0; }
static int kbd_on(void) { return is_303() && (ui.view == V_PART || ui.rec || ui.freeplay[bidx()]); }
static uint8_t kbd_held_note[NBASS];
static uint8_t bass_rec_step[NBASS];                 /* recorded source step + 1; zero means none */
static uint8_t bass_rec_pat[NBASS], bass_rec_playing[NBASS];
static uint8_t kbd_held_key[NBASS];                  /* physical key + 1; survives octave and part changes */
/* Original owners receive each physical key, independently of native voice allocation. */
#define UI_BASS_HELD_MAX 37u
static uint8_t kbd_arp_key[NBASS][UI_BASS_HELD_MAX] X0X_POOL;     /* physical key + 1 */
static uint8_t kbd_arp_note[NBASS][UI_BASS_HELD_MAX] X0X_POOL;
static uint8_t kbd_arp_n[NBASS] X0X_POOL;
static int chi_arp_on_part(int b)
{
    (void)b; return 0; /* native owner receives every key; no external ARP */
}
static int held_note_of(const bpart_t *bp, int s);
static void bass_step_cancel(void);
static void drum_step_cancel(void);

/* ============================================================ text helpers === */
static char *put_s(char *b, const char *s)
{
    while (*s)
        *b++ = *s++;
    *b = 0;
    return b;
}
static char *put_i(char *b, int v)
{
    char t[12];
    int n = 0, neg = v < 0;
    uint32_t u = (uint32_t)(neg ? -v : v);
    do {
        t[n++] = (char)('0' + u % 10u);
        u /= 10u;
    } while (u);
    if (neg)
        *b++ = '-';
    while (n)
        *b++ = t[--n];
    *b = 0;
    return b;
}
#define NOTE_N X0X_NOTE_N                      /* same twelve names as clip ROOT / chord spell */
static char *put_note(char *b, int n)
{
    b = put_s(b, NOTE_N[(n % 12 + 12) % 12]);
    return put_i(b, n / 12 - 1);
}
static char *put_hex(char *b, uint32_t v, int digits)
{
    int i;
    for (i = digits - 1; i >= 0; i--)
        *b++ = "0123456789ABCDEF"[(v >> (4 * i)) & 15u];
    *b = 0;
    return b;
}

static void say(const char *a, const char *b)
{
    char *q = put_s(ui.msg, a);
    if (b)
        put_s(q, b);
    ui.msg_until = plat_ms() + 1300u;
}

/* =============================================================== param refs === */
enum { R_NONE, R_ENG, R_SWING, R_DLEN, R_DRATE, R_BLEN, R_BRATE, R_BDIR, R_BTRANS, R_GEN, R_BRKSET,
       R_BRKSLICE, R_BRKSLOT, R_TEMPO, R_ACCENT, R_CLKOUT, R_NOTEOUT, R_PALETTE, R_KEYLED, R_KEYSOUND, R_AUTOSAVE, R_ACT, R_SBAR, R_SPAT,
       R_SLEN, R_STALLS, R_HDR, R_TAPE, R_MIDICH, R_OUTLOUD, R_SREP, R_BATT, R_USBFULL, R_FREEPLAY,
       R_BT, R_BTSTAT, R_BTNAME, R_CKCH, R_CLKSRC, R_SMC_ROLE, R_SMC_MAP, R_BENGINE, R_BPRESET, R_BSTATUS, R_SECTION, R_PARTON, R_FINETUNE, R_QUEUEMUTE, R_BRKRATE, R_BPATSND, R_NOTELOCK };   /* R_TAPE: FX's one-knob TAPE (DIGI .. worn tape) */          /* R_HDR: a list's section header (a = its group), never selected */
typedef struct { uint8_t kind, a, b, c; } pref_t;
#define PR(k, a, b, c) ((pref_t){(k), (a), (b), (c)})
#define NONE PR(R_NONE, 0, 0, 0)

static const char *const GLOBAL_SECTIONS[6] = {"MIDI + CLOCK", "BLUETOOTH", "AUDIO", "KEYS + SCREEN", "PROJECT", "SYSTEM"};
static ui_original_control_cache original_controls X0X_POOL;
static ui_original_wave_cache original_wave X0X_POOL;   /* engine waveform cue (ca8299b6 / 9e237cce) */
static uint8_t original_page_bank, original_list_bank;
static int original_display_value(pref_t r);
static const ui_original_control_view *original_text_view(pref_t r, int value);
static void build_pages(void);
static const char *const BENGINE_N[] = {"CHICAGO", "MIAMI", "DRONE", "JUNO"};
static const x0x_param_t BENGINE_P = {"ENGINE",3,0,BENGINE_N};
static x0x_param_t BPRESET_P = {"PRESET",54,0,0};
static const x0x_param_t BSTATUS_P = {"STATUS",0,0,0};
/* per-pattern preset recall (owner 2026-11-12 02:42): 0 OFF, else the preset number in the
 * part's current engine. Codes 1..81=Chicago, 129..158=Miami and
 * 193..196=Drone. Reuse the original pattern byte without migration. */
static x0x_param_t PATSND_P = {"PAT SOUND",54,0,0};

static const char *const RATE_N[] = {"1/16", "1/16T", "1/32", "1/8T", "1/8", "1/4"};   /* M13: index = pattern.h RATE_* */
static const char *const BRK_RATE_N[] = {"1/16", "1/8", "1/4"};   /* M13: BREAK groups 16ths; stored as RATE_16/8/4 */
static const char *const DIR_N[] = {"FWD", "REV", "PING", "RND"};
static const char *const ONOFF_N[] = {"OFF", "ON"};
#define ROOT_N NOTE_N                       /* same twelve names as put_note */
static const char *const THEME_N[] = {"GREEN", "AMBER", "CYAN", "RED", "MONO", "LIGHT"};
enum { G_DENS, G_ACC, G_SLIDE, G_OCTS, G_ROOT, G_SCALE, G_BASE, G_MUT, NGEN };
static const x0x_param_t GEN_P[NGEN] = {
    {"DENS", 100, 70, 0}, {"ACCENT", 100, 40, 0}, {"SLIDE", 100, 25, 0}, {"OCTS", 2, 1, 0},
    {"ROOT", 11, 9, ROOT_N}, {"SCALE", TB3PO_NSCALES - 1, 0, TB3PO_SCALE_NAMES}, {"OCTAVE", 4, 1, 0},
    {"MUTATE", 16, 0, 0},
};
enum { SQ_SWING, SQ_DLEN, SQ_DRATE, SQ_BLEN, SQ_BRATE, SQ_BDIR, SQ_BTRANS, SQ_TEMPO, SQ_ACCENT, SQ_CLK, SQ_NOTES,
       SQ_THEME, SQ_KEYLED, SQ_KEYSOUND, SQ_AUTOSAVE, NSQ };
static const char *const KEYSOUND_N[] = {"STOPPED", "ALWAYS"};
static const char *const LIGHTS_N[] = {"OFF", "ON", "KEYS"};   /* ON: the keys, and the unlit buttons glow */
static const x0x_param_t SEQ_P[NSQ] = {
    {"SWING", 100, 0, 0}, {"LENGTH", NSTEPS - 1, 15, 0}, {"RATE", NRATES - 1, 0, RATE_N}, {"LENGTH", NSTEPS - 1, 15, 0},
    {"RATE", NRATES - 1, 0, RATE_N}, {"DIR", 3, 0, DIR_N}, {"TRANSP", 48, 24, 0}, {"TEMPO", 255, 105, 0},
    {"ACCENT", 127, 88, 0}, {"CLOCK OUT", 1, 1, ONOFF_N}, {"NOTES OUT", 1, 0, ONOFF_N}, {"THEME", 5, 1, THEME_N},
    {"LIGHTS", 2, 1, LIGHTS_N}, {"KEY SOUND", 1, 0, KEYSOUND_N},
    {"AUTOSAVE", 1, 1, ONOFF_N},
};
static const x0x_param_t ACT_P[] = {
    {"", 0, 0, 0}, {"SAVE PROJECT", 0, 0, 0}, {"LOAD SAVED", 0, 0, 0},
    {"CLEAR THIS PART", 0, 0, 0}, {"CLEAR PATTERN", 0, 0, 0},
    {"COPY PATTERN", 0, 0, 0}, {"RESET PROJECT", 0, 0, 0}, {"ABOUT DnBOX", 0, 0, 0}, {"INSERT BAR", 0, 0, 0},
    {"DELETE BAR", 0, 0, 0}, {"CLEAR SONG", 0, 0, 0}, {"PERFORMANCE", 0, 0, 0}, {"RUN PERF TEST", 0, 0, 0},
#if BOARD_SMK37 && X0X_DEV_PADCAL
    {"PAD COLOURS", 0, 0, 0},
#endif
};
static const x0x_param_t STALLS_P = {"STALLS", 1, 0, ONOFF_N};
static const x0x_param_t MIDICH_P[NPARTS] = {   /* 0 = OFF (no notes in or out), 1-16 */
    {"909 MIDI CH", 16, 10, 0}, {"808 MIDI CH", 16, 11, 0}, {"BASS A MIDI CH", 16, 2, 0}, {"BASS B MIDI CH", 16, 3, 0},
    {"BREAK MIDI CH", 16, 4, 0}};
/* M7: per-part ON/OFF (seq.part_off). OFF stops new notes, independent of mute and level. */
static const x0x_param_t NOTELOCK_P = {"NOTE LOCK", 1, 0, ONOFF_N};   /* runtime; capture only */
static const x0x_param_t PARTON_P[NPARTS] = {
    {"909", 1, 1, ONOFF_N}, {"808", 1, 1, ONOFF_N}, {"BASS A", 1, 1, ONOFF_N}, {"BASS B", 1, 1, ONOFF_N},
    {"BREAK", 1, 1, ONOFF_N}};
static const x0x_param_t QUEUEMUTE_P = {"QUEUE MUTES", 1, 0, ONOFF_N};
static const x0x_param_t BRKRATE_P = {"RATE", 2, 0, BRK_RATE_N};
static const char *const OUT_N[] = {"NORMAL", "LOUD"};
static const x0x_param_t OUT_P = {"OUTPUT", 1, 0, OUT_N};
static const char *const USBA_N[] = {"FOLLOWS KNOB", "FULL"};
static const x0x_param_t USBA_P = {"USB AUDIO", 1, 0, USBA_N};
static const x0x_param_t TUNE_P = {"TUNE", 127, 64, 0};  /* global, both bass engines; stored as signed 0-center */
static const x0x_param_t FREEPLAY_P = {"FREE PLAY", 1, 0, ONOFF_N};
static const char *const BRKSLICE_N[] = {"4", "8", "16", "32"};
static const x0x_param_t BRKSLICE_P[2] = {
    {"A SLICES", 3, 1, BRKSLICE_N}, {"B SLICES", 3, 1, BRKSLICE_N}
};
static const x0x_param_t SREP_P = {"REPEAT", 7, 0, 0};    /* the bar plays 1-8 times */
static const char *const BATT_N[] = {"EMPTY", "1/3", "2/3", "FULL", "USB POWER", "..."};
static const x0x_param_t BATT_P = {"BATTERY", 5, 0, BATT_N};   /* read only (plat_battery) */
#define BT_N ONOFF_N                                           /* same OFF/ON labels */
static const x0x_param_t BT_P = {"BLUETOOTH", 1, 0, BT_N};      /* Bluetooth MIDI (SMK-37) */
static const char *const SMC_ROLE_N[] = {"DEVICE", "SMC HOST"};
static const char *const SMC_MAP_N[] = {"DAW", "USER"};
static const x0x_param_t SMC_ROLE_P = {"BT ROLE", 1, 0, SMC_ROLE_N};
static const x0x_param_t SMC_MAP_P = {"SMC PRESET", 1, 0, SMC_MAP_N};
static const x0x_param_t CKCH_P = {"CLIP KEYS CH", 13, 0, 0};  /* clip mode keybed channel 2-15 (0 = 2) */
static const char *const CLKSRC_N[] = {"AUTO", "INTERNAL", "EXTERNAL"};   /* SEQ_CLK_* order */
static const x0x_param_t CLKSRC_P = {"CLOCK SOURCE", 2, 0, CLKSRC_N};
static const char *const BTSTAT_N[] = {"NO IMAGE", "OFF", "RESTART", "STARTING", "READY", "CONNECTED",
                                       "FAILED", "BAD IMAGE"};   /* PLAT_BLE_* order */
static const x0x_param_t BTSTAT_P = {"STATUS", 7, 0, BTSTAT_N};   /* read only (plat_ble_state) */
static const x0x_param_t SONG_P[] = {
    {"909", NPAT - 1, 0, 0}, {"808", NPAT - 1, 0, 0}, {"BASS A", NPAT - 1, 0, 0}, {"BASS B", NPAT - 1, 0, 0},
    {"BREAK", NPAT - 1, 0, 0},
    {"LENGTH", NSONG, 0, 0},
};

static int pref_read_only(pref_t r)
{
    if (r.kind == R_BSTATUS) return 1;
    if (r.kind == R_BPRESET && !original_runtime_kind_available(engine_bass_requested_bank(r.b))) return 1;
    if (r.kind == R_ENG && r.a == T_303 &&
        !original_runtime_kind_available(engine_bass_bank(r.b))) return 1;
    if (r.kind == R_ENG && r.a == T_303 && original_sound_is_performance(
        (unsigned)engine_bass_sound_bank(&proj.sound,r.b),r.c)) return 1;
    return r.kind == R_BATT || r.kind == R_BTSTAT || r.kind == R_BTNAME;
}

/* the song's bar k exists from here on: a new bar repeats the one before (the first: what plays) */
static void song_fill(int k)
{
    song_t *sg = song();
    if (sg->len <= k && sg->len < NSONG) song_structure_revision++;
    while (sg->len <= k && sg->len < NSONG) {
        song_bar_t *b = &sg->bar[sg->len];
        int p;
        if (sg->len)
            *b = sg->bar[sg->len - 1];
        else {
            for (p = 0; p < NPARTS; p++)
                b->pat[p] = seq.ppat[p];
            b->mute = 0;
        }
        sg->len++;
    }
}

static const x0x_param_t *pref_desc(pref_t r)
{
    switch (r.kind) {
    case R_BENGINE: return &BENGINE_P;
    case R_BPRESET:
        BPRESET_P.max = (uint8_t)(original_sound_factories((unsigned)engine_bass_requested_bank(r.b))-1);
        return &BPRESET_P;
    case R_BSTATUS: return &BSTATUS_P;
    case R_BPATSND:
        PATSND_P.max = (uint8_t)original_sound_factories((unsigned)engine_bass_requested_bank(r.b));
        return &PATSND_P;
    case R_NOTELOCK: return &NOTELOCK_P;
    case R_ENG: return engine_param(r.a, r.b, r.c);
    case R_GEN: return &GEN_P[r.c % NGEN];
    case R_BRKSET: return breaks_param(r.c);
    case R_SWING: return &SEQ_P[SQ_SWING];
    case R_DLEN: return &SEQ_P[SQ_DLEN];
    case R_DRATE: return &SEQ_P[SQ_DRATE];
    case R_BLEN: return &SEQ_P[SQ_BLEN];
    case R_BRATE: return &SEQ_P[SQ_BRATE];
    case R_BDIR: return &SEQ_P[SQ_BDIR];
    case R_BTRANS: return &SEQ_P[SQ_BTRANS];
    case R_BRKSLICE: return &BRKSLICE_P[r.a != 0];
    case R_BRKSLOT: {
        static x0x_param_t d = {"LOOP", 0, 0, 0};
        static const char *none[] = {"none"};
        int n = engine_brk_nslots();
        d.max = n ? (uint8_t)(n - 1) : 0;
        d.names = n ? engine_brk_slot_names() : none;
        return &d;
    }
    case R_TEMPO: return &SEQ_P[SQ_TEMPO];
    case R_ACCENT: return &SEQ_P[SQ_ACCENT];
    case R_CLKOUT: return &SEQ_P[SQ_CLK];
    case R_NOTEOUT: return &SEQ_P[SQ_NOTES];
    case R_PALETTE: return &SEQ_P[SQ_THEME];
    case R_KEYLED: return &SEQ_P[SQ_KEYLED];
    case R_KEYSOUND: return &SEQ_P[SQ_KEYSOUND];
    case R_AUTOSAVE: return &SEQ_P[SQ_AUTOSAVE];
    case R_ACT: return &ACT_P[r.a];
    case R_SBAR: {
        static x0x_param_t d = {"BAR", 0, 0, 0};
        d.max = (uint8_t)(song()->len < NSONG ? song()->len : NSONG - 1);
        return &d;
    }
    case R_SPAT: return &SONG_P[r.a % NPARTS];
    case R_MIDICH: return &MIDICH_P[r.a % NPARTS];
    case R_PARTON: return &PARTON_P[r.a % NPARTS];
    case R_QUEUEMUTE: return &QUEUEMUTE_P;
    case R_BRKRATE: return &BRKRATE_P;
    case R_OUTLOUD: return &OUT_P;
    case R_USBFULL: return &USBA_P;
    case R_FINETUNE: return &TUNE_P;
    case R_FREEPLAY: return &FREEPLAY_P;
    case R_SREP: return &SREP_P;
    case R_BATT: return &BATT_P;
    case R_BT: return &BT_P;
    case R_SMC_ROLE: return &SMC_ROLE_P;
    case R_SMC_MAP: return &SMC_MAP_P;
    case R_CKCH: return &CKCH_P;
    case R_CLKSRC: return &CLKSRC_P;
    case R_BTSTAT: return &BTSTAT_P;
    case R_BTNAME: {                                   /* read only: the name it advertises */
        static const char *nm[1];
        static const x0x_param_t d = {"NAME", 0, 0, nm};
        nm[0] = plat_ble_name()[0] ? plat_ble_name() : "-";
        return &d;
    }
    case R_SLEN: return &SONG_P[5];
    case R_STALLS: return &STALLS_P;
    case R_TAPE: {
        static const x0x_param_t d = {"TAPE", 127, 72, 0};
        return &d;
    }
    default: return 0;
    }
}

/* SMC snapshots use the otherwise-unused b byte on pattern refs to bind an
 * exact pattern (index + 1). Ordinary panel refs keep b=0 and follow playback. */
static pattern_t *pref_pattern(pref_t r)
{
    if (r.kind == R_BRKRATE) return r.b ? &proj.pat[r.b - 1u] : cur_pat();
    if (r.kind < R_SWING || r.kind > R_BRKSLOT) return cur_pat();
    if (r.b) return &proj.pat[r.b - 1u];
    if (r.kind >= R_GEN) return cur_pat();
    return pat_of(r.kind == R_SWING ? PART_909 : r.kind == R_DLEN || r.kind == R_DRATE ? r.a : NKIT + r.a);
}

static int pref_get(pref_t r)
{
    pattern_t *p = pref_pattern(r);
    switch (r.kind) {
    case R_BENGINE: return engine_bass_requested_bank(r.b);
    case R_BPRESET: return engine_bass_requested_preset(r.b);
    case R_BSTATUS: return engine_bass_preset_pending(r.b) * 4 + engine_bass_status(r.b);
    case R_ENG: return proj.sound.v[r.a][r.b][r.c];
    case R_SWING: return p->swing;
    case R_DLEN: return p->drum[r.a].len - 1;
    case R_DRATE: return p->drum[r.a].rate;
    case R_BLEN: return p->bass[r.a].len - 1;
    case R_BRATE: return p->bass[r.a].rate;
    case R_BRKRATE: return p->brk.rate == RATE_8 ? 1 : p->brk.rate == RATE_4 ? 2 : 0;
    case R_BDIR: return p->bass[r.a].dir;
    case R_BTRANS: return p->bass[r.a].transpose;
    case R_GEN: {
        const tb3po_cfg_t *g = &p->bass[r.a].gen;
        switch (r.c) {
        case G_DENS: return g->density;
        case G_ACC: return g->accent;
        case G_SLIDE: return g->slide;
        case G_OCTS: return g->oct_range - 1;
        case G_ROOT: return g->root;
        case G_SCALE: return g->scale;
        case G_BASE: return g->base_oct;
        default: return g->mutate_bars;
        }
    }
    case R_BRKSET: return p->brk.set[r.c];
    case R_BRKSLOT: return r.a ? p->brk.slot_b : p->brk.slot_a;
    case R_BRKSLICE: { int code = (p->brk.slice_mode >> (r.a * 2)) & 3; return code < 2 ? code ^ 1 : code; }
    case R_TEMPO: return (int)(seq.bpm + 0.5f) - 20;
    case R_ACCENT: return seq.accent_q7;
    case R_CLKOUT: return seq.send_clock;
    case R_NOTEOUT: return seq.send_notes;
    case R_PALETTE: return proj.set.palette;
    case R_KEYLED: return proj.set.keyled;
    case R_KEYSOUND: return proj.set.keysound;
    case R_AUTOSAVE: return !proj.set.autosave_off;
    case R_SBAR: return ui.song_sel;
    case R_SPAT: {
        const song_t *sg = song();
        int bar = r.b ? r.b - 1u : ui.song_sel;
        int k = bar < sg->len ? bar : r.b ? -1 : sg->len - 1;
        return k >= 0 ? sg->bar[k].pat[r.a] : seq.ppat[r.a];
    }
    case R_MIDICH: return seq.ch[r.a % NPARTS] == SEQ_CH_OFF ? 0 : seq.ch[r.a % NPARTS] + 1;
    case R_PARTON: return !SEQ_PART_OFF(&seq, r.a % NPARTS);
    case R_QUEUEMUTE: return seq.queued_mutes;
    case R_BPATSND: {
        uint8_t ps = pat_of(PART_303A + (r.b & 1))->rsv[r.b & 1];
        unsigned bank, value;
        return bass_pattern_preset_decode(ps, &bank, &value) ? (int)value : 0;
    }
    case R_NOTELOCK: return engine_note_lock_capture_on();
    case R_OUTLOUD: return proj.set.out_loud;
    case R_USBFULL: return proj.set.usb_full;
    case R_FINETUNE: return PROJ_TUNE_OF(&proj.set) + 64;
    case R_FREEPLAY: return ui.freeplay[r.a];
    case R_SREP: {
        unsigned bar = r.b ? r.b - 1u : ui.song_sel;
        return bar < song()->len ? song()->bar[bar].mute >> 5 : 0;
    }
    case R_BATT: return plat_battery() < 0 ? 5 : plat_battery();
    case R_BT: return proj.set.bt & 1u;
    case R_SMC_ROLE: return !!(proj.set.bt & PROJ_BT_SMC_CENTRAL);
    case R_SMC_MAP: return !!(proj.set.bt & PROJ_BT_SMC_USER);
    case R_CKCH: return proj.set.ck_ch - 2;
    case R_CLKSRC: return PROJ_CLK_SRC(proj.set.bt);
    case R_BTSTAT: return plat_ble_state();
    case R_SLEN: return song()->len;
    case R_STALLS: return perf.stalls_on;
    case R_TAPE: return proj.sound.v[T_FX][1][0];       /* (kept in an engine slot nothing reads) */
    default: return 0;
    }
}

static void ui_restore_base(int target, int voice, int parameter)
{
    if (target == T_303) {
        if ((unsigned)voice < NBASS && original_sound_is_performance(
            (unsigned)engine_bass_bank(voice),(unsigned)parameter)) return;
        engine_set_base(target,voice,parameter); return;
    }
    engine_set(target,voice,parameter,proj.sound.v[target][voice][parameter]);
}

X0X_COLD static void pref_set_impl(pref_t r, int v, int from_keyboard)
{
#if X0X_BASS_PRESET_PREVIEW
    /* Freeze the active bank before reading its descriptor. The audio boundary
     * may otherwise replace Chicago with Miami between clamp and store. */
    int bass_edit = r.kind == R_ENG && r.a == T_303;
    if (bass_edit) engine_bass_edit_hold(1);
#endif
    pattern_t *p = pref_pattern(r);
    const x0x_param_t *d = pref_desc(r);
    if (!d || r.kind == R_ACT || pref_read_only(r)) {
#if X0X_BASS_PRESET_PREVIEW
        if (bass_edit) engine_bass_edit_hold(0);
#endif
        return;
    }
    v = v < 0 ? 0 : v > d->max ? d->max : v;
    if (r.kind == R_BENGINE || r.kind == R_BPRESET) {
        if (v == pref_get(r)) return;
        int bank = r.kind == R_BENGINE ? v : engine_bass_requested_bank(r.b);
        int preset = r.kind == R_BENGINE ? 0 : v;
        int rc = engine_bass_select_preset(r.b,bank,preset,&proj.sound);
        if (rc) {
            say(rc == -2 ? "ENGINE UNAVAILABLE" : rc == -4 ? "SOUND LOCKS OWN LANE" :
                rc == -5 ? "UNSUPPORTED SOUND" : "INVALID PRESET",0);
            return;
        }
        if (!from_keyboard) bass_layout_note_remote_edit(r.b);
        else bass_layout_accept();
        mark_dirty();
        if (from_keyboard) build_pages();
        return;
    }
    if (r.kind == R_BPATSND) {
        if (v && !original_runtime_kind_available(engine_bass_requested_bank(r.b))) {
            say("ENGINE UNAVAILABLE",0);
            return;
        }
        if (!v && !pat_of(PART_303A + (r.b & 1))->rsv[r.b & 1]) return;
    }
    mark_dirty();
    switch (r.kind) {
    case R_ENG:
        if (r.a == T_303) {
            if (!original_sound_set(proj.sound.v[T_303][r.b],r.c,(unsigned)v)) {
                say("INVALID SOUND",0); break;
            }
            engine_bass_sound_refresh(&proj.sound,r.b);
        } else
        proj.sound.v[r.a][r.b][r.c] = (uint8_t)v;
        engine_set(r.a, r.b, r.c, v);
        if (r.a == T_MST && r.c == MST_COMP1)          /* the macros: the details they set, for the list */
            master_comp1_pots(v, &proj.sound.v[T_MST][0][MST_THRESH], &proj.sound.v[T_MST][0][MST_RATIO],
                              &proj.sound.v[T_MST][0][MST_MAKEUP]);
        else if (r.a == T_MST && r.c == MST_DJF)
            master_djf_pots(v, &proj.sound.v[T_MST][0][MST_MODE], &proj.sound.v[T_MST][0][MST_CUTOFF]);
        break;
    case R_SWING: p->swing = (uint8_t)v; break;
    case R_DLEN: p->drum[r.a].len = (uint8_t)(v + 1); break;
    case R_DRATE: p->drum[r.a].rate = (uint8_t)v; break;
    case R_BLEN: p->bass[r.a].len = (uint8_t)(v + 1); break;
    case R_BRATE: p->bass[r.a].rate = (uint8_t)v; break;
    case R_BRKRATE: p->brk.rate = (uint8_t)(v == 1 ? RATE_8 : v == 2 ? RATE_4 : RATE_16); break;
    case R_BDIR: p->bass[r.a].dir = (uint8_t)v; break;
    case R_BTRANS: p->bass[r.a].transpose = (uint8_t)v; break;
    case R_GEN: {
        tb3po_cfg_t *g = &p->bass[r.a].gen;
        switch (r.c) {
        case G_DENS: g->density = (uint8_t)v; break;
        case G_ACC: g->accent = (uint8_t)v; break;
        case G_SLIDE: g->slide = (uint8_t)v; break;
        case G_OCTS: g->oct_range = (uint8_t)(v + 1); break;
        case G_ROOT: g->root = (uint8_t)v; break;
        case G_SCALE: g->scale = (uint8_t)v; break;
        case G_BASE: g->base_oct = (uint8_t)v; break;
        default: g->mutate_bars = (uint8_t)v; break;
        }
        if (r.c != G_MUT)                            /* the line stays: the settings are the next NEW / MUTATE's */
            ui.gen_stale[r.a] = 1;
        break;
    }
    case R_BRKSET: p->brk.set[r.c] = (uint8_t)v; break;
    case R_BRKSLICE: {
        ui.brk_count_target = (uint8_t)(r.a != 0);
        unsigned shift = r.a * 2u, code = v < 2 ? (unsigned)v ^ 1u : (unsigned)v;
        p->brk.slice_mode = (uint8_t)((p->brk.slice_mode & ~(3u << shift)) | (code << shift));
        if (!r.b || p == pat_of(PART_BRK)) engine_brk_loops();
        break;
    }
    case R_BRKSLOT:
        ui.brk_count_target = (uint8_t)(r.a != 0);
        if (r.a)
            p->brk.slot_b = (uint8_t)v;
        else
            p->brk.slot_a = (uint8_t)v;
        if (!r.b || p == pat_of(PART_BRK)) engine_brk_loops();
        ui.outline_ok = 0;
        break;
    case R_TEMPO: seq.bpm = (float)(v + 20); break;
    case R_ACCENT: seq.accent_q7 = (uint8_t)v; break;
    case R_CLKOUT: seq.send_clock = (uint8_t)v; break;
    case R_NOTEOUT: seq.send_notes = (uint8_t)v; break;
    case R_PALETTE: proj.set.palette = (uint8_t)v; palette_set((uint32_t)v); break;
    case R_KEYLED: proj.set.keyled = (uint8_t)v; break;
    case R_KEYSOUND: proj.set.keysound = (uint8_t)v; break;
    case R_AUTOSAVE: proj.set.autosave_off = (uint8_t)!v; ui.last_autosave = (uint8_t)!v; break;
    case R_SBAR: ui.song_sel = (uint8_t)v; break;
    case R_SPAT: {
        unsigned bar = r.b ? r.b - 1u : ui.song_sel;
        if (r.b && bar >= song()->len) break; /* a deleted locked bar stays deleted */
        song_fill((int)bar);
        song()->bar[bar].pat[r.a] = (uint8_t)v;
        break;
    }
    case R_MIDICH: seq.ch[r.a % NPARTS] = (uint8_t)(v ? v - 1 : SEQ_CH_OFF); break;
    case R_PARTON: seq.part_off = (uint8_t)(v ? seq.part_off & ~(1u << (r.a % NPARTS)) : seq.part_off | 1u << (r.a % NPARTS)); break;
    case R_QUEUEMUTE:
        PROJ_SET_QMUTE(&proj.set, v);
        seq.queued_mutes = (uint8_t)PROJ_QMUTE_OF(&proj.set);
        break;
    case R_BPATSND: {
        unsigned bank = (unsigned)engine_bass_requested_bank(r.b);
        pat_of(PART_303A + (r.b & 1))->rsv[r.b & 1] =
            (uint8_t)bass_pattern_preset_encode(bank, (unsigned)v);
        break;
    }
    case R_NOTELOCK: engine_note_lock_capture(v); break;
    case R_OUTLOUD: proj.set.out_loud = (uint8_t)v; engine_out_loud(v); break;
    case R_USBFULL: proj.set.usb_full = (uint8_t)v; engine_usb_full(v); break;
    case R_FINETUNE: PROJ_SET_TUNE(&proj.set, v - 64); engine_bass_tune(v - 64); break;
    case R_CKCH: proj.set.ck_ch = (uint8_t)(v + 2); break;   /* sounding notes end on their own channel */
    case R_CLKSRC:                                            /* (ui_frame gives it to the sequencer) */
        proj.set.bt = (uint8_t)((proj.set.bt & ~PROJ_BT_CLK_MASK) | (uint8_t)v << 1 | PROJ_BT_CLK_IN);
        break;
    case R_BT:
        project_device_bt_set(v > 0);
        plat_ble_set(v > 0);
        if (plat_ble_state() == PLAT_BLE_RESTART)
            say("RESTART TO TURN ON", 0);             /* the controller starts only at power-on */
        else if (project_device_bt_pending()) say("BT SAVE PENDING", 0);
        break;
    case R_SMC_ROLE:
        project_device_roles_set(PROJ_BT_SMC_CENTRAL, v ? PROJ_BT_SMC_CENTRAL : 0u);
        say(v ? "BLUETOOTH HOST" : "BLUETOOTH DEVICE", 0);
        break;
    case R_SMC_MAP:
        project_device_roles_set(PROJ_BT_SMC_USER, v ? PROJ_BT_SMC_USER : 0u);
        say(v ? "USER: CH16 + MMC" : "DAW: MACKIE MODE", 0);
        break;
    case R_FREEPLAY:
        if (v && ui.part == PART_303A + r.a)
            bass_step_cancel();                       /* the held step must not become a held keyboard note */
        ui.freeplay[r.a] = (uint8_t)v;
        if (!v && (kbd_held_note[r.a] || kbd_arp_n[r.a])) { /* a key still down: let it go */
            engine_bass_off(r.a);
            kbd_held_note[r.a] = 0;
            kbd_held_key[r.a] = 0;
            kbd_arp_n[r.a] = 0;
        }
        break;
    case R_SREP: {
        unsigned bar = r.b ? r.b - 1u : ui.song_sel;
        if (bar < NSONG && (!r.b || bar < song()->len)) {
            song_fill((int)bar);
            song_bar_t *b = &song()->bar[bar];
            b->mute = (uint8_t)((b->mute & 0x1Fu) | v << 5);
        }
        break;
    }
    case R_TAPE: {                                    /* 0..15 the clean digital delay; above, tape, wearing */
        uint8_t ty = (uint8_t)(v >= 16), we = (uint8_t)(ty ? (v - 16) * 127 / 111 : proj.sound.v[T_FX][0][FX_DL_WEAR]);
        proj.sound.v[T_FX][1][0] = (uint8_t)v;
        proj.sound.v[T_FX][0][FX_DL_TYPE] = ty;
        proj.sound.v[T_FX][0][FX_DL_WEAR] = we;
        engine_set(T_FX, 0, FX_DL_TYPE, ty);
        engine_set(T_FX, 0, FX_DL_WEAR, we);
        break;
    }
    case R_STALLS:
        perf.stalls_on = (uint8_t)v;
        plat_stalls_enable(v);
        perf.have = 0;                                /* the next window starts the counts again */
        break;
    case R_SLEN:
        if (v != song()->len) song_structure_revision++;
        if (v > song()->len)
            song_fill(v - 1);
        else
            song()->len = (uint16_t)v;
        if (ui.song_sel > song()->len)
            ui.song_sel = (uint8_t)(song()->len < NSONG ? song()->len : NSONG - 1);
        break;
    default: break;
    }
#if X0X_BASS_PRESET_PREVIEW
    if (bass_edit) engine_bass_edit_hold(0);
#endif
}
static void pref_set(pref_t r, int v) { pref_set_impl(r, v, 1); }


/* a name in capitals (the engines' own are mixed case): two at a time */
static const char *caps_of(const char *n)
{
    static char t[2][24];
    static int w;
    char *q = t[w ^= 1];
    int i;
    for (i = 0; n[i] && i < 23; i++) {
        int brand_n = i > 0 && n[i-1]=='D' && n[i]=='n' && n[i+1]=='B' && n[i+2]=='O' && n[i+3]=='X';
        q[i] = !brand_n && n[i] >= 'a' && n[i] <= 'z' ? (char)(n[i] - 32) : n[i];
    }
    q[i] = 0;
    return q;
}

/* the value belongs to the pattern (it changes when the pattern does), not to the sound */
static int in_pattern(pref_t r)
{
    switch (r.kind) {
    case R_SWING: case R_DLEN: case R_DRATE: case R_BLEN: case R_BRATE: case R_BDIR: case R_BTRANS: case R_GEN:
    case R_BRKSET: case R_BRKSLOT: case R_BRKSLICE: case R_BRKRATE: case R_BPATSND:
        return 1;
    default:
        return 0;
    }
}

/* a knob's label: mixer refs name their part */
static const char *pref_name(pref_t r)
{
    if(r.kind==R_SECTION)return GLOBAL_SECTIONS[r.a<6?r.a:0];
    if ((r.kind == R_PARTON || r.kind == R_SPAT) && part_is_303(r.a % NPARTS))
        return part_name(r.a % NPARTS);                /* the engine, never "303" for Miami */
    if (r.kind == R_MIDICH && part_is_303(r.a % NPARTS)) {
        static char t[24];
        put_s(put_s(t, part_name(r.a % NPARTS)), " MIDI CH");
        return t;
    }
    static const char *const MIXN[NPARTS][MX_NPARAMS] = {{"909", "909 RV", "909 DL", "909 PAN", "909 CUT"},
                                                         {"808", "808 RV", "808 DL", "808 PAN", "808 CUT"},
                                                         {"BASS A", "A REV", "A DLY", "A PAN", "A CUT"},
                                                         {"BASS B", "B REV", "B DLY", "B PAN", "B CUT"},
                                                         {"BREAK", "BRK RV", "BRK DL", "BRK PAN", "BRK CUT"}};
    static const char *const PATN[6][2] = {{"909 LEN", "808 LEN"}, {"909 RATE", "808 RATE"}, {"A LEN", "B LEN"},
                                           {"A RATE", "B RATE"}, {"A DIR", "B DIR"}, {"A TRANSP", "B TRANSP"}};
    static const char *const CHN[MX_NPARAMS] = {"LEVEL", "REV", "DLY", "PAN", "CUT"};
    const x0x_param_t *d = pref_desc(r);
    static const char *const SEQN[6] = {"LENGTH", "RATE", "LENGTH", "RATE", "DIRECTION", "TRANSP"};
    if (r.kind == R_ENG && r.a == T_303)
        return ui_original_name((unsigned)engine_bass_sound_bank(&proj.sound,r.b),r.c);
    if (r.kind >= R_DLEN && r.kind <= R_BTRANS)       /* SEQ: the part's own; a list elsewhere: whose */
        return ui.view == V_SEQ ? SEQN[r.kind - R_DLEN] : PATN[r.kind - R_DLEN][r.a & 1];
    if (r.kind == R_ENG && r.a == T_MIX && ui.view == V_MIX && r.c < MX_NPARAMS)
        return CHN[r.c];                               /* MIX's PARTS: the picked part's */
    if (r.kind == R_ENG && (r.a == T_909 || r.a == T_808) && r.b == NDRUM && r.c == 1)
        return "ACCENT";                               /* the kits' depth of accents */
    if (r.kind == R_ENG && r.a == T_MIX && r.b < NPARTS && r.c == 0 && part_is_303(r.b))
        return part_name(r.b);
    if (r.kind == R_ENG && r.a == T_MIX && r.b < NPARTS && r.c < MX_NPARAMS)
        return MIXN[r.b][r.c];
    if (r.kind == R_ENG && r.a == T_FX) {               /* the page says which effect: the knob, what */
        switch (r.c) {
        case FX_RV_DECAY: return "DECAY";
        case FX_RV_TONE: case FX_DL_TONE: return "TONE";
        case FX_DL_TIME: return "TIME";
        case FX_DL_FDBK: return "FEEDBACK";
        case FX_RV_HPF: return "REV LOW CUT";
        case FX_DL_HPF: return "DLY LOW CUT";
        case FX_RV_LEVEL: return "REV RETURN";
        case FX_DL_LEVEL: return "DLY RETURN";
        case FX_DL_PING: return "PING-PONG";
        case FX_COMP: return "GLUE";
        default: break;
        }
    }
    if (r.kind == R_BRKSET && r.c == BRK_BCHANCE)
        return "B CHANCE";
    if (r.kind == R_ENG && (r.a == T_909 || r.a == T_808) && r.b < NDRUM && ui.view == V_MIX && ui.overlay == O_LIST) {
        static char t[24];                             /* MIX's list: whose track ("909 BD LEVEL") */
        put_s(put_s(put_s(put_s(t, r.a == T_909 ? "909 " : "808 "), engine_voice_name(r.a, r.b)), " "), d ? d->name : "");
        return t;
    }
    if (r.kind == R_ENG && r.a == T_303) {
        {
            switch (r.c) {
            case BASS303_AATTACK: return "ATTACK";
            case BASS303_ADECAY: return "DECAY";
            case BASS303_ASUSTAIN: return "SUSTAIN";
            case BASS303_ARELEASE: return "RELEASE";
            case BASS303_FATTACK: return "F ATTACK";
            case BASS303_FSUSTAIN: return "F SUSTAIN";
            case BASS303_FRELEASE: return "F RELEASE";
            default: break;
            }
        }
    }
    if (r.kind == R_BRKSLOT)
        return r.a ? "LOOP B" : "LOOP A";
    return d ? d->name : "";
}

/* a pan: a part's (MIX) or a drum voice's ("Pan", its last pot): drawn L / C / R, its arc from the middle */
static int is_pan(pref_t r)
{
    const x0x_param_t *d;
    if (r.kind != R_ENG)
        return 0;
    if (r.a == T_MIX)
        return r.c == MX_PAN;
    d = pref_desc(r);
    return (r.a == T_909 || r.a == T_808) && d && d->name[0] == 'P' && d->name[1] == 'a' && d->name[2] == 'n' &&
           !d->name[3];
}

static int matrix_value(pref_t r);

/* Chicago Gate routes amp ADSR to the filter and therefore uses filter time laws. */
static int display_env_param(pref_t r)
{
    if (r.c >= BASS303_AATTACK && r.c <= BASS303_ARELEASE &&
        matrix_value(PR(R_ENG,T_303,r.b,BASS303_AMPMODE)) == BASS303_AMP_GATE) {
        static const uint8_t filter[4] = {BASS303_FATTACK,BASS303_DECAY,BASS303_FSUSTAIN,BASS303_FRELEASE};
        return filter[r.c-BASS303_AATTACK];
    }
    return r.c;
}

static float display_env_ms(pref_t r, int v)
{
    (void)r; (void)v; return 0.0f; /* bass303.c is not linked in the original-synth build */
}

static void display_ms(float ms,char *num,char *unit)
{
    if(ms>0.0f && ms<10.0f) {
        int t=(int)(ms*10.0f+0.5f);
        put_i(put_s(put_i(num,t/10),"."),t%10);
    } else put_i(num,(int)(ms+0.5f));
    put_s(unit,"ms");
}
static const char *original_status_name(int voice)
{
    static const char *const pending[] = {"READY","WAIT","HELD","WHEEL","LOCKS","INPUT","WAIT"};
    int status = engine_bass_status(voice), wait = engine_bass_preset_pending(voice);
    if (status == ORIGINAL_RUNTIME_UNAVAILABLE) {
        if (wait > 0 && wait < 7 && original_runtime_kind_available(engine_bass_requested_bank(voice)))
            return pending[wait];
        return "UNAVAIL";
    }
    if (status != 1) return status == -1 ? "FX WAIT" : "DSP ERR";
    return wait > 0 && wait < 7 ? pending[wait] : "READY";
}
static int original_value_text(pref_t r, int value, char *num, char *unit)
{
    if (r.kind == R_BENGINE) {
        put_s(num, value >= 0 && value <= ORIGINAL_SOUND_JUNO ? BENGINE_N[value] : "INVALID");
        return 1;
    }
    if (r.kind == R_BPRESET) {
        if (value < 0) put_s(num,"USER");
        else {
            char *end = put_i(num,value+1);
            if (!engine_bass_preset_pending(r.b) && engine_bass_preset_edited(r.b)) put_s(end,"*");
        }
        return 1;
    }
    if (r.kind == R_BSTATUS) { put_s(num,original_status_name(r.b)); return 1; }
    if (r.kind != R_ENG || r.a != T_303) return 0;
    int bank = engine_bass_sound_bank(&proj.sound,r.b);
    unsigned kind = (unsigned)bank, id = r.c;
    const ui_original_control_view *v = 0;
    /* a corrupt patch has no bank: never index a name table through a null view */
    if (bank != ORIGINAL_SOUND_CHICAGO && bank != ORIGINAL_SOUND_MIAMI && bank != ORIGINAL_SOUND_DRONE && bank != ORIGINAL_SOUND_JUNO) { put_s(num,"INVALID"); return 1; }
    if (kind == ORIGINAL_SOUND_JUNO || kind == ORIGINAL_SOUND_DRONE) { put_i(num,(value*100+63)/127); put_s(unit,"%"); return 1; }
    if (ui_original_states(kind,id) || (kind == ORIGINAL_SOUND_CHICAGO && id == 4) ||
        (kind == ORIGINAL_SOUND_MIAMI && id == 7)) {
        v = original_text_view(r,value);
        if (!v) { put_s(num,"INVALID"); return 1; }
    }
    if (kind == ORIGINAL_SOUND_CHICAGO) {
        static const char *const speed[] = {"1/2","1/4D","1/2T","1/4","1/8D","1/4T","1/8","1/8T","1/16","1/32"};
        if (id == 4) { put_i(v->env_percent>0?put_s(num,"+"):num,v->env_percent); put_s(unit,"%"); return 1; }
        if (id == 11) { put_s(num,v->amp_gate ? "GATE" : "ENV"); return 1; }
        if (id == 13) { put_s(num,v->arp_on ? "ON" : "OFF"); return 1; }
        if (id == 14) { put_s(num,v->arp_mode == 1 ? "DOWN" : v->arp_mode == 2 ? "UP" : "UP/DN"); return 1; }
        if (id == 15) { put_s(num,v->arp_range == 1 ? "1 OCT" : v->arp_range == 2 ? "2 OCT" : "FULL"); return 1; }
        if (id == 16) { put_s(num,speed[v->arp_speed]); return 1; }
        if (id == 17) {
            const char *name = original_sound_fx_name((unsigned)value);
            put_s(num,name ? name : "INVALID"); return 1;
        }
    } else {
        static const char *const shape[] = {"TRI","SAW","SQR","PUL"};
        static const char *const wobble[] = {"TRI","DOWN","UP","SQR"};
        static const char *const rate[] = {"1/2","1/4","1/8","1/16","1/3","1/6","1/12","1/24"};
        if (id == 0 || id == 6) { put_s(num,shape[v->shape[id == 0 ? 0 : 1]]); return 1; }
        if (id == 11) { put_s(num,wobble[v->shape[2]]); return 1; }
        if (id == 13) { put_s(num,rate[v->wobble_rate]); return 1; }
        if (id == 3) { put_i(v->carrier_pitch > 0 ? put_s(num,"+") : num,v->carrier_pitch); put_s(unit,"st"); return 1; }
        if (id == 7) {
            int amount = v->xmod_tune; char *q = num;
            if (amount < 0) { q = put_s(q,"-"); amount = -amount; }
            else if (amount > 0) q = put_s(q,"+");
            q = put_i(q,amount/100); *q++ = '.'; *q++ = (char)('0'+(amount/10)%10); *q++ = (char)('0'+amount%10); *q = 0;
            return 1;
        }
    }
    put_i(num,(value*100+63)/127); put_s(unit,"%"); return 1;
}

/* signed number with one decimal below 10 (|x|), else whole */
static char *put_d1(char *q, float x, int sign)
{
    int t = (int)(x * 10.0f + (x < 0 ? -0.5f : 0.5f));
    if (t < 0) { *q++ = '-'; t = -t; } else if (sign && t > 0) *q++ = '+';
    if (t < 100) { q = put_i(q, t / 10); *q++ = '.'; *q++ = (char)('0' + t % 10); *q = 0; return q; }
    return put_i(q, (t + 5) / 10);
}
/* an engine value in its unit (X0X_U_*), short enough for a 60 px cell */
static void unit_value(int u, float x, char *num, char *unit)
{
    switch (u) {
    case X0X_U_PCT: put_i(num, (int)(x + 0.5f)); put_s(unit, "%"); return;
    case X0X_U_GAIN:
        if (x <= 0.0f) { put_s(num, "OFF"); return; }
        put_d1(num, 6.0206f * fm_log2f(x), 1); put_s(unit, "dB"); return;
    case X0X_U_HZ:
        if (x < 999.5f) { put_i(num, (int)(x + 0.5f)); put_s(unit, "Hz"); }
        else { put_d1(num, x / 1000.0f, 0); put_s(unit, "kHz"); }
        return;
    case X0X_U_MS:
        if (x < 999.5f) { put_i(num, (int)(x + 0.5f)); put_s(unit, "ms"); }
        else { put_d1(num, x / 1000.0f, 0); put_s(unit, "s"); }
        return;
    case X0X_U_S:
        if (x < 0.9995f) { put_i(num, (int)(x * 1000.0f + 0.5f)); put_s(unit, "ms"); }
        else { put_d1(num, x, 0); put_s(unit, "s"); }
        return;
    case X0X_U_RATIO: x = 12.0f * fm_log2f(x); /* fall through: semitones */
    case X0X_U_ST: put_d1(num, x, 1); put_s(unit, "st"); return;
    default: return;
    }
}

/* the value, as a number and a unit ("-6" "dB"); a switch gives its name and no unit */
X0X_COLD static void pref_value_of(pref_t r, int v, char *num, char *unit)
{
    const x0x_param_t *d = pref_desc(r);
    *num = *unit = 0;
    if (!d || r.kind == R_ACT)
        return;
    if ((r.kind == R_ENG && r.a == T_303) || r.kind == R_BENGINE || r.kind == R_BPRESET || r.kind == R_BSTATUS) {
        engine_bass_edit_hold(1);
        (void)original_value_text(r,v,num,unit);
        engine_bass_edit_hold(0);
        return;
    }
    if (d->names) {
        /* Retained or incompatible sound data must not become a pointer lookup. */
        put_s(num, v >= 0 && v <= d->max ? d->names[v] : "INVALID");
        if (r.kind == R_ENG && r.a == T_BRK && r.c == 1 && v >= 0 && v <= d->max)
            put_s(unit, "st");                           /* breaks.c: semi = Pitch - 12 */
        return;
    }
    if (r.kind == R_TAPE) {
        if (v < 16)
            put_s(num, "DIGI");
        else {
            put_i(num, (v - 16) * 100 / 111);
            put_s(unit, "%");
        }
        return;
    }
    if (is_pan(r)) {                                     /* L64 .. C .. R63 */
        if (v == 64)
            put_s(num, "C");
        else
            put_i(put_s(num, v < 64 ? "L" : "R"), v < 64 ? 64 - v : v - 64);
        return;
    }
    switch (r.kind) {
    case R_ENG:
        if (r.a == T_MST) {                              /* the master formats itself: "-12dB" */
            char t[16], *q = t;
            engine_master_format(r.c, t);
            while (*q && (*q == '-' || *q == '.' || (*q >= '0' && *q <= '9')))
                q++;
            put_s(unit, q);
            *q = 0;
            put_s(num, t);
            return;
        }
        if (r.a == T_MIX) {
            if (r.c == 0) {                              /* level: 100 = 0 dB, square law */
                if (!v)
                    put_s(num, "OFF");
                else {
                    float db = 12.0412f * fm_log2f((float)v / 100.0f);
                    int t10 = (int)(db * 10.0f + (db < 0 ? -0.5f : 0.5f));
                    char *q = num;
                    if (t10 > 0)
                        *q++ = '+';
                    else if (t10 < 0)
                        *q++ = '-';
                    t10 = t10 < 0 ? -t10 : t10;
                    q = put_i(q, t10 / 10);
                    if (t10 < 100 && t10 % 10) {
                        *q++ = '.';
                        put_i(q, t10 % 10);
                    }
                    put_s(unit, "dB");
                }
                return;
            }
            put_i(num, v * 100 / 127);
            put_s(unit, "%");
            return;
        }
        { float x = 0.0f; int u = engine_param_si(r.a, r.b, r.c, v, &x);
          if (u != X0X_U_NONE) { unit_value(u, x, num, unit); return; } }
        put_i(num, v);
        return;
    case R_DLEN:
    case R_BLEN: put_i(num, v + 1); put_s(unit, "st"); return;
    case R_BTRANS: {
        char *q = num;
        if (v > 24)
            *q++ = '+';
        put_i(q, v - 24);
        put_s(unit, "st");
        return;
    }
    case R_SWING: put_i(num, 50 + v / 4); put_s(unit, "%"); return;
    case R_GEN:
        if (r.c == G_OCTS || r.c == G_BASE)
            put_i(num, v + 1);
        else if (r.c == G_MUT) {
            if (!v)
                put_s(num, "OFF");
            else {
                put_i(num, v);
                put_s(unit, "bar");
            }
        } else {
            put_i(num, v);
            put_s(unit, "%");
        }
        return;
    case R_BRKSET: put_i(num, v); put_s(unit, "%"); return;
    case R_TEMPO: put_i(num, v + 20); put_s(unit, "bpm"); return;
    case R_FINETUNE: {
        int tsteps = v - 64, milli = tsteps * 625;
        char *e = num;
        if (milli > 0) *e++ = '+';
        if (milli < 0) { *e++ = '-'; milli = -milli; }
        e = put_i(e, milli / 1000);
        *e++ = '.';
        *e++ = (char)('0' + (milli / 100) % 10);
        *e = 0;
        put_s(unit, "Hz");
        return;
    }
    case R_BPATSND: {
        unsigned ps = pat_of(PART_303A + (r.b & 1))->rsv[r.b & 1];
        if (!ps) { put_s(num, "OFF"); return; }
        unsigned kind, preset;
        if (!bass_pattern_preset_decode(ps, &kind, &preset)) { put_s(num, "INVALID"); return; }
        num[0] = kind == ORIGINAL_SOUND_JUNO ? 'J' : kind == ORIGINAL_SOUND_DRONE ? 'D' : kind == ORIGINAL_SOUND_MIAMI ? 'M' : 'C';
        put_i(num + 1, (int)preset);
        return;
    }
    case R_SBAR: put_i(num, v + 1); return;
    case R_SPAT: num[0] = 'P'; put_i(num + 1, v + 1); return;
    case R_MIDICH: if (v) put_i(num, v); else put_s(num, "OFF"); return;
    case R_CKCH: put_i(num, v + 2); return;
    case R_SREP: num[0] = 'x'; put_i(num + 1, v + 1); return;
    case R_SLEN: put_i(num, v); put_s(unit, "bar"); return;
    default: put_i(num, v); return;
    }
}
static void pref_value(pref_t r, char *num, char *unit)
{
    if (r.kind == R_ENG && r.a == T_303) { pref_value_of(r,original_display_value(r),num,unit); return; }
    pref_value_of(r,pref_get(r),num,unit);
}

/* ===================================================================== pages === */
#define MAXPAGES 14
/* page groups: whose values a page holds (the SEL list's headers, the header's colour) */
enum { GR_NONE, GR_TRACK, GR_TMIX, GR_KIT, GR_PAT, GR_SOUND, GR_MORE,
       GR_MIDI, GR_AUDIO, GR_KEYS, GR_PROJECT, GR_SYSTEM, GR_BT };   /* (the last six: GLO's sections) */
#define MAXMORE 14
typedef struct {
    pref_t r[MAXPAGES][4];
    char title[MAXPAGES][12];
    uint8_t group[MAXPAGES];
    int n;
    pref_t more[MAXMORE];              /* the screen's other knobs: only in SEL's list, under MORE */
    int nmore;
} pages_t;
static pages_t pg X0X_POOL;
typedef struct { pref_t r[4]; char title[12]; int page, n; } page_query_t;
/* The descriptor emitter has one explicit output contract. Query mode records
 * one requested page plus the count, without a second persistent page table. */
typedef struct {
    pages_t *pages;
    page_query_t *query;
    uint8_t group;
} page_emitter_t;

static void more(page_emitter_t *emit, pref_t r)
{
    pages_t *pages = emit->pages;
    if (pages && r.kind != R_NONE && pages->nmore < MAXMORE)
        pages->more[pages->nmore++] = r;
}

static void title(pages_t *pages, int i, const char *s)
{
    int k = 0;
    while (s[k] && k < 11) {
        pages->title[i][k] = s[k];
        k++;
    }
    pages->title[i][k] = 0;
}

static void add_page(page_emitter_t *emit, const char *t,
                     pref_t a, pref_t b, pref_t c, pref_t d)
{
    page_query_t *query = emit->query;
    pages_t *pages = emit->pages;
    if (query) {
        if (query->n == query->page) {
            query->r[0] = a;
            query->r[1] = b;
            query->r[2] = c;
            query->r[3] = d;
            unsigned i = 0;
            for (; t[i] && i < 11; i++)
                query->title[i] = t[i];
            query->title[i] = 0;
        }
        query->n++;
        return;
    }
    if (pages->n >= MAXPAGES)
        return;
    pages->r[pages->n][0] = a;
    pages->r[pages->n][1] = b;
    pages->r[pages->n][2] = c;
    pages->r[pages->n][3] = d;
    title(pages, pages->n, t);
    pages->group[pages->n] = emit->group;
    pages->n++;
}

static int name_is(const x0x_param_t *d, const char *n)
{
    const char *a = d ? d->name : "";
    while (*a && *a == *n) {
        a++;
        n++;
    }
    return !*a && !*n;
}
static pref_t find_ref(int t, int v, const char *n)
{
    int i;
    for (i = 0; i < engine_nparams(t, v); i++)
        if (name_is(engine_param(t, v, i), n))
            return PR(R_ENG, t, v, i);
    return NONE;
}

/* Drum sound knobs: named ranks so matching controls keep the same physical
 * knobs across 909/808 tracks (DSP tables differ per voice). Level/Pan/Rev/Dly
 * stay on MIX; Drive/Dist stay in SEL's list. Unknown names keep their relative
 * table order after the named ranks. Restored after Chicago-aux land dropped it. */
static int track_param_rank(const x0x_param_t *d)
{
    static const char *const order[] = {
        "Tune", "Tone", "Attack", "Sound", "Decay", "Snappy", "Tail", "P.Dpth", "Pitch",
    };
    int i;
    for (i = 0; i < (int)(sizeof order / sizeof *order); i++)
        if (name_is(d, order[i]))
            return i;
    return (int)(sizeof order / sizeof *order);
}

/* a drum track: its sound, four knobs a page (its DRIVE and DIST: SEL's list; its level, pan and sends:
 * MIX's 909 MIX / 808 MIX page) */
X0X_COLD static void add_track_pages(page_emitter_t *emit, int t, int v)
{
    const char *nm = engine_voice_name(t, v);
    pref_t snd[NPARAMS_MAX];
    int rank[NPARAMS_MAX];
    int n = 0, i, j;
    for (i = 0; i < engine_nparams(t, v) && n < NPARAMS_MAX; i++) {
        const x0x_param_t *d = engine_param(t, v, i);
        if (name_is(d, "Drive") || name_is(d, "Dist"))
            more(emit, PR(R_ENG, t, v, i));
        else if (!name_is(d, "Level") && !name_is(d, "Pan") && !name_is(d, "Rev") && !name_is(d, "Dly")) {
            rank[n] = track_param_rank(d);
            snd[n++] = PR(R_ENG, t, v, i);
        }
    }
    for (i = 1; i < n; i++) {              /* stable insertion by rank */
        pref_t x = snd[i];
        int rx = rank[i];
        for (j = i; j > 0 && rank[j - 1] > rx; j--) {
            snd[j] = snd[j - 1];
            rank[j] = rank[j - 1];
        }
        snd[j] = x;
        rank[j] = rx;
    }
    emit->group = GR_TRACK;
    for (i = 0; i < n; i += 4)
        add_page(emit, nm, snd[i], i + 1 < n ? snd[i + 1] : NONE, i + 2 < n ? snd[i + 2] : NONE, i + 3 < n ? snd[i + 3] : NONE);
}

/* where a screen's page is kept: per part on the part's screens (and TB-3PO), else one per screen */
static uint8_t *page_of(int view)
{
    return &ui.page[view][view == V_PART || view == V_SEQ || view == V_GEN ? ui.part : 0];
}

/* Immutable page descriptions avoid rebuilding four constant preference records at
 * every call site. The only patched byte is the current part/voice/channel;
 * NONE retains its all-zero record. This runs only during UI page construction. */
X0X_COLD __attribute__((noinline)) static void add_page_refs(page_emitter_t *emit, const char *t, const pref_t *refs, int axis, uint8_t value)
{
    pref_t row[4];
    for (int i = 0; i < 4; i++) {
        row[i] = refs[i];
        if (row[i].kind != R_NONE) {
            if (axis == 1) row[i].a = value;
            if (axis == 2) row[i].b = value;
        }
    }
    add_page(emit, t, row[0], row[1], row[2], row[3]);
}

X0X_COLD __attribute__((noinline)) static void more_refs(page_emitter_t *emit, const pref_t *refs, unsigned n, int axis, uint8_t value)
{
    unsigned i;
    for (i = 0; i < n; i++) {
        pref_t r = refs[i];
        if (axis == 1) r.a = value;
        if (axis == 2) r.b = value;
        more(emit, r);
    }
}

/* Pure navigation inputs: emit existing descriptors without keyboard clamping. */
static void describe_pages(pages_t *out, page_query_t *query, int view, int p, int mixsel, const uint8_t *selection)
{
    page_emitter_t output = {out, query, GR_NONE};
    page_emitter_t *emit = &output;
    if (query)
        query->n = 0;
    else
        out->n = out->nmore = 0;
    switch (view) {
    case V_HOME:                                       /* the pattern: how the parts run through it */
    case V_GLO:
        do { static const pref_t refs[4] = {PR(R_TEMPO, 0, 0, 0), PR(R_SWING, 0, 0, 0), PR(R_ENG, T_MST, 0, MST_DJF), PR(R_ENG, T_MST, 0, MST_PUMP)};
            add_page_refs(emit, "PERFORM", refs, 0, 0); } while (0);
        break;
    case V_SEQ:                                        /* the part's steps: how its pattern runs */
        emit->group = GR_PAT;
        if (part_is_drum(p))
            do { static const pref_t refs[4] = {PR(R_DLEN, 0, 0, 0), PR(R_DRATE, 0, 0, 0), NONE, NONE};
            add_page_refs(emit, "SEQUENCE", refs, 1, p); } while (0);   /* (the swing: HOME's, all parts') */
        else if (part_is_303(p)) {
            int b = p - PART_303A;
            do { static const pref_t refs[4] = {PR(R_BLEN, 0, 0, 0), PR(R_BRATE, 0, 0, 0), PR(R_BDIR, 0, 0, 0), PR(R_BTRANS, 0, 0, 0)};
            add_page_refs(emit, "SEQUENCE", refs, 1, b); } while (0);
            add_page(emit, "PRESET", PR(R_BPATSND, 0, b, 0), NONE, NONE, NONE);   /* 0.0.25: this pattern's bass preset */
            emit->group = GR_NONE;                          /* (not the pattern's: no P1 in its name) */
            do { static const pref_t refs[4] = {PR(R_FREEPLAY, 0, 0, 0), NONE, NONE, NONE};
            add_page_refs(emit, "KEYS", refs, 1, b); } while (0);
        }
        else {
            do { static const pref_t refs[4] = {PR(R_BRKRATE, 0, 0, 0), NONE, NONE, NONE};
            add_page_refs(emit, "SEQUENCE", refs, 0, 0); } while (0);
            do { static const pref_t refs[4] = {PR(R_BRKSET, 0, 0, BRK_COMPLEX), PR(R_BRKSET, 0, 0, BRK_ANCHOR), PR(R_BRKSET, 0, 0, BRK_ROLL), PR(R_BRKSET, 0, 0, BRK_FILL)};
            add_page_refs(emit, "GROOVE", refs, 0, 0); } while (0);
            do { static const pref_t refs[4] = {PR(R_BRKSET, 0, 0, BRK_R2), PR(R_BRKSET, 0, 0, BRK_R3), PR(R_BRKSET, 0, 0, BRK_R4), PR(R_BRKSET, 0, 0, BRK_R8)};
            add_page_refs(emit, "RETRIG", refs, 0, 0); } while (0);
            do { static const pref_t refs[] = {PR(R_BRKSET, 0, 0, BRK_PHRASE), PR(R_BRKSET, 0, 0, BRK_ALEN), PR(R_BRKSET, 0, 0, BRK_BLEN)};
                more_refs(emit, refs, 3, 0, 0); } while (0);
        }
        break;
    case V_PART:                                       /* the part's sound */
        if (part_is_drum(p)) {
            int t = p == PART_909 ? T_909 : T_808;
            add_track_pages(emit, t, selection[p]);
            emit->group = GR_KIT;
            if (p == PART_909)                         /* (the kit's gain: the mixer's level does it) */
                do { static const pref_t refs[4] = {PR(R_ENG, T_909, NDRUM, 1), NONE, NONE, NONE};
            add_page_refs(emit, "KIT", refs, 0, 0); } while (0);
            else
                do { static const pref_t refs[4] = {PR(R_ENG, T_808, NDRUM, 1), NONE, NONE, NONE};
            add_page_refs(emit, "KIT", refs, 0, 0); } while (0);
        } else if (part_is_303(p)) {
            int b = p - PART_303A;
            emit->group = GR_SOUND;
            int kind = engine_bass_bank(b), chicago = kind == ORIGINAL_SOUND_CHICAGO;
            const int8_t (*rows)[4] = kind == ORIGINAL_SOUND_JUNO ? ui_original_juno_rows : kind == ORIGINAL_SOUND_DRONE ? ui_original_drone_rows :
                chicago ? ui_original_chicago_rows : ui_original_miami_rows;
            const char *const *titles = kind == ORIGINAL_SOUND_JUNO ? ui_original_juno_titles : kind == ORIGINAL_SOUND_DRONE ? ui_original_drone_titles :
                chicago ? ui_original_chicago_titles : ui_original_miami_titles;
            int count = kind == ORIGINAL_SOUND_JUNO ? UI_ORIGINAL_JUNO_PAGES : kind == ORIGINAL_SOUND_DRONE ? UI_ORIGINAL_DRONE_PAGES :
                chicago ? UI_ORIGINAL_CHICAGO_PAGES : UI_ORIGINAL_MIAMI_PAGES;
            for (int row = 0; original_runtime_kind_available(kind) && row < count; row++) {
                pref_t refs[4];
                for (int col = 0; col < 4; col++) refs[col] = rows[row][col] < 0 ? NONE : PR(R_ENG,T_303,b,rows[row][col]);
                add_page_refs(emit, titles[row],refs,0,0);
            }
            add_page(emit, "SOUND",PR(R_BENGINE,0,b,0),PR(R_BPRESET,0,b,0),PR(R_BSTATUS,0,b,0),NONE);
        } else {
            emit->group = GR_PAT;                           /* (its groove and retrigs: SEQ) */
            do { static const pref_t refs[4] = {PR(R_BRKSLOT, 0, 0, 0), PR(R_BRKSLOT, 1, 0, 0), PR(R_BRKSET, 0, 0, BRK_BCHANCE), PR(R_ENG, T_BRK, 0, 1)};
            add_page_refs(emit, "LOOPS", refs, 0, 0); } while (0);
            more(emit, PR(R_ENG, T_BRK, 0, 0));
            more(emit, PR(R_BRKSLICE, 0, 0, 0));
            more(emit, PR(R_BRKSLICE, 1, 0, 0));
        }
        break;
    case V_GEN: {
        int b = p - PART_303A;
        emit->group = GR_PAT;
        do { static const pref_t refs[4] = {PR(R_GEN, 0, 0, G_DENS), PR(R_GEN, 0, 0, G_ACC), PR(R_GEN, 0, 0, G_SLIDE), PR(R_GEN, 0, 0, G_OCTS)};
            add_page_refs(emit, "GENERATE", refs, 1, b); } while (0);
        do { static const pref_t refs[4] = {PR(R_GEN, 0, 0, G_ROOT), PR(R_GEN, 0, 0, G_SCALE), PR(R_GEN, 0, 0, G_BASE), PR(R_GEN, 0, 0, G_MUT)};
            add_page_refs(emit, "SCALE", refs, 1, b); } while (0);
        break;
    }
    case V_FX:                                         /* (each part's sends: MIX's PARTS) */
        do { static const pref_t refs[4] = {PR(R_ENG, T_FX, 0, FX_RV_DECAY), PR(R_ENG, T_FX, 0, FX_RV_TONE), NONE, NONE};
            add_page_refs(emit, "REVERB", refs, 0, 0); } while (0);
        do { static const pref_t refs[4] = {PR(R_ENG, T_FX, 0, FX_DL_TIME), PR(R_ENG, T_FX, 0, FX_DL_FDBK), PR(R_ENG, T_FX, 0, FX_DL_TONE), PR(R_TAPE, 0, 0, 0)};
            add_page_refs(emit, "DELAY", refs, 0, 0); } while (0);
            do { static const pref_t refs[] = {PR(R_ENG, T_FX, 0, FX_RV_HPF), PR(R_ENG, T_FX, 0, FX_RV_LEVEL), PR(R_ENG, T_FX, 0, FX_DL_HPF), PR(R_ENG, T_FX, 0, FX_DL_LEVEL), PR(R_ENG, T_FX, 0, FX_DL_PING)};
                more_refs(emit, refs, 5, 0, 0); } while (0);
        break;
    case V_MIX:                                        /* a channel picked with a black key, its four knobs */
        do { static const pref_t refs[4] = {PR(R_ENG, T_MIX, 0, MX_LEVEL), PR(R_ENG, T_MIX, 0, MX_PAN), PR(R_ENG, T_MIX, 0, MX_REV), PR(R_ENG, T_MIX, 0, MX_DLY)};
            add_page_refs(emit, "PARTS", refs, 2, mixsel); } while (0);
        for (p = 0; p < NKIT; p++) {                    /* each drum machine's tracks: LEVEL, PAN, REV, DLY */
            int t = p ? T_808 : T_909, v = selection[p];
            add_page(emit, p ? "808 MIX" : "909 MIX", find_ref(t, v, "Level"), find_ref(t, v, "Pan"), find_ref(t, v, "Rev"),
                     find_ref(t, v, "Dly"));
        }
        do { static const pref_t refs[4] = {PR(R_ENG, T_FX, 0, FX_DRIVE), PR(R_ENG, T_MST, 0, MST_COMP1), PR(R_ENG, T_MST, 0, MST_PUMP), PR(R_ENG, T_MST, 0, MST_DJF)};
            add_page_refs(emit, "MASTER", refs, 0, 0); } while (0);
            do { static const pref_t refs[] = {PR(R_ENG, T_MST, 0, MST_THRESH), PR(R_ENG, T_MST, 0, MST_RATIO), PR(R_ENG, T_MST, 0, MST_ATTACK), PR(R_ENG, T_MST, 0, MST_RELEASE), PR(R_ENG, T_MST, 0, MST_MAKEUP), PR(R_ENG, T_MST, 0, MST_MIX), PR(R_ENG, T_MST, 0, MST_PUMPSRC), PR(R_ENG, T_MST, 0, MST_RESO), PR(R_ENG, T_MST, 0, MST_LIMIT), PR(R_ENG, T_FX, 0, FX_DIST), PR(R_ENG, T_FX, 0, FX_COMP), PR(R_ENG, T_FX, 0, FX_VOLUME)};
                more_refs(emit, refs, 12, 0, 0); } while (0);
        /* sibling of MASTER: same knobs, post-master eng_scope wave (Baud Girl ≤10 Hz redraw) */
        do { static const pref_t refs[4] = {PR(R_ENG, T_FX, 0, FX_DRIVE), PR(R_ENG, T_MST, 0, MST_COMP1), PR(R_ENG, T_MST, 0, MST_PUMP), PR(R_ENG, T_MST, 0, MST_DJF)};
            add_page_refs(emit, "WAVE", refs, 0, 0); } while (0);
        break;
    case V_PERF:
        do { static const pref_t refs[4] = {PR(R_STALLS, 0, 0, 0), NONE, NONE, NONE};
            add_page_refs(emit, "PERF", refs, 0, 0); } while (0);
        break;
    case V_SONG:
        do { static const pref_t refs[4] = {PR(R_SBAR, 0, 0, 0), PR(R_SPAT, PART_909, 0, 0), PR(R_SPAT, PART_808, 0, 0), PR(R_SPAT, PART_BRK, 0, 0)};
            add_page_refs(emit, "BAR", refs, 0, 0); } while (0);
        do { static const pref_t refs[4] = {PR(R_SBAR, 0, 0, 0), PR(R_SPAT, PART_303B, 0, 0), PR(R_SPAT, PART_303A, 0, 0), PR(R_SREP, 0, 0, 0)};
            add_page_refs(emit, "BAR", refs, 0, 0); } while (0);
        break;
    default: break;
    }
    if ((query ? query->n : out->n) == 0)
        do { static const pref_t refs[4] = {NONE, NONE, NONE, NONE};
            add_page_refs(emit, "", refs, 0, 0); } while (0);
}

static void build_pages(void)
{
#if X0X_BASS_PRESET_PREVIEW
    int b=bidx(), oldpage=*page_of(ui.view);
    int preserve=ui.view==V_PART && is_303() && (bass_layout_pending_mask & (1u<<b));
    int keep_sound=ui.view==V_PART && is_303() && oldpage<pg.n &&
        pg.r[oldpage][0].kind==R_BENGINE && pg.r[oldpage][0].b==b;
#endif
    describe_pages(&pg, 0, ui.view, ui.part, ui.mixsel, ui.sel);
    if (ui.view == V_PART && is_303()) original_page_bank = (uint8_t)engine_bass_bank(bidx());
#if X0X_BASS_PRESET_PREVIEW
    if(!preserve && keep_sound) *page_of(ui.view)=(uint8_t)(pg.n-1);
#endif
    if (
#if X0X_BASS_PRESET_PREVIEW
        !preserve &&
#endif
        *page_of(ui.view) >= pg.n) *page_of(ui.view) = 0;
}

static int cur_page(void)
{
    int page = *page_of(ui.view);
    if (ui.view == V_PART && is_303() &&
        (bass_layout_on_sound_page & (1u << bidx())))
        return pg.n - 1;
    return page < pg.n ? page : pg.n - 1;
}

static void bass_layout_note_remote_edit(int voice)
{
    unsigned bit = 1u << (unsigned)voice;
    if (ui.view != V_PART || !is_303() || bidx() != voice)
        return;
    if (!(bass_layout_pending_mask & bit) && pg.r[cur_page()][0].kind == R_BENGINE)
        bass_layout_on_sound_page |= (uint8_t)bit;
    bass_layout_pending_mask |= (uint8_t)bit;
}

static void bass_layout_accept(void)
{
    if (ui.view == V_PART && is_303() && (bass_layout_pending_mask & (1u << bidx())))
        *page_of(ui.view) = (uint8_t)cur_page();
    bass_layout_pending_mask = bass_layout_on_sound_page = 0;
}

/* MIX's page of a drum machine's tracks: which machine (0 / 1), -1 = not one */
static int drum_mix_page(void)
{
    const char *t = pg.title[cur_page()];
    return ui.view == V_MIX && t[4] == 'M' && t[5] == 'I' && t[6] == 'X' ? (t[0] == '8') : -1;
}

/* MIX MASTER (peak hist + COMP knobs); not the WAVE sibling */
static int master_mix_page(void)
{
    const char *t = pg.title[cur_page()];
    return ui.view == V_MIX && t[0] == 'M' && t[1] == 'A' && t[2] == 'S' && t[3] == 'T';
}

/* MIX WAVE: live post-master mono scope from eng_scope[] */
static int wave_mix_page(void)
{
    const char *t = pg.title[cur_page()];
    return ui.view == V_MIX && t[0] == 'W' && t[1] == 'A' && t[2] == 'V' && t[3] == 'E';
}

/* a drum machine's page of the selected track's own sound (not the whole kit's: SENDS, PART, KIT) */
static int track_page(void)
{
    int g = pg.group[cur_page()];
    return ui.view == V_PART && is_drum() && (g == GR_TRACK || g == GR_TMIX);
}

/* ===================================================================== lists === */
/* A list is rows of refs. SEL on a page opens the list of every page's knobs (the deep view);
 * GLOBAL is a list of its own. SELECT moves, ALGORITHM changes, SEL runs an action. */
#define LIST_MAX 64
static pref_t list_rows[LIST_MAX] X0X_POOL;
static char list_title[16];

static void list_add(pref_t r)
{
    int i;
    if (r.kind == R_NONE || ui.list_n >= LIST_MAX)
        return;
    for (i = 0; i < ui.list_n; i++)                   /* a ref on two pages (LEVEL) lists once */
        if (list_rows[i].kind == r.kind && list_rows[i].a == r.a && list_rows[i].b == r.b && list_rows[i].c == r.c)
            return;
    list_rows[ui.list_n++] = r;
}

/* a list section's name: whose values follow */
static void hdr_name(int g, char *t)
{
    const char *who = is_drum() ? engine_voice_name(ui.part == PART_909 ? T_909 : T_808, ui.sel[ui.part]) : part_name(ui.part);
    switch (g) {
    case GR_TRACK: put_s(put_s(t, who), ": THIS TRACK"); break;
    case GR_TMIX: put_s(put_s(t, who), ": TRACK MIX"); break;
    case GR_KIT: put_s(put_s(t, part_name(ui.part)), ": ALL TRACKS"); break;
    case GR_PAT: put_s(put_i(put_s(t, "P"), seq.ppat[ui.part] + 1), ": THE PATTERN"); break;
    case GR_MORE: put_s(t, "MORE"); break;
    case GR_MIDI: put_s(t, "MIDI"); break;
    case GR_AUDIO: put_s(t, "AUDIO"); break;
    case GR_KEYS: put_s(t, "KEYS AND SCREEN"); break;
    case GR_PROJECT: put_s(t, "PROJECT"); break;
    case GR_SYSTEM: put_s(t, "SYSTEM"); break;
    case GR_BT: put_s(t, "BLUETOOTH MIDI"); break;
    default: put_s(put_s(t, part_name(ui.part)), ": THE SOUND"); break;
    }
}

static int list_skip(int i) { return i < ui.list_n && list_rows[i].kind == R_HDR; }

static void open_list_of_pages(void)
{
    if (ui.view == V_PART && is_303()) original_list_bank = original_page_bank;
    int p, k, last = -1, groups = 0;
    ui.list_n = 0;
    for (p = 0; p < pg.n; p++)
        if (pg.group[p] != (p ? pg.group[p - 1] : GR_NONE))
            groups++;
    for (p = 0; p < pg.n; p++) {
        if (groups > 1 && pg.group[p] != last && ui.list_n < LIST_MAX)
            list_rows[ui.list_n++] = PR(R_HDR, pg.group[p], 0, 0);
        last = pg.group[p];
        for (k = 0; k < 4; k++)
            list_add(pg.r[p][k]);
    }
    if (pg.nmore && ui.list_n < LIST_MAX)              /* the knobs no page has */
        list_rows[ui.list_n++] = PR(R_HDR, GR_MORE, 0, 0);
    for (k = 0; k < pg.nmore; k++)
        list_add(pg.more[k]);
    if (ui.view == V_PERF)
        list_add(PR(R_ACT, ACT_PERF_TEST, 0, 0));
    if (ui.view == V_SONG) {
        list_add(PR(R_SLEN, 0, 0, 0));
        list_add(PR(R_ACT, ACT_SONG_INS, 0, 0));
        list_add(PR(R_ACT, ACT_SONG_DEL, 0, 0));
        list_add(PR(R_ACT, ACT_SONG_CLR, 0, 0));
    }
    if (ui.view == V_SEQ)
        put_s(put_s(list_title, part_name(ui.part)), " SEQ");
    else
        put_s(list_title, ui.view == V_PART ? part_display(ui.part) : VIEW_N[ui.view]);
    ui.list_sel = ui.list_top = 0;
    while (list_skip(ui.list_sel))
        ui.list_sel++;
    ui.overlay = ui.list_n ? O_LIST : O_NONE;
}

static void global_index(void)
{
    ui.glo_section=-1;ui.list_n=0;
    for(int g=0;g<6;g++) {
#if !BOARD_SMK37
        if(g==1)continue;
#endif
        list_add(PR(R_SECTION,g,0,0));
    }
    put_s(list_title,"GLOBAL");ui.list_sel=ui.glo_index<ui.list_n?ui.glo_index:0;ui.list_top=0;ui.overlay=O_LIST;
}
static void global_section(int g)
{
    if(g<0||g>=6)return;
    ui.glo_index=ui.list_sel;ui.glo_section=(int8_t)g;ui.list_n=0;
    switch(g) {
    case 0:
        list_add(PR(R_CLKSRC,0,0,0));list_add(PR(R_CLKOUT,0,0,0));list_add(PR(R_NOTEOUT,0,0,0));
        for(int p=0;p<NPARTS;p++)list_add(PR(R_MIDICH,part_at(p),0,0));
#if BOARD_SMK37
        list_add(PR(R_CKCH,0,0,0));
#endif
        break;
    case 1:
#if BOARD_SMK37
        list_add(PR(R_BT,0,0,0));list_add(PR(R_SMC_ROLE,0,0,0));list_add(PR(R_SMC_MAP,0,0,0));
        list_add(PR(R_BTSTAT,0,0,0));list_add(PR(R_BTNAME,0,0,0));
#endif
        break;
    case 2:list_add(PR(R_OUTLOUD,0,0,0));list_add(PR(R_USBFULL,0,0,0));list_add(PR(R_FINETUNE,0,0,0));
        for(int p=0;p<NPARTS;p++)list_add(PR(R_PARTON,part_at(p),0,0));
        list_add(PR(R_QUEUEMUTE,0,0,0));list_add(PR(R_NOTELOCK,0,0,0));break;
    case 3:list_add(PR(R_KEYLED,0,0,0));list_add(PR(R_KEYSOUND,0,0,0));list_add(PR(R_PALETTE,0,0,0));break;
    case 4:
        list_add(PR(R_ACT,ACT_SAVE,0,0));list_add(PR(R_ACT,ACT_LOAD,0,0));list_add(PR(R_AUTOSAVE,0,0,0));
        list_add(PR(R_ACT,ACT_CLEAR_PAT,0,0));list_add(PR(R_ACT,ACT_RESET,0,0));break;
    case 5:
        list_add(PR(R_ACT,ACT_PERF,0,0));list_add(PR(R_ACT,ACT_ABOUT,0,0));list_add(PR(R_BATT,0,0,0));
#if BOARD_SMK37 && X0X_DEV_PADCAL
        {extern uint8_t smk_clip_mode_on(void);if(!smk_clip_mode_on())list_add(PR(R_ACT,ACT_PADCAL,0,0));}
#endif
        break;
    }
    put_s(list_title,GLOBAL_SECTIONS[g]);ui.list_sel=ui.glo_sel[g]<ui.list_n?ui.glo_sel[g]:0;
    ui.list_top=ui.glo_top[g]<=ui.list_sel?ui.glo_top[g]:0;ui.overlay=O_LIST;
}
static void global_back(void)
{
    int g=ui.glo_section;
    if(g>=0&&g<6){ui.glo_sel[g]=ui.list_sel;ui.glo_top[g]=ui.list_top;}
    global_index();
}
static void open_global(void)
{
    memset(ui.glo_sel,0,sizeof ui.glo_sel);memset(ui.glo_top,0,sizeof ui.glo_top);ui.glo_index=0;global_index();
}

/* ================================================================ questions === */
static void ask(int act, int arg, const char *q1, const char *q2)
{
    ui.ask_act = (uint8_t)act;
    ui.ask_overlay = ui.overlay;
    ui.ask_arg = (uint16_t)arg;
    put_s(ui.ask_q[0], q1);
    put_s(ui.ask_q[1], q2 ? q2 : "");
    ui.overlay = O_ASK;
}

/* part `part` of a pattern has something to play */
static int part_used(const pattern_t *pt, int part)
{
    int v, s;
    if (part < NKIT) {
        for (v = 0; v < NDRUM; v++)
            if (sm_any(pt->drum[part].hit[v]))
                return 1;
        return 0;
    }
    if (part == PART_BRK)
        return pt->brk.steps != 0;
    for (s = 0; s < NSTEPS; s++)
        if (bstep_gate(&pt->bass[part - NKIT].step[s]) == G_NOTE)
            return 1;
    return 0;
}

static int pattern_used(const pattern_t *pt)
{
    int v, s, used = pt->brk.steps != 0;
    for (v = 0; v < NDRUM; v++)
        used |= sm_any(pt->drum[0].hit[v]) | sm_any(pt->drum[1].hit[v]);
    for (s = 0; s < NSTEPS; s++)
        used |= bstep_gate(&pt->bass[0].step[s]) != G_REST || bstep_gate(&pt->bass[1].step[s]) != G_REST;
    return used;
}

/* motion lanes of one part pattern: gone, and the knobs back to their own values */
static void clear_lanes(int pat, int part)
{
    int k;
    for (k = 0; k < NLANE; k++) {
        lane_t *l = &proj.arr.lane[k];
        if (l->used && l->pat == pat && l->part == part) {
            engine_motion_clear(k);
            if (l->t < NTARGETS)                      /* (T_PROB: no knob) */
                ui_restore_base(l->t,l->v,l->i);
        }
    }
}

/* part `part` of pattern src onto pattern dst, its lanes too; 0 = done, -1 = lanes did not fit */
static int copy_part(int dst, int src, int part)
{
    pattern_t *d = &proj.pat[dst];
    const pattern_t *a = &proj.pat[src];
    int k, rc = 0;
    if(dst==src)return 0;
    /* Preflight the complete copy, including whole note sounds. A full pool
     * must not produce a copied note with missing or mismatched sound state. */
    int needed=0,available=0;
    for(k=0;k<NLANE;k++) {
        const lane_t *l=&proj.arr.lane[k];
        needed+=l->used && l->pat==src && l->part==part;
        available+=!l->used || (l->pat==dst && l->part==part);
    }
    if(needed>available)return -1;
    if (part < NKIT) {
        d->drum[part] = a->drum[part];
        if (part == PART_909)
            d->swing = a->swing;                      /* the 909 is the bar: its groove goes with it */
    } else if (part < PART_BRK)
        d->bass[part - NKIT] = a->bass[part - NKIT];
    else
        d->brk = a->brk;
    clear_lanes(dst, part);
    for (k = 0; k < NLANE; k++) {                     /* a copy lands on pattern dst: never copied again */
        const lane_t *l = &proj.arr.lane[k];
        int n, i;
        if (!l->used || l->pat != src || l->part != part)
            continue;
        if ((n = motion_alloc(proj.arr.lane, dst, part, l->t, l->v, l->i)) < 0) {
            rc = -1;
            break;
        }
        for (i = 0; i < NSTEPS; i++)
            proj.arr.lane[n].val[i] = l->val[i];
    }
    return rc;
}

static void clear_part(pattern_t *p, int part)
{
    int i;
    if (part < NKIT) {
        int w;
        for (w = 0; w < NSW; w++) {
            for (i = 0; i < NDRUM; i++)
                p->drum[part].hit[i][w] = 0;
            p->drum[part].accent[w] = 0;
        }
    } else if (part < PART_BRK) {
        for (i = 0; i < NSTEPS; i++)
            p->bass[part - NKIT].step[i].flags = G_REST;
    } else {
        p->brk.steps = 0;
        for (i = 0; i < 16; i++)
            p->brk.slice[i] = 0;
    }
}

/* ============================================================ help cards === */
/* Hold one button for HELP_HOLD ms without using it with anything: a card says what it does here,
 * its combinations included. A key, a turn or another button puts the card away (and the
 * combination works as always); letting go of the button after its card does nothing else. */
#define HELP_HOLD 900u
#define HELP_HOLD_SAVE 400u                    /* SAVE is held to copy: its card says what will be copied */
static int perf_testing(void);
static int perf_save_busy(void);
#define HELP_LINES 6
/* Help-card titles use printed legends on SMK; FM-1 retains its panel names.
 * Host tests can select the SMK captions without enabling hardware dependencies. */
#if X0X_SMK_CAPTIONS
static const char *const BTN_LABEL[NB] = {"FX", "SCALE", "CHORD", "NOTE REPEAT", "PARA", "GLOBE", "PATCH", "BT", "ARP", "SEQ", "SEQ PLAY", "SEQ REC", "OCTAVE-", "OCTAVE+"};
static const char *btn_label(int i) { return BTN_LABEL[i]; }
#elif defined(X0X_HOST)
static const char *const BTN_LABEL[NB] = {"FX", "SEL", "ENV", "LFO", "EDIT", "GLO", "HOME", "SAVE", "ARP", "SEQ",
                                          "PLAY / STOP", "REC", "OCT-", "OCT+"};
static const char *btn_label(int i) { return BTN_LABEL[i]; }
#else
static const char *btn_label(int i) { return i == B_PLAY ? "PLAY / STOP" : B_NAME[i]; }
#endif

static int help_lines(int b, const char *l[HELP_LINES])
{
    int n = 0, gen = ui.view == V_GEN, kbd = is_303() && ui.rec;
#define L(s) (l[n++] = (s))
    switch (b) {
    case B_FX: L("THE EFFECTS: REVERB, DELAY,"); L("TAPE AND KIT DRIVE"); L("AGAIN: THE NEXT PAGE"); break;
    case B_SEL: L("THIS SCREEN AS A LIST"); L("IN A LIST: RUN THE ACTION"); L("IN A QUESTION: YES"); break;
    case B_ENV:
        if (is_303()) { L("HOLD + KEY: AN ACCENT"); if (kbd) L("WRITING: + " UI_CAP_OCT ": REST"); }
        else if (is_drum()) { L("HOLD + WHITE KEY: ACCENT"); L("HOLD + BLACK KEY: LOUD HIT"); }
        else L("HOLD + KEY: AN ACCENT");
        break;
    case B_LFO:
        L("THE MIXER AND THE MASTER"); L("AGAIN: THE NEXT PAGE");
        if (ui.view == V_MIX) L(UI_CAP_HOME " + BLACK KEY: MUTE");
        if (is_303()) { L("HOLD + KEY: A SLIDE"); if (kbd) L("HOLD + " UI_CAP_OCT ": TIE"); }
        break;
    case B_EDIT: L("THE PART'S SOUND"); L("AGAIN: THE NEXT PAGE"); L("HOLD A STEP + KNOB: P-LOCK");
        L("STEP + " UI_CAP_SELECT ": CHANCE"); break;
    case B_GLO: L("SETTINGS, SAVE, LOAD,"); L("RESET, CLEAR, PERFORMANCE"); L("AGAIN: CLOSE"); break;
    case B_HOME:
#if X0X_BASS_PRESET_PREVIEW
        if (ui.view==V_PART && is_303() && pg.r[cur_page()][0].kind==R_BENGINE &&
            engine_bass_preset_pending(bidx())) L("TAP: CANCEL SOUND REQUEST");
        else
#endif
            L("THE PATTERN: ALL FIVE PARTS");
        L("AGAIN: SONG  + " UI_CAP_SELECT ": TEMPO"); L("+ WHITE KEY: PATTERN");
        if (is_drum() && part_view()) L("+ BLACK KEY: MUTE THE TRACK");
        L("+ " UI_CAP_REC ": UNDO  + " UI_CAP_PLAY ": REDO"); L("LIST: BACK   QUESTION: NO");
        break;
    case B_SAVE: {                                   /* the pattern a copy takes */
        static char cp[40], cl[32], st[40];
        put_s(cp, "+ WHITE KEY: COPY LIVE PARTS");
        put_s(put_s(cl, "+ " UI_CAP_REC ": CLEAR "), part_name(ui.part));
        if (ui.rec && !proj.set.autosave_off && save_state() == SAVE_UNSAVED)
            put_s(st, UI_CAP_REC " OFF FOR AUTOSAVE");
        else
            put_s(put_s(st, proj.set.autosave_off ? "AUTO OFF / " : "AUTO ON / "),
                  save_state() == SAVE_QUEUED ? queued_save_label() : save_state() == SAVE_FAILED ? "SAVE FAILED" :
                  save_state() == SAVE_UNSAVED ? "UNSAVED" : "SAVED");
        L("TAP: SAVE EVERYTHING"); L(cp); L(ui.pbank ? "TO P17-32 (+ " UI_CAP_OCT "-: P1-16)" : "TO P1-16 (+ " UI_CAP_OCT "+: P17-32)"); L(cl);
        L("+ KNOB: FORGET ITS MOTION"); L(st);
        break;
    }
    case B_ARP:
        L("TB-3PO: THE 303 LINE"); L("GENERATOR (CHICAGO, MIAMI)");
        if (gen) { L(UI_CAP_OCT "+: A NEW LINE"); L(UI_CAP_OCT "-: MUTATE IT"); }
        L("AGAIN: THE NEXT PAGE");
        break;
    case B_SEQ:
        L("THE PART'S STEPS: LENGTH, RATE"); L("AGAIN: THE NEXT PAGE"); L("STEP + " UI_CAP_SELECT ": CHANCE");
        if (is_303()) L("STEP + " UI_CAP_ALGO ": VELOCITY");
        break;
    case B_PLAY: L("START / STOP"); L(UI_CAP_HOME " + " UI_CAP_PLAY ": REDO"); break;
    case B_REC:
        L("RECORD ON / OFF:"); L(is_303() ? "THE KEYS PLAY AND WRITE NOTES" : "BLACK KEYS, KNOB MOVES");
        L(UI_CAP_HOME " + " UI_CAP_REC ": UNDO"); L(UI_CAP_SAVE " + " UI_CAP_REC ": CLEAR PART");
        break;
    case B_OCTDN:
    case B_OCTUP:
        if (gen) L(b == B_OCTUP ? "A NEW 303 LINE" : "MUTATE THE LINE");
        else if (kbd) { L("THE KEYBOARD'S OCTAVE"); L(UI_CAP_LFO "+" UI_CAP_OCT ": TIE"); L(UI_CAP_ENV "+" UI_CAP_OCT ": REST"); }
        else if (ui.view == V_HOME || ui.view == V_SONG) L(b == B_OCTUP ? "PATTERNS 17-32" : "PATTERNS 1-16");
        else {
            L(b == B_OCTUP ? "THE NEXT 16 STEPS" : "THE 16 STEPS BEFORE"); L("PAGES: 1-16 17-32 33-48 49-64");
            if (is_303()) L("HOLDING A STEP: ITS OCTAVE");
        }
        break;
    default: break;
    }
#undef L
    return n;
}

/* SAVE held on its own a moment: invite a destination, without claiming a
 * snapshot exists before the player chooses one. */
#define COPY_HOLD 250u
static void copy_tick(uint32_t btn, uint32_t keys)
{
    static uint8_t said;
    uint32_t m = 1u << B_SAVE;
    if (!(btn & m)) {
        said = 0;
        return;
    }
    if (!said && btn == m && !keys && !(ui.btn_used & m) && ui.overlay != O_ASK &&
        plat_ms() - ui.down_t[B_SAVE] >= COPY_HOLD && (int32_t)(ui.turn_t - ui.down_t[B_SAVE]) <= 0) {
        say("CHOOSE PASTE TARGET", 0);
        said = 1;
    }
}

static void help_tick(uint32_t btn, uint32_t keys)
{
    uint32_t now = plat_ms();
    int i;
    if (ui.help) {
        uint32_t m = 1u << (ui.help - 1);
        if (btn != m || keys || (int32_t)(ui.turn_t - ui.down_t[ui.help - 1]) > 0 || ui.overlay == O_ASK)
            ui.help = 0;                                 /* used with something, or let go */
        return;
    }
    if (!btn || (btn & (btn - 1u)) || keys || ui.overlay == O_ASK || perf_testing())
        return;                                          /* exactly one button, nothing else */
    for (i = 0; i < NB; i++)
        if (btn == 1u << i && !(ui.btn_used & btn) && now - ui.down_t[i] >= (i == B_SAVE ? HELP_HOLD_SAVE : HELP_HOLD) &&
            (int32_t)(ui.turn_t - ui.down_t[i]) <= 0) {
            ui.help = (uint8_t)(i + 1);
            ui.btn_used |= btn;                          /* its release now does nothing */
        }
}

/* ================================================================ undo === */
/* HOME + REC undoes, HOME + PLAY redoes (undo.c): everything after the settings is undoable, the
 * sound, the patterns, the song and the knob motion. A step is one gesture: what changed between
 * two quiet moments (UNDO_QUIET ms with nothing touched or held), or a whole recording pass. */
#define UNDO_QUIET 400u
#define UNDO_OFF __builtin_offsetof(project_t, sound)
#define UNDO_BYTES (sizeof(project_t) - UNDO_OFF)
static undo_t undo X0X_POOL;
/* Project transfers temporarily borrow the undo baseline. The history stays in undo.pool;
 * abort copies the live project back, and successful replacement starts a new history. */
#define undo_shadow ((uint8_t *)&project_stage + UNDO_OFF)
#if X0X_BASS_TAGGED_SOUND
static uint8_t undo_bass_mask,undo_wait; /* 1 undo, 2 redo */
static int undo_wait_cur;
static uint32_t undo_wait_used,undo_wait_serial;
#endif
static uint8_t undo_lanes;             /* the last undo / redo touched the knob motion */

static void undo_start(void) {
#if X0X_BASS_TAGGED_SOUND
    undo_wait=0;
#endif
    undo_init(&undo, (uint8_t *)&proj + UNDO_OFF, undo_shadow, UNDO_BYTES); }

static int undo_commit_stable(void)
{
#if X0X_BASS_PRESET_PREVIEW
    /* Preset application writes a bank and tag from the audio boundary. Keep
     * it pending while undo measures and copies the project snapshot. */
    engine_bass_edit_hold(1);
#endif
    int result = undo_commit(&undo);
#if X0X_BASS_PRESET_PREVIEW
    engine_bass_edit_hold(0);
#endif
    return result;
}

static void undo_tick(void)
{
    if (project_busy || perf_testing() || (ui.rec && seq.playing) || ui.btn || ui.keys || plat_ms() - ui.act_t < UNDO_QUIET ||
        (ui.frame & 3u))
        return;
    undo_commit_stable();
}

/* a run of the project changed under the engine: the sound's pots go to the engine again */
static void undo_changed(uint32_t off, uint32_t len)
{
    const uint32_t s0 = __builtin_offsetof(project_t, sound), s1 = s0 + sizeof(proj.sound.v);
    const uint32_t l0 = __builtin_offsetof(project_t, arr) + __builtin_offsetof(arrange_t, lane);
    uint32_t a = off + UNDO_OFF, k;
    for (k = a; k < a + len; k++) {
        if (k >= s0 && k < s1) {
            uint32_t x = k - s0, t = x / (NVOICES_MAX * NPARAMS_MAX), v = (x / NPARAMS_MAX) % NVOICES_MAX,
                     i = x % NPARAMS_MAX;
#if X0X_BASS_TAGGED_SOUND
            if((t==T_303 && (undo_bass_mask&(1u<<v))) ||
               (t==T_MIX && v>=PART_303A && v<=PART_303B && (undo_bass_mask&(1u<<(v-PART_303A)))))continue;
#endif
            if ((int)v < engine_nvoices((int)t) && (int)i < engine_nparams((int)t, (int)v))
                ui_restore_base((int)t, (int)v, (int)i);
        } else if (k >= l0) {
            undo_lanes = 1;
        }
    }
}

/* what an undo step touched, in words: "909 P3", "SOUND", "SONG", "MOTION" */
static void undo_name(uint32_t lo, uint32_t hi, char *t)
{
    const uint32_t p0 = __builtin_offsetof(project_t, pat), a0 = __builtin_offsetof(project_t, arr),
                   l0 = a0 + __builtin_offsetof(arrange_t, lane);
    uint32_t a = lo + UNDO_OFF, b = hi + UNDO_OFF;
    if (b < p0) {
        put_s(t, "SOUND");
    } else if (a >= p0 && b < a0 && (a - p0) / sizeof(pattern_t) == (b - p0) / sizeof(pattern_t)) {
        uint32_t pi = (a - p0) / sizeof(pattern_t), x = (a - p0) % sizeof(pattern_t), y = (b - p0) % sizeof(pattern_t);
        int pa = (int)(x < __builtin_offsetof(pattern_t, bass) ? x / sizeof(dpart_t)
                       : x < __builtin_offsetof(pattern_t, brk) ? NKIT + (x - __builtin_offsetof(pattern_t, bass)) / sizeof(bpart_t)
                       : PART_BRK);
        int pb = (int)(y < __builtin_offsetof(pattern_t, bass) ? y / sizeof(dpart_t)
                       : y < __builtin_offsetof(pattern_t, brk) ? NKIT + (y - __builtin_offsetof(pattern_t, bass)) / sizeof(bpart_t)
                       : PART_BRK);
        char *q = put_s(t, pa == pb ? part_name(pa) : "PATTERN");
        put_i(put_s(q, " P"), (int)pi + 1);
    } else if (a >= p0 && b < a0) {
        put_s(t, "PATTERNS");
    } else if (a >= a0 && b < l0) {
        put_s(t, "SONG");
    } else if (a >= l0) {
        put_s(t, "MOTION");
    } else {
        put_s(t, "CHANGES");
    }
}

/* Finish an audio-owned recorder before history or bulk pattern edits. Hold is
 * brief, covers state finalization only, and never reinitializes a voice. */
static void record_finish(void)
{
    seq.rec_mask = seq.rec_ext_mask = 0;
    engine_project_hold(1);
    seq.rec_epoch++;
    seq.rec_ev_gen++;
    for (int b = 0; b < NBASS; b++) seq_rec_cancel(&seq, b);
    engine_project_hold(0);
}
static void do_undo(int redo)
{
    record_finish();
    uint32_t lo, hi;
    char t[24];
#if X0X_BASS_PRESET_PREVIEW && !X0X_BASS_TAGGED_SOUND
    if(engine_bass_preview_changed()) { say("UNDO UNAVAILABLE",""); return; }
#endif
#if X0X_BASS_PRESET_PREVIEW
    /* Keep the chosen bank stable through target inspection and swap. The
     * commit helper nests one hold while it scans the undo snapshot. */
    engine_bass_edit_hold(1);
#endif
    undo_commit_stable();                       /* what was just done is a step too */
#if X0X_BASS_TAGGED_SOUND
    undo_wait=0;undo_bass_mask=0;
    int entry=redo?undo.cur:undo.cur-1;
    if(entry>=0 && entry<undo.n) {
        bass_base_state_t target;
        for(int v=0;v<NBASS;v++) {
            uint32_t cell=__builtin_offsetof(sound_t,v)+((T_303*NVOICES_MAX+v)*NPARAMS_MAX);
            uint32_t tag=__builtin_offsetof(sound_t,bass)+v*sizeof(bass_sound_tag_t);
            undo_peek(&undo,entry,cell,target.cell[v],NPARAMS_MAX);
            undo_peek(&undo,entry,tag,target.tag[v].bytes,BASS_SOUND_TAG_BYTES);
            if(memcmp(target.cell[v],proj.sound.v[T_303][v],NPARAMS_MAX) ||
               memcmp(&target.tag[v],&proj.sound.bass[v],sizeof target.tag[v]))undo_bass_mask|=1u<<v;
        }
        if(undo_bass_mask) {
            engine_project_hold(1);
            int ready=engine_bass_base_ready(undo_bass_mask,&target);
            if(ready) {
                engine_project_hold(0);
                if(ready>0) {
                    undo_wait=(uint8_t)(redo?2:1);undo_wait_cur=undo.cur;undo_wait_used=undo.used;
                    undo_wait_serial=engine_bass_choice_serial();say("UNDO WAIT NOTE / INPUT",0);
                } else say(ready==-4?"UNDO SOUND LOCKS":"UNDO ENGINE UNAVAILABLE",0);
#if X0X_BASS_PRESET_PREVIEW
                engine_bass_edit_hold(0);
#endif
                return;
            }
        }
    }
#endif
    undo_lanes = 0;
    if (!(redo ? undo_redo : undo_undo)(&undo, undo_changed, &lo, &hi)) {
#if X0X_BASS_TAGGED_SOUND
        if(undo_bass_mask)engine_project_hold(0);
#endif
#if X0X_BASS_PRESET_PREVIEW
        engine_bass_edit_hold(0);
#endif
        say(redo ? "NOTHING TO REDO" : "NOTHING TO UNDO", 0);
        return;
    }
#if X0X_BASS_TAGGED_SOUND
    if(undo_bass_mask) {engine_bass_base_restore(undo_bass_mask);engine_project_hold(0);}
#endif
#if X0X_BASS_PRESET_PREVIEW
    engine_bass_edit_hold(0);
#endif
    song_structure_revision++;                     /* undo may restore/reorder song bars */
    if (undo_lanes)
        engine_motion_reset();
    engine_brk_loops();
    ui.outline_ok = 0;
    if (ui.song_sel > song()->len)
        ui.song_sel = song()->len;
    build_pages();
    mark_dirty();
    undo_name(lo, hi, t);
    say(redo ? "REDO " : "UNDO ", t);
}

/* SAVE while playing waits for the stop: writing the flash stops the audio (the code and the samples
 * are read from it, and a 4 KB erase takes tens of ms) */
#define AUTOSAVE_QUIET 4000u
X0X_COLD int ui_boot_flash_busy(void)
{
#if BOARD_SMK37
    extern uint8_t smk_ck_flash_busy(void);
#endif
    if (seq.playing || seq.req_start || seq.req_cont || seq.req_stop || ui.rec || perf_save_busy()
        || engine_project_notes()
#if BOARD_SMK37
        || smk_ck_flash_busy()
#endif
    )
        return 1;
    return 0;
}

X0X_COLD int ui_project_save(void)
{
    int rc;
#if BOARD_SMK37
    extern uint8_t smk_ck_flash_busy(void);
#endif
#ifndef X0X_HOST
    extern int store_stage_held(void);
#endif
    if (project_busy || ui_boot_flash_busy() || seq.playing || seq.req_start || seq.req_cont || seq.req_stop ||
        ui.rec || perf_save_busy()
#if BOARD_SMK37
        || smk_ck_flash_busy()
#endif
#ifndef X0X_HOST
        || store_stage_held()
#endif
    )
        return UI_PROJECT_BUSY;
    save_wait = 0;
    rc = project_save();
    if (project_storage_unsupported() != 2)
        say(rc == -9 ? "NEWER DATA: NOT SAVED" : rc == -7 ? "MEMORY FULL: NOT SAVED" : rc ? "SAVE FAILED" : "SAVED", 0);
    ui.save_failed = rc != 0;
    if (!rc)
        ui.dirty = 0;
    return rc;
}

static void save_project(void)
{
#if BOARD_SMK37
    extern uint8_t smk_ck_flash_busy(void), smk_clip_mode_on(void);
#endif
    if (project_storage_unsupported() == 2) {
        save_wait = 0;
        ui.save_failed = 1;
        return; /* keep the warning glyph; only validated adoption unlocks */
    }
    if (project_busy) {
        say("PROJECT TRANSFER BUSY", 0);
        return;
    }
    if (!ui_boot_flash_busy()
#if BOARD_SMK37
        && !(smk_clip_mode_on() && (smk_ck_flash_busy() || plat_ms() - ui.act_t < AUTOSAVE_QUIET))
#endif
    ) {
        if (ui_project_save() != UI_PROJECT_BUSY)
            return;
    }
    /* A held MIDI note, queued audio input or other transient owner may make
     * the final readiness check busy. Keep the user's explicit save request. */
    save_wait = 1;
    say(queued_save_message(), 0);
}

/* ============================================================ performance === */
/* PERF: what the FM-1 measures of itself, a window a second: the clock (the core's cycle counter
 * against the 24 MHz timer), the audio load and its peak, dropouts, stall cycles (when switched on),
 * and each stage's share of the CPU (the engine times them: engine.h ENG_PROF_N). PERF TEST plays
 * three patterns of its own (the factory loop, all five parts, a dense worst case) on the factory
 * sound, 1 s to settle and 3 s measured each, and keeps the table; then it puts back the project's
 * patterns, sound, tempo, mutes, chain and song mode. The project itself is never written. */
static const char *const PT_N[3] = {"FACTORY LOOP", "ALL FIVE", "WORST CASE"};
#ifdef PERF_SCRATCH
#define perf_bench ((pattern_t *)(void *)PERF_SCRATCH)
#else
static pattern_t perf_bench[3];
#endif

static void perf_window(int force)
{
    uint32_t now = plat_ms(), t = plat_ticks24(), c = plat_cycles(), f = eng_prof_frames, st[3];
    uint32_t dt = t - perf.ticks, dc = c - perf.cyc, df = f - perf.frames, sum = 0;
    float ups;
    int k;
    if (!force && now - perf.t_ms < 1000u)
        return;
    perf.t_ms = now;
    if (perf.have && df) {
        if (plat_cycles_cpu() && dt >= 240u)
            perf.mhz10 = (uint16_t)(dc / (dt / 240u));          /* cycles per (dt / 24) us, x 10 */
        ups = plat_cycles_cpu() ? (float)perf.mhz10 * (100000.0f / 44100.0f) : (float)plat_cycles_hz() / 44100.0f;
        for (k = 0; k < ENG_PROF_N; k++) {
            uint32_t d = eng_prof[k] - perf.prof[k];
            sum += d;
            perf.stage[k] = (uint16_t)((float)d * 1000.0f / ((float)df * ups) + 0.5f);
        }
        perf.cps = plat_cycles_cpu() ? (uint16_t)(sum / df) : 0;
        perf.load = (uint8_t)plat_cpu_pct();
        perf.peak = (uint8_t)plat_cpu_peak_pct();
        if (plat_stalls(st) == 0 && dc)
            for (k = 0; k < 3; k++)
                perf.stall[k] = (uint8_t)((float)(st[k] - perf.st[k]) * 100.0f / (float)dc + 0.5f);
    } else {
        plat_cpu_peak_pct();
    }
    perf.ticks = t;
    perf.cyc = c;
    perf.frames = f;
    for (k = 0; k < ENG_PROF_N; k++)
        perf.prof[k] = eng_prof[k];
    if (plat_stalls(st) == 0)
        for (k = 0; k < 3; k++)
            perf.st[k] = st[k];
    perf.have = 1;
}

/* the test's patterns: 0 the factory loop (909 kick, clap, open hats; 303 A; the break), 1 all five,
 * 2 everything dense */
static void perf_build(void)
{
    /* the tracks in key order (pattern.h): 909 BD SD LT MT HT RS CP CH OH CR RD, 808 ... CB CY OH CH */
    enum { DR_BD, DR_SD, DR_LT, DR_MT, DR_HT, DR_RS, DR_CP, DR_CH, DR_OH, DR_CR, DR_RD };
    enum { D8_BD, D8_SD, D8_LT, D8_MT, D8_HT, D8_RS, D8_CP, D8_CB, D8_CY, D8_OH, D8_CH };
    int i;
    for (i = 0; i < 3; i++) {
        pattern_t *p = &perf_bench[i];
        dpart_t *a = &p->drum[0], *b = &p->drum[1];
        pattern_init(p, 0x3B0u + 977u * (uint32_t)i, 0x5A1u + 613u * (uint32_t)i);
        tb3po_generate(&p->bass[0]);
        if (i)
            tb3po_generate(&p->bass[1]);
        p->brk.steps = 0xFFFFu;
        a->hit[DR_BD][0] = 0x1111u;
        a->hit[DR_CP][0] = 0x1010u;
        a->hit[DR_OH][0] = 0x4444u;
        a->accent[0] = 0x0101u;
        if (i >= 1) {
            b->hit[D8_BD][0] = 0x1111u;
            b->hit[D8_CP][0] = 0x1010u;
            b->hit[D8_CH][0] = 0x1111u;
            b->hit[D8_OH][0] = 0x4444u;
            b->hit[D8_CB][0] = 0x0808u;
        }
        if (i == 2) {
            a->hit[DR_SD][0] = 0x1010u;
            a->hit[DR_CH][0] = 0xFFFFu;
            a->hit[DR_CR][0] = 0x0001u;
            a->hit[DR_RD][0] = 0x1111u;
            a->hit[DR_LT][0] = 0x4000u;
            a->accent[0] = 0x1111u;
            b->hit[D8_SD][0] = 0x1010u;
            b->hit[D8_CH][0] = 0xFFFFu;
            b->hit[D8_CY][0] = 0x0101u;
            b->hit[D8_LT][0] = 0x8080u;
        }
    }
}

static void perf_restore(void)
{
    int p;
    record_finish();
    seq.pat = perf.pat;
    for (p = 0; p < NPARTS; p++) {
        seq.ppat[p] = perf.ppat[p];
        seq.pcue[p] = 0xFF;
    }
    seq.mute = perf.mute;
    seq.song_on = perf.song_on;
    seq_chain(&seq, perf.ca, perf.cb);
    seq.bpm = perf.bpm;
    engine_apply_sound(&proj.sound);
    engine_motion_enable(1);
    engine_guard_enable(1);
    engine_brk_loops();
}

static void perf_test_start(void)
{
    int p;
    if (perf.test >= 0 && perf.phase != 4)
        return;
    perf.pat = seq.pat;
    for (p = 0; p < NPARTS; p++)
        perf.ppat[p] = seq.ppat[p];
    perf.mute = seq.mute;
    perf.song_on = seq.song_on;
    perf.ca = seq.chain_a;
    perf.cb = seq.chain_b;
    perf.bpm = seq.bpm;
    if (seq.playing)
        seq_stop(&seq);
    perf.test = 0;
    perf.phase = 0;
    for (p = 0; p < 3; p++)
        perf.res_load[p] = perf.res_cps[p] = perf.res_peak[p] = 0;
}

static void perf_test_abort(void)
{
    seq_stop(&seq);
    perf.phase = 3;
    perf.test = 0;
    say("PERF TEST STOPPED", 0);
}

/* the test, one step a frame (the main loop): the transport changes take a block to land */
static void perf_test_tick(void)
{
    uint32_t now = plat_ms();
    int p;
    if (perf.test < 0 || perf.phase == 4)
        return;
    switch (perf.phase) {
    case 0:                                           /* stopped: swap in the test's patterns and sound */
        if (seq.playing || seq.req_stop)              /* (a pending stop would cancel the start below) */
            return;
        record_finish();
        perf_build();                                 /* here, after the last save that can run (PERF_SCRATCH) */
        for (p = 0; p < NPARTS; p++) {
            seq.ppat[p] = 0;
            seq.pcue[p] = 0xFF;
        }
        seq.pat = perf_bench;
        seq.mute = 0;
        seq.song_on = 0;
        seq_chain(&seq, 0, 0);
        seq.bpm = 125.0f;
        engine_sound_defaults(&proj.sound);
        engine_apply_sound(&proj.sound);
        engine_motion_enable(0);
        engine_guard_enable(0);
        engine_brk_loops();
        seq_start(&seq);
        perf.phase = 1;
        perf.test_t0 = now;
        break;
    case 1:                                           /* settle on the scenario's pattern */
        if (!seq.playing && now - perf.test_t0 > 200u) {
            perf_test_abort();
            return;
        }
        if (now - perf.test_t0 >= 1000u && seq.ppat[PART_909] == perf.test) {
            perf_window(1);
            perf.phase = 2;
            perf.test_t0 = now;
        }
        break;
    case 2:                                           /* measure 3 s */
        if (!seq.playing) {
            perf_test_abort();
            return;
        }
        if (now - perf.test_t0 >= 3000u) {
            int k;
            uint32_t sum = 0;
            perf_window(1);
            for (k = 0; k < ENG_PROF_N; k++)
                sum += perf.stage[k];
            perf.res_load[perf.test] = (uint16_t)sum;
            perf.res_peak[perf.test] = perf.peak;
            perf.res_cps[perf.test] = perf.cps;
            if (++perf.test < 3) {
                seq_cue(&seq, perf.test);
                perf.phase = 1;
                perf.test_t0 = now;
            } else {
                seq_stop(&seq);
                perf.phase = 3;
            }
        }
        break;
    default:                                          /* put everything back once stopped */
        if (seq.playing || seq.req_stop)
            return;
        perf_restore();
        perf.phase = 4;
        if (perf.test == 3) {
            perf.test = PT_DONE;
            say("PERF TEST DONE", 0);
        } else {
            perf.test = PT_IDLE;
        }
        break;
    }
}

static int saved_sound_present(int part)
{
    int target, voice, nvoice, tag;
    return !sound_reset_span(part, &target, &voice, &nvoice, &tag) &&
        !sound_reset_empty(&proj.sound, target, voice, nvoice, tag);
}

static void ask_sound_reset(int part)
{
    engine_bass_edit_hold(1);
    if (saved_sound_present(part)) ask(ACT_RESET_SOUND, part, "RESET SOUND", part_name(part));
    else say("NO SAVED SOUND ", part_name(part));
    engine_bass_edit_hold(0);
}

/* Foreground only. Stack factory image avoids persistent RAM and never borrows
 * project_stage: that object holds the undo baseline. Reset is one gesture. */
X0X_COLD static void reset_sound(int part)
{
    sound_t factory;
    int target, voice, nvoice, tag;
    uint8_t mute_proxy = (uint8_t)seq.mute; /* data helper only checks this pointer for null */
    if (project_busy || sound_reset_span(part, &target, &voice, &nvoice, &tag)) return;
    engine_bass_edit_hold(1);
    if (!saved_sound_present(part)) {
        say("NO SAVED SOUND", 0);
        engine_bass_edit_hold(0);
        return;
    }
    record_finish(); /* finalize audio-owned recording before the undo snapshot */
    engine_sound_defaults(&factory);
#if X0X_BASS_TAGGED_SOUND
    unsigned mask = tag >= 0 ? 1u << tag : 0;
    if (mask) {
        bass_base_state_t next;
        memcpy(next.cell, factory.v[T_303], sizeof next.cell);
        memcpy(next.tag, factory.bass, sizeof next.tag);
        engine_project_hold(1);
        int ready = engine_bass_base_ready(mask, &next);
        if (ready) {
            engine_project_hold(0);
            ui.overlay = O_ASK; /* retry after notes/input or sound locks are released */
            say(ready > 0 ? "UNDO WAIT NOTE / INPUT" :
                ready == -4 ? "UNDO SOUND LOCKS" : "UNDO ENGINE UNAVAILABLE", 0);
            engine_bass_edit_hold(0);
            return;
        }
    }
#endif
    /* Keep preceding mixer/part edits out of the reset's undo entry. */
    undo_commit_stable();
    int result = sound_reset_part(&proj.sound, &factory, part, &mute_proxy, &undo);
    if (result == SOUND_RESET_OK) {
#if X0X_BASS_TAGGED_SOUND
        if (mask) engine_bass_base_restore(mask);
        else
#endif
        for (int v = 0; v < nvoice; ++v)
            for (int i = 0; i < engine_nparams(target, voice + v) && i < NPARAMS_MAX; ++i)
                ui_restore_base(target, voice + v, i);
        mark_dirty();
        build_pages();
        say("RESET SOUND ", part_name(part));
    } else say(result == SOUND_RESET_NO_SAVED ? "NO SAVED SOUND" : "UNDO UNAVAILABLE", 0);
#if X0X_BASS_TAGGED_SOUND
    if (mask) engine_project_hold(0);
#endif
    engine_bass_edit_hold(0);
}

static void set_view(int v);

X0X_COLD static void run_action(int act, int arg)
{
    char t[28];
    if (act == ACT_CLEAR_PART || act == ACT_CLEAR_PAT || act == ACT_COPY) record_finish();
    switch (act) {
    case ACT_RESET_SOUND: reset_sound(arg); break;
    case ACT_SAVE: save_project(); break;
    case ACT_LOAD: (void)ui_project_load(); break;
    case ACT_CLEAR_PART:
        clear_part(pat_of(arg), arg);
        clear_lanes(seq.ppat[arg], arg);
        mark_dirty();
        say("CLEARED ", part_name(arg));
        break;
    case ACT_CLEAR_PAT: {
        int i;
        for (i = 0; i < NPARTS; i++) {
            clear_part(pat_of(i), i);
            clear_lanes(seq.ppat[i], i);
        }
        mark_dirty();
        say("PATTERN CLEARED", 0);
        break;
    }
    case ACT_COPY: {                                  /* all five parts, from the source slots selected */
        int dst = arg & 0xFF, i, rc = 0;              /* with the destination key */
        for (i = 0; i < NPARTS; i++)
            if (ui.paste_src[i] != dst)
                rc |= copy_part(dst, ui.paste_src[i], i);
        mark_dirty();
        put_i(put_s(t, "PARTS PASTED TO P"), dst + 1);
        say(rc ? "MOTION FULL: NOT ALL PASTED" : t, 0);
        break;
    }
    case ACT_SONG_INS:
    case ACT_SONG_DEL: {
        song_t *sg = song();
        int k = ui.song_sel, i;
        if (k >= sg->len) {
            say("NO BAR SELECTED", 0);
            break;
        }
        if (act == ACT_SONG_INS) {
            if (sg->len >= NSONG) {
                say("SONG FULL", 0);
                break;
            }
            for (i = sg->len; i > k; i--)
                sg->bar[i] = sg->bar[i - 1];
            sg->len++;
        } else {
            for (i = k; i + 1 < sg->len; i++)
                sg->bar[i] = sg->bar[i + 1];
            sg->len--;
        }
        song_structure_revision++;
        mark_dirty();
        say(act == ACT_SONG_INS ? "BAR INSERTED" : "BAR DELETED", 0);
        break;
    }
    case ACT_SONG_CLR:
        song_structure_revision++;
        song()->len = 0;
        ui.song_sel = 0;
        mark_dirty();
        say("SONG CLEARED", 0);
        break;
    case ACT_RESET:
        (void)ui_project_reset();
        break;
    case ACT_PERF:
        set_view(V_PERF);
        break;
    case ACT_PERF_TEST:
        ui.overlay = O_NONE;                          /* the table is under the list */
        perf_test_start();
        say("PERF TEST: 15 SECONDS", 0);
        break;
#if BOARD_SMK37 && X0X_DEV_PADCAL
    case ACT_PADCAL: {
        extern void smk_padcal_enter(void);
        ui.overlay = O_NONE;
        smk_padcal_enter();
        break;
    }
#endif
    case ACT_ABOUT: {
        char full[64], *e;
        /* The long line alone carries the diagnostic SHA. The header uses a smaller
         * face when necessary. The settings-row label and compact form omit it. */
        e = put_s(full, "DnBOX " X0X_VERSION "  MEM ");
        e = put_s(put_i(e, project_mem_pct()), "%  CPU ");
        e = put_s(put_i(e, (int)plat_cpu_pct()), "%");
        if (X0X_GIT_SHA[0])
            put_s(put_s(e, " g"), X0X_GIT_SHA);
        for (e = full; *e; e++)
            ;
        if ((unsigned)(e - full) < sizeof ui.msg) {
            say(full, 0);
            break;
        }
        e = put_s(t, "DnBOX ");
        {
            const char *v = X0X_VERSION;
            int n = 0;
            while (v[n] && n < 8 && e < t + (int)sizeof t - 1)
                *e++ = v[n++];
            *e = 0;
        }
        e = put_s(e, " M");
        e = put_i(e, project_mem_pct());
        e = put_s(e, " C");
        put_i(e, (int)plat_cpu_pct());
        say(t, 0);
        break;
    }
    default: break;
    }
}

/* ===================================================================== input === */
/* knob acceleration by speed: a slow turn is one step a detent (fine detail), a quick one up to 8,
 * so a fast half turn sweeps 0-127. Several detents in one read are a fast turn too. Small ranges
 * stay gentler; switches and lists never get here (turn_ref steps them one at a time).
 * SMC strips set accel_smc. Their byte already counts the detents, and the panel's x8 (x16 on a
 * wide range) made a flick leap the pot. A slow click stays one step. A quicker turn still gains,
 * but only the first few detents in that message are multiplied, and a wide range is not doubled. */
static uint8_t accel_off;              /* the host simulator's "spin": exact steps */
static uint8_t accel_smc;              /* this step is an SMC strip, not a panel encoder */
static int32_t accel(int role, int32_t s, int range)
{
    uint32_t now = plat_ms(), dt = now - ui.enc_t[role], a = (uint32_t)(s < 0 ? -s : s), m;
    ui.enc_t[role] = now;
    if (!a)
        return s;
    if (a > 1)
        dt /= a;                                      /* per detent */
    ui.enc_run[role] = (uint8_t)(dt < 60u ? (ui.enc_run[role] + a > 255u ? 255u : ui.enc_run[role] + a) : a);
    if (range <= 24 || accel_off || ui.enc_run[role] < 4u)
        return s;                                     /* a few clicks, however quick: one each */
    if (accel_smc) {
        m = dt < 12u ? 3u : dt < 45u ? 2u : 1u;
        if (range < 100 && m > 2u)
            m = 2u;
        if (m == 1u)
            return s;
        {
            uint32_t head = a < 3u ? a : 3u;
            uint32_t scaled = head * m + (a - head);
            return s < 0 ? -(int32_t)scaled : (int32_t)scaled;
        }
    }
    m = dt < 12u ? 8u : dt < 25u ? 5u : dt < 45u ? 3u : 1u;
    if (range < 100 && m > 3u)
        m = 3u;
    if (range > 150 && m > 1u)
        m *= 2u;
    return s * (int32_t)m;
}

static void set_view(int v)
{
    bass_layout_accept();
    /* A step held on SEQ may carry its p-lock gesture to EDIT's sound knobs.
     * Return to SEQ after key-up so lock_release still uses those knob refs. */
    if (ui.view == V_PART && v == V_SEQ && (ui.held_step >= 0 || ui.hold_step >= 0)) {
        say("RELEASE STEP FIRST", 0);
        return;
    }
#if BOARD_SMK37
    smc_ui_cancel();
#endif
    if (!(ui.view == V_SEQ && v == V_PART)) {
        bass_step_cancel();
        drum_step_cancel();
    }
    if (v != ui.view)
        ui.prev_view = ui.view;
    ui.view = (uint8_t)v;
    /* EDIT may complete a note recorded on SEQ, but accepts no new recorded
     * MIDI/key onset. Keep the two recorder contexts distinct across pages. */
    seq.rec_mask = ui.rec && is_303() && v == V_SEQ ? (uint8_t)(1u << bidx()) : 0;
    seq.rec_ext_mask = ui.rec ? (uint8_t)((1u << NBASS) - 1u) : 0;
    seq.rec_hold_mask = ui.rec && is_303() && v == V_PART ? (uint8_t)(1u << bidx()) : 0;
    ui.brk_held = -1;
    ui.overlay = O_NONE;
    build_pages();
}

/* a sound knob turned: record its lane (REC, playing), or let the knob win over the lane for a pass */
static void motion_touch(pref_t r)
{
    int part, k;
    if (r.kind != R_ENG || !seq.playing)
        return;
    part = engine_motion_part(r.a, r.b);
    k = motion_find(proj.arr.lane, seq.ppat[part], part, r.a, r.b, r.c);
    if (ui.rec) {
        if (k < 0 && (k = motion_alloc(proj.arr.lane, seq.ppat[part], part, r.a, r.b, r.c)) < 0) {
            say("MOTION FULL", 0);
            return;
        }
        engine_motion_rec(k);
    } else if (k >= 0) {
        engine_motion_hold(k);
    }
}

/* SAVE held + a sound knob: forget its motion in this pattern */
static void motion_forget(pref_t r)
{
    int part, k;
    if (r.kind != R_ENG)
        return;
    part = engine_motion_part(r.a, r.b);
    k = motion_find(proj.arr.lane, seq.ppat[part], part, r.a, r.b, r.c);
    if (k < 0) {
        say("NO MOTION ON ", pref_name(r));
        return;
    }
    engine_motion_clear(k);
    ui_restore_base(r.a,r.b,r.c);
    mark_dirty();
    say("MOTION CLEARED: ", pref_name(r));
}

/* what a knob's lane plays now in this pattern, -1 none (the knob strip draws it) */
static int motion_now(pref_t r)
{
    int part;
    if (r.kind != R_ENG)
        return -1;
    part = engine_motion_part(r.a, r.b);
    return engine_motion_value(motion_find(proj.arr.lane, seq.ppat[part], part, r.a, r.b, r.c));
}
static int has_motion(pref_t r)
{
    int part;
    if (r.kind != R_ENG)
        return 0;
    part = engine_motion_part(r.a, r.b);
    return motion_find(proj.arr.lane, seq.ppat[part], part, r.a, r.b, r.c) >= 0;
}

/* p-locks: on EDIT, a step held (one already there: a tap still toggles it) and a sound knob turned
 * give that step its own value, one step of the knob's lane (motion.h: the other steps keep the knob's) */
static int held_drum_step(void)
{
    return is_drum() && ui.hold_drum == ui.part * NDRUM + ui.sel[ui.part] &&
           ui.hold_pat == seq.ppat[ui.part] ? ui.hold_step : -1;
}

static int lock_step(void)
{
    if (ui.view != V_PART || ui.overlay != O_NONE)
        return -1;
    if (is_303())
        return ui.rec ? -1 : ui.held_step;
    return is_drum() ? held_drum_step() : ui.brk_held;
}
static int lockable(pref_t r) { return r.kind == R_ENG && !pref_read_only(r) && engine_motion_part(r.a, r.b) == ui.part; }
static int lock_of(pref_t r, int s)                  /* step s's own value of r, -1 none */
{
    int k;
    if (s < 0 || !lockable(r))
        return -1;
    k = motion_find(proj.arr.lane, seq.ppat[ui.part], ui.part, r.a, r.b, r.c);
    return k >= 0 && proj.arr.lane[k].val[s] != MOT_NONE ? proj.arr.lane[k].val[s] : -1;
}
/* Called under edit_hold: a reference built for an old admitted bank cannot
 * acquire a new meaning merely because a pending selection crossed a boundary. */
static int original_ref_current(pref_t r)
{
    if (r.kind != R_ENG || r.a != T_303 || ui.view != V_PART || !is_303() || r.b != bidx()) return 1;
    int shown = ui.overlay == O_LIST ? original_list_bank : original_page_bank;
    if (shown == engine_bass_bank(r.b)) return 1;
    build_pages();
    if (ui.overlay == O_LIST) open_list_of_pages();
    ui.touched = -1;
    return 0;
}
static int original_switch_turn(pref_t r,int current,int direction,int exact_base)
{
    if(r.kind!=R_ENG || r.a!=T_303 || !direction)return -1;
    int kind=engine_bass_sound_bank(&proj.sound,r.b);
    unsigned states=ui_original_states((unsigned)kind,r.c);
    if(!states)return -1;
    float value=(float)current/127.0f;
    if(exact_base)(void)original_sound_value(proj.sound.v[T_303][r.b],r.c,&value);
    int next=(int)ui_original_quant(value,states)+(direction>0?1:-1);
    if(next<0)next=0;
    if(next>=(int)states)next=(int)states-1;
    return (next*127+(int)(states-1)/2)/(int)(states-1);
}
static int original_display_value(pref_t r)
{
    int value = pref_get(r), preview = -1;
    if (lock_step() >= 0) preview = lock_of(r,lock_step());
    else preview = motion_now(r);
    return preview >= 0 ? preview : value;
}
static const ui_original_control_view *original_text_view(pref_t r, int value)
{
    const uint8_t *cell = proj.sound.v[T_303][r.b];
    unsigned kind = (unsigned)engine_bass_sound_bank(&proj.sound,r.b);
    uint32_t relevant = kind == ORIGINAL_SOUND_CHICAGO ? UI_ORIGINAL_CHICAGO_TEXT_MASK :
        kind == ORIGINAL_SOUND_MIAMI ? UI_ORIGINAL_MIAMI_TEXT_MASK : 0u;
    uint8_t preview[22] = {0}; uint32_t mask = 0;
    for (unsigned id = 0; id < original_sound_count(kind); id++) if (relevant & (1u<<id)) {
        pref_t ref = PR(R_ENG,T_303,r.b,id);
        int q = lock_step() >= 0 ? lock_of(ref,lock_step()) : motion_now(ref);
        if (q >= 0) { preview[id] = (uint8_t)q; mask |= 1u<<id; }
    }
    if ((relevant & (1u<<r.c)) && value != cell[r.c]) { preview[r.c]=(uint8_t)value; mask |= 1u<<r.c; }
    return ui_original_controls_update(&original_controls,r.b,cell,preview,mask) ? &original_controls.view : 0;
}

/* The engine waveform of an oscillator control, with the same lock/motion
 * preview as the text readout. 0 when the slot has no waveform. */
static const ui_original_wave_cache *original_wave_view(pref_t r, int value)
{
    const uint8_t *cell = proj.sound.v[T_303][r.b];
    unsigned kind = (unsigned)engine_bass_sound_bank(&proj.sound,r.b);
    if (kind == ORIGINAL_SOUND_JUNO || kind == ORIGINAL_SOUND_DRONE) return 0; /* drone has no Miami oscillator UI */
    uint32_t relevant = kind == ORIGINAL_SOUND_CHICAGO ? UI_ORIGINAL_CHICAGO_WAVE_MASK : UI_ORIGINAL_MIAMI_WAVE_MASK;
    uint8_t preview[22] = {0}; uint32_t mask = 0;
    for (unsigned id = 0; id < original_sound_count(kind); id++) if (relevant & (1u<<id)) {
        pref_t ref = PR(R_ENG,T_303,r.b,id);
        int q = lock_step() >= 0 ? lock_of(ref,lock_step()) : motion_now(ref);
        if (q >= 0) { preview[id] = (uint8_t)q; mask |= 1u<<id; }
    }
    if ((relevant & (1u<<r.c)) && value != cell[r.c]) { preview[r.c]=(uint8_t)value; mask |= 1u<<r.c; }
    return ui_original_wave_update(&original_wave,r.b,cell,preview,mask) ? &original_wave : 0;
}

static void lock_turn(pref_t r, int e, int role)
{
    int s = lock_step(), part = ui.part, k, cur, nv;
#if X0X_BASS_PRESET_PREVIEW
    /* The active preset can change the descriptor at an audio boundary. Keep
     * descriptor, first lane allocation, lock value and audible preview in
     * one engine-identity transaction, including all early exits. */
    int bass_edit = r.kind == R_ENG && r.a == T_303;
    if (bass_edit) engine_bass_edit_hold(1);
#endif
    const x0x_param_t *d = pref_desc(r);
    lane_t *l;
    if (!original_ref_current(r)) goto done;
    if (!d)
        goto done;
    if (!lockable(r)) {
        say("NO P-LOCK: ", caps_of(pref_name(r)));
        goto done;
    }
    if (is_303())
        ui.step_edited = 1;                           /* its release keeps the step */
    else
        ui.hold_used = 1;
    k = motion_find(proj.arr.lane, seq.ppat[part], part, r.a, r.b, r.c);
    if (ui.btn & (1u << B_SAVE)) {                    /* SAVE + the knob: the step's lock goes */
        int j, any = 0;
        ui.btn_used |= 1u << B_SAVE;
        if (k < 0 || proj.arr.lane[k].val[s] == MOT_NONE)
            goto done;
        l = &proj.arr.lane[k];
        l->val[s] = MOT_NONE;
        for (j = 0; j < NSTEPS; j++)
            any |= l->val[j] != MOT_NONE;
        if (!any)
            engine_motion_clear(k);
        if (!seq.playing)
            ui_restore_base(r.a, r.b, r.c);
        mark_dirty();
        say("P-LOCK CLEARED: ", caps_of(pref_name(r)));
        goto done;
    }
    if (k < 0 && (k = motion_alloc(proj.arr.lane, seq.ppat[part], part, r.a, r.b, r.c)) < 0) {
        say("MOTION FULL", 0);
        goto done;
    }
    l = &proj.arr.lane[k];
    cur = l->val[s] != MOT_NONE ? l->val[s] : proj.sound.v[r.a][r.b][r.c];
    nv=original_switch_turn(r,cur,e,l->val[s]==MOT_NONE);
    if(nv<0)
    {
    e = d->names || d->max < 24 ? (e > 0 ? 1 : -1) : accel(role, e, d->max);
    nv = cur + e;
    nv = nv < 0 ? 0 : nv > d->max ? d->max : nv;
    }
    l->val[s] = (uint8_t)nv;
    if (!seq.playing)                                 /* stopped: heard at once, until the step is let go */
        engine_set(r.a, r.b, r.c, nv);
    mark_dirty();
    ui.touched = (int8_t)(role - EN_K1);
    ui.touch_until = plat_ms() + 900u;
    ui.touch_view = ui.view; ui.touch_part = ui.part; ui.touch_page = (uint8_t)cur_page();
    ui.touch_kind = r.kind; ui.touch_a = r.a; ui.touch_b = r.b; ui.touch_c = r.c;
done:
#if X0X_BASS_PRESET_PREVIEW
    if (bass_edit) engine_bass_edit_hold(0);
#endif
    return;
}
static void lock_release(void)                        /* the held step let go: stopped, the knobs' own back */
{
    int i;
    if (seq.playing)
        return;
    for (i = 0; i < 4; i++) {
        pref_t r = pg.r[cur_page()][i];
        if (lockable(r))
            ui_restore_base(r.a,r.b,r.c);
    }
}

/* Navigation ends a step gesture without treating its later key-up as a tap. The preview belongs
 * to the part that was down, even if a queued pattern switch has changed the screen meanwhile. */
static void bass_step_cancel(void)
{
    if (ui.held_step < 0)
        return;
    if (ui.step_preview)
        engine_bass_off(ui.held_step_part - PART_303A);
    if (ui.step_edited && lock_step() >= 0)
        lock_release();
    ui.step_preview = 0;
    ui.step_edited = 0;
    ui.held_step = -1;
}

static void drum_step_cancel(void)
{
    if (ui.hold_step >= 0 && ui.hold_used && is_drum() &&
        ui.hold_drum == ui.part * NDRUM + ui.sel[ui.part])
        lock_release();                /* restore before selection/navigation replaces the preview's page */
    ui.hold_step = -1;
}

/* probability: SEQ or EDIT, a step held, SELECT sets its chance (5..100 %, a T_PROB lane: motion.h's
 * MOT_NONE = always). Drums: the selected track's step; the 303s and the break: the step */
static int held_any_step(void)
{
    if (!steps_view() || ui.overlay != O_NONE)
        return -1;
    if (is_303())
        return ui.rec ? -1 : ui.held_step;
    return is_drum() ? held_drum_step() : ui.brk_held;
}
static void prob_turn(int e)
{
    int s = held_any_step(), part = ui.part, v = part << 4 | (is_drum() ? ui.sel[part] : 0), k, nv, j, any = 0;
    char t[24], *q;
    lane_t *l;
    if (is_303())
        ui.step_edited = 1;
    else
        ui.hold_used = 1;
    k = motion_find(proj.arr.lane, seq.ppat[part], part, T_PROB, v, 0);
    nv = k >= 0 && proj.arr.lane[k].val[s] != MOT_NONE ? proj.arr.lane[k].val[s] : 100;
    {   /* one line, turned down from 100 %: 95 .. 5 %, then 1:2 2:2 1:3 .. 8:8 */
        int pos = nv > 100 ? 20 + nv - PROB_COND : (100 - nv) / 5;
        pos += e > 0 ? -1 : 1;
        pos = pos < 0 ? 0 : pos > 19 + PROB_NCOND ? 19 + PROB_NCOND : pos;
        nv = pos < 20 ? 100 - 5 * pos : PROB_COND + pos - 20;
    }
    if (nv != 100 && k < 0 && (k = motion_alloc(proj.arr.lane, seq.ppat[part], part, T_PROB, v, 0)) < 0) {
        say("MOTION FULL", 0);
        return;
    }
    if (k >= 0) {
        l = &proj.arr.lane[k];
        l->val[s] = (uint8_t)(nv != 100 ? nv : MOT_NONE);
        for (j = 0; j < NSTEPS; j++)
            any |= l->val[j] != MOT_NONE;
        if (!any)
            engine_motion_clear(k);
    }
    mark_dirty();
    q = put_s(put_i(put_s(t, "STEP "), s + 1), ": ");
    if (nv > 100) {
        int a, b;
        prob_cond(nv - PROB_COND, &a, &b);
        put_i(put_s(put_i(q, a), ":"), b);
    } else
        put_s(put_i(q, nv), "%");
    say(t, 0);
}

/* the 16 steps on the keys that have values of their own (p-locks, recorded motion) for part's lanes
 * of target t (-1: any), voice v (-1: any) */
static uint32_t lock_marks(int t, int v, int base)
{
    uint32_t m = 0;
    int k, c;
    for (k = 0; k < NLANE; k++) {
        const lane_t *l = &proj.arr.lane[k];
        if (!l->used || l->part != ui.part || l->pat != seq.ppat[ui.part] || (t >= 0 && l->t != t) ||
            (v >= 0 && l->v != v))
            continue;
        for (c = 0; c < 16; c++)
            if (base + c < NSTEPS && l->val[base + c] != MOT_NONE)
                m |= 1u << c;
    }
    return m;
}

static void turn_ref(pref_t r, int e, int knob)
{
#if X0X_BASS_PRESET_PREVIEW
    /* The detent's descriptor, current value, write and motion ownership all
     * belong to one committed engine, even across an audio boundary. */
    int bass_edit = r.kind == R_ENG && r.a == T_303;
    if (bass_edit) engine_bass_edit_hold(1);
#endif
    if (!accel_smc && !original_ref_current(r)) {
        if (bass_edit) engine_bass_edit_hold(0);
        return;
    }
    const x0x_param_t *d = pref_desc(r);
    if (!d || r.kind == R_ACT || pref_read_only(r)) {
#if X0X_BASS_PRESET_PREVIEW
        if (bass_edit) engine_bass_edit_hold(0);
#endif
        return;
    }
    int switched=original_switch_turn(r,pref_get(r),e,1);
    if(switched>=0)pref_set_impl(r,switched,!accel_smc);
    else
    {
    if (d->names || d->max < 24
#if X0X_BASS_PRESET_PREVIEW
        || r.kind == R_BPRESET || r.kind == R_BPATSND
#endif
       )
        e = e > 0 ? 1 : -1;                          /* a switch: one detent, one position */
    else
        e = accel(knob, e, d->max);
    int next = pref_get(r) + e;
    if (r.kind == R_BENGINE) {
        while (next >= 0 && next <= d->max && !original_runtime_kind_available(next))
            next += e > 0 ? 1 : -1;
    } else if (r.kind == R_BPATSND && e < 0) {
        unsigned kind, preset;
        unsigned code=pat_of(PART_303A+(r.b&1))->rsv[r.b&1];
        /* The visible archived byte owns this gesture, even while a different
         * available engine is requested. Never turn D4 into J3 implicitly. */
        if(bass_pattern_preset_decode(code,&kind,&preset) && preset &&
           !original_runtime_kind_available((int)kind))next=0;
    }
    pref_set_impl(r, next,!accel_smc);
    }
    if (r.kind == R_ENG)
        PARAM_TRACE(accel_smc ? PARAM_SMC_KNOB : PARAM_PANEL_KNOB,
                    r.a, r.b, r.c, pref_get(r));
    motion_touch(r);
#if X0X_BASS_PRESET_PREVIEW
    if (bass_edit) engine_bass_edit_hold(0);
#endif
}

static int rec_step(int track) { return seq_rec_step(&seq, track); }

/* Per-step drum velocity lives in a T_VEL motion lane (same packing as T_PROB): pattern size
 * cannot hold an 11×64 plane under the pool/RAM budgets. MOT_NONE = legacy accent law. */
static void drum_vel_clear_step(int k, int v, int s)
{
    int voice = k << 4 | v, lane, j, any = 0;
    lane_t *l;
    if ((unsigned)k >= NKIT || (unsigned)v >= NDRUM || (unsigned)s >= NSTEPS)
        return;
    lane = motion_find(proj.arr.lane, seq.ppat[k], k, T_VEL, voice, 0);
    if (lane < 0)
        return;
    l = &proj.arr.lane[lane];
    l->val[s] = MOT_NONE;
    for (j = 0; j < NSTEPS; j++)
        any |= l->val[j] != MOT_NONE;
    if (!any)
        engine_motion_clear(lane);
}

static void drum_vel_set_step(int k, int v, int s, uint8_t vel)
{
    int voice = k << 4 | v, lane;
    lane_t *l;
    if ((unsigned)k >= NKIT || (unsigned)v >= NDRUM || (unsigned)s >= NSTEPS)
        return;
    if (!vel)
        vel = 1;
    if (vel > 127u)
        vel = 127u;
    lane = motion_find(proj.arr.lane, seq.ppat[k], k, T_VEL, voice, 0);
    if (lane < 0 && (lane = motion_alloc(proj.arr.lane, seq.ppat[k], k, T_VEL, voice, 0)) < 0) {
        say("MOTION FULL", 0);
        return;
    }
    l = &proj.arr.lane[lane];
    l->val[s] = vel;
}

/* A live drum hit recorded on step s: black keys and external MIDI (ext_rec_drain). */
static void drum_rec_write(int k, int v, int s, int accent, uint8_t vel)
{
    if ((unsigned)k >= NKIT || (unsigned)v >= NDRUM || (unsigned)s >= NSTEPS)
        return;
    sm_set(pat_of(k)->drum[k].hit[v], s);
    if (accent)
        sm_set(pat_of(k)->drum[k].accent, s);
    drum_vel_set_step(k, v, s, vel);
    seq_rec_skip(&seq, TRK_DRUM + k, s, v);      /* (the key sounded it) */
    mark_dirty();
}

static void drum_key(int v, int down, int step_record)
{
    int k = ui.part;
    uint8_t kv;
    int accent;
    if (!down)
        return;
    if (ui.sel[k] != v) drum_step_cancel();
    ui.sel[k] = (uint8_t)v;
    build_pages();
    accent = (ui.btn & (1u << B_ENV)) != 0;
    kv = plat_key_velocity(BLACK_KEY[v]);
    /* KEY SOUND STOPPED (the default): while the pattern plays a black key only selects its track,
     * so choosing one to edit does not add a hit to the groove; stopped, it plays it, and with REC
     * on it always does (that is how drums are recorded). Strike velocity matches 303 FREE PLAY. */
    if (proj.set.keysound || !seq.playing || ui.rec)
        engine_drum(k, v, accent ? 1.0f : (float)kv / 127.0f);
    if (accent)
        ui.btn_used |= 1u << B_ENV;
    if (step_record && ui.rec && seq.playing)
        drum_rec_write(k, v, rec_step(TRK_DRUM + k), accent, accent ? 127u : kv);
}

/* BREAK step st: on, with its own slice code (0 = the generator's, 1..32 = slot + 1). */
static void brk_slice_write(brkpart_t *bp, int st, int code)
{
    if ((unsigned)st >= 16u)
        return;
    bp->slice[st] = (uint8_t)code;
    bp->steps |= 1u << st;
    mark_dirty();
}

/* External MIDI recording for 909, 808 and BREAK (engine midi_in queues the note, on the part's own
 * channel, with its record step). REC on and playing: every part records on its own channel at once,
 * whatever part or view is selected (owner 2026-10-30).
 * The 303s record in the engine (seq_rec_bass). */
static void ext_rec_drain(void)
{
    if (project_busy) return;
    for (;;) {
        uint32_t ev, state = plat_cq_lock();
        int have = engine_rec_ev_get(&ev);
        /* Audio owns pattern/transport changes. Keep validation and this one
         * pattern write in the same source-mask transaction, without muting. */
        if (have && ui.rec && seq.playing) {
            int part = REC_EV_PART(ev), st = REC_EV_STEP(ev);
            if (part == PART_BRK)
                brk_slice_write(&pat_of(PART_BRK)->brk, st & 15, REC_EV_VOICE(ev) + 1);
            else if (part < NKIT)
                drum_rec_write(part, REC_EV_VOICE(ev), st, 0, (uint8_t)REC_EV_VEL(ev));
        }
        plat_cq_unlock(state);
        if (!have) break;
    }
}

#define STEP_TAP_MS 300u
/* a white key: a step. An empty one is on at once; one already on comes off on a tap (a quick
 * release), and stays when held (EDIT: its p-locks) */
static void drum_step(int k, int white, int down)
{
    int s = ui.spage * 16 + white;
    dpart_t *d = &pat_of(k)->drum[k];
    uint32_t *bits = d->hit[ui.sel[k]];
    if (s >= NSTEPS)
        return;
    if (!down) {
        if (ui.hold_step >= 0 && (ui.hold_step & 15) == white) {
            int same_target = ui.hold_drum == k * NDRUM + ui.sel[k];
            int same = ui.hold_step == s && same_target &&
                       ui.hold_pat == seq.ppat[k];
            if (same && !ui.hold_created && !ui.hold_used && plat_ms() - ui.hold_t0 < STEP_TAP_MS) {
                sm_flip(bits, s);
                if (!sm_get(bits, s))
                    drum_vel_clear_step(k, ui.sel[k], s);
                mark_dirty();
            }
            if (same_target && ui.hold_used)
                lock_release();
            ui.hold_step = -1;
        }
        return;
    }
    if (ui.btn & (1u << B_ENV)) {
        sm_flip(d->accent, s);
        ui.btn_used |= 1u << B_ENV;
        mark_dirty();
        return;
    }
    ui.hold_step = (int8_t)s;
    ui.hold_drum = (uint8_t)(k * NDRUM + ui.sel[k]);
    ui.hold_pat = seq.ppat[k];
    ui.hold_used = 0;
    ui.hold_t0 = plat_ms();
    ui.hold_created = !sm_get(bits, s);
    if (ui.hold_created) {
        sm_flip(bits, s);
        mark_dirty();
    }
}

static int kbd_note(int k) { return 41 + k + 12 * ui.oct; }

/* Slide belongs to the source note, not the newly pressed destination. Only link a
 * note written by this held-key gesture in the same pattern and recording mode. */
static void bass_rec_link(int b, int step)
{
    bpart_t *bp = &cur_pat()->bass[b];
    int prev = (int)bass_rec_step[b] - 1;
    int len = bp->len ? bp->len : 16;
    if (kbd_held_note[b] && prev >= 0 && prev < len && prev != step &&
        bass_rec_pat[b] == seq.ppat[ui.part] && bass_rec_playing[b] == seq.playing &&
        bstep_gate(&bp->step[prev]) == G_NOTE && bp->step[prev].note == kbd_held_note[b])
        bp->step[prev].flags |= BS_SLIDE;
    bass_rec_step[b] = (uint8_t)(step + 1);
    bass_rec_pat[b] = seq.ppat[ui.part];
    bass_rec_playing[b] = seq.playing;
}

static void bass_write(int b, int note, int gate)
{
    if (gate==G_NOTE && !original_runtime_kind_available(engine_bass_bank(b))) {
        say("ENGINE UNAVAILABLE",0);return;
    }
    bpart_t *bp = &cur_pat()->bass[b];
    int len = bp->len ? bp->len : 16, w = ui.wpos[b] % len;
    uint8_t f = (uint8_t)gate;
    if (gate == G_NOTE) {
#if X0X_BASS_NOTE_SOUND
        if(engine_bass_note_capture(proj.arr.lane,seq.ppat[ui.part],b,w,&proj.sound)<0) {
            say("NOTE SOUND NOT SAVED",0);return;
        }
#endif
        bass_rec_link(b, w);
        if (ui.btn & (1u << B_ENV)) {
            f |= BS_ACCENT;
            ui.btn_used |= 1u << B_ENV;
        }
        if (ui.btn & (1u << B_LFO)) {
            f |= BS_SLIDE;
            ui.btn_used |= 1u << B_LFO;
        }
        bp->step[w].note = (uint8_t)note;
        bp->step[w].velocity = BASS_VELOCITY_DEFAULT;
    }
    if (gate != G_NOTE) {
        bass_rec_step[b] = 0;
#if X0X_BASS_NOTE_SOUND
        bass_note_clear(proj.arr.lane,seq.ppat[ui.part],b,w);
#endif
    }
    (void)held_chord_set(proj.arr.lane,seq.ppat[ui.part],b,w,0,0);
    bp->step[w].flags = f;
    ui.wpos[b] = (uint8_t)((w + 1) % len);
    mark_dirty();
}

static void bass_write_held_chord(int b)
{
    if (!original_runtime_kind_available(engine_bass_bank(b))) {
        say("ENGINE UNAVAILABLE",0);return;
    }
    uint8_t notes[HELD_CHORD_NOTES];int n=0;
    for(unsigned j=0;j<kbd_arp_n[b];j++) {
        unsigned note=kbd_arp_note[b][j];int at=0;
        while(at<n && notes[at]<note)at++;
        if(at<n && notes[at]==note)continue;
        if(n==HELD_CHORD_NOTES){say("CHORD NOT SAVED",0);return;}
        for(int q=n;q>at;q--)notes[q]=notes[q-1];
        notes[at]=(uint8_t)note;n++;
    }
    if(!n)return;
    bpart_t *bp=&cur_pat()->bass[b];int len=bp->len?bp->len:16;
    int extend=kbd_arp_n[b]>1 && bass_rec_step[b] && bass_rec_pat[b]==seq.ppat[ui.part] && !bass_rec_playing[b];
    int step=extend?(int)bass_rec_step[b]-1:ui.wpos[b]%len;
    int reserve=engine_note_lock_capture_on() && bass_note_find(proj.arr.lane,seq.ppat[ui.part],b,step)<0;
    if(!held_chord_write(proj.arr.lane,seq.ppat[ui.part],b,step,notes,-n,reserve)) {say("CHORD NOT SAVED",0);return;}
    if(engine_bass_note_capture(proj.arr.lane,seq.ppat[ui.part],b,step,&proj.sound)<0) {say("NOTE SOUND NOT SAVED",0);return;}
    (void)held_chord_set(proj.arr.lane,seq.ppat[ui.part],b,step,notes,n);
    bp->step[step]=(bstep_t){notes[0],G_NOTE,BASS_VELOCITY_DEFAULT};
    bass_rec_step[b]=(uint8_t)(step+1);bass_rec_pat[b]=seq.ppat[ui.part];bass_rec_playing[b]=0;
    if(!extend)ui.wpos[b]=(uint8_t)((step+1)%len);
    mark_dirty();
}

static void bass_kbd(int key, int step_record)
{
    int b = bidx(), n = kbd_note(key);
    if (!original_runtime_kind_available(engine_bass_bank(b))) {
        say("ENGINE UNAVAILABLE",0);return;
    }
    if ((X0X_ORIGINAL_SYNTH || chi_arp_on_part(b)) && kbd_arp_n[b] < UI_BASS_HELD_MAX) {
        uint32_t i, have = 0;
        for (i = 0; i < kbd_arp_n[b]; i++)
            if (kbd_arp_key[b][i] == (uint8_t)(key + 1))
                have = 1;
        if (!have) {
            kbd_arp_key[b][kbd_arp_n[b]] = (uint8_t)(key + 1);
            kbd_arp_note[b][kbd_arp_n[b]] = (uint8_t)n;
            kbd_arp_n[b]++;
        }
    }
    if (!(step_record && ui.rec && seq.playing))
        engine_bass_on_velocity(b, n, (ui.btn & (1u << B_ENV)) != 0,
                                !chi_arp_on_part(b) && kbd_held_note[b] != 0,
                                (ui.view == V_PART || (ui.freeplay[b] && !ui.rec)) ?
                                    plat_key_velocity(key) : BASS_VELOCITY_DEFAULT);
    if (step_record && ui.rec && !seq.playing) {
        if(engine_bass_sound_bank(&proj.sound,b)>=2)bass_write_held_chord(b);
        else bass_write(b, n, G_NOTE);
    } else if (step_record && ui.rec && seq.playing) {
        int f = ((ui.btn & (1u << B_ENV)) ? BS_ACCENT : 0) |
                ((ui.btn & (1u << B_LFO)) ? BS_SLIDE : 0);
        ui.btn_used |= ui.btn & ((1u << B_ENV) | (1u << B_LFO));
        seq.rec_mask = (uint8_t)(1u << b);
        engine_bass_record(b, n, BASS_VELOCITY_DEFAULT, f);
        /* The audio recorder publishes rec_dirty only after an accepted write.
         * A queued onset may be refused after an engine/pattern transition. */
    } else
        bass_rec_step[b] = 0;
    kbd_held_note[b] = (uint8_t)n;
    kbd_held_key[b] = (uint8_t)(key + 1);
}

/* an edit sounds as the drum keys do (KEY SOUND): while stopped or recording, or always */
static int key_sounds(void) { return proj.set.keysound || !seq.playing || ui.rec; }
static void bass_step_key(int white, int down)
{
    int b = bidx(), s = ui.spage * 16 + white;
    bpart_t *bp = &cur_pat()->bass[b];
    if (s >= NSTEPS)
        return;
    if (down) {                                       /* an empty step is on at once: hold it to edit it */
        bass_step_cancel();                            /* a second held key replaces the first preview */
        ui.held_step = (int8_t)s;
        ui.held_step_part = ui.part;
        ui.held_step_pat = seq.ppat[ui.part];
        ui.step_edited = 0;
        ui.step_t0 = plat_ms();
        ui.step_created = bstep_gate(&bp->step[s]) == G_REST;
        if (ui.step_created) {
#if X0X_BASS_NOTE_SOUND
            if(engine_bass_note_capture(proj.arr.lane,seq.ppat[ui.part],b,s,&proj.sound)<0) {
                bass_step_cancel();say("NOTE SOUND NOT SAVED",0);return;
            }
#endif
            (void)held_chord_set(proj.arr.lane,seq.ppat[ui.part],b,s,0,0);
            bp->step[s].flags = G_NOTE;
            mark_dirty();
        }
        ui.step_preview = key_sounds();               /* as the drum keys */
        if (ui.step_preview)
            engine_bass_on_velocity(b, bp->step[s].note + bp->transpose - 24,
                                    (bp->step[s].flags & BS_ACCENT) != 0, 0, bstep_velocity(&bp->step[s]));
    } else if (ui.held_step == s && ui.held_step_part == ui.part &&
               ui.held_step_pat == seq.ppat[ui.part]) {
        if (!ui.step_created && !ui.step_edited && plat_ms() - ui.step_t0 < STEP_TAP_MS) {   /* a tap takes it off */
            (void)held_chord_set(proj.arr.lane,seq.ppat[ui.part],b,s,0,0);
            bp->step[s].flags = G_REST;
#if X0X_BASS_NOTE_SOUND
            bass_note_clear(proj.arr.lane,seq.ppat[ui.part],b,s);
#endif
            mark_dirty();
        }
        bass_step_cancel();
    }
}

static int all_on(int w)                               /* every part plays pattern w */
{
    int p;
    for (p = 0; p < NPARTS; p++)
        if (seq.ppat[p] != w)
            return 0;
    return 1;
}

static const uint32_t MUTE_MASK[NPARTS] = {(1u << NDRUM) - 1u, ((1u << NDRUM) - 1u) << NDRUM, 1u << MUTE_BASS0,
                                           1u << (MUTE_BASS0 + 1), 1u << MUTE_BRK};
static int part_muted(int p) { return (seq.mute & MUTE_MASK[p]) == MUTE_MASK[p]; }

static int perf_testing(void) { return perf.test >= 0 && perf.phase != 4; }
/* A queued SAVE runs in phase 0, before perf_build borrows the save scratch and runtime state.
 * From phase 1 through restoration, neither the scratch nor the live settings may be saved. */
static int perf_save_busy(void) { return perf_testing() && perf.phase != 0; }

/* the held 303 step's note, moved by `by` semitones (KNOB 1: one; OCT: twelve); a rest or a tie
 * becomes a note of its own */
static void held_note_by(int by)
{
    bpart_t *bp = &cur_pat()->bass[bidx()];
    bstep_t *st = &bp->step[ui.held_step];
    int n = held_note_of(bp, ui.held_step) + by;
#if X0X_BASS_NOTE_SOUND
    if(bstep_gate(st)!=G_NOTE && engine_bass_note_capture(proj.arr.lane,
       seq.ppat[ui.part],bidx(),ui.held_step,&proj.sound)<0) {
        say("NOTE SOUND NOT SAVED",0);return;
    }
#endif
    uint8_t notes[HELD_CHORD_NOTES];
    int count=held_chord_get(proj.arr.lane,seq.ppat[ui.part],bidx(),ui.held_step,st->note,notes);
    int newroot=n<12?12:n>108?108:n,delta=newroot-st->note,kept=1;
    if(bstep_gate(st)==G_NOTE && count>1) {
        notes[0]=(uint8_t)newroot;
        for(int j=1;j<count;j++) {
            int pitch=notes[j]+delta;pitch=pitch<0?0:pitch>127?127:pitch;
            if(pitch>notes[kept-1])notes[kept++]=(uint8_t)pitch;
        }
        (void)held_chord_set(proj.arr.lane,seq.ppat[ui.part],bidx(),ui.held_step,notes,kept);
    } else (void)held_chord_set(proj.arr.lane,seq.ppat[ui.part],bidx(),ui.held_step,0,0);
    st->note = (uint8_t)newroot;
    if (bstep_gate(st) != G_NOTE)
        st->flags = (uint8_t)((st->flags & (BS_ACCENT | BS_SLIDE)) | G_NOTE);
    ui.step_edited = 1;
    mark_dirty();
    if (key_sounds()) {                                /* as the drum keys: playing, the line is heard */
        engine_bass_on_velocity(bidx(), st->note + bp->transpose - 24, 0, 1, bstep_velocity(st));
        ui.step_preview = 1;
    }
}

/* Keyboard mute pickup history is shared only with explicit mute edges, so an
 * off/on pair between scans cannot hide a new epoch. No physical sample is invented. */
static uint8_t smk_mute_intended[4], smk_mute_known, smk_mute_active, smk_mute_edit, smk_mute_bank;
static void smk_mute_edge(int target, int silent)
{
    int position = target < NPARTS ? part_position(target) : target;
    if (position / 4 != smk_mute_bank) return;
    int i = position % 4;
    uint8_t bit = (uint8_t)(1u << i);
    pref_t r = target < NPARTS ? PR(R_ENG, T_MIX, target, MX_LEVEL) :
               PR(R_ENG, T_FX, 0, target == 5 ? FX_RV_LEVEL : FX_DL_LEVEL);
    smk_mute_intended[i] = (uint8_t)pref_get(r);
    if (silent) { smk_mute_active |= bit; smk_mute_edit |= bit; }
    else { smk_mute_active &= (uint8_t)~bit; smk_mute_edit &= (uint8_t)~bit; }
}

static void mute_part(int p)                         /* a whole part on / off (HOME, MIX's PARTS) */
{
    uint32_t mask = MUTE_MASK[p];
    if (seq.queued_mutes && seq.playing) {
        seq.mute_q ^= mask;
        if (seq.mute_q & mask)
            say(part_muted(p) ? "UNMUTE AT BAR " : "MUTE AT BAR ", part_name(p));
        else
            say("CANCELED ", part_name(p));
        return;
    }
    seq.mute = part_muted(p) ? seq.mute & ~mask : seq.mute | mask;
    if (seq.song_rec && seq.playing && seq.song_pos < song()->len) {   /* song recording: this bar too */
        song_bar_t *b = &song()->bar[seq.song_pos];
        b->mute = (uint8_t)(part_muted(p) ? b->mute | 1u << p : b->mute & ~(1u << p));
        mark_dirty();
    }
    smk_mute_edge(p, part_muted(p));
    say(part_muted(p) ? "MUTED " : "UNMUTED ", part_name(p));
}
static int track_muted(int km, int v) { return (int)(seq.vmute >> (km * NDRUM + v) & 1u); }
/* Only actual level destinations participate. FILTER and navigation never do.
 * A muted kit also silences its voice levels; their separate mute bits survive. */
static int volume_muted(pref_t r)
{
    if (r.kind != R_ENG) return 0;
    if (r.a == T_MIX && r.b < NPARTS && r.c == MX_LEVEL)
        return part_muted(r.b);
    if (r.a <= T_808 && r.b < NDRUM && r.c == find_ref(r.a, r.b, "Level").c)
        return part_muted(r.a) || track_muted(r.a, r.b);
    if (r.a == T_FX && !r.b) {
        int bit = r.c == FX_RV_LEVEL ? 1 : r.c == FX_DL_LEVEL ? 2 : r.c == FX_VOLUME ? 4 : 0;
        return engine_fx_muted() & bit;
    }
    return 0;
}

static void mute_track(int km, int v)                /* one drum track on / off */
{
    uint32_t bit = 1u << (km * NDRUM + v);
    if (seq.queued_mutes && seq.playing) {
        seq.vmute_q ^= bit;
        if (seq.vmute_q & bit)
            say(track_muted(km, v) ? "UNMUTE AT BAR " : "MUTE AT BAR ", engine_voice_name(km ? T_808 : T_909, v));
        else
            say("CANCELED ", engine_voice_name(km ? T_808 : T_909, v));
        return;
    }
    seq.vmute ^= bit;
    say(track_muted(km, v) ? "MUTED " : "UNMUTED ", engine_voice_name(km ? T_808 : T_909, v));
}

#if BOARD_SMK37 || X0X_HOST
void smk_clip_enter_cleanup(void)
{
    for (int k = 0; k < 11; k++)
        if (ui.brk_localkeys & (1u << k))
            engine_brk_live(k < 8 ? 32 + ui.brk_page * 8 + k : k, 0);
    ui.brk_localkeys = ui.brk_pinkeys = 0;
    engine_brk_edit_hold(0);
    bass_step_cancel();
    ui.chain_first = -1;
    ui.hold_step = -1;
    ui.brk_held = -1;
    for (int b = 0; b < NBASS; b++)                   /* a 303 key note that still sounds: let it go */
        if (kbd_held_note[b] || kbd_arp_n[b]) {
            engine_bass_off(b);
            kbd_held_note[b] = 0;
            kbd_held_key[b] = 0;
            kbd_arp_n[b] = 0;
            bass_rec_step[b] = 0;
        }
}
#endif

/* Outer C3/D3 count, C#3/D#3 page; E3 remains unassigned. use the authoritative bitmap, not lossy extq.
 * Always update the edge baseline, including modal/clip/busy frames. */
void ui_brk_page_keys(unsigned keys, int allowed)
{
    static unsigned previous;
    static int eligible_before;
    int eligible = allowed && !project_busy && !ui.help && ui.overlay == O_NONE &&
        ui.part == PART_BRK && (ui.view == V_SEQ || ui.view == V_PART) && !ui.btn && !perf_testing();
    unsigned pressed = keys & ~previous;
    previous = keys;
    if (!eligible || !eligible_before) { eligible_before = eligible; return; }
    if (!pressed) return;
    if ((pressed & 12u) == 4u || (pressed & 12u) == 8u) {
        unsigned bank = ui.brk_count_target;
        pref_t ref = PR(R_BRKSLICE, bank, 0, 0);
        int value = pref_get(ref) + ((pressed & 4u) ? -1 : 1);
        if (value < 0) value = 0;
        if (value > 3) value = 3;
        pref_set(ref, value);
        mark_dirty();
        ui.act_t = plat_ms();
    }
    pressed &= 3u;
    if (!pressed) return;
    if ((ui.brk_localkeys & 255u) || ui.brk_pinkeys) { say("RELEASE SLICES", 0); return; }
    int pages = (engine_brk_count(0) + 7) / 8;
    int page = ui.brk_page < pages ? ui.brk_page : pages - 1;
    if (pressed == 1 && page > 0) page--;
    if (pressed == 2 && page + 1 < pages) page++;
    ui.brk_page = (uint8_t)page;
    ui.act_t = plat_ms();
}

static int live_central_event(int key,int down);
static void key_event(int k, int down)
{
    /* End the press-time BREAK owner before modal/view/clip dispatch can hide it.
     * Paging is blocked while held, so its slice identity remains stable. */
    int oldbl = KEY_BLACK[k], w = KEY_WHITE[k];
    if (!down && oldbl >= 0 && ((ui.brk_localkeys | ui.brk_pinkeys) & (1u << oldbl))) {
        if (ui.brk_localkeys & (1u << oldbl))
            engine_brk_live(oldbl < 8 ? 32 + ui.brk_page * 8 + oldbl : oldbl, 0);
        ui.brk_localkeys &= (uint16_t)~(1u << oldbl);
        ui.brk_pinkeys &= (uint16_t)~(1u << oldbl);
        engine_brk_edit_hold((ui.brk_localkeys & 255u) || ui.brk_pinkeys);
        return;
    }
    /* SEQ's held step can remain down while EDIT shows its sound knobs. Its
     * release finishes that same gesture; EDIT never starts an unseen step. */
    if (!down && w >= 0 && ui.view == V_PART) {
        if (is_drum() && ui.hold_step >= 0 && (ui.hold_step & 15) == w) {
            drum_step(ui.part, w, 0);
            return;
        }
        if (is_303() && ui.held_step >= 0 && (ui.held_step & 15) == w) {
            bass_step_key(w, 0);
            return;
        }
    }
    if (live_central_event(k,down)) return;
    if (!down) {
        for (int b = 0; b < NBASS; b++) {
            uint32_t i, j, hit = 0;
            int note = -1;
            for (i = 0; i < kbd_arp_n[b]; i++)
                if (kbd_arp_key[b][i] == (uint8_t)(k + 1)) {
                    note = kbd_arp_note[b][i];
                    for (j = i + 1; j < kbd_arp_n[b]; j++) {
                        kbd_arp_key[b][j - 1] = kbd_arp_key[b][j];
                        kbd_arp_note[b][j - 1] = kbd_arp_note[b][j];
                    }
                    kbd_arp_n[b]--;
                    hit = 1;
                    break;
                }
            if (kbd_held_key[b] == k + 1 || hit) {
                if ((X0X_ORIGINAL_SYNTH || chi_arp_on_part(b)) && note >= 0)
                    engine_bass_off_note(b, note);
                else
                    engine_bass_off(b);
                if (!kbd_arp_n[b]) {
                    kbd_held_note[b] = 0;
                    kbd_held_key[b] = 0;
                } else {
                    kbd_held_note[b] = kbd_arp_note[b][kbd_arp_n[b] - 1u];
                    kbd_held_key[b] = kbd_arp_key[b][kbd_arp_n[b] - 1u];
                }
                bass_rec_step[b] = 0;
                return;
            }
        }
    }
#if BOARD_SMK37
    extern uint8_t smk_clip_mode_on(void);
#if X0X_DEV_PADCAL
    extern uint8_t smk_padcal_on(void);
    if (smk_clip_mode_on() || smk_padcal_on())
#else
    if (smk_clip_mode_on())
#endif
        return;   /* clip mode: the pads launch clips, the keybed plays MIDI to Loopy (main_fm1.c clip keys) */
#endif
    int bl = KEY_BLACK[k], wp = w >= 0 ? ui.pbank * 16 + w : -1;   /* wp: a white key's pattern */
    if (ui.overlay == O_ASK || ui.view == V_PERF || perf_testing())
        return;
    if (down && w >= 0 && (ui.btn & (1u << B_SAVE))) {     /* SAVE held + white key: paste the pattern here */
        int p;
        ui.btn_used |= 1u << B_SAVE;
        if (all_on(wp))
            return;
        for (p = 0; p < NPARTS; p++)
            ui.paste_src[p] = seq.ppat[p];
        if (pattern_used(&proj.pat[wp])) {
            char t[24];
            put_s(put_i(put_s(t, "PASTE OVER P"), wp + 1), "?");
            ask(ACT_COPY, wp, t, "IT HAS NOTES");
        } else
            run_action(ACT_COPY, wp);
        return;
    }
    if (ui.view == V_SONG && !(ui.btn & (1u << B_HOME))) {   /* SONG: white = the bar's pattern, black = its mutes */
        int k = ui.song_sel;
        if (!down || k >= NSONG || (w < 0 && bl >= NPARTS))
            return;
        song_fill(k);
        if (w >= 0) {
            int p;
            for (p = 0; p < NPARTS; p++)
                song()->bar[k].pat[p] = (uint8_t)wp;
            if (k + 1 < NSONG)
                ui.song_sel = (uint8_t)(k + 1);
        } else {
            song()->bar[k].mute ^= (uint8_t)(1u << part_at(bl));
        }
        mark_dirty();
        return;
    }
    if (w >= 0 && (ui.view == V_HOME || (ui.btn & (1u << B_HOME)))) {
        if (ui.btn & (1u << B_HOME))
            ui.btn_used |= 1u << B_HOME;
        if (down) {
            if (ui.chain_first >= 0 && ui.chain_first != wp) {
                char t[16], *q = t;
                seq_chain(&seq, ui.chain_first, wp);
                q = put_i(q, (ui.chain_first < wp ? ui.chain_first : wp) + 1);
                *q++ = '-';
                put_i(q, (ui.chain_first < wp ? wp : ui.chain_first) + 1);
                say("CHAIN P", t);
            } else {
                ui.chain_first = (int8_t)wp;
                seq_chain(&seq, 0, 0);
                seq_cue(&seq, wp);
            }
        } else if (ui.chain_first == wp) {
            ui.chain_first = -1;
        }
        return;
    }
    if (bl >= 0 && (ui.btn & (1u << B_HOME)) && (drum_mix_page() >= 0 || (ui.view == V_MIX && cur_page() == 0))) {
        ui.btn_used |= 1u << B_HOME;                  /* MIX + HOME + black key: mute that channel */
        if (down && drum_mix_page() >= 0)
            mute_track(drum_mix_page(), bl);
        else if (down && bl < NPARTS)
            mute_part(part_at(bl));
        return;
    }
    if (bl >= 0 && ui.view == V_MIX && cur_page() == 0) {   /* MIX's PARTS: black keys 1-5 pick the part */
        if (down && bl < NPARTS) {
            ui.mixsel = (uint8_t)part_at(bl);
            build_pages();
        }
        return;
    }
    if (bl >= 0 && drum_mix_page() >= 0) {            /* MIX, a drum machine's page: black keys pick the track */
        if (down) {
            int km = drum_mix_page();
            if (ui.sel[km] != bl) drum_step_cancel();
            ui.sel[km] = (uint8_t)bl;
            if (proj.set.keysound || !seq.playing)
                engine_drum(km, bl, 0.75f);
            build_pages();
        }
        return;
    }
    if (w >= 0 && drum_mix_page() >= 0) {            /* the SMK pads keep editing this visible kit's steps */
        drum_step(drum_mix_page(), w, down);          /* also under a settings list or HELP (O_ASK left above) */
        return;
    }
    if (ui.view == V_HOME && bl >= 0) {
        if (down && bl < NPARTS)
            mute_part(part_at(bl));
        return;
    }
    if (ui.view == V_MIX || ui.view == V_FX)          /* MASTER, FX: the keys choose nothing (they used to */
        return;                                       /* play the part's steps or the break's slices) */
    if (is_drum() && bl >= 0 && (ui.btn & (1u << B_HOME))) {   /* HOME + black key: mute that track */
        ui.btn_used |= 1u << B_HOME;
        if (down)
            mute_track(ui.part, bl);
        return;
    }
    if (is_drum()) {
        if (bl >= 0)
            drum_key(bl, down, ui.view == V_SEQ);
        else if (w >= 0 && ui.view == V_SEQ)
            drum_step(ui.part, w, down);
        else if (w >= 0 && down && ui.view == V_PART && key_sounds())
            engine_drum(ui.part, ui.sel[ui.part], 0.75f); /* audition selected sound, never write a hidden step */
    } else if (is_303()) {
        if (kbd_on()) {                                /* REC: the keys play and write notes; FREE PLAY: play */
            if (down)
                bass_kbd(k, ui.view == V_SEQ);
        }
        else if (w >= 0 && ui.view == V_SEQ)
            bass_step_key(w, down);
    } else {
        brkpart_t *bp = &cur_pat()->brk;
        int count = engine_brk_count(0);
        if (!(ui.brk_localkeys & 255u) && !ui.brk_pinkeys && ui.brk_page * 8 >= count)
            ui.brk_page = (uint8_t)((count - 1) / 8);
        int slot = ui.brk_page * 8 + bl;
        if (bl >= 0 && bl < 8 && down && slot >= count) { say("UNUSED SLICE KEY", 0); return; }
        if (bl >= 0 && bl < 8 && down && ui.brk_held >= 0) {     /* a step held + black 1-8: its own slice */
            int st = ui.brk_held;
            brk_slice_write(bp, st, bp->slice[st] && (bp->slice[st] - 1) % count == slot ? 0 : slot + 1);
            ui.hold_used = 1;                          /* its release keeps the step */
            ui.brk_pinkeys |= (uint16_t)(1u << bl);
            engine_brk_edit_hold(1);
            if (bp->slice[st]) {
                char t[24];
                put_i(put_s(put_i(put_s(t, "STEP "), st + 1), ": SLICE "), slot + 1);
                say(t, 0);
            } else
                say("STEP: THE GENERATOR'S SLICE", 0);
        } else if (bl >= 0 && !down && (ui.brk_pinkeys & (1u << bl))) {
            ui.brk_pinkeys &= (uint16_t)~(1u << bl);
        } else if (bl >= 0) {
            if (down) ui.brk_localkeys |= (uint16_t)(1u << bl);
            engine_brk_edit_hold((ui.brk_localkeys & 255u) || ui.brk_pinkeys);
            engine_brk_live(bl < 8 ? 32 + slot : bl, down);
        } else if (w >= 0 && down) {                     /* as the drums: empty on at once, a tap takes it off */
            ui.brk_held = (int8_t)w;
            ui.hold_used = 0;
            ui.hold_t0 = plat_ms();
            ui.hold_created = !((bp->steps >> w) & 1u);
            if (ui.hold_created) {
                bp->steps |= 1u << w;
                mark_dirty();
            }
        } else if (w >= 0 && ui.brk_held == w) {
            if (!ui.hold_created && !ui.hold_used && plat_ms() - ui.hold_t0 < STEP_TAP_MS) {
                bp->steps &= ~(1u << w);
                mark_dirty();
            }
            if (ui.hold_used)
                lock_release();
            ui.brk_held = -1;
        }
    }
}

static void list_move(int d)
{
    int s = ui.list_sel, step = d < 0 ? -1 : 1, t;
    for (; d; d -= step) {                             /* a row at a time, over the section headers */
        for (t = s + step; t >= 0 && t < ui.list_n && list_skip(t); t += step)
            ;
        if (t < 0 || t >= ui.list_n)
            break;
        s = t;
    }
    ui.list_sel = (uint8_t)s;
    if (list_rows[s].kind == R_BRKSLICE || list_rows[s].kind == R_BRKSLOT)
        ui.brk_count_target = (uint8_t)(list_rows[s].a != 0);
    if (ui.list_sel < ui.list_top)
        ui.list_top = ui.list_sel;
    if (ui.list_sel >= ui.list_top + 6)
        ui.list_top = (uint8_t)(ui.list_sel - 5);
}

static void list_enter(void)
{
    pref_t r = list_rows[ui.list_sel];
    if (r.kind == R_SECTION) {global_section(r.a);return;}
    if (r.kind != R_ACT)
        return;
    if (r.a == ACT_CLEAR_PAT)
        ask(ACT_CLEAR_PAT, 0, "CLEAR THIS PATTERN?", "ALL FIVE PARTS");
    else if (r.a == ACT_RESET)
        ask(ACT_RESET, 0, "RESET PROJECT?", "SAMPLES ARE KEPT");
    else if (r.a == ACT_LOAD && ui.dirty)
        ask(ACT_LOAD, 0, "LOAD SAVED PROJECT?", "DISCARD UNSAVED EDITS");
    else if (r.a == ACT_SONG_CLR)
        ask(ACT_SONG_CLR, 0, "CLEAR THE SONG?", 0);
    else
        run_action(r.a, 0);
}

#if BOARD_SMK37 || X0X_HOST
/* The SMK-37 "<" and ">" (smk_arrows.h). 1: a menu list of this file is open (GLO or the list of a page). */
static int ui_menu_open(void) { return ui.overlay == O_LIST && !perf_testing(); }
/* The hook for submenu rows. Return 1 if row r is a submenu row and the arrow did its job: ">" enters the
 * submenu, "<" goes back. This lane has no submenu rows. */
static int list_sub_arrow(pref_t r, int d)
{
    if(r.kind!=R_SECTION)return 0;
    if(d>0)global_section(r.a);
    return 1;
}
/* "<" (d = -1) or ">" (d = +1) in a menu: the value of the selected row one step down or up, as ALGORITHM
 * does (turn_ref). The value stops at its ends. An action row and a section header do nothing. The knob
 * acceleration does not start: the presses and the repeats are 60 ms or more apart (accel). */
static int ui_menu_arrow(int d)
{
#if BOARD_SMK37
    smc_ui_cancel();
#endif
    pref_t r = list_rows[ui.list_sel];
    if (d < 0 && ui.view == V_GLO && ui.glo_section >= 0) {
        global_back();                                /* "<" leaves a settings section, as HOME */
        return 1;                                     /* the held "<" must not edit the section index */
    }
    if (list_sub_arrow(r, d))
        return d > 0;                                 /* the caller consumes this held category-entry arrow */
    turn_ref(r, d, EN_ALGO);
    ui.act_t = plat_ms();                             /* (the autosave waits for quiet) */
    return 0;
}
#endif

static void close_overlay(void)
{
    if (ui.view == V_GLO) {
        ui.overlay = O_NONE;
        set_view(ui.prev_view == V_GLO ? V_PART : ui.prev_view);
        return;
    }
    ui.overlay = O_NONE;
}

#if X0X_BASS_PRESET_PREVIEW
/* A tap, not a new press gesture. Live notes/wheels may be the reason for the
 * wait; step edits, help, modal UI and modifier chords retain their priority. */
static int cancel_sound_request(void)
{
    int pending, page=cur_page();
    if (project_busy || ui.view!=V_PART || !is_303() || ui.overlay!=O_NONE ||
        ui.help || ui.held_step>=0 || held_any_step()>=0 || page>=pg.n ||
        pg.r[page][0].kind!=R_BENGINE || pg.r[page][0].b!=bidx() ||
        ((ui.btn | plat_buttons()) & ~(1u<<B_HOME)) ||
        (plat_keys() & ~ui.keys)) return 0;
#if BOARD_SMK37
    extern uint8_t smk_clip_mode_on(void);
    if (smk_clip_mode_on()) return 0;
#endif
    /* Nested, bounded hold: no audio-boundary apply between check and cancel.
     * An unstable producer snapshot is not a confirmed cancel or an undo. */
    engine_bass_edit_hold(1);
    pending=engine_bass_preset_pending(bidx());
    if (pending>0 && pending<6) engine_bass_cancel_preset(bidx());
    engine_bass_edit_hold(0);
    return pending!=0; /* transient snapshot: stay here; never claim an undo */
}
#endif

/* Shared NO behavior: restore the question's caller, including Global's list. */
static void answer_no(void)
{
    ui.overlay = ui.ask_overlay;
    say("CANCELLED", 0);
    if (ui.view == V_GLO) ui.overlay = O_LIST;
}

/* Return 1 when HOME+PLAY has already performed redo. Otherwise the caller
 * continues its normal PLAY path, after answering NO when a question is open. */
static int play_answer_question(int home_held)
{
    x0x_play_question_t policy = x0x_play_question_resolve(ui.overlay == O_ASK, 1, home_held);
    for (unsigned i = 0; i < policy.n; ++i) {
        if (policy.act[i] == X0X_PQ_ANSWER_NO) answer_no();
        else if (policy.act[i] == X0X_PQ_REDO) {
            ui.btn_used |= ui.btn & (1u << B_HOME);
            do_undo(1);
            return 1;
        }
    }
    return 0;
}

X0X_COLD static void button_tap(int b)
{
    if (perf_testing()) {                             /* the test owns the transport: HOME or PLAY stop it */
        if ((b == B_HOME || b == B_PLAY) && perf.phase != 3)
            perf_test_abort();
        return;
    }
    if (ui.overlay == O_ASK && b == B_PLAY &&
        play_answer_question(ui.btn & (1u << B_HOME))) return;
    if (ui.overlay == O_ASK) {                        /* SEL confirms; HOME answers NO */
        if (b == B_SEL) {
            ui.overlay = O_NONE;
            run_action(ui.ask_act, ui.ask_arg);
        } else if (b == B_HOME) {
            answer_no();
        } else
            return;
        if (ui.view == V_GLO)
            ui.overlay = O_LIST;
        return;
    }
    switch (b) {
    case B_PLAY:
        if (ui.btn & (1u << B_HOME)) {               /* HOME + PLAY: redo */
            ui.btn_used |= 1u << B_HOME;
            do_undo(1);
            break;
        }
        memset(bass_rec_step, 0, sizeof bass_rec_step);
        if (seq.playing)
            seq_stop(&seq);
        else {
            seq.song_start = ui.song_sel < song()->len ? ui.song_sel : 0;
            seq_start(&seq);
        }
        break;
    case B_REC:
        if (ui.btn & (1u << B_HOME)) {               /* HOME + REC: undo */
            ui.btn_used |= 1u << B_HOME;
            do_undo(0);
            break;
        }
        if (ui.btn & (1u << B_SAVE)) {               /* SAVE + REC: clear this part (asks) */
            char t[24];
            ui.btn_used |= 1u << B_SAVE;
            put_s(put_s(t, "CLEAR "), part_name(ui.part));
            ask(ACT_CLEAR_PART, ui.part, t, "IN THIS PATTERN?");
            break;
        }
        record_finish();
        bass_step_cancel();                            /* key-up will now take the keyboard path */
        memset(bass_rec_step, 0, sizeof bass_rec_step);
        ui.rec = !ui.rec;
        if (ui.rec && is_303())
            ui.wpos[bidx()] = 0;
        say(ui.rec ? "RECORD ON: KEYS + KNOBS" : "RECORD OFF", 0);
        break;
    case B_HOME:                                      /* the pattern; again: the song (a list: back) */
        if(ui.view==V_GLO && ui.overlay==O_LIST && ui.glo_section>=0) {global_back();break;}
        if (ui.overlay != O_NONE || ui.view == V_GLO)
            close_overlay();
#if X0X_BASS_PRESET_PREVIEW
        else if (cancel_sound_request())
            break;
#endif
        else
            set_view(ui.view == V_HOME ? V_SONG : V_HOME);
        break;
    case B_SEL:
        if (ui.overlay == O_LIST)
            list_enter();
        else
            open_list_of_pages();
        break;
    case B_EDIT:
        if (ui.view == V_PART && ui.overlay == O_NONE && is_303() &&
            pg.r[cur_page()][0].kind == R_BENGINE && engine_bass_preset_pending(bidx())) {
            engine_bass_cancel_preset(bidx()); say("SOUND CHANGE CANCELLED",0); break;
        }
        if (ui.view == V_PART && ui.overlay == O_NONE)
            *page_of(V_PART) = (uint8_t)((cur_page() + 1) % pg.n);
        else
            set_view(V_PART);
        break;
    case B_ARP:
        if (!is_303()) {
            say("TB-3PO: PICK CHICAGO OR MIAMI", 0);
            break;
        }
        if (ui.view == V_GEN && ui.overlay == O_NONE)  /* the generator; again: its next page */
            *page_of(V_GEN) = (uint8_t)((cur_page() + 1) % pg.n);
        else
            set_view(V_GEN);
        break;
    case B_FX:
        if (ui.view == V_FX && ui.overlay == O_NONE)
            *page_of(V_FX) = (uint8_t)((cur_page() + 1) % pg.n);
        else
            set_view(V_FX);
        break;
    case B_LFO:
        if (ui.view == V_MIX && ui.overlay == O_NONE)
            *page_of(V_MIX) = (uint8_t)((cur_page() + 1) % pg.n);
        else
            set_view(V_MIX);
        break;
    case B_GLO:
        if (ui.view == V_GLO)
            close_overlay();
        else {
            set_view(V_GLO);
            open_global();
        }
        break;
    case B_SEQ:                                       /* the part's steps; again: the next page */
        if (ui.view == V_SEQ && ui.overlay == O_NONE)
            *page_of(V_SEQ) = (uint8_t)((cur_page() + 1) % pg.n);
        else
            set_view(V_SEQ);
        break;
    case B_SAVE: save_project(); break;
    case B_OCTUP:
    case B_OCTDN: {
        int up = b == B_OCTUP;
        if (ui.btn & (1u << B_SAVE)) {               /* SAVE + OCT: the bank a copy goes to */
            ui.btn_used |= 1u << B_SAVE;
            ui.pbank = (uint8_t)up;
            say(up ? "COPY TO P17-32" : "COPY TO P1-16", 0);
            ui.help = 0;
        } else if (steps_view() && is_303() && !ui.rec && ui.held_step >= 0) {   /* a held step: its octave */
            held_note_by(up ? 12 : -12);
        } else if (ui.view == V_GEN) {
            bpart_t *bp = &cur_pat()->bass[bidx()];
            if (up) {
                char t[20];
                bp->gen.seed = tb3po_new_seed(plat_ms() ^ (ui.frame << 7));
                tb3po_generate(bp);
                for(int step=0;step<NSTEPS;step++)(void)held_chord_set(proj.arr.lane,seq.ppat[ui.part],bidx(),step,0,0);
#if X0X_BASS_NOTE_SOUND
                for(int step=0;step<NSTEPS;step++)bass_note_clear(proj.arr.lane,seq.ppat[ui.part],bidx(),step);
#endif
                ui.gen_stale[bidx()] = 0;
                put_hex(put_s(t, "NEW LINE "), bp->gen.seed & 0xFFFFu, 4);
                say(t, 0);
            } else {
                uint32_t r = bp->gen.seed ^ plat_ms();
                tb3po_mutate(bp, &r);
                for(int step=0;step<NSTEPS;step++)(void)held_chord_set(proj.arr.lane,seq.ppat[ui.part],bidx(),step,0,0);
#if X0X_BASS_NOTE_SOUND
                for(int step=0;step<NSTEPS;step++)if(bstep_gate(&bp->step[step])!=G_NOTE)
                    bass_note_clear(proj.arr.lane,seq.ppat[ui.part],bidx(),step);
#endif
                ui.gen_stale[bidx()] = 0;
                say("MUTATED", 0);
            }
            mark_dirty();
        } else if (kbd_on() && steps_view()) {        /* the keyboard's octave */
            if (ui.view == V_SEQ && (ui.btn & (1u << B_LFO))) { /* SEQ LFO + OCT: a tie */
                ui.btn_used |= 1u << B_LFO;
                bass_write(bidx(), 0, G_TIE);
            } else if (ui.view == V_SEQ && (ui.btn & (1u << B_ENV))) { /* SEQ ENV + OCT: a rest */
                ui.btn_used |= 1u << B_ENV;
                bass_write(bidx(), 0, G_REST);
            } else {
                char t[12];
                ui.btn_used |= ui.btn & ((1u << B_LFO) | (1u << B_ENV));
                ui.oct = (int8_t)(ui.oct + (up ? 1 : -1));
                ui.oct = ui.oct < -2 ? -2 : ui.oct > 3 ? 3 : ui.oct;
                put_i(put_s(t, "OCTAVE "), ui.oct);
                say(t, 0);
            }
        } else if (ui.view == V_HOME || ui.view == V_SONG) {   /* the pattern bank: 1-16, 17-32 */
            ui.pbank = (uint8_t)up;
            say(up ? "PATTERNS 17-32" : "PATTERNS 1-16", 0);
        } else {
            char t[20];
            int pg_ = ui.spage + (up ? 1 : -1);
            ui.spage = (uint8_t)(pg_ < 0 ? 0 : pg_ > NSTEPS / 16 - 1 ? NSTEPS / 16 - 1 : pg_);
            put_i(put_s(put_i(put_s(t, "STEPS "), ui.spage * 16 + 1), "-"), ui.spage * 16 + 16);
            say(t, 0);
        }
        break;
    }
    default: break;
    }
}

static x0x_panic_chord_t kbd_panic;

/* Controls held across a project transfer cannot start a new panic chord. */
static void keyboard_panic_reset(uint32_t btn)
{
    kbd_panic.active = 0;
    kbd_panic.inhibited = (uint8_t)((btn & ((1u << B_FX) | (1u << B_SEQ))) != 0u);
}

static unsigned keyboard_panic(uint32_t btn, uint32_t changed)
{
    unsigned held = 0, result;
    if (!(changed & ((1u << B_FX) | (1u << B_SEQ))))
        return 0;
    if (btn & (1u << B_FX))
        held |= X0X_PANIC_FIRST;
    if (btn & (1u << B_SEQ))
        held |= X0X_PANIC_SECOND;
    result = x0x_panic_chord_update(&kbd_panic, held, X0X_PANIC_KEYBOARD);
    if (result & X0X_PANIC_FIRE)
        engine_request_notes_off();
    return (result & X0X_PANIC_CONSUME) ? 1u : 0u;
}

/* Physical Free Play rate pads, ported from 6ae0928's division_pad_* route.
 * Original Miami keeps its native macro13/division order. Shape pads untouched. */
static int division_pad_owner(void)
{
#if BOARD_SMK37 && X0X_DEV_WOBBLE && X0X_ORIGINAL_SYNTH
    extern uint8_t smk_clip_mode_on(void);
    /* A settings list or HELP on the synth page does not take the pads: they keep
     * the rates they show. Only a question (O_ASK) waits for an answer. */
    if (project_busy || perf_testing() || ui.rec || ui.overlay == O_ASK ||
        (ui.btn & ((1u << B_HOME) | (1u << B_SAVE))) ||
        (ui.view != V_SEQ && ui.view != V_PART) || !is_303() ||
        !ui.freeplay[bidx()] || engine_bass_bank(bidx()) != ORIGINAL_SOUND_MIAMI ||
        smk_clip_mode_on() || smc_ui_active())
        return 0;
#if X0X_DEV_PADCAL
    extern uint8_t smk_padcal_on(void);
    if (smk_padcal_on()) return 0;
#endif
    return bidx() + 1;
#else
    return 0;
#endif
}
static int division_pad_index(void)
{
#if BOARD_SMK37 && X0X_DEV_WOBBLE && X0X_ORIGINAL_SYNTH
    int v = pref_get(PR(R_ENG, T_303, bidx(), ORIGINAL_MIAMI_WOBBLE_RATE));
    return v < 0 ? 0 : v > 127 ? 7 : (v * 7 + 63) / 127;
#else
    return 0;
#endif
}
static const char *division_pad_label(void)
{
    static const char *const labels[8] = {"PADS: RATE 1/2", "PADS: RATE 1/4",
        "PADS: RATE 1/8", "PADS: RATE 1/16", "PADS: RATE 1/3", "PADS: RATE 1/6",
        "PADS: RATE 1/12", "PADS: RATE 1/24"};
    return labels[division_pad_index()];
}
/* Free Play bottom row: pads 9-12 pick the wobble SHAPE (control 11: TRI, DOWN,
 * UP, SQR); pads 13-16 are empty: dark, and a press does nothing. */
enum { DIVISION_SHAPE_PADS = 4 };
static int division_shape_index(void)
{
#if BOARD_SMK37 && X0X_DEV_WOBBLE && X0X_ORIGINAL_SYNTH
    int v = pref_get(PR(R_ENG, T_303, bidx(), ORIGINAL_MIAMI_WOBBLE_SHAPE));
    return v < 0 ? 0 : v > 127 ? 3 : (v * 3 + 63) / 127;
#else
    return 0;
#endif
}
static void division_pad_input(void)
{
    int owner = division_pad_owner();
    int pad = plat_division_pad((unsigned)owner);
#if BOARD_SMK37 && X0X_DEV_WOBBLE && X0X_ORIGINAL_SYNTH
    if (owner && pad >= 0 && pad < 8) {
        pref_set(PR(R_ENG, T_303, owner - 1, ORIGINAL_MIAMI_WOBBLE_RATE), (pad * 127 + 3) / 7);
        mark_dirty(); ui.act_t = plat_ms();
        say("WOBBLE ", division_pad_label() + 11);
    } else if (owner && pad >= 8 && pad < 8 + DIVISION_SHAPE_PADS) {
        static const char *const shape[DIVISION_SHAPE_PADS] = {"SHAPE TRI","SHAPE DOWN","SHAPE UP","SHAPE SQR"};
        pref_set(PR(R_ENG, T_303, owner - 1, ORIGINAL_MIAMI_WOBBLE_SHAPE), ((pad - 8) * 127 + 1) / 3);
        mark_dirty(); ui.act_t = plat_ms();
        say("WOBBLE ", shape[pad - 8]);
    }   /* pads 13-16: empty, nothing */
#else
    (void)pad;
#endif
}

/* 37 physical identities, not indices into the legacy 27-key tables. */
typedef struct {
    uint8_t pitch[37],velocity[37],accent[37],down[37],order[37],n;
    uint64_t suppressed;
} ui_live_keys_t;
static ui_live_keys_t live_keys[NBASS] X0X_POOL;
static plat_outer_event_t live_outer[32] X0X_POOL;
static uint32_t live_epoch=1,live_generation,live_context,live_wait_generation[NBASS],live_intent_generation[NBASS];
static int8_t live_owner=-1,live_octave,live_arp;
static uint8_t live_wait,live_intent;
static unsigned live_token(unsigned physical)
{ return physical>=5 && physical<32?physical-4:physical<5?physical+28:physical+1; }
int ui_live_key_owner(void)
{
#if BOARD_SMK37 || defined(X0X_HOST)
    /* Synth pages keep the keybed: a settings list or HELP on top of SEQ/EDIT
     * does not take the piano keys. Only a question (O_ASK) waits for an answer. */
    if(project_busy || perf_testing() || ui.rec || ui.overlay==O_ASK ||
       (ui.btn&((1u<<B_HOME)|(1u<<B_SAVE))) || (ui.view!=V_SEQ && ui.view!=V_PART) ||
       !is_303() || (!ui.freeplay[bidx()] && ui.view!=V_PART))return 0; /* EDIT plays (kbd_on): all 37 keys */
#if BOARD_SMK37
    extern uint8_t smk_clip_mode_on(void);
    if(smk_clip_mode_on() || smc_ui_active())return 0;
#if X0X_DEV_PADCAL
    extern uint8_t smk_padcal_on(void);if(smk_padcal_on())return 0;
#endif
#endif
    return bidx()+1;
#else
    return 0;
#endif
}
static void ui_live_cancel_voice(int b)
{
    if((unsigned)b>=NBASS || (!live_keys[b].n && !(live_intent&(1u<<b))))return;
    int arp;engine_live_key_state(b,&live_wait_generation[b],&arp,0);
    engine_live_key_cancel(b);live_wait|=(uint8_t)(1u<<b);live_intent&=(uint8_t)~(1u<<b);
    uint64_t held=plat_physical_keys();
    memset(&live_keys[b],0,sizeof live_keys[b]);live_keys[b].suppressed=held;
    kbd_held_note[b]=kbd_held_key[b]=kbd_arp_n[b]=bass_rec_step[b]=0;
}
static int live_send(int b,unsigned physical,int on,int slide)
{
    ui_live_keys_t *k=&live_keys[b];
    if(engine_live_key(b,live_generation,(int)live_token(physical),k->pitch[physical],
        on?k->velocity[physical]:0,k->accent[physical],slide)) {
        if(on){live_intent|=(uint8_t)(1u<<b);live_intent_generation[b]=live_generation;k->down[physical]=2;}
        return 1;
    }
    ui_live_cancel_voice(b);return 0;
}
static void live_edge(unsigned physical,int velocity,int pitch)
{
    if(physical>=37)return;
    uint64_t bit=(uint64_t)1u<<physical;
    if(!velocity)for(int b=0;b<NBASS;b++)live_keys[b].suppressed&=~bit;
    if(live_owner<0 || (live_wait&(1u<<live_owner)))return;
    int b=live_owner;ui_live_keys_t *k=&live_keys[b];
    int owns=(live_intent&(1u<<b)) && live_intent_generation[b]==live_generation;
    if(velocity) {
        if(k->down[physical] || (k->suppressed&bit))return;
        if(k->n>=UI_BASS_HELD_MAX){k->suppressed|=bit;return;}
        k->pitch[physical]=(uint8_t)pitch;k->velocity[physical]=(uint8_t)velocity;
        k->accent[physical]=(uint8_t)!!(ui.btn&(1u<<B_ENV));k->down[physical]=1;
        unsigned old=k->n;k->order[k->n++]=(uint8_t)physical;
        (void)old;
        if (!live_send(b, physical, 1, 0)) return;
    } else {
        if(!k->down[physical])return;
        unsigned i=0;while(i<k->n && k->order[i]!=physical)i++;
        int latest=i+1==k->n,active=k->down[physical]==2;k->down[physical]=0;
        if(i<k->n){for(unsigned j=i+1;j<k->n;j++)k->order[j-1]=k->order[j];k->n--;}
        (void)latest;
        if (owns && active && !live_send(b, physical, 0, 0)) return;
    }
    if(k->n){unsigned last=k->order[k->n-1];kbd_held_note[b]=k->pitch[last];kbd_held_key[b]=(uint8_t)live_token(last);}
    else kbd_held_note[b]=kbd_held_key[b]=0;
    bass_rec_step[b]=0;
}
static void live_reconcile(uint64_t physical)
{
    for(int b=0;b<NBASS;b++)live_keys[b].suppressed&=physical;
    if(live_owner>=0) {
        ui_live_keys_t *k=&live_keys[live_owner];
        int last=k->n?k->order[k->n-1]:-1;
        /* Remove missing older keys first: fallback must never transiently
         * resurrect another key already released in this same snapshot. */
        for(unsigned p=0;p<37;p++)if((int)p!=last && k->down[p] && !(physical&((uint64_t)1u<<p)))live_edge(p,0,0);
        if(last>=0 && k->down[last] && !(physical&((uint64_t)1u<<last)))live_edge((unsigned)last,0,0);
    }
}
/* Entry precedes controls; exit cuts off old publication on any context edit.
 * Every input-only and early-return path passes through this wrapper boundary. */
static void live_boundary(int entry)
{
    int owner=ui_live_key_owner()-1,arp=0;uint32_t generation=0,context=0;
    if(owner>=0) {
        engine_live_key_state(owner,&generation,&arp,&context);
        if(arp<0)owner=-1; /* exhausted capability serial: no admission until cold boot */
        if(owner>=0 && (live_wait&(1u<<owner)) && generation!=live_wait_generation[owner])live_wait&=(uint8_t)~(1u<<owner);
    }
    int changed=owner!=live_owner || (owner>=0 && (context!=live_context || arp!=live_arp));
    int gate_changed=owner>=0 && generation!=live_generation;
    int pitch_changed=ui.oct!=live_octave,overflow=0,n;
    uint64_t physical;
    if(changed) {
        /* Revoke the old physical keys before discarding their inventory.
         * A changed serial is not proof that their Note Off was consumed. */
        if(live_owner>=0) ui_live_cancel_voice(live_owner);
        live_owner=(int8_t)owner;live_context=context;live_arp=(int8_t)arp;
    }
    if(gate_changed && owner>=0 && !changed) ui_live_cancel_voice(owner);
    live_generation=generation;
    if(changed || pitch_changed || gate_changed) {
        live_epoch++;if(!live_epoch)live_epoch=1;
        plat_outer_keys(live_outer,&physical,&overflow,live_epoch,owner>=0,ui.oct,1);
        live_octave=ui.oct;
        if(owner>=0) {
            for(unsigned p=0;p<37;p++)if(!live_keys[owner].down[p] && (physical&((uint64_t)1u<<p)))
                live_keys[owner].suppressed|=(uint64_t)1u<<p;
        }
        live_reconcile(physical);return;
    }
    if(!entry)return;
    n=plat_outer_keys(live_outer,&physical,&overflow,live_epoch,owner>=0,ui.oct,0);
    if(overflow) {
        if(owner>=0)ui_live_cancel_voice(owner);
        live_epoch++;if(!live_epoch)live_epoch=1;
        plat_outer_keys(live_outer,&physical,&overflow,live_epoch,owner>=0,ui.oct,1);
        return;
    }
    for(int i=0;i<n;i++)if(owner>=0 && live_outer[i].generation==live_epoch) {
        unsigned w=live_outer[i].word;live_edge(w&127u,(int)((w>>7)&127u),(int)((w>>14)&127u));
    }
    live_reconcile(physical);
}
/* Only physical keybed edges enter this route; legacy pad-note aliases retain
 * their existing path. Outer tokens never enter KEY_BLACK or central bitmaps. */
static int live_central_event(int key,int down)
{
    unsigned p=(unsigned)key+5;uint64_t bit=(uint64_t)1u<<p;
    uint64_t physical=plat_physical_keys();
    if(down && !(physical&bit))return 0;
    live_boundary(0);
    /* A legacy pad/key press accepted before Free Play still owns its original
     * release. It was never admitted into the new physical-key registry. */
    if(!down)for(int b=0;b<NBASS;b++)if(!live_keys[b].down[p] && !live_keys[b].n) {
        int legacy=kbd_held_key[b]==key+1;
        for(unsigned i=0;i<kbd_arp_n[b];i++)legacy|=kbd_arp_key[b][i]==key+1;
        if(legacy){live_keys[b].suppressed&=~bit;return 0;}
    }
    for(int b=0;b<NBASS;b++)if(live_keys[b].suppressed&bit) {
        if(!down)live_keys[b].suppressed&=~bit;
        return 1;
    }
    if(live_owner<0)return 0;
    live_edge(p,down?plat_key_velocity(key):0,kbd_note(key));return 1;
}


X0X_COLD static void input_body(void)
{
    uint32_t btn = plat_buttons(), keys = plat_keys(), ch, i;
    unsigned panic_consume;
    if(btn!=ui.btn || keys!=ui.keys)bass_layout_accept();
#if X0X_BASS_PRESET_PREVIEW
    static int observed_bank[NBASS]={-1,-1};
    for(int v=0;v<NBASS;v++) if(observed_bank[v]!=engine_bass_bank(v)) {
        observed_bank[v]=engine_bass_bank(v);build_pages();
        if (!(bass_layout_pending_mask & (1u<<v)) && ui.view == V_PART && ui.overlay == O_LIST && is_303() && v == bidx()) open_list_of_pages();
    }
#endif
    uint8_t revision = project_revision;
    int e;
    if (project_busy) {
        project_input_sync();
#if BOARD_SMK37
        smc_poll();                                  /* discard controller events while the project is locked */
#endif
        return;
    }
    if (seq.rec_dirty) { seq.rec_dirty = 0; mark_dirty(); ui.act_t = plat_ms(); }
    if (seq.rec_refused) {
        say(seq.rec_refused==3?"CHORD NOT SAVED":seq.rec_refused==2?"NOTE SOUND NOT SAVED":"REC NEEDS FWD/REV",0);
        seq.rec_refused=0;
    }
    seq.rec_mask = ui.rec && is_303() && ui.view == V_SEQ && ui.overlay == O_NONE ?
                   (uint8_t)(1u << bidx()) : 0;
    seq.rec_ext_mask = ui.rec && ui.overlay != O_ASK ? (uint8_t)((1u << NBASS) - 1u) : 0;
    seq.rec_hold_mask = ui.rec && is_303() && ui.view == V_PART && ui.overlay == O_NONE ?
                        (uint8_t)(1u << bidx()) : 0;
    for (i = 0; i < NBASS; i++)
        if (!ui.rec || !kbd_held_note[i] || ui.part != PART_303A + i ||
            bass_rec_pat[i] != seq.ppat[PART_303A + i] || bass_rec_playing[i] != seq.playing)
            bass_rec_step[i] = 0;
    if (ui.held_step >= 0 && (ui.part != ui.held_step_part || seq.ppat[ui.part] != ui.held_step_pat))
        bass_step_cancel();                            /* playback or a cue changed the pattern under the key */
#if BOARD_SMK37
    smc_poll();
    if (revision != project_revision)
        return;
#endif
#if BOARD_SMK37
    extern uint8_t smk_clip_transport_button(uint8_t button, uint8_t pressed);
    extern uint8_t smk_clip_history_button(uint8_t button, uint8_t pressed, uint8_t patch_held);
    extern void smk_play_note_button(uint8_t pressed, uint8_t home_held);
#endif
    ch = btn ^ ui.btn;
    panic_consume = keyboard_panic(btn, ch);
#if BOARD_SMK37
    if (ch || keys != ui.keys)
        smc_ui_cancel();
#endif
    for (i = 0; i < NB; i++) {
        uint32_t m = 1u << i;
        if (!(ch & m))
            continue;
        /* PANIC_CONSUME */
        if ((i == B_FX || i == B_SEQ) && panic_consume) {
            if (btn & m) {
                any_button = 1;
                ui.down_t[i] = plat_ms();
                ui.btn_used |= m;
            } else
                ui.btn_used &= ~m;
            if (revision != project_revision)
                return;
            continue;
        }
#if BOARD_SMK37
        if ((i == B_PLAY || i == B_REC) &&
            smk_clip_history_button((uint8_t)i, (uint8_t)((btn & m) != 0u), (uint8_t)((btn >> B_HOME) & 1u))) {
            if (btn & m) {
                ui.btn_used |= m | 1u << B_HOME;   /* PATCH release does not change the X0X view */
            } else {
                ui.btn_used &= ~m;
            }
            continue;
        }
        if ((i == B_PLAY || i == B_REC) && smk_clip_transport_button((uint8_t)i, (uint8_t)((btn & m) != 0u))) {
            if (btn & m)
                ui.btn_used |= m;
            else
                ui.btn_used &= ~m;
            continue;
        }
        if (i == B_PLAY)                               /* outside clip mode: also the PLAY note (MID-14) */
            smk_play_note_button((uint8_t)((btn & m) != 0u), (uint8_t)((btn >> B_HOME) & 1u));
#endif
        if (btn & m) {
            any_button = 1;
            ui.btn_used &= ~m;
            ui.down_t[i] = plat_ms();
            if (i == B_REC || i == B_PLAY)             /* transport acts on the press: timing */
                button_tap((int)i);
        } else if (!(ui.btn_used & m) && i != B_REC && i != B_PLAY) {
            button_tap((int)i);
        }
        if (revision != project_revision)
            return;                                  /* discard the remainder of the old project's input frame */
    }
    if (btn || keys || btn != ui.btn || keys != ui.keys)
        ui.act_t = plat_ms();                         /* held or changed: being played */
    copy_tick(btn, keys);
    help_tick(btn, keys);
    ui.btn = btn;
    ch = keys ^ ui.keys;
    ui.keys = keys;
    for (i = 0; i < NKEYS; i++)
        if (ch & (1u << i))
            key_event((int)i, (keys >> i) & 1u);
    build_pages();
    if (!seq.playing)                                  /* PLAY plays what is on screen: the song on SONG, */
        seq.song_on = ui.view == V_SONG;               /* else the patterns; playing, it keeps going */
    seq.song_rec = (uint8_t)(seq.song_on && ui.rec);  /* the song + REC: the song is being written */
    if (ui.overlay == O_ASK) {                         /* a question: the knobs wait */
        for (i = 0; i < NE; i++)
            enc((int)i);
        return;
    }
    if (perf_testing()) {                              /* the test owns the knobs too */
        for (i = 0; i < NE; i++)
            enc((int)i);
        return;
    }
    if ((e = enc(EN_SELECT)) != 0) {             /* SELECT: move; with HOME held: tempo */
        if (held_any_step() >= 0 && !(ui.btn & (1u << B_HOME))) {
            prob_turn(e);                             /* a step held: its chance */
        } else if (ui.btn & (1u << B_HOME)) {
            float bpm = seq.bpm + (float)accel(EN_SELECT, e, 200);
            seq.bpm = bpm < 20.0f ? 20.0f : bpm > 275.0f ? 275.0f : bpm;
            ui.btn_used |= 1u << B_HOME;
            ui.touched = 4;
            ui.touch_until = plat_ms() + 900u;
            mark_dirty();
        } else if (ui.overlay == O_LIST) {
            list_move(e > 0 ? 1 : -1);
        } else {
            int p = cur_page() + (e > 0 ? 1 : -1);
            if (ui.view == V_MIX || ui.view == V_FX ||
                (ui.view == V_PART && (is_drum() || is_303()))) /* #63 safe browsing. */
                *page_of(ui.view) = (uint8_t)(p < 0 ? pg.n-1 : p >= pg.n ? 0 : p);
            else
                *page_of(ui.view) = (uint8_t)(p < 0 ? 0 : p >= pg.n ? pg.n - 1 : p);
        }
    }
    if ((e = enc(EN_ALGO)) != 0) {               /* ALGORITHM: part, or held 303 step's velocity */
        if (ui.overlay == O_LIST) {
            turn_ref(list_rows[ui.list_sel], e, EN_ALGO);
        } else if (ui.view == V_SEQ && is_303() && ui.held_step >= 0) {
            bstep_t *st = &cur_pat()->bass[bidx()].step[ui.held_step];
            int v = (int)bstep_velocity(st) + e;
            st->velocity = (uint8_t)(v < 1 ? 1 : v > 127 ? 127 : v);
            ui.step_edited = 1;
            mark_dirty();
            if (ui.step_preview) {
                bpart_t *bp = &cur_pat()->bass[bidx()];
                engine_bass_on_velocity(bidx(), st->note + bp->transpose - 24,
                                        (st->flags & BS_ACCENT) != 0, 1, st->velocity);
            }
        } else {
            int p = part_neighbor(ui.part, e > 0 ? 1 : -1);
            if (p != ui.part) {
                bass_step_cancel();
                drum_step_cancel();
            }
            ui.part = (uint8_t)p;
            if (ui.view == V_GEN && !is_303())         /* TB-3PO is a 303's */
                set_view(V_PART);
            ui.outline_ok = 0;
            build_pages();
            if (ui.view == V_MIX) {                   /* MIX follows: a drum machine's tracks, else that part on PARTS */
                int k;
                ui.mixsel = ui.part;
                build_pages();
                for (k = 0; k < pg.n; k++)
                    if (is_drum() ? pg.title[k][0] == PART_N[ui.part][0] && pg.title[k][4] == 'M' : !k)
                        *page_of(V_MIX) = (uint8_t)k;
            }
        }
    }
    if ((e = enc(EN_PRESET)) != 0) {             /* PRESETS: a part's screen, that part; else all five */
#if X0X_BASS_PRESET_PREVIEW
        if(ui.view==V_PART && is_303() && pg.r[cur_page()][0].kind==R_BENGINE) {
            pref_t r=PR(R_BPRESET,0,bidx(),0); pref_set(r,pref_get(r)+(e>0?1:-1));
        } else
#endif
        {
        int part = part_view() ? ui.part : PART_909, c = seq_cue_of(&seq, part);
        int p = (c >= 0 ? c : seq.ppat[part]) + (e > 0 ? 1 : -1);
        p = p < 0 ? 0 : p >= NPAT ? NPAT - 1 : p;
        seq_chain(&seq, 0, 0);
        if (part_view())
            seq_cue_part(&seq, part, p);
        else
            seq_cue(&seq, p);
        ui.pbank = (uint8_t)(p / 16);                 /* HOME shows the bank it is in */
        }
    }
    for (i = 0; i < 4; i++) {
        if ((e = enc(EN_K1 + (int)i)) == 0)
            continue;
        if (lock_step() >= 0) {                         /* EDIT, a step held: its p-lock */
#if X0X_BASS_PRESET_PREVIEW
            int bass_edit = is_303();
            if (bass_edit) {
                engine_bass_edit_hold(1);
                /* A bank may have committed since input() refreshed pg.
                 * Do not reinterpret this detent's old page in the new bank.
                 * The next input pass rebuilds it before accepting an edit. */
                if (observed_bank[bidx()] != engine_bass_bank(bidx())) {
                    engine_bass_edit_hold(0);
                    continue;
                }
            }
#endif
            lock_turn(pg.r[cur_page()][i], e, EN_K1 + (int)i);
#if X0X_BASS_PRESET_PREVIEW
            if (bass_edit) engine_bass_edit_hold(0);
#endif
            continue;
        }
        if (ui.view == V_SEQ && is_303() && ui.held_step >= 0) {     /* SEQ, a held step's knobs edit it */
            bpart_t *bp = &cur_pat()->bass[bidx()];
            bstep_t *st = &bp->step[ui.held_step];
            ui.step_edited = 1;
            mark_dirty();
            if (i == 0) {
                held_note_by(e);
            } else if (i == 1) {
                st->flags = (uint8_t)((st->flags & (BS_ACCENT | BS_SLIDE)) | (bstep_gate(st) + (e > 0 ? 1 : 2)) % 3);
            } else if (i == 2) {
                st->flags ^= BS_ACCENT;
            } else {
                st->flags ^= BS_SLIDE;
            }
            continue;
        }
        if (ui.btn & (1u << B_SAVE)) {                  /* SAVE + knob: forget that knob's motion */
            ui.btn_used |= 1u << B_SAVE;
            engine_bass_edit_hold(1);
            if (original_ref_current(pg.r[cur_page()][i])) motion_forget(pg.r[cur_page()][i]);
            engine_bass_edit_hold(0);
            continue;
        }
        turn_ref(pg.r[cur_page()][i], e, EN_K1 + (int)i);
        ui.touched = (int8_t)i;
        ui.touch_until = plat_ms() + 900u;
        {
            pref_t r = pg.r[cur_page()][i];
            ui.touch_view = ui.view; ui.touch_part = ui.part; ui.touch_page = (uint8_t)cur_page();
            ui.touch_kind = r.kind; ui.touch_a = r.a; ui.touch_b = r.b; ui.touch_c = r.c;
        }
    }
}

static void input(void)
{
    live_boundary(1);
    input_body();
    seq.rec_ext_mask = ui.rec && !project_busy && ui.overlay != O_ASK ? (uint8_t)((1u << NBASS) - 1u) : 0;
    live_boundary(0);
}

/* ================================================================== drawing === */
#define HDR_H 20
#define MAIN_Y 20
#define BAND_H 69                     /* the main area: two bands of 69 (the knob row takes the 6 below) */
#define KNOB_Y 158
#define KNOB_H 82
/* gfx.c sizes the one screen strip (CV_ROWS) to this main area. The unity
 * build sees that macro; a host file that compiles ui.c alone does not. */
#ifdef CV_ROWS
_Static_assert(2u * BAND_H <= CV_ROWS, "main area taller than the screen strip");
_Static_assert(KNOB_H <= CV_ROWS, "knob row taller than the screen strip");
_Static_assert(HDR_H <= CV_ROWS, "header taller than the screen strip");
_Static_assert(HDR_H + 2u * BAND_H + KNOB_H == 240u, "the three strips must tile the 240-row panel");
#endif

#include "lcd_tiles.h"
/* Dirty-tile DMA uses a dedicated, bounded .bss buffer. Full-row DMA
 * reads the untouched canvas until lcd_sync. Pool capacity is unchanged (0.0.24.1 has only 136 bytes above its pool gate).
 * 48 x 16 x RGB565 = 1536 bytes, 1.024 ms at the SMK-37's 12 MHz SPI. */
static uint16_t cv_lcd_txbuf[X0X_LCD_MAX_DMA_BYTES / 2u];
static uint32_t blit_hash[4];
static uint8_t part_header_snapshot_valid;
static uint8_t cv_tile_valid[4];
static uint32_t cv_hash(void)
{
    uint32_t i, h = 2166136261u, n = cv_w * cv_h;
    for (i = 0; i < n; i++)
        h = (h ^ cv_px[i]) * 16777619u;
    return h ^ (cv_w << 16) ^ cv_h;
}
#if BOARD_SMK37 && !defined(X0X_HOST)
void smk_ck_poll(void);                     /* clip keybed's MIDI note/arp service in main_fm1.c */
#endif
static void cv_lcd_input(void)
{
#if X0X_LCD_TRACE
    lcd_trace_dispatch();
#endif
    input();                                /* exact normal key/MIDI input path, preserving queue order */
    division_pad_input();
#if BOARD_SMK37 && !defined(X0X_HOST)
    smk_ck_poll();                          /* clip-mode notes must not wait for the screen */
#endif
}
/* At most one normal foreground dispatch per hardware millisecond.
 * The timer interrupt continues changing plat_ms during each bounded DMA. */
static void cv_lcd_maybe_input(void)
{
    static uint32_t last_ms = UINT32_MAX;
    const uint32_t now = plat_ms();
    if (last_ms != now) {
        last_ms = now;
        cv_lcd_input();
    }
}
typedef struct { uint32_t x, y; } cv_lcd_pos_t;
static void cv_lcd_emit(void *context, const uint16_t *px, uint32_t stride,
                         uint32_t x, uint32_t y, uint32_t w, uint32_t h)
{
    const cv_lcd_pos_t *pos = (const cv_lcd_pos_t *)context;
    /* The previous DMA can still read cv_lcd_txbuf: never overwrite it early.
     * This wait is bounded by the previous <=1536-byte pixel transfer. */
    lcd_sync();
    x0x_lcd_tile_pack(cv_lcd_txbuf, px, stride, x, y, w, h);
    lcd_blit(pos->x + x, pos->y + y, w, h, cv_lcd_txbuf);
    cv_lcd_maybe_input();
}
/* A whole-strip repaint already has contiguous full-width rows in cv_px.
 * DMA can read directly from that canvas without packing or an extra copy:
 * the next cv_begin() calls lcd_sync() before it writes to the canvas. */
static void cv_lcd_full(uint32_t x, uint32_t y)
{
    if (!cv_w) return;
    const uint32_t rows_per_dma = X0X_LCD_MAX_DMA_BYTES / (2u * cv_w);
    for (uint32_t row = 0; row < cv_h; row += rows_per_dma) {
        const uint32_t h = cv_h - row < rows_per_dma ? cv_h - row : rows_per_dma;
        lcd_blit(x, y + row, cv_w, h, cv_px + row * cv_w);
        cv_lcd_maybe_input();
    }
}
static void cv_commit(int region, uint32_t x, uint32_t y)
{
    if (region == 0) part_header_snapshot_valid = 0;
    uint32_t h = cv_hash();
    if (h != blit_hash[region]) {
        blit_hash[region] = h;
        cv_tile_valid[region] = 0;          /* next tiled owner must repaint after a whole-strip owner */
        cv_lcd_full(x, y);
    }
}

/* Hash 16x16 tiles, not the cross product of all changed rows and columns.
 * Adjacent changed tiles are grouped up to 48 pixels wide. Scattered playheads
 * stay separate, and no single display operation blocks input for a whole strip. */
#define MAIN_ROWS (2 * BAND_H)
#define KNOB_ROWS KNOB_H
#define LCD_TILE_ROWS(n) (((n) + X0X_LCD_TILE_H - 1u) / X0X_LCD_TILE_H)
static uint32_t main_tileh[LCD_TILE_ROWS(MAIN_ROWS) * X0X_LCD_TILE_COLS];
static uint32_t knob_tileh[LCD_TILE_ROWS(KNOB_ROWS) * X0X_LCD_TILE_COLS];
static uint32_t header_tileh[LCD_TILE_ROWS(HDR_H) * X0X_LCD_TILE_COLS];
static uint32_t header_full_hash, popup_knob_full_hash;
static void cv_commit_rows(int region, uint32_t x, uint32_t y,
                           uint32_t rows, uint32_t *hashes)
{
    cv_lcd_pos_t pos = {x, y};
    int force = !blit_hash[region] || !cv_tile_valid[region];
    blit_hash[region] = 1u;
    cv_tile_valid[region] = 1u;
    x0x_lcd_tile_commit(cv_px, rows, hashes, force, cv_lcd_emit, &pos);
}
static void cv_commit_rect(int region, uint32_t x, uint32_t y)
{
    cv_commit_rows(region, x, y, MAIN_ROWS, main_tileh);
}
static void cv_commit_knobs(int region)
{
    cv_commit_rows(region, 0, KNOB_Y, KNOB_ROWS, knob_tileh);
}

/* Full-band changes need no per-tile pixel packing. Send the same pixels
 * via 0.0.24.3's <=1,536-byte full-row DMA chunks and initialize the tile
 * hashes so the very next small change stays a dirty-tile update. */
static void cv_commit_full_with_tiles(int region, uint32_t x, uint32_t y,
                                      uint32_t rows, uint32_t *hashes)
{
    for (uint32_t row = 0; row < rows; row += X0X_LCD_TILE_H) {
        uint32_t h = rows - row < X0X_LCD_TILE_H ? rows - row : X0X_LCD_TILE_H;
        for (uint32_t col = 0; col < X0X_LCD_TILE_COLS; ++col)
            hashes[(row / X0X_LCD_TILE_H) * X0X_LCD_TILE_COLS + col] =
                x0x_lcd_tile_hash(cv_px, X0X_LCD_WIDTH,
                                  col * X0X_LCD_TILE_W, row, h);
    }
    blit_hash[region] = 1u;
    cv_tile_valid[region] = 1u;
    cv_lcd_full(x, y);
}

/* Tiny beat, cue and status changes use dirty header tiles. Unchanged frames
 * pay only the same single whole-band hash as 0.0.24.3. */
static void cv_commit_header(void)
{
    part_header_snapshot_valid = 0;
    if (!blit_hash[0] || !cv_tile_valid[0]) {
        /* Cold full-band transfer already computes all tile hashes. Avoid
         * hashing the full canvas twice; learn its full hash next frame. */
        cv_commit_full_with_tiles(0, 0, 0, HDR_H, header_tileh);
        header_full_hash = 0;
        return;
    }
    uint32_t h = cv_hash();
    if (h == header_full_hash) return;
    cv_commit_rows(0, 0, 0, HDR_H, header_tileh);
    header_full_hash = h;
}

/* SMC details use small dirty tiles after a full redraw; the separate popup
 * full hash avoids repeated descriptor-band work in a stable frame. */
static void cv_commit_popup_knobs(void)
{
    if (!blit_hash[3] || !cv_tile_valid[3]) {
        /* First popup redraw uses the established tile hashes for the whole
         * strip. Defer its duplicate full-canvas hash until the next frame. */
        cv_commit_full_with_tiles(3, 0, KNOB_Y, KNOB_ROWS, knob_tileh);
        popup_knob_full_hash = 0;
        return;
    }
    uint32_t h = cv_hash();
    if (h == popup_knob_full_hash) return;
    cv_commit_knobs(3);
    popup_knob_full_hash = h;
}

static uint16_t blend(uint16_t a, uint16_t b, int t)  /* a..b, t of 16 */
{
    int r = ((a >> 11) * (16 - t) + (b >> 11) * t) >> 4, g = (((a >> 5) & 63) * (16 - t) + ((b >> 5) & 63) * t) >> 4,
        bl = ((a & 31) * (16 - t) + (b & 31) * t) >> 4;
    return (uint16_t)((r << 11) | (g << 5) | bl);
}
static uint16_t part_col(void) { return PART_COL[ui.part]; }
static uint16_t matrix_col(void)
{
    return is_303()?(ui_theme_light?RGB(40,104,30):RGB(164,235,141)):part_col();
}

/* Owner-approved Chicago second screen only; not a global theme or setting.
 * The first four rows and Miami's OUTPUT/DAMPER controls keep their layout. */
static int matrix_three_rows(void)
{
    return 0; /* Original pages keep four rows per bank. */
    return ui.view==V_PART && is_303() && cur_page()>=4 && pg.n==7 &&
           pg.r[4][0].kind==R_ENG && pg.r[4][0].c==CHI_ARP_SWITCH &&
           pg.r[6][0].kind==R_BENGINE;
}
#define SOUND_BASE UI_N_BASE
#define SOUND_FACE UI_N_FACE
#define SOUND_EDGE UI_N_EDGE
#define SOUND_SIDE UI_N_SIDE
#define SOUND_SELECT UI_N_SELECT
#define SOUND_SELECT_EDGE UI_N_SELECT_EDGE
#define SOUND_SELECT_SIDE UI_N_SELECT_SIDE
#define SOUND_INK UI_N_INK
#define SOUND_WHITE UI_N_WHITE
#define SOUND_GRAY UI_N_GRAY
#define SOUND_DIM UI_N_DIM
#define SOUND_LINE UI_N_LINE
#define SOUND_GREEN UI_N_ACCENT
#define SOUND_AMBER UI_N_AMBER

static uint16_t dim(uint16_t c, int t) { return blend(C_BLACK, c, t); }

static int32_t tw(const felucca_font_t *f, const char *s) { return text_w(f, s); }

/* a font's capital line: the first and last rows of 'H' (rounded half coverage), measured
 * once from the glyph bitmap, so text is centred on what the eye sees rather than on the
 * font's cell (which differs per face and size) */
typedef struct { const felucca_font_t *f; int8_t top, bot; } capm_t;
static capm_t capm[6];
static const capm_t *caps(const felucca_font_t *f)
{
    int i;
    for (i = 0; i < 6 && capm[i].f; i++)
        if (capm[i].f == f)
            return &capm[i];
    if (i == 6)
        i = 5;
    {
        uint32_t gi = ((uint32_t)'H' <= f->last ? 'H' : '0') - f->first, w = f->bw[gi], bpr = (w + 1u) / 2u, x, y;
        const uint8_t *gd = f->data + f->off[gi];
        int top = -1, bot = 0;
        for (y = 0; y < f->h; y++)
            for (x = 0; x < w; x++) {
                uint32_t a = gd[y * bpr + x / 2u];
                a = (x & 1u) ? (a & 15u) : (a >> 4);
                if (a >= 8u) {
                    if (top < 0)
                        top = (int)y;
                    bot = (int)y;
                }
            }
        capm[i].f = f;
        capm[i].top = (int8_t)(top < 0 ? 0 : top);
        capm[i].bot = (int8_t)bot;
    }
    return &capm[i];
}
/* parts of a line ("A 909 GR", "B 909 FL") with a real gap between them: a proportional face's
 * space is too narrow to separate them. A NULL ends the list. */
static int32_t segs(int32_t x, int32_t y, const felucca_font_t *f, uint16_t c, int32_t gap, const char *a,
                    const char *b, const char *d, const char *e)
{
    const char *p[4] = {a, b, d, e};
    int i;
    for (i = 0; i < 4 && p[i]; i++)
        x = cv_text(x, y, f, p[i], c) + gap;
    return x;
}

/* the y to draw f at so its capitals sit centred in [y0, y0 + h) */
static int32_t vc(const felucca_font_t *f, int32_t y0, int32_t h)
{
    const capm_t *m = caps(f);
    int32_t ch = m->bot - m->top + 1;
    return y0 + (h - ch + 1) / 2 - m->top;
}
/* the y to draw g at so its baseline matches f drawn at y */
static int32_t base_y(const felucca_font_t *f, int32_t y, const felucca_font_t *g)
{
    return y + caps(f)->bot - caps(g)->bot;
}
static void text_c(int32_t cx, int32_t y, const felucca_font_t *f, const char *s, uint16_t c)
{
    cv_text(cx - tw(f, s) / 2, y, f, s, c);
}
static void text_r(int32_t rx, int32_t y, const felucca_font_t *f, const char *s, uint16_t c)
{
    cv_text(rx - tw(f, s), y, f, s, c);
}

/* ---- anti-aliased shapes. Coverage is 0..16; a pixel is blended over what is there. ---- */
static void px_blend(int32_t x, int32_t y, uint16_t c, uint32_t a)
{
    uint16_t *q;
    uint32_t bg;
    y += cv_oy;
    if ((uint32_t)x >= cv_w || y < cv_y0 || y >= cv_y1 || !a)
        return;
    q = &cv_px[(uint32_t)y * cv_w + (uint32_t)x];
    if (a >= 16u) {
        *q = swap16(c);
        return;
    }
    bg = swap16(*q);
    *q = swap16((uint32_t)(((((c >> 11) * a + (bg >> 11) * (16u - a)) >> 4) << 11) |
                           (((((c >> 5) & 63u) * a + ((bg >> 5) & 63u) * (16u - a)) >> 4) << 5) |
                           (((c & 31u) * a + (bg & 31u) * (16u - a)) >> 4)));
}

/* corner coverage of a radius-r quarter circle, pixel (x, y) of the r x r corner square,
 * 4 x 4 supersampled; and of its 1-px ring (for outlines). Constant data in flash, packed: the
 * r x r square of radius r starts at CORNER_OFF[r]. The values are those that the old start-up
 * loop (corners_init) calculated, to the byte. */
#define RMAX 8
static const uint8_t CORNER_OFF[RMAX + 1] = {0, 0, 1, 5, 14, 30, 55, 91, 140};
/* Lossless nibble encoding: coverage 8 is absent, so nibble 8 encodes 16.
 * FILL's 204 values precede RING's 204 values. Every other coverage is literal. */
static const uint8_t CORNER_PACKED[204] = {
    0x6d, 0xff, 0x08, 0xf9, 0x89, 0xf8, 0x88, 0x30, 0x8b, 0xf3, 0x88, 0x8b, 0x88, 0x88, 0x88, 0x00,
    0xc5, 0x08, 0x8a, 0x88, 0x85, 0x88, 0xc8, 0x88, 0x88, 0x88, 0x88, 0x08, 0x00, 0xd7, 0x08, 0xd1,
    0x88, 0x08, 0x8d, 0x88, 0x78, 0x88, 0x88, 0xd8, 0x88, 0x88, 0x88, 0x88, 0x88, 0x08, 0x00, 0x92,
    0x8d, 0x00, 0xf6, 0x88, 0x08, 0x86, 0x88, 0x88, 0xf2, 0x88, 0x88, 0x98, 0x88, 0x88, 0x88, 0x8d,
    0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x00, 0x00, 0xa3, 0x8e, 0x00, 0x91, 0x88, 0x88, 0x10, 0x8d,
    0x88, 0x88, 0x90, 0x88, 0x88, 0x88, 0x83, 0x88, 0x88, 0x88, 0x8a, 0x88, 0x88, 0x88, 0x8e, 0x88,
    0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x6d, 0xff, 0x03, 0xf9, 0xa9, 0xf1, 0x01, 0x30, 0x8b, 0xf3,
    0x17, 0x7b, 0x00, 0x18, 0x00, 0x00, 0xc5, 0x08, 0xda, 0x05, 0xd5, 0x01, 0xc0, 0x05, 0x00, 0x08,
    0x00, 0x00, 0x00, 0xd7, 0x08, 0xd1, 0x4b, 0x00, 0x6d, 0x00, 0x70, 0x0b, 0x00, 0xd0, 0x04, 0x00,
    0x80, 0x00, 0x00, 0x00, 0x00, 0x92, 0x8d, 0x00, 0xf6, 0x39, 0x00, 0xf6, 0x03, 0x00, 0xf2, 0x03,
    0x00, 0x90, 0x09, 0x00, 0x00, 0x3d, 0x00, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0xa3, 0x8e,
    0x00, 0x91, 0x7e, 0x03, 0x10, 0xad, 0x01, 0x00, 0x90, 0x0a, 0x00, 0x00, 0xe3, 0x01, 0x00, 0x00,
    0x7a, 0x00, 0x00, 0x00, 0x3e, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00,
};
_Static_assert(sizeof CORNER_PACKED * 2u == 408u, "complete corner coverage table");
static __attribute__((noinline)) uint32_t corner_coverage(uint32_t index)
{
    uint32_t a = (CORNER_PACKED[index >> 1] >> ((index & 1u) * 4u)) & 15u;
    return a == 8u ? 16u : a;
}
#define corner_fill_at(r, j, i) corner_coverage(CORNER_OFF[r] + (uint32_t)(j) * (uint32_t)(r) + (uint32_t)(i))
#define corner_ring_at(r, j, i) corner_coverage(204u + CORNER_OFF[r] + (uint32_t)(j) * (uint32_t)(r) + (uint32_t)(i))

/* a filled rounded rectangle; r is clamped to fit */
static void rbox(int32_t x, int32_t y, int32_t w, int32_t h, int32_t r, uint16_t c)
{
    int32_t i, j;
    if (w <= 0 || h <= 0)
        return;
    if (r > w / 2)
        r = w / 2;
    if (r > h / 2)
        r = h / 2;
    if (r > RMAX)
        r = RMAX;
    if (r < 1) {
        cv_rect(x, y, w, h, c);
        return;
    }
    cv_rect(x + r, y, w - 2 * r, h, c);
    cv_rect(x, y + r, r, h - 2 * r, c);
    cv_rect(x + w - r, y + r, r, h - 2 * r, c);
    for (j = 0; j < r; j++)
        for (i = 0; i < r; i++) {
            uint32_t a = corner_fill_at(r, j, i);
            px_blend(x + i, y + j, c, a);
            px_blend(x + w - 1 - i, y + j, c, a);
            px_blend(x + i, y + h - 1 - j, c, a);
            px_blend(x + w - 1 - i, y + h - 1 - j, c, a);
        }
}

/* a 1-px rounded outline */
static void rframe(int32_t x, int32_t y, int32_t w, int32_t h, int32_t r, uint16_t c)
{
    int32_t i, j;
    if (r > w / 2)
        r = w / 2;
    if (r > h / 2)
        r = h / 2;
    if (r > RMAX)
        r = RMAX;
    if (r < 1)
        r = 1;
    cv_rect(x + r, y, w - 2 * r, 1, c);
    cv_rect(x + r, y + h - 1, w - 2 * r, 1, c);
    cv_rect(x, y + r, 1, h - 2 * r, c);
    cv_rect(x + w - 1, y + r, 1, h - 2 * r, c);
    for (j = 0; j < r; j++)
        for (i = 0; i < r; i++) {
            uint32_t a = corner_ring_at(r, j, i);
            px_blend(x + i, y + j, c, a);
            px_blend(x + w - 1 - i, y + j, c, a);
            px_blend(x + i, y + h - 1 - j, c, a);
            px_blend(x + w - 1 - i, y + h - 1 - j, c, a);
        }
}

/* the radius that suits a box of height h: soft, never round */
static int32_t rad_of(int32_t h) { return h >= 30 ? 6 : h >= 18 ? 4 : h >= 9 ? 3 : 2; }
static void box(int32_t x, int32_t y, int32_t w, int32_t h, uint16_t c) { rbox(x, y, w, h, rad_of(h < w ? h : w), c); }
static void frame(int32_t x, int32_t y, int32_t w, int32_t h, uint16_t c) { rframe(x, y, w, h, rad_of(h < w ? h : w), c); }

/* an anti-aliased disc of radius r (float) at (cx, cy) */
static void disc(float cx, float cy, float r, uint16_t c)
{
    int32_t x0 = (int32_t)fm_floorf(cx - r - 1.0f), x1 = (int32_t)(cx + r + 1.0f);
    int32_t y0 = (int32_t)fm_floorf(cy - r - 1.0f), y1 = (int32_t)(cy + r + 1.0f), x, y;
    for (y = y0; y <= y1; y++)
        for (x = x0; x <= x1; x++) {
            float dx = (float)x + 0.5f - cx, dy = (float)y + 0.5f - cy, d = fm_sqrtf(dx * dx + dy * dy);
            float a = fm_clampf(r - d + 0.5f, 0.0f, 1.0f);
            px_blend(x, y, c, (uint32_t)(a * 16.0f + 0.5f));
        }
}
static void dot(int32_t x, int32_t y, int32_t r, uint16_t c) { disc((float)x + 0.5f, (float)y + 0.5f, (float)r + 0.3f, c); }

/* atan2 in turns, 0..1 from +x going clockwise on screen (y down) */
static float turns(float y, float x)
{
    float ax = fm_fabsf(x), ay = fm_fabsf(y), a = ax < ay ? ax / (ay + 1e-9f) : ay / (ax + 1e-9f), s = a * a, r;
    r = ((-0.0464964749f * s + 0.15931422f) * s - 0.327622764f) * s * a + a;   /* atan on [0, 1] */
    if (ay > ax)
        r = 1.57079637f - r;
    if (x < 0.0f)
        r = FM_PI - r;
    if (y < 0.0f)
        r = FM_TWO_PI - r;
    return r * (1.0f / FM_TWO_PI);
}

/* a knob: a 270-degree track from 7:30 to 4:30, thickness th, anti-aliased, round ends; the
 * value filled from the start (or from the top, for a bipolar value) and a round handle */
#include "ui_arc8_geometry.h"
static void arc(int32_t cx, int32_t cy, int32_t r, float v, uint16_t track, uint16_t fill, int bipolar)
{
    const float th = 3.4f, a0 = 0.375f, sweep = 0.75f;  /* start at 135 degrees, in turns */
    float ro = (float)r, ri = ro - th, rm = ro - th * 0.5f, fx = (float)cx + 0.5f, fy = (float)cy + 0.5f;
    float lo = bipolar ? (v < 0.5f ? v : 0.5f) : 0.0f, hi = bipolar ? (v < 0.5f ? 0.5f : v) : v;
    int32_t x, y;
    v = fm_clampf(v, 0.0f, 1.0f);
    if (r == 8) {
        /* Keep original y/x order, exact float t bits and rounded coverage.
         * Caps/handle below and every other radius retain the original path. */
        for (unsigned i = 0; i < sizeof arc8_geometry / sizeof *arc8_geometry; ++i) {
            float t;
            memcpy(&t, &arc8_geometry[i].turns_bits, sizeof t);
            px_blend(cx + arc8_geometry[i].x, cy + arc8_geometry[i].y,
                     (t >= lo && t <= hi) ? fill : track, arc8_geometry[i].coverage);
        }
    } else for (y = -r - 1; y <= r + 1; y++)
        for (x = -r - 1; x <= r + 1; x++) {
            float dx = (float)x + 0.5f - 0.5f, dy = (float)y + 0.5f - 0.5f, d = fm_sqrtf(dx * dx + dy * dy), t, a;
            a = fm_clampf(ro + 0.5f - d, 0.0f, 1.0f) * fm_clampf(d - ri + 0.5f, 0.0f, 1.0f);
            if (a <= 0.0f)
                continue;
            t = turns(dy, dx) - a0;
            if (t < 0.0f)
                t += 1.0f;
            t /= sweep;
            if (t > 1.0f)
                continue;                              /* the gap at the bottom; the caps close it */
            px_blend(cx + x, cy + y, (t >= lo && t <= hi) ? fill : track, (uint32_t)(a * 16.0f + 0.5f));
        }
    {   /* round ends: the track's, then the fill's, then the handle */
        float e0 = (a0) * FM_TWO_PI, e1 = (a0 + sweep) * FM_TWO_PI, ev = (a0 + sweep * v) * FM_TWO_PI;
        float el = (a0 + sweep * lo) * FM_TWO_PI;
        disc(fx + fm_cosf(e0) * rm - 0.5f, fy + fm_sinf(e0) * rm - 0.5f, th * 0.5f, lo <= 0.0f && hi > 0.0f ? fill : track);
        disc(fx + fm_cosf(e1) * rm - 0.5f, fy + fm_sinf(e1) * rm - 0.5f, th * 0.5f, hi >= 1.0f ? fill : track);
        if (hi > lo)
            disc(fx + fm_cosf(el) * rm - 0.5f, fy + fm_sinf(el) * rm - 0.5f, th * 0.5f, fill);
        disc(fx + fm_cosf(ev) * rm - 0.5f, fy + fm_sinf(ev) * rm - 0.5f, th * 0.5f + 1.3f, C_BLACK);
        disc(fx + fm_cosf(ev) * rm - 0.5f, fy + fm_sinf(ev) * rm - 0.5f, th * 0.5f + 0.6f, C_WHITE);
    }
}

static void play_icon(int32_t x, int32_t y, uint16_t c)
{
    int32_t i, j;
    for (j = 0; j < 11; j++)                           /* a triangle, edges anti-aliased */
        for (i = 0; i < 9; i++) {
            float fy = (float)j + 0.5f - 5.5f, fx = (float)i + 0.5f;
            float edge = 8.0f - fx - fm_fabsf(fy) * 1.3f;
            float a = fm_clampf(edge * 0.7f + 0.5f, 0.0f, 1.0f) * fm_clampf(fx + 0.5f, 0.0f, 1.0f);
            px_blend(x + i, y + j, c, (uint32_t)(a * 16.0f + 0.5f));
        }
}

/* the length of the part on screen, when its keys are steps (0: they are not) */
static int steps_len(void)
{
    if (is_drum())
        return cur_pat()->drum[ui.part].len;
    if (is_303() && !ui.rec)
        return cur_pat()->bass[bidx()].len;
    return 0;
}

/* -------------------------------------------------------------- header --- */
/* Keep screen renderers out of their callers on SMK to reduce code size.
 * Drawing operations, fonts and audio code stay unchanged. */
#if BOARD_SMK37 && defined(__clang__)
#define UI_DRAW __attribute__((minsize, noinline))
#else
#define UI_DRAW
#endif
/* Horizontal runs keep the small-cell atlas cheap to paint at either scale. */
static UI_DRAW void ui_pictogram(int x,int y,int glyph,int scale,uint16_t ink)
{
    if ((unsigned)glyph>=UI_G_COUNT || scale<1 || scale>3) return;
    for (int row=0;row<9;row++) {
        uint16_t bits=UI_PICTOGRAM[glyph][row];
        for (int col=0;col<9;) {
            if (!(bits & (1u<<(8-col)))) { col++; continue; }
            int start=col;
            do { col++; } while (col<9 && (bits & (1u<<(8-col))));
            cv_rect(x+start*scale,y+row*scale,(col-start)*scale,scale,ink);
        }
    }
}
static UI_DRAW void ui_state_toggle(int x,int y,int on,uint16_t ink)
{
    rframe(x,y,18,9,2,ink);
    cv_rect(x+(on?12:2),y+2,4,5,ink);
}
/* Complete sequence identity stays clear of tempo/transport at the right. */
static UI_DRAW int ui_position_badge(int glyph,int position,int queued,uint16_t ink,uint16_t cue_ink)
{
    char number[12],next[12];
    put_i(number,position); put_i(next,queued);
    const felucca_font_t *font=&FONT_S;
    int width=12+tw(font,number)+(queued?15+tw(font,next):0);
    if (width>53) font=&FONT_T;
    width=12+tw(font,number)+(queued?15+tw(font,next):0);
    if (width>53) font=&FONT_XS;
    ui_pictogram(132,5,glyph,1,ink);
    int x=cv_text(144,vc(font,1,17),font,number,ink);
    if (queued) {
        ui_pictogram(x+3,5,UI_G_NEXT,1,cue_ink);
        x=cv_text(x+15,vc(font,1,17),font,next,cue_ink);
    }
    return x;
}
/* Shallow bevel stays entirely inside the existing rectangle. Four-pixel
 * chamfers, inset dark lower edge, restrained local highlight: no tall teeth,
 * extra buffer, animation, layout change or mutable render state. */
static UI_DRAW void surface_panel(int x,int y,int w,int h,int active,uint16_t face,uint16_t edge,uint16_t side)
{
    int r=h>=18?4:h>=9?2:1, row;
    if(w<2*r+3 || h<2*r+3) r=1;
    for(row=0;row<h;row++) {
        int inset=row<r?r-row:row>=h-r?row-(h-r)+1:0;
        uint16_t shade=face;
        if(active && h>=18 && row>0 && row<5)shade=blend(face,C_WHITE,5-row);
        if(active && h>=18 && row>=h-4)shade=blend(face,C_BLACK,(row-(h-4)+1)*2);
        cv_rect(x+inset,y+row,w-2*inset,1,shade);
    }
    cv_rect(x+r,y,w-2*r,1,edge);
    cv_line(x,y+r,x+r,y,edge);
    cv_rect(x,y+r,1,h-2*r,active?edge:UI_N_LEFT);
    cv_line(x+w-r-1,y,x+w-1,y+r,edge);
    cv_rect(x+w-1,y+r,1,h-2*r,side);
    cv_line(x+w-1,y+h-r-1,x+w-r-1,y+h-1,side);
    cv_rect(x+r,y+h-1,w-2*r,1,UI_N_SHADOW);
    cv_line(x,y+h-r-1,x+r,y+h-1,side);
    /* A short light catch, not a washed-out full-width glare band. */
    if(w>24 && h>=18) cv_rect(x+r+2,y+1,w/4,1,active?edge:UI_N_LEFT);
    if(active && h>=18) cv_rect(x+r+1,y+h-2,w-2*r-2,1,side);
}
static UI_DRAW void night_panel(int x,int y,int w,int h,int active)
{
    surface_panel(x,y,w,h,active,active?SOUND_SELECT:SOUND_FACE,
                  active?SOUND_SELECT_EDGE:SOUND_EDGE,active?SOUND_SELECT_SIDE:SOUND_SIDE);
}
/* Compact steps/notes use the same shallow material inside their old bounds.
 * Keep the centre ink (hit/mute/play semantics) and all overlay notches intact. */
static UI_DRAW void night_mark(int x,int y,int w,int h,uint16_t ink,int raised)
{
    box(x,y,w,h,ink);
    if(w>=4 && h>=5) {
        cv_rect(x+1,y+1,w-2,1,raised?blend(ink,C_WHITE,3):UI_N_SHADOW);
        cv_rect(x+1,y+h-2,w-2,1,raised?dim(ink,7):UI_N_LEFT);
    }
}

static void night_label_c(int cx,int y,const felucca_font_t *f,const char *s,uint16_t ink)
{
    int x=cx-tw(f,s)/2;
    cv_text(x,y+1,f,s,UI_N_LEFT); /* shallow incised lower light */
    cv_text(x,y-1,f,s,UI_N_SHADOW);
    cv_text(x,y,f,s,ink);       /* retain the native face, metrics and ink */
}
#define sound_slab night_panel

static void pat_glyph_row(int32_t x,int32_t y,const uint8_t strength[8],uint16_t c,int current);
/* Shared, bounded pictures for status and the existing physical controls. */
static UI_DRAW void nav_arrow(int x,int y,int direction,uint16_t ink)
{
    int tip=x+(direction>0?5:0),tail=x+(direction>0?0:5),back=tip-direction*3;
    cv_line(tail,y+3,tip,y+3,ink);
    cv_line(back,y,tip,y+3,ink);cv_line(tip,y+3,back,y+6,ink);
}
static UI_DRAW void row_picture(int x,int y,uint16_t ink)
{
    for(int row=0;row<3;row++)cv_rect(x,y+1+row*3,10,row==1?2:1,ink);
}
static UI_DRAW void header_pattern_badge(int x,int part,int pattern,int current,uint16_t ink)
{
    uint8_t strength[8];char number[4];
    if(part<0 || part>=NPARTS || pattern<0 || pattern>=NPAT)return;
    frame(x,6,10,7,ink);
    home_pattern_strength8(&proj.pat[pattern],proj.arr.lane,pattern,part,
                          proj.set.accent_q7,T_VEL,strength);
    pat_glyph_row(x+1,8,strength,PART_COL[part],current);
    put_i(number,pattern+1);cv_text(x+12,vc(&FONT_T,1,17),&FONT_T,number,ink);
}
static UI_DRAW void header_pattern_cue(int x,int part)
{
    int cue=seq_cue_of(&seq,part);
    if(seq.song_on || cue<0 || cue==seq.ppat[part])return;
    /* A live sequencer step may pulse the arrow. Wall time alone never does. */
    uint16_t ink=seq.playing && (eng_step[TRK_DRUM]&1)?C_WHITE:C_AMB;
    nav_arrow(x,6,1,ink);header_pattern_badge(x+8,part,cue,0,C_GRAY);
}

/* Exact inputs of the static PART header; keep the newer audio-owned
 * metro phase and tiled display owner from 8be16486. */
typedef struct {
    const char *name;
    uint16_t colours[5], col;
    uint8_t light, part, page, pages, phase, rec, save, night;
} part_header_snapshot_t;
static part_header_snapshot_t part_header_snapshot;

static UI_DRAW void draw_header(void)
{
#if BOARD_SMK37
    extern uint8_t smk_clip_mode_on(void);
#endif
    char b[24];
    int32_t x;
    int ss = save_state();
    int pickup = ui.msg[0] == 'P' && ui.msg[1] == 'I' && ui.msg[2] == 'C' &&
                 ui.msg[3] == 'K' && ui.msg[4] == ' ';
    part_header_snapshot_t snapshot = {0};
    int cacheable = !ui.msg_until && ui.view == V_PART && (is_drum() || is_303()) &&
        ui.overlay == O_NONE && !ui.help && !division_pad_owner() &&
        seq_cue_of(&seq, ui.part) < 0
#if BOARD_SMK37
        && !smk_clip_mode_on()
#endif
        ;
    if (cacheable) {
        snapshot.name = part_display(ui.part);
        if (is_303()) snapshot.name = engine_bass_bank(bidx()) == ORIGINAL_SOUND_JUNO ? (bidx()?"JUNO B":"JUNO A") : engine_bass_bank(bidx()) == ORIGINAL_SOUND_DRONE ?
            (bidx() ? "DRONE B" : "DRONE A") : engine_bass_bank(bidx()) == ORIGINAL_SOUND_MIAMI ?
            (bidx() ? "MIAMI B" : "MIAMI A") : (bidx() ? "CHICAGO B" : "CHICAGO A");
        memcpy(snapshot.colours, pal, sizeof pal);
        snapshot.col = matrix_col(); snapshot.light = ui_theme_light;
        snapshot.part = ui.part; snapshot.page = (uint8_t)cur_page(); snapshot.pages = pg.n;
        snapshot.phase = seq.metro_view; snapshot.rec = ui.rec; snapshot.save = (uint8_t)ss;
        snapshot.night = (uint8_t)(matrix_three_rows() || X0X_ORIGINAL_SYNTH);
        if (part_header_snapshot_valid && blit_hash[0] && cv_tile_valid[0] &&
            !memcmp(&snapshot, &part_header_snapshot, sizeof snapshot)) return;
    }
    part_header_snapshot_valid = 0;
    cv_begin(240, HDR_H, C_BLACK);
    night_panel(0,0,240,HDR_H,0);
    if (ui.msg_until && (int32_t)(ui.msg_until - plat_ms()) > 0 && !pickup) {   /* what a button just did */
        box(0, 0, 240, HDR_H - 1, part_col());
        if (!memcmp(ui.msg, "NEXT: PAT ", 10)) {
            int pattern=0, n=10;
            while (n<(int)sizeof ui.msg-1 && ui.msg[n]>='0' && ui.msg[n]<='9' && pattern<=NPAT)
                pattern=pattern*10+ui.msg[n++]-'0';
            put_s(put_s(b, "> "), ui.msg+10);
            x=(240-tw(&FONT_B,"NEXT")-6-12-6-tw(&FONT_B,b))/2;
            x=cv_text(x,vc(&FONT_B,0,HDR_H-1),&FONT_B,"NEXT",C_BLACK)+6;
            frame(x,1,12,17,C_BLACK);
            if (!ui.msg[n] && pattern>0 && pattern<=NPAT) {
                for (int pos=0;pos<NPARTS;pos++) {
                    uint8_t strength[8];
                    home_pattern_strength8(&proj.pat[pattern-1],proj.arr.lane,pattern-1,part_at(pos),
                                           proj.set.accent_q7,T_VEL,strength);
                    pat_glyph_row(x+2,2+pos*3,strength,C_BLACK,0);
                }
            }
            cv_text(x+18,vc(&FONT_B,0,HDR_H-1),&FONT_B,b,C_BLACK);
        } else {   /* #800 NEXT pattern glyph; other messages keep #806's long-text font fallback */
            const felucca_font_t *font = tw(&FONT_B, ui.msg) <= 232 ? &FONT_B : &FONT_XS;
            text_c(120, vc(font, 0, HDR_H - 1), font, ui.msg, C_BLACK);
        }
        cv_commit_header();
        return;
    }
    if (!pickup || (int32_t)(ui.msg_until - plat_ms()) <= 0)
        ui.msg_until = pickup = 0;
    if (!pickup && ui.view==V_PART && (is_drum() || is_303()) && ui.overlay==O_NONE && !ui.help
#if BOARD_SMK37
        && !smk_clip_mode_on()
#endif
        ) {
        const char *name=part_display(ui.part);
        if(is_303()) {
            name=engine_bass_bank(bidx())==ORIGINAL_SOUND_JUNO?(bidx()?"JUNO B":"JUNO A"):engine_bass_bank(bidx())==ORIGINAL_SOUND_DRONE?(bidx()?"DRONE B":"DRONE A"):
                engine_bass_bank(bidx())==ORIGINAL_SOUND_MIAMI?(bidx()?"MIAMI B":"MIAMI A"):
                (bidx()?"CHICAGO B":"CHICAGO A");
        }
        int night=matrix_three_rows() || X0X_ORIGINAL_SYNTH;
        if(night) sound_slab(0,0,240,20,0);
        cv_text(7,2,&FONT_B,name,night?SOUND_GREEN:matrix_col());
        if (division_pad_owner()) {
            int dx = 7 + tw(&FONT_B, name) + 8;
            dx = cv_text(dx, 6, &FONT_T, "PADS ", C_AMB);
            cv_text(dx, 6, &FONT_T, division_pad_label() + 11, C_AMB);
        }
        {   /* Screen banks, not musical divisions or the selected control row. */
            int banks = (pg.n + 3) / 4;
            for (int i = 0; i < banks; i++) {
                int dx = 232 - (banks - 1 - i) * 10;
                dot(dx, 9, 2, night?SOUND_AMBER:C_HI);
                if (i != cur_page() / 4) dot(dx, 9, 1, night?SOUND_FACE:C_BLACK);
            }
        }
        if(!division_pad_owner()) header_pattern_cue(132,ui.part);   /* #807 cue picture */
        { uint8_t phase = seq.metro_view; /* #688/#788: audio-owned beat phase */
          play_icon(175, 4, !phase ? C_DIM : phase <= 4u ? C_WHITE : C_HI);
        }
        if(ui.rec) dot(190,9,3,RGB(255,50,50));
        if(ss!=SAVE_SAVED) dot(237,3,2,ss==SAVE_FAILED?RGB(255,70,70):C_AMB);
        cv_commit_header();
        if (cacheable) { part_header_snapshot = snapshot; part_header_snapshot_valid = 1; }
        return;
    }
    if (pickup) {                         /* fader pickup hint in the left chip; song/pattern and tempo stay visible */
        x = cv_text(4, vc(&FONT_S, 1, 17), &FONT_S, ui.msg, C_AMB) + 6;
    }
#if BOARD_SMK37
    else if (smk_clip_mode_on()) {                         /* clip mode: the mode chip reads LP (Loopy Pro) */
        x = cv_text(4, vc(&FONT_B, 1, 17), &FONT_B, "LP", C_HI) + 6;
    }
#endif
    else if (part_view()) {                           /* the part chip, then where we are */
        const char *part_label=part_display(ui.part);
#if X0X_BASS_PRESET_PREVIEW
        if ((ui.view == V_SEQ || ui.view == V_PART) && is_303()) {
#if X0X_BASS_TAGGED_SOUND
            if (engine_bass_sound_bank(&proj.sound, bidx()) < 0)
                part_label = bidx() ? "BASS B" : "BASS A";
            else
#endif
            {
            int kind = engine_bass_bank(bidx());
            part_label = kind == ORIGINAL_SOUND_JUNO ? (bidx() ? "JUNO B" : "JUNO A") :
                         kind == ORIGINAL_SOUND_DRONE ? (bidx() ? "DRONE B" : "DRONE A") :
                         kind == ORIGINAL_SOUND_MIAMI ? (bidx() ? "MIAMI B" : "MIAMI A") :
                                                       (bidx() ? "CHICAGO B" : "CHICAGO A");
            }
        }
#endif
        const char *mode = ui.view==V_GEN?"TB-3PO":ui.view==V_SEQ?(!kbd_on()?"SEQ":ui.rec?"SEQ KEYS":"FREE PLAY"):
                           ui.view==V_PART&&is_303()?"SOUND":kbd_on()?(ui.rec?"KEYS":"FREE PLAY"):"";
        const felucca_font_t *pf=&FONT_B,*mf=&FONT_S;
        if(tw(pf,part_label)+18+tw(mf,mode)>128)pf=mf=&FONT_XS;
        int32_t w = tw(pf, part_label) + 12;
        box(0,1,w,17,part_col());cv_text(6,vc(pf,1,17),pf,part_label,C_BLACK);
        x=w+6;
        if(mode[0])x=cv_text(x,vc(mf,1,17),mf,mode,kbd_on()&&ui.view!=V_GEN&&!(ui.view==V_PART&&is_303())?C_AMB:C_HI)+6;
    } else {
        x = cv_text(4, vc(&FONT_B, 1, 17), &FONT_B, ui.view==V_GLO?list_title:VIEW_N[ui.view], C_HI) + 6;
        if (drum_mix_page() >= 0)                     /* MIX: 909 / MIX: 808 (whose tracks these are) */
            x = cv_text(x - 6, vc(&FONT_B, 1, 17), &FONT_B, drum_mix_page() ? ": 808" : ": 909",
                        PART_COL[drum_mix_page()]) + 6;
    }
    if (ss != SAVE_SAVED) {               /* use the gap before pattern/clock, never cover cue or step range */
        const char *label = project_storage_unsupported() == 2 ? "!" :
            ss == SAVE_QUEUED ? queued_save_label() : ss == SAVE_FAILED ? "SAVE FAILED" : "UNSAVED";
        int32_t w = tw(&FONT_XS, label) + 10;
        uint16_t c = ss == SAVE_FAILED ? RGB(255, 70, 70) : C_AMB;
        if (x + w <= 130) {
            box(x, 3, w, 13, c);
            text_c(x + w / 2, vc(&FONT_XS, 3, 13), &FONT_XS, label, C_BLACK);
        } else if (x + 11 <= 130) {       /* a long mode name leaves room only for a short flag */
            box(x, 3, 11, 13, c);
            text_c(x + 5, vc(&FONT_XS, 3, 13), &FONT_XS, ss == SAVE_FAILED ? "!" : ss == SAVE_QUEUED ? "Q" : "*", C_BLACK);
        }
    }
#if BOARD_SMK37
    if (smk_clip_mode_on()) {                         /* clip mode: the clock of the arp, not the pattern */
        extern uint8_t smk_ck_ext(void);
        cv_text(132, vc(&FONT_S, 1, 17), &FONT_S, smk_ck_ext() ? "EXT" : "INT", smk_ck_ext() ? C_AMB : C_GRAY);
    } else
#endif
    {   /* the pattern of the part on screen (else the 909's), its cue; in SONG mode the bar */
        int part = part_view() ? ui.part : PART_909, cue = seq_cue_of(&seq, part);
        int pending=cue>=0 && cue!=seq.ppat[part] && !seq.song_on;
        x=ui_position_badge(seq.song_on?UI_G_SONG:UI_G_PATTERN,
            (seq.song_on?(seq.playing?seq.song_pos:ui.song_sel):seq.ppat[part])+1,
            pending?cue+1:0,seq.song_on?(seq.song_rec?RGB(255,90,80):C_AMB):C_WHITE,
            (ui.frame & 16u)?C_WHITE:C_GRAY);
        if (!pending && seq.chain_a != seq.chain_b && !seq.song_on) {
            cv_text(x + 3, vc(&FONT_XS, 1, 17), &FONT_XS, "CHN", C_AMB);
        } else if (!pending && steps_view() && steps_len() > 16) {   /* the 16 steps the keys show */
            put_i(put_s(put_i(b, ui.spage * 16 + 1), "-"), ui.spage * 16 + 16);
            cv_text(x + 4, vc(&FONT_XS, 1, 17), &FONT_XS, b, C_GRAY);
        }
    }
    {   /* following an external clock, the measured tempo wanders a little from clock to clock: the
         * display averages it over about a second, and moves only when that is half a BPM away */
        static float avg;
        static int shown;
        float t = seq_tempo(&seq);
        if (!seq.ext || avg < 1.0f)
            avg = t;
        avg += (t - avg) * 0.03f;
        if (!seq.ext || fm_fabsf(avg - (float)shown) > 0.6f)
            shown = (int)(avg + 0.5f);
        put_i(b, shown);
    }
    text_r(212, vc(&FONT_S, 1, 17), &FONT_S, b, seq.ext ? C_AMB : C_HI);
    { uint8_t phase = seq.metro_view; /* neutral in STOP/WAIT; no track playhead */
      play_icon(217, 4, !phase ? C_DIM : phase <= 4u ? C_WHITE : C_HI);
    }
    if (ui.rec)
        dot(231, 9, 4, RGB(255, 50, 50));
    if (ss != SAVE_SAVED)            /* still visible when REC or a long mode name uses the badge space */
        dot(237, 3, 2, ss == SAVE_FAILED ? RGB(255, 70, 70) : C_AMB);
    cv_commit_header();
}

/* -------------------------------------------------------------- the views --- */
static int step_of(int col) { return ui.spage * 16 + col; }
#define GX 27
static int32_t col_x(int c) { return GX + c * 13 + (c >> 2); }   /* a pixel between beats */

#define DROW 11                                    /* drum rows: 12 of them over both bands, a gap under */
static UI_DRAW void draw_drum(int band)
{
    int k = ui.part, v, c, len = cur_pat()->drum[k].len;
    const dpart_t *d = &cur_pat()->drum[k];
    int ph = seq.playing ? eng_step[TRK_DRUM + k] : -1;
    uint16_t col = part_col(), on_dim = dim(col, 8);
    uint32_t lmarks = lock_marks(k == PART_909 ? T_909 : T_808, ui.sel[k], ui.spage * 16) |
                      lock_marks(T_PROB, k << 4 | ui.sel[k], ui.spage * 16);
    for (v = 0; v <= NDRUM; v++) {
        int y = v * DROW + 1 - band * BAND_H, sel = v < NDRUM && v == ui.sel[k];
        const char *nm = v < NDRUM ? engine_voice_name(k == PART_909 ? T_909 : T_808, v) : "AC";
        const uint32_t *bits = v < NDRUM ? d->hit[v] : d->accent;
        int muted = v < NDRUM && ((seq.mute | seq.vmute) & (1u << (k * NDRUM + v)));
        if (y < -DROW || y >= BAND_H)
            continue;
        if (sel)
            surface_panel(0,y-1,24,DROW,1,col,col,dim(col,5));
        cv_text(5, vc(&FONT_XS, y - 1, DROW - 1), &FONT_XS, nm, sel ? C_BLACK : muted ? C_LINE : v < NDRUM ? C_GRAY : C_WHITE);
        for (c = 0; c < 16; c++) {
            int s = step_of(c), x = col_x(c), hit = s < NSTEPS && sm_get(bits, s);
            if (s >= len) {
                cv_rect(x + 5, y + 3, 2, 2, C_LINE);
                continue;
            }
            if (v == NDRUM) {                          /* the accent row: white marks */
                if (hit)
                    night_mark(x + 2, y + 1, 8, 6, C_WHITE,1);
                else
                    rbox(x + 2, y + 3, 8, 2, 1, C_LINE);
                continue;
            }
            night_mark(x, y, 12, DROW - 2, hit ? (muted ? C_DIM : sel ? col : on_dim) : (s == ph ? C_DIM : C_LINE),hit);
            if (hit && s == ph)
                box(x + 2, y + 2, 8, DROW - 6, C_WHITE);
            if (hit && sel && ((lmarks >> c) & 1u))      /* the step's own values (p-locks): a notch */
                cv_rect(x + 8, y + 1, 3, 3, C_BLACK);
        }
    }
}

#define ROLL_TOP 4                                 /* the 303's line: from here (both bands) ... */
#define ROLL_BOT 92                                /* ... to here; then AC, SL and the step's line */
static int note_y(int n, int lo, int hi) { return ROLL_BOT - (n - lo) * (ROLL_BOT - ROLL_TOP) / (hi - lo); }

/* A TIE only carries a real NOTE. In particular, an all-TIE/orphan pattern is
 * silent and must not acquire a fictitious pitch on the piano roll. */
static int note_start_of(const bpart_t *bp, int s)
{
    int k;
    for (k = 0; k < bp->len && bstep_gate(&bp->step[s]) == G_TIE; k++)
        s = s ? s - 1 : bp->len - 1;
    return bstep_gate(&bp->step[s]) == G_NOTE ? s : -1;
}

static int held_note_of(const bpart_t *bp, int s)
{
    int start = note_start_of(bp, s);
    return bp->step[start >= 0 ? start : s].note;
}

static UI_DRAW void draw_303(int band, int gen)
{
    int b = bidx(), c, o = band * BAND_H, n;       /* o: drawn in the screen's rows, minus the band's */
    const bpart_t *bp = &cur_pat()->bass[b];
    int ph = seq.playing ? eng_step[TRK_BASS0 + b] : -1, lo = 127, hi = 0;
    uint16_t col = part_col();
    uint32_t lmarks = gen ? 0 : lock_marks(-1, -1, ui.spage * 16);
    char t[40], *q = t;
    (void)gen;
    for (c = 0; c < bp->len && c < NSTEPS; c++) {
        int start = note_start_of(bp, c);
        if (start >= 0) {
            int pitch = bp->step[start].note;
            if (pitch < lo)
                lo = pitch;
            if (pitch > hi)
                hi = pitch;
        }
    }
    if (lo > hi)
        lo = hi = 12 * (bp->gen.base_oct + 1) + bp->gen.root;
    lo -= 2;
    hi += 2;
    if (hi - lo < 14)
        hi = lo + 14;
    for (n = lo; n <= hi; n++)                     /* the line: pitch by height, the root's octaves ruled */
        if ((n - bp->gen.root) % 12 == 0) {
            int y = note_y(n, lo, hi) - o;
            put_note(t, n);
            cv_rect(GX, y + 2, 213, 1, C_LINE);
            cv_text(1, y - 4, &FONT_XS, t, C_DIM);
        }
    for (c = 0; c < 16; c++) {
        int s = step_of(c), x = col_x(c), g;
        const bstep_t *st = &bp->step[s < NSTEPS ? s : 0];
        if (s >= bp->len) {
            cv_rect(x + 5, ROLL_BOT + 4 - o, 2, 2, C_LINE);
            continue;
        }
        g = bstep_gate(st);
        if (s == ph)
            cv_rect(x, ROLL_TOP - 4 - o, 12, ROLL_BOT - ROLL_TOP + 10, dim(col, 2));
        if (g != G_REST && note_start_of(bp, s) >= 0) {
            int hn = held_note_of(bp, s), y = note_y(hn, lo, hi) - o;
            uint16_t fc = s == ui.held_step ? C_WHITE : (st->flags & BS_ACCENT) ? col : dim(col, 9);
            int end = st->flags >> BS_END_SHIFT;
            int width = end ? (end * 12 + 14) / 15 : 12;
            night_mark(x, y, width, 5, fc,1); /* captured 1..15 release fraction of this step */
            if ((lmarks >> c) & 1u)                  /* the step's own values (p-locks): a notch */
                cv_rect(x + 5, y - 3, 2, 2, C_WHITE);
            if (g == G_TIE) {
                if (c > 0)                           /* continued from previous visible step */
                    cv_rect(col_x(c - 1) + 6, y,
                            x - (col_x(c - 1) + 6) + (width < 6 ? width : 6), 5, fc);
                else {                               /* page 16→17 or loop last→first */
                    cv_rect(x - 4, y + 1, 4, 3, fc);
                    cv_rect(x - 7, y + 2, 3, 1, fc);
                }
            }
            if (c == 15 && bstep_gate(&bp->step[s + 1 < bp->len ? s + 1 : 0]) == G_TIE) {
                cv_rect(x + 12, y + 1, 2, 3, fc);
                cv_rect(x + 14, y + 2, 2, 1, fc);
            }
            if ((st->flags & BS_SLIDE) && c < 15) {
                int nx = s + 1 < bp->len ? s + 1 : 0, ny = note_y(bp->step[nx].note, lo, hi) - o;
                cv_line(x + 11, y + 2, x + 14, ny + 2, C_WHITE);
            }
        }
        night_mark(x + 1, 101 - o, 10, 4, g && (st->flags & BS_ACCENT) ? C_WHITE : C_LINE,g && (st->flags & BS_ACCENT));   /* its accent, its slide */
        night_mark(x + 1, 113 - o, 10, 4, g && (st->flags & BS_SLIDE) ? col : C_LINE,g && (st->flags & BS_SLIDE));
    }
    cv_text(3, vc(&FONT_XS, 99, 8) - o, &FONT_XS, "AC", C_GRAY);
    cv_text(3, vc(&FONT_XS, 111, 8) - o, &FONT_XS, "SL", C_GRAY);
    if (ui.held_step >= 0 || ui.rec) {   /* the step held (or being written) */
        int s = ui.held_step >= 0 ? ui.held_step : ui.wpos[b];
        const bstep_t *st = &bp->step[s];
        q = put_s(q, ui.held_step >= 0 ? "STEP " : "WRITE ");
        q = put_i(q, s + 1);
        q = put_s(q, "  ");
        q = put_note(q, held_note_of(bp, s) + bp->transpose - 24);
        if (bstep_gate(st) == G_TIE)
            q = put_s(q, " TIE");
        if (st->flags & BS_ACCENT)
            q = put_s(q, " ACC");
        if (st->flags & BS_SLIDE)
            q = put_s(q, " SLIDE");
        put_i(put_s(q, " V"), bstep_velocity(st));
        cv_text(4, vc(&FONT_B, 122, 16) - o, &FONT_B, t, C_WHITE);
    } else {                                           /* else the line's scale and seed */
        char t2[16];
        q = put_s(q, ROOT_N[bp->gen.root % 12]);
        q = put_s(q, " ");
        put_s(q, TB3PO_SCALE_NAMES[bp->gen.scale % TB3PO_NSCALES]);
        put_hex(put_s(t2, "SEED "), bp->gen.seed & 0xFFFFu, 4);
        segs(4, vc(&FONT_S, 122, 16) - o, &FONT_S, C_GRAY, 18, t, t2, 0, 0);
    }
}

static int strcmp_s(const char *a, const char *b);
static UI_DRAW void draw_param_widget(pref_t r, int x, int y, int width, int touched, uint16_t col, int height, int night);
static UI_DRAW int adsr_touch_active(void);
static UI_DRAW int adsr_row(int page);
static UI_DRAW void draw_adsr_inline(int page,int active,int y,int h,int off);
enum { GL_NONE, GL_POWER, GL_DOWN, GL_UP, GL_BOTH, GL_CLOCK, GL_PEDAL };
static UI_DRAW void matrix_glyph(int x,int y,int glyph,uint16_t c,uint16_t bg);

static UI_DRAW int matrix_row_hint(int x,int y,uint16_t c)
{
    cv_text(x,y,&FONT_T,UI_CAP_ARROWS,c);
    x+=tw(&FONT_T,UI_CAP_ARROWS)+4;
    matrix_glyph(x,y,GL_BOTH,c,C_BLACK);
    row_picture(x+14,y,c);
    return x+24;
}

/* Physical EDIT caption plus a page and forward arrow, within the old hint. */
static UI_DRAW int matrix_next_hint(int x,int y,uint16_t c)
{
    x=cv_text(x,y,&FONT_T,UI_CAP_EDIT,c)+4;
    cv_line(x,y,x+8,y,c);cv_line(x+8,y,x+8,y+10,c);
    cv_line(x+8,y+10,x,y+10,c);cv_line(x,y+10,x,y,c);
    cv_line(x+2,y+3,x+6,y+3,c);cv_line(x+2,y+6,x+6,y+6,c);
    cv_line(x+12,y+5,x+22,y+5,c);
    cv_line(x+18,y+1,x+22,y+5,c);cv_line(x+22,y+5,x+18,y+9,c);
    return x+23;
}

static UI_DRAW int matrix_touch_matches(pref_t r, int i)
{
    return ui.touched == i && ui.touch_view == ui.view &&
           ui.touch_part == ui.part && ui.touch_page == cur_page() &&
           ui.touch_kind == r.kind && ui.touch_a == r.a &&
           ui.touch_b == r.b && ui.touch_c == r.c;
}

/* Control rows share the existing main/knob strips; no framebuffer or UI state is added. */
static UI_DRAW const char *matrix_group(int page)
{
    const char *t = pg.title[page];
    if (!strcmp_s(t,"FX")) {
        int ty=matrix_value(pg.r[page][0]);
        return ty==CHI_FX_OFF?"FX / OFF":ty==CHI_FX_COMP?"FX / MASTER":"FX / INSERT";
    }
    if (!strcmp_s(t,"AMP ADSR")) return "AMP ENVELOPE";
    if (!strcmp_s(t,"FILTER ADSR")) return "FILTER ENVELOPE";
    if (!strcmp_s(t,"WOB / FILT")) return "WOBBLE / FILTER";
    return t;
}

/* Describe only mapped slots; sparse rows keep their physical knob numbers. */
static UI_DRAW void matrix_knob_caption(char *text, int page)
{
    int k, n=0, emitted=0;
    unsigned mapped=0;
    int sound=pg.r[page][0].kind==R_BENGINE;
    char *q=text;
    for(k=0;k<4;k++) if(pg.r[page][k].kind!=R_NONE && (!sound || !pref_read_only(pg.r[page][k]))) {
        mapped|=1u<<k;
        n++;
    }
    *q=0;
    if(!n) return;
    q=put_s(q,n==1?"KNOB ":"KNOBS ");
    for(k=0;k<4;k++) if(mapped&(1u<<k)) {
        int last=k;
        while(last+1<4 && (mapped&(1u<<(last+1)))) last++;
        if(emitted++) q=put_s(q,",");
        q=put_i(q,UI_FIRST_KNOB+k);
        if(last>k) q=put_i(put_s(q,"-"),UI_FIRST_KNOB+last);
        k=last;
    }
}

static UI_DRAW void draw_part_sound(int band)
{
    int page=cur_page(), first=page/4*4, row, k, off=band*BAND_H;
    int three=matrix_three_rows(), night=three || X0X_ORIGINAL_SYNTH;
    int rows=three?3:4, height=three?66:49, step=three?67:50;
    uint16_t col=matrix_col(), gray=night?SOUND_GRAY:C_GRAY, hint=night?SOUND_AMBER:C_HI;
    if(night) cv_rect(0,0,240,band==2?KNOB_H:BAND_H,SOUND_BASE);
    for (row=0;row<rows;row++) {
        int p=first+row, y=4+row*step-off, active=p==page;
        uint16_t label=night?(active?SOUND_INK:SOUND_GRAY):(active?C_BLACK:C_GRAY);
        char t[32];
        if (p>=pg.n || y+height<=0 || y>=(band==2?KNOB_H:BAND_H)) continue;
        if (night) sound_slab(3,y,234,height,active);
        else surface_panel(3,y,234,height,active,active?col:SOUND_FACE,
                           active?blend(col,C_WHITE,5):SOUND_EDGE,active?dim(col,8):SOUND_SIDE);
        put_s(put_s(put_i(t,row+1),"  "),matrix_group(p));
        cv_text(8,y,&FONT_T,t,label);
        if (adsr_row(p)) { draw_adsr_inline(p,active,y+off,height,off); continue; } /* graph replaces A/D/S/R, any row */
        if (active) {
            char knobs[20];matrix_knob_caption(knobs,p);
            text_r(232,y,&FONT_T,knobs,label);
        }
        for (k=0;k<4;k++) {
            int x=4+k*59;
            if (k && (pg.r[p][k].kind!=R_NONE
#if X0X_BASS_PRESET_PREVIEW
                || (k==2 && pg.r[p][0].kind==R_BENGINE)
#endif
                )) cv_rect(x,y+14,1,night?height-18:32,night?(active?SOUND_SELECT_SIDE:SOUND_LINE):(active?dim(col,3):C_LINE));
            draw_param_widget(pg.r[p][k],x,y,59,active,col,height,night);
        }
#if X0X_BASS_PRESET_PREVIEW
        if (!X0X_ORIGINAL_SYNTH && pg.r[p][0].kind==R_BENGINE) {
            int b=bidx(), pending=engine_bass_preset_pending(b), preset=engine_bass_preset_index(b);
            int edited=engine_bass_preset_edited(b);
            const char *status=pending?"WAIT":preset<0?"USER":edited?"EDITED":"ACTIVE";
            const char *reason=pending==2?"WAIT FOR NOTES/TAIL":pending==3?"RETURN WHEELS":
                pending==4?"SOUND LOCKS ACTIVE":pending==5?"WAIT FOR INPUT":
                pending==6?"WAIT FOR UPDATE":"WAIT FOR AUDIO";
            int iw=pending?9:edited?8:10, vy=y+(night?(pending?31:36):(pending?24:29));
#if X0X_BASS_TAGGED_SOUND
            if (engine_bass_sound_bank(&proj.sound,b)<0) {status="UNKNOWN";iw=0;}
#endif
            /* K7/K8 stay unmapped. Their shared right half is a status display,
             * with a compact group measured from the actual text advance and
             * each primitive's ink width, separated by two pixels. */
            int gx=180-(tw(&FONT_T,status)+iw+(iw?2:0))/2;
            uint16_t c=night?(active?SOUND_INK:SOUND_WHITE):(active?C_BLACK:C_HI);
            text_c(180,y+(night?14:11),&FONT_T,"STATUS",label);
            cv_text(gx+iw+(iw?2:0),vy,&FONT_T,status,c);
            if(pending) {
                cv_line(gx,vy,gx+8,vy,c);cv_line(gx,vy+8,gx+8,vy+8,c);
                cv_line(gx+1,vy+1,gx+7,vy+7,c);cv_line(gx+7,vy+1,gx+1,vy+7,c);
                text_c(180,y+(night?49:37),&FONT_T,reason,c);
            } else if(iw && edited) {
                cv_line(gx,vy+7,gx+6,vy+1,c);cv_line(gx+1,vy+8,gx+7,vy+2,c);
            } else if(iw) {
                cv_line(gx,vy+4,gx+3,vy+7,c);cv_line(gx+3,vy+7,gx+9,vy+1,c);
            }
        }
#endif
    }
    if(night) sound_slab(0,207-off,240,13,0);
    if (lock_step()>=0) {
        char t[48];put_s(put_i(put_s(t,"STEP "),lock_step()+1)," " UI_CAP_ARROWS ": CHANCE " UI_CAP_EDIT);
        int x=cv_text(7,208-off,&FONT_T,t,C_AMB);
        row_picture(x+4,208-off,C_AMB);
    } else
#if X0X_BASS_PRESET_PREVIEW
    if (pg.r[page][0].kind==R_BENGINE && engine_bass_preset_pending(bidx()))
        cv_text(7,208-off,&FONT_T,UI_CAP_HOME ": CANCEL",gray);
    else
#endif
    {
        int x=matrix_row_hint(7,208-off,gray);
        matrix_next_hint(x+8,208-off,gray);
    }
#if X0X_BASS_PRESET_PREVIEW
    if (pg.r[page][0].kind==R_BENGINE) {
        if (lock_step()<0) {
            if(engine_bass_preset_pending(bidx()))
                matrix_row_hint(234-tw(&FONT_T,UI_CAP_ARROWS)-28,208-off,hint);
            else {
                int x=234-tw(&FONT_T,UI_CAP_HOME)-10;
                x=cv_text(x,208-off,&FONT_T,UI_CAP_HOME,hint);
                nav_arrow(x+4,210-off,-1,hint);
            }
        }
    } else
#endif
    {
        char t[12];put_s(put_i(put_s(put_i(t,first+1),"-"),first+4<pg.n?first+4:pg.n),"");
        text_r(234,208-off,&FONT_T,t,hint);
    }
}

static UI_DRAW void draw_break(int band)
{
    const brkpart_t *bp = &cur_pat()->brk;
    int c, ph = seq.playing ? eng_step[TRK_BRK] : -1, slice, bank, div, running;
    uint16_t col = part_col();
    uint32_t lmarks = lock_marks(-1, -1, 0);           /* (the break: its 16 steps) */
    engine_brk_state(&slice, &bank, &div, &running);
    int audition = engine_brk_held() != 0, active = running || audition;
    if (!ui.outline_ok || ui.outline_slot != bp->slot_a) {
        ui.outline_ok = (uint8_t)engine_brk_outline(0, ui.outline, 232);
        ui.outline_slot = bp->slot_a;
    }
    if (band == 0) {                                   /* loop A: eight visible slice slots */
        int x, count = engine_brk_count(0);
        int page = ui.brk_page * 8 < count ? ui.brk_page : (count - 1) / 8;
        night_panel(3,1,234,65,0);
        for (c = 0; c < 8; c++) {
            int x0 = 8 + c * 28, local = page * 8 + c;
            char t[4];
            if (local < count) put_i(t, local + 1); else put_s(t, "-");
            if (active && local == slice && bank == 0)
                cv_rect(x0,5,28,44,dim(col,5));
            text_c(x0 + 14,53,&FONT_XS,t,active && local==slice && bank==0?C_WHITE:C_GRAY);
        }
        cv_rect(8,27,224,1,C_LINE);
        for (x=0;x<224 && ui.outline_ok;x++) {
            int sl = page * 8 + x / 28;
            int source_x = (page * 8 * 232 + x * 8 * 232 / 224) / count;
            int h = sl < count && source_x < 232 ? ui.outline[source_x] * 21 / 255 : 0;
            if(h) cv_rect(8+x,27-h,1,2*h+1,active && sl==slice && bank==0?C_WHITE:col);
        }
        for(c=1;c<8;c++) cv_rect(8+c*28,5,1,44,C_LINE);
    } else {
        const char *const *sn = engine_brk_slot_names();
        int ns = engine_brk_nslots();
        char t[40], *q = t;
        night_panel(3,1,234,20,0);
        for (c=0;c<16;c++) {
            int x=8+c*14,on=(bp->steps>>c)&1u;
            cv_rect(x,5,12,12,on?(c==ph?C_WHITE:col):(c==ph?C_DIM:UI_N_SIDE));
            cv_rect(x,5,12,1,on?col:UI_N_EDGE);
            if (on && ((lmarks >> c) & 1u))            /* the step's own values (p-locks): a notch */
                cv_rect(x+8,6,3,3,C_BLACK);
            if (bp->slice[c]) {                        /* the step's own slice */
                char d[4]; put_i(d, (bp->slice[c] - 1) % engine_brk_count(0) + 1);
                text_c(x+6,vc(&FONT_XS,5,12),&FONT_XS,d,on?C_BLACK:C_GRAY);
            }
        }

        {
            char ta[16], tb[16];
            if (!ns) {
                put_s(ta, "A  none");
                put_s(tb, "B  none");
            } else {
                put_s(put_s(ta, "A  "), sn[bp->slot_a % ns]);
                put_s(put_s(tb, "B  "), sn[bp->slot_b % ns]);
            }
            night_panel(3,25,114,16,bank==0 && active);
            night_panel(123,25,114,16,bank==1 && active);
            text_c(60,28,&FONT_XS,ta,C_HI);text_c(180,28,&FONT_XS,tb,C_HI);
            (void)q;
        }
        int count = engine_brk_count(0), page = ui.brk_page * 8 < count ? ui.brk_page : (count - 1) / 8;
        q = put_i(put_s(t, "A KEYS "), page * 8 + 1);
        q = put_i(put_s(q, "-"), count < 8 ? count : page * 8 + 8);
        q = put_i(put_s(q, "/"), count);
        if (count != (int)brk_slice_count(bp, 0)) put_s(q, " PENDING");
        cv_text(8, 44, &FONT_XS, t, C_GRAY);
        q = put_s(t, ui.brk_count_target ? "EDIT B " : "EDIT A ");
        put_i(q, (int)brk_slice_count(bp, ui.brk_count_target));
        cv_text(144, 44, &FONT_XS, t, C_GRAY);
        q = put_s(t, "C/D COUNT C#/D# PAGE");
        if (active) {
            q = put_s(q, audition ? " | LIVE A" : bank ? " | PLAY B" : " | PLAY A");
            put_i(put_s(q, ":"), slice + 1);

        }
        cv_text(8, 58, &FONT_T, t, C_DIM);
    }
}

/* Stored forward note-origin semantics, shared with the piano roll. Resolve
 * a possible wrapped hold once, then propagate gates across this 16-step row. */
static uint32_t bass_content_bits16(const bpart_t *bp, int base)
{
    uint32_t bits = 0;
    int s, held;
    if (base >= bp->len)
        return 0;
    held = note_start_of(bp, base) >= 0;
    for (s = 0; s < 16 && base + s < bp->len; s++) {
        int gate = bstep_gate(&bp->step[base + s]);
        if (gate != G_TIE)
            held = gate == G_NOTE;
        if (held)
            bits |= 1u << (unsigned)s;
    }
    return bits;
}

/* first 16 steps of one part in a pattern (drums: any voice; 303: gates; break: steps) */
static __attribute__((unused)) uint32_t pat_part_bits16(const pattern_t *pt, int part)
{
    int s, len;
    uint32_t bits = 0;
    if (part < NKIT) {
        const dpart_t *d = &pt->drum[part];
        len = d->len < 16 ? d->len : 16;
        for (s = 0; s < len; s++) {
            int v;
            for (v = 0; v < NDRUM; v++)
                if (sm_get(d->hit[v], s))
                    bits |= 1u << (unsigned)s;
        }
        return bits;
    }
    if (part == PART_BRK)
        return pt->brk.steps & 0xFFFFu;
    {
        const bpart_t *bp = &pt->bass[part - NKIT];
        return bass_content_bits16(bp, 0);
    }
    return bits;
}

/* 8 px wide row in a pattern glyph: each column is on when either of two 16th steps hits */
static void pat_glyph_row(int32_t x, int32_t y, const uint8_t strength[8], uint16_t c, int current)
{
    int i;
    for (i = 0; i < 8; i++)
        if (strength[i])
            cv_rect(x+i,y,1,3,dim(c,home_glyph_brightness(strength[i],current)));
}

/* HOME uses full instrument names and shallow lane plates. Display positions
 * never become project/engine IDs; each lane still reads its own current pattern. */
static void lane(int y, int p, uint32_t bits, int ph, int len, int base)
{
    int c, muted = part_muted(p);
    uint16_t accent = muted ? C_DIM : PART_COL[p];
    const char *name = part_display(p);
    night_panel(3,y,234,18,0);
    cv_rect(4,y+3,2,11,accent);
    /* Full names fit the default engines. Same-engine A/B and unknown states
     * retain the stable short lane names instead of colliding with the grid. */
    if(tw(&FONT_T,name)>49) name=part_s(p);
    cv_text(9,vc(&FONT_T,y+1,16),&FONT_T,name,accent);
    for (c = 0; c < 16 && base + c < len; c++) {
        int x=58+c*11+(c>>2);
        int on=(bits>>c)&1u;
        /* Eight-pixel cells have equal five-pixel margins in the 18px plate. */
        cv_rect(x,y+5,9,8,UI_N_SIDE);
        cv_rect(x,y+5,9,1,on?accent:UI_N_EDGE);
        if(on) cv_rect(x+1,y+6,7,6,muted?C_DIM:dim(accent,11));
        cv_rect(x,y+12,9,1,on?dim(accent,6):UI_N_EDGE);
        if(seq.playing && (ph&15)==c) cv_rect(x+1,y+14,7,2,C_WHITE);
    }
}

static UI_DRAW void draw_home(int band)
{
    int p,c,off=band*BAND_H;
    if(band==0) {
        int cue=seq_cue_of(&seq,PART_909),c0=ui.pbank*16;
        night_panel(3,1,234,33,0);
        for(c=c0;c<c0+16;c++) {
            int x=7+(c-c0)*14+(c-c0>=8?4:0);
            int in_chain=seq.chain_a!=seq.chain_b &&
                c>=(seq.chain_a<seq.chain_b?seq.chain_a:seq.chain_b) &&
                c<=(seq.chain_a<seq.chain_b?seq.chain_b:seq.chain_a);
            cv_rect(x,3,12,22,UI_N_SIDE);
            cv_rect(x,3,12,1,UI_N_EDGE);
            for(int pos=0;pos<NPARTS;pos++) {
                p=part_at(pos);
                int used=part_used(&proj.pat[c],p);
                uint8_t strength[8];
                /* Assignment is not content: an empty lane must leave no coloured mark. */
                if(!used) continue;
                home_pattern_strength8(&proj.pat[c],proj.arr.lane,c,p,
                                       proj.set.accent_q7,T_VEL,strength);
                pat_glyph_row(x+2,4+pos*4,strength,PART_COL[p],seq.ppat[p]==c);
                if(seq.ppat[p]==c)cv_rect(x,4+pos*4,1,3,PART_COL[p]);
            }
            if(c==cue && c!=seq.ppat[PART_909] && (ui.frame&16u)) frame(x-1,1,14,25,C_WHITE);
            if(in_chain)cv_rect(x,32,12,1,C_AMB);
            if(c==seq.ppat[ui.part]) {
                char t[4];put_i(t,c+1);int w=tw(&FONT_T,t),tx=x+6-w/2;
                if(tx<4)tx=4;if(tx+w>236)tx=236-w;
                cv_text(tx,25,&FONT_T,t,ui.pbank?C_AMB:C_GRAY);
            }
        }
    }
    for(int pos=0;pos<NPARTS;pos++) {
        int y=35+pos*20-off;
        if(y+19<=0 || y>=BAND_H)continue;
        p=part_at(pos);
        uint32_t bits=0;
        if(p<NKIT) {
            const dpart_t *d=&pat_of(p)->drum[p];
            int base=seq.playing?(eng_step[TRK_DRUM+p]&~15):0;
            for(int v=0;v<NDRUM;v++)bits|=d->hit[v][base>>5]>>(base&31);
            lane(y,p,bits&0xFFFFu,eng_step[TRK_DRUM+p],d->len,base);
        } else if(p==PART_BRK) lane(y,p,pat_of(p)->brk.steps,eng_step[TRK_BRK],16,0);
        else {
            const bpart_t *bp=&pat_of(p)->bass[p-NKIT];
            int base=seq.playing?(eng_step[TRK_BASS0+p-NKIT]&~15):0;
            lane(y,p,bass_content_bits16(bp,base),eng_step[TRK_BASS0+p-NKIT],bp->len,base);
        }
    }
}

/* SONG: a table of bars, twelve rows across the two bands (the first is the heading) */
static UI_DRAW void draw_song(int band)
{
    const song_t *sg = song();
    int r, p, top = ui.song_sel > 5 ? ui.song_sel - 5 : 0;
    for (r = 0; r < 6; r++) {
        int row = band * 6 + r, y = r * 11, k = top + row - 1;
        char t[8];
        if (row == 0) {                                /* the heading */
            cv_text(4, vc(&FONT_XS, y, 11), &FONT_XS, "BAR", C_GRAY);
            for (int pos = 0; pos < NPARTS; pos++) {
                p = part_at(pos);
                text_c(58 + pos * 36, vc(&FONT_XS, y, 11), &FONT_XS, part_s(p), PART_COL[p]);
            }
            continue;
        }
        if (k > sg->len || k >= NSONG)
            break;
        surface_panel(0,y,236,11,k==ui.song_sel,k==ui.song_sel?C_LINE:SOUND_FACE,
                      k==ui.song_sel?SOUND_SELECT_EDGE:SOUND_EDGE,SOUND_SIDE);
        put_i(t, k + 1);
        cv_text(4, vc(&FONT_XS, y, 11), &FONT_XS, t, k == ui.song_sel ? C_WHITE : C_GRAY);
        if (seq.song_on && seq.playing && k == seq.song_pos)
            play_icon(26, y + 1, seq.song_rec ? RGB(255, 80, 70) : C_WHITE);
        if (k == sg->len) {                            /* one past the end: where the song grows */
            cv_text(50, vc(&FONT_XS, y, 11), &FONT_XS, k ? "END" : "EMPTY: WHITE KEYS ADD BARS", C_DIM);
            continue;
        }
        for (int pos = 0; pos < NPARTS; pos++) {
            p = part_at(pos);
            int muted = sg->bar[k].mute >> p & 1u;
            t[0] = 'P';
            put_i(t + 1, sg->bar[k].pat[p] + 1);
            text_c(58 + pos * 36, vc(&FONT_XS, y, 11), &FONT_XS, muted ? "-" : t, muted ? C_DIM : PART_COL[p]);
        }
        if (SONG_REP(&sg->bar[k]) > 1) {               /* a bar played more than once: x2 .. x8 */
            t[0] = 'x';
            put_i(t + 1, SONG_REP(&sg->bar[k]));
            text_r(238, vc(&FONT_XS, y, 11), &FONT_XS, t, C_WHITE);
        }
    }
}

/* Continuous send track with an explicit setting thumb, including zero/max. */
static UI_DRAW void night_send(int x,int y,int w,int value,uint16_t col)
{
    int at=x+value*(w-3)/127;
    cv_rect(x,y+2,w,3,UI_N_SIDE);
    if(value)cv_rect(x,y+3,at-x+2,1,dim(col,8));
    cv_rect(at,y,3,7,col);
}

static UI_DRAW void draw_fx(int band)
{
    int off=band*BAND_H;
    char a[16],u[8],t[40],*q;
    text_c(98,1-off,&FONT_T,"REVERB",C_GRAY);text_c(192,1-off,&FONT_T,"DELAY",C_GRAY);
    for(int pos=0;pos<NPARTS;pos++) {
        int p=part_at(pos),y=14+pos*15-off;
        night_panel(3,y,234,13,0);
        const char *name=part_display(p);
        if(tw(&FONT_T,name)>49)name=part_s(p);
        cv_text(7,y+2,&FONT_T,name,PART_COL[p]);
        night_send(60,y+3,76,proj.sound.v[T_MIX][p][1],PART_COL[p]);
        night_send(154,y+3,76,proj.sound.v[T_MIX][p][2],PART_COL[p]);
    }
    night_panel(3,92-off,234,20,0);
    pref_value(PR(R_ENG,T_FX,0,FX_DL_TIME),a,u);
    q=put_s(put_s(t,"DELAY "),a);
    pref_value(PR(R_ENG,T_FX,0,FX_DL_TYPE),a,u);
    put_s(put_s(q,"  "),a);cv_text(9,96-off,&FONT_S,t,C_HI);
    night_panel(3,116-off,114,20,0);night_panel(123,116-off,114,20,0);
    cv_text(9,121-off,&FONT_T,"FEEDBACK",C_GRAY);cv_text(129,121-off,&FONT_T,"RV DECAY",C_GRAY);
    put_s(put_i(t,proj.sound.v[T_FX][0][FX_DL_FDBK]*100/127),"%");
    text_r(111,121-off,&FONT_T,t,C_WHITE);
    put_i(t,proj.sound.v[T_FX][0][FX_RV_DECAY]*100/127);text_r(231,121-off,&FONT_T,t,C_WHITE);
}

/* MIX, a drum machine's page: its eleven tracks' levels (and pans), the selected one lit */
static UI_DRAW void draw_drum_mix(int band, int k)
{
    int t = k ? T_808 : T_909, v, o = band * BAND_H;
    uint16_t col = PART_COL[k];
    for (v = 0; v < NDRUM; v++) {
        int x = 4 + v * 21, sel = v == ui.sel[k];
        pref_t lv = find_ref(t, v, "Level"), pn = find_ref(t, v, "Pan");
        int l = lv.kind ? proj.sound.v[t][v][lv.c] : 0, pa = pn.kind ? proj.sound.v[t][v][pn.c] : 64;
        int muted = (seq.mute | seq.vmute) & (1u << (k * NDRUM + v)), fh = 96, f = l * fh / 127;
        /* Shallow strip well and top caption: preserve the 96px level travel,
         * independent hit brightness and the original pan/control geometry. */
        surface_panel(x, 0 - o, 19, 134, 0, SOUND_FACE,
                      sel ? dim(col, 8) : SOUND_EDGE, SOUND_SIDE);
        surface_panel(x + 1, 1 - o, 17, 12, sel,
                      sel ? col : SOUND_FACE, sel ? col : SOUND_EDGE, SOUND_SIDE);
        text_c(x + 10, vc(&FONT_XS, 1, 12) - o, &FONT_XS,
               engine_voice_name(t, v), sel ? C_BLACK : muted ? C_DIM : C_GRAY);
        cv_rect(x + 6, 15 - o, 7, fh + 2, UI_N_SHADOW);
        rbox(x + 7, 16 - o, 5, fh, 2, C_LINE);
        if (f)                                        /* the level, dim; a hit lights it up to the level */
            rbox(x + 7, 16 + fh - f - o, 5, f, 2, muted ? C_DIM : dim(col, sel ? 6 : 4));
        {
            uint32_t age=0; float envelope=0;
            int live=engine_drum_view(k,v,&age,&envelope);
            int hf=live?(int)((float)f*envelope+.5f):0;
            /* Existing MIX travel and level remain; real voice EG lights separate
             * 6px segments. This is the track LEVEL control, not a new PART slot. */
            for(int sy=0;sy<fh;sy+=8) {
                uint16_t ink=sy<hf && !muted?(sel?C_WHITE:col):
                    sy<f?(muted?C_DIM:dim(col,sel?6:4)):C_LINE;
                cv_rect(x+7,16+fh-sy-6-o,5,6,ink);
            }
        }
        rbox(x + 3, 123 - o, 13, 3, 1, C_LINE);          /* the pan, a mark from the middle */
        rbox(x + 3 + (pa * 10) / 127, 121 - o, 3, 7, 1, sel ? C_WHITE : C_GRAY);
    }
}

/* WAVE page: mid-line plot of eng_scope (post-master L+R). Latch ≤10 Hz; skip if shape/write
 * index unchanged so SPI stays calm (Baud Girl FM-1+VA scope policy). No second audio tap. */
static UI_DRAW void draw_master_wave(void)
{
    enum { X0=8,W=188,MID=34,AMP=26 };
    static int16_t latched[SCOPE_N];
    static uint32_t last_ms, last_w, last_hash;
    static uint8_t have, flat;
    uint32_t now = plat_ms(), w = eng_scope_w, h, base;
    int i, x, y0, y1;
    if (!have || (int32_t)(now - last_ms) >= 100) {
        base = w;
        h = 2166136261u;
        for (i = 0; i < (int)SCOPE_N; i++)
            h = (h ^ (uint32_t)(uint16_t)eng_scope[(base + (uint32_t)i) & (SCOPE_N - 1u)]) * 16777619u;
        if (!have || h != last_hash || w != last_w) {
            flat = 1;
            for (i = 0; i < (int)SCOPE_N; i++) {
                latched[i] = eng_scope[(base + (uint32_t)i) & (SCOPE_N - 1u)];
                if (latched[i]) flat = 0;
            }
            last_hash = h;
            last_w = w;
            have = 1;
        }
        last_ms = now;
    }
    night_panel(3,1,198,66,0);
    cv_rect(X0,MID,W,1,C_LINE);
    if (flat) {
        /* Same inclusive horizontal pixels as 187 adjacent one-pixel spans. */
        cv_line(X0, MID, X0 + W - 1, MID, part_col());
        return;
    }
    y0 = MID - (int)latched[0] * AMP / 32768;
    if (y0 < 2)
        y0 = 2;
    if (y0 > BAND_H - 3)
        y0 = BAND_H - 3;
    for (x = 1; x < W; x++) {
        int si = x * (int)SCOPE_N / W;
        y1 = MID - (int)latched[si] * AMP / 32768;
        if (y1 < 2)
            y1 = 2;
        if (y1 > BAND_H - 3)
            y1 = BAND_H - 3;
        cv_line(X0 + x - 1, y0, X0 + x, y1, part_col());
        y0 = y1;
    }
}

static UI_DRAW void draw_mix(int band)
{
    int p, master = master_mix_page(), wave = wave_mix_page();
    if (drum_mix_page() >= 0) {
        draw_drum_mix(band, drum_mix_page());
        return;
    }
    /* MASTER peak history: fixed 98 columns. A scrolling ring rewrote every column each
     * frame, so cv_commit_rect sent nearly the whole main band (~18 ms SPI) — panel tear
     * ("broken" hist) and knob-strip lag (draw_knobs waits on that blit). Write-head
     * overwrite + wall-clock sample keeps geometry stable and dirties ~one column. */
    if (band == 0 && master) {
        enum { HIST_N = 98, HIST_MS = 20 };             /* ~2 s window; never shrink width */
        static uint8_t hist[HIST_N];
        static uint32_t hw, hist_ms;                    /* hw was uint8_t: ring broke every 256 */
        static uint16_t peak_hold;
        int x, pk = 0;
        uint32_t now = plat_ms();
        for (p = 0; p < NPARTS; p++)
            pk = eng_peak[p] > pk ? eng_peak[p] : pk;
        if ((uint16_t)pk > peak_hold)
            peak_hold = (uint16_t)pk;
        if (!hist_ms || (int32_t)(now - hist_ms) >= HIST_MS) {
            hist[hw % (uint32_t)HIST_N] = (uint8_t)(peak_hold * 62 / 32768);
            hw++;
            peak_hold = 0;
            hist_ms = now;                             /* one column per paint when overdue */
        }
        for (x = 0; x < HIST_N; x++) {
            int h = hist[x];
            cv_rect(4 + x * 2, 66 - h, 2, h + 1, part_col());
        }
    }
    if (band == 0 && wave)
        draw_master_wave();
    if (band == 0 && !master && !wave) {               /* channel strips */
        for (int pos = 0; pos < NPARTS; pos++) {
            p = part_at(pos);
            int x = 6 + pos * 38, lvl = proj.sound.v[T_MIX][p][0], pk = eng_peak[p] * 64 / 32768;
            int selected=cur_page()==0 && p==ui.mixsel;
            surface_panel(x-2,0,30,BAND_H,selected,selected?dim(PART_COL[p],3):SOUND_FACE,
                          selected?PART_COL[p]:SOUND_EDGE,SOUND_SIDE);
            rbox(x + 10, 4, 6, 64, 3, C_LINE);
            if (pk > 1)
                rbox(x + 10, 68 - pk, 6, pk, 3, part_muted(p) ? C_DIM : PART_COL[p]);
            rbox(x + 4, 67 - lvl * 64 / 127, 18, 3, 1, C_WHITE);
        }
    }
    if (band == 0) {                                   /* the master's gain reduction (MASTER and WAVE) */
        {
            int gr = (int)(engine_gr_db() * 64.0f / 24.0f);
            gr = gr > 64 ? 64 : gr;
            night_panel(205,1,32,66,0);
            rbox(208,5,7,61,3,C_LINE);
            if (gr > 1)
                rbox(208,5,7,gr>61?61:gr,3,RGB(255,80,60));
            cv_text(218,4,&FONT_T,"GR",C_GRAY);
        }
    } else {
        char t[24], a[12], u[8], *q;
        if(wave) {
            night_panel(3,3,114,34,0);night_panel(123,3,114,34,0);
            cv_text(9,6,&FONT_T,"COMP REDUCTION",C_GRAY);
            cv_text(129,6,&FONT_T,"PUMP",C_GRAY);
            if(engine_gr_db()>0.5f)put_s(put_i(put_s(t,"-"),(int)(engine_gr_db()+0.5f))," dB");
            else put_s(t,"0 dB");
            cv_text(9,20,&FONT_S,t,C_WHITE);
            pref_value(PR(R_ENG,T_MST,0,MST_PUMP),a,u);put_s(put_s(t,a),u);
            cv_text(129,20,&FONT_S,t,C_HI);
            night_panel(3,42,234,24,0);
            put_s(put_i(put_s(t,"AUDIO LOAD "),(int)plat_cpu_pct()),"%");
            cv_text(9,49,&FONT_XS,t,plat_cpu_pct()>85u?C_AMB:C_GRAY);
            if(engine_guard_active())text_r(229,49,&FONT_XS,"GUARD",C_AMB);
            return;
        }
        for (int pos = 0; pos < NPARTS && !master && !wave; pos++) { /* strip names */
            p = part_at(pos);
            text_c(6 + pos * 38 + 13, 0, &FONT_XS, part_s(p), part_muted(p) ? C_LINE : PART_COL[p]);
        }
        night_panel(0,14,118,31,0);night_panel(120,14,120,31,0);
        night_panel(0,46,240,22,0);
        if ((int)(engine_gr_db() + 0.5f))
            put_s(put_i(put_s(t, "COMP -"), (int)(engine_gr_db() + 0.5f)), "dB");
        else
            put_s(t, "COMP 0dB");
        cv_text(4, 20, &FONT_B, t, engine_gr_db() > 0.5f ? RGB(255, 110, 90) : C_GRAY);
        pref_value(PR(R_ENG, T_MST, 0, MST_PUMP), a, u);
        q = put_s(put_s(t, "PUMP "), a);
        put_s(q, u);
        cv_text(124, 20, &FONT_B, t, proj.sound.v[T_MST][0][MST_PUMP] ? C_HI : C_GRAY);
        put_s(put_i(a, (int)plat_cpu_pct()), "%");
        cv_text(4, 50, &FONT_XS, "AUDIO LOAD", C_DIM);
        cv_text(70, 50, &FONT_XS, a, plat_cpu_pct() > 85u ? RGB(255, 60, 60) : C_GRAY);
        if (engine_guard_active())                    /* the overload guard is saving the CPU */
            cv_text(100, 50, &FONT_XS, "GUARD", C_AMB);
    }
}

/* PERF: the live window, or the test's progress and table */
static char *put_pct10(char *q, int v)                /* 123 -> "12.3%" */
{
    q = put_i(q, v / 10);
    *q++ = '.';
    q = put_i(q, v % 10);
    return put_s(q, "%");
}
static UI_DRAW void draw_perf(int band)
{
    /* First five match PART_N; only FX/MASTER/SEQ are perf-only. */
    static const char *const SN_TAIL[ENG_PROF_N - NPARTS] = {"FX", "MASTER", "SEQ"};
    char t[40], *q;
    int k;
#if X0X_LCD_TRACE && !defined(X0X_HOST)
    /* Development trace readout: last 64 samples, P50/P95/worst in microseconds.
     * The ordinary PERF display is byte-for-byte unchanged in default builds. */
    if (band && perf.test < 0) {
        static const char *const names[LCD_T_COUNT] = {"KEY", "MIDI", "LCD", "FRAME", "TMR5", "AUDIO"};
        for (int n = 0; n < LCD_T_COUNT; ++n) {
            q = put_s(t, names[n]); q = put_s(q, " ");
            q = put_i(q, (int)lcd_trace_percentile((unsigned)n, 50));
            q = put_s(q, "/");
            q = put_i(q, (int)lcd_trace_percentile((unsigned)n, 95));
            q = put_s(q, "/");
            put_i(q, (int)lcd_trace_hist[n].worst);
            cv_text(4, 1 + n * 10, &FONT_T, t, C_GRAY);
        }
        put_i(put_s(t, "LCD B/FRAME "), (int)lcd_trace_last_frame_bytes);
        cv_text(4, 61, &FONT_T, t, C_DIM);
        return;
    }
#endif
    if (band == 0) {
        q = put_s(t, "CLOCK ");
        if (perf.mhz10) {
            q = put_i(q, perf.mhz10 / 10);
            put_s(q, " MHz");
        } else
            put_s(q, plat_cycles_cpu() ? "..." : "? (NO CYCLE COUNTER)");
        cv_text(4, 2, &FONT_B, t, C_WHITE);
        if (plat_cpu2_on())                           /* the cores: one after the second gave up (fm1-x0x#10) */
            text_r(236, 6, &FONT_XS, "2 CORES", C_GRAY);
        else {
            q = put_s(t, "1 CORE");
            if (plat_cpu2_gave_up() == 1)
                put_i(put_s(q, ": BAD READS "), (int)plat_cpu2_bad());
            else if (plat_cpu2_gave_up() == 2)
                put_s(q, ": 2ND TIMED OUT");
            text_r(236, 6, &FONT_XS, t, plat_cpu2_gave_up() ? RGB(255, 80, 60) : C_GRAY);
        }
        if (X0X_GIT_SHA[0])
            text_r(236, 16, &FONT_XS, "GIT " X0X_GIT_SHA, C_GRAY);
        if (perf.test >= 0) {
            int done = perf.phase == 4;
            q = put_s(t, done ? "PERF TEST DONE" : "PERF TEST ");
            if (!done) {
                q = put_i(q, perf.test + 1);
                q = put_s(q, "/3  ");
                put_s(q, PT_N[perf.test < 3 ? perf.test : 2]);
            }
            cv_text(4, 24, &FONT_S, t, done ? C_HI : C_AMB);
            if (!done)
                cv_text(4, 46, &FONT_XS, UI_CAP_HOME " / " UI_CAP_PLAY ": STOP", C_DIM);
            else
                cv_text(4, 46, &FONT_XS, "SHARE OF THE CPU (PEAK)  CYCLES / SAMPLE", C_DIM);
            return;
        }
        q = put_s(t, "LOAD ");
        q = put_i(q, perf.load);
        q = put_s(q, "%  PEAK ");
        q = put_i(q, perf.peak);
        q = put_s(q, "%  DROPOUTS ");
        put_i(q, (int)plat_xruns());
        cv_text(4, 24, &FONT_S, t, C_HI);
        if (perf.stalls_on) {
            q = put_s(t, "STALLS  FETCH ");
            q = put_i(q, perf.stall[0]);
            q = put_s(q, "%  READ ");
            q = put_i(q, perf.stall[1]);
            q = put_s(q, "%  WRITE ");
            put_s(put_i(q, perf.stall[2]), "%");
        } else
            put_s(t, "STALLS OFF (KNOB 1)");
        cv_text(4, 46, &FONT_XS, t, perf.stalls_on ? C_GRAY : C_DIM);
        if (!perf.stalls_on && plat_irq_stack_size()) {   /* the interrupts' 8 KiB: the deepest so far */
            q = put_s(t, "IRQ STACK ");
            q = put_i(q, (int)plat_irq_stack_used());
            q = put_s(q, " / ");
            put_s(put_i(q, (int)plat_irq_stack_size()), " B");
            text_r(236, 46, &FONT_XS, t, plat_irq_stack_used() * 4u > plat_irq_stack_size() * 3u ? RGB(255, 80, 60) : C_GRAY);
        }
        return;
    }
    if (perf.test >= 0) {                             /* the table, so far */
        for (k = 0; k < 3; k++) {
            int y = k * 14 + 2;
            cv_text(4, y, &FONT_S, PT_N[k], perf.test == k && perf.phase != 4 ? C_AMB : C_GRAY);
            if (!perf.res_load[k])
                continue;
            q = put_pct10(t, perf.res_load[k]);
            q = put_s(q, " (");
            q = put_i(q, perf.res_peak[k]);
            put_s(q, "%)");
            cv_text(112, y, &FONT_S, t, C_WHITE);
            if (perf.res_cps[k]) {
                put_i(t, perf.res_cps[k]);
                text_r(236, y, &FONT_S, t, C_HI);
            }
        }
        if (perf.phase == 4)
            cv_text(4, 50, &FONT_XS, UI_CAP_SEL ": RUN IT AGAIN", C_DIM);
        if (plat_irq_stack_size()) {                 /* the interrupts' stack, the deepest so far (after the test too) */
            q = put_s(t, "IRQ STACK ");
            q = put_i(q, (int)plat_irq_stack_used());
            q = put_s(q, " / ");
            put_s(put_i(q, (int)plat_irq_stack_size()), " B");
            text_r(236, 50, &FONT_XS, t, plat_irq_stack_used() * 4u > plat_irq_stack_size() * 3u ? RGB(255, 80, 60) : C_GRAY);
        }
        return;
    }
    for (k = 0; k < ENG_PROF_N; k++) {                /* each stage's share of the CPU */
        int x = (k & 1) * 118 + 4, y = (k >> 1) * 12;
        int stage = k < NPARTS ? part_at(k) : k;
        cv_text(x, y, &FONT_XS, k < NPARTS ? part_s(stage) : SN_TAIL[k - NPARTS], C_GRAY);
        put_pct10(t, perf.stage[stage]);
        text_r(x + 108, y, &FONT_XS, t, C_WHITE);
    }
    if (perf.cps) {
        q = put_s(t, "RENDER ");
        q = put_i(q, perf.cps);
        put_s(q, " CYCLES / SAMPLE");
        cv_text(4, 44, &FONT_XS, t, C_GRAY);
    }
    q = put_s(t, engine_guard_active() ? "GUARD ON  " : "GUARD ");   /* the overload guard: engaged, times */
    put_s(put_i(q, (int)eng_guard_count), "x");
    text_r(236, 55, &FONT_XS, t, engine_guard_active() ? C_AMB : C_DIM);
    cv_text(4, 55, &FONT_XS, UI_CAP_SEL ": RUN PERF TEST", C_DIM);
}

/* the readout: the knob being turned, large, across the bottom band */
static UI_DRAW void draw_readout(void)
{
    char num[36], unit[8];
    pref_t r;
    int32_t w, x;
    const char *nm;
    char t[24];
    if (ui.touched == 4) {
        r = PR(R_TEMPO, 0, 0, 0);
        nm = "TEMPO";
    } else {
        r = pg.r[cur_page()][ui.touched];
        nm = caps_of(pref_name(r));
        if (track_page()) {                              /* a track's own: "BD  Tune" */
            put_s(put_s(put_s(t, engine_voice_name(ui.part == PART_909 ? T_909 : T_808, ui.sel[ui.part])), "  "), nm);
            nm = t;
        } else if (in_pattern(r)) {                      /* the pattern's: "P3  LENGTH" (it changes with it) */
            int pp = r.kind == R_DLEN || r.kind == R_DRATE ? r.a : r.kind >= R_BLEN && r.kind <= R_BTRANS ? NKIT + r.a
                     : r.kind == R_SWING ? PART_909 : part_view() ? ui.part : PART_909;
            put_s(put_s(put_i(put_s(t, "P"), seq.ppat[pp] + 1), "  "), nm);
            nm = t;
        }
    }
    pref_value(r, num, unit);
    if (r.kind == R_BPRESET) {
        const char *name = original_sound_name((unsigned)engine_bass_requested_bank(r.b),
                                               (unsigned)engine_bass_requested_preset(r.b));
        put_s(num,caps_of(name ? name : "USER"));
        put_i(put_s(t,"PRESET "),engine_bass_requested_preset(r.b)+1); nm=t;
    }
    {   /* one row: the name on the left, the value (+ unit) on the right, both on the box's middle */
        const int32_t bx = 8, by = 14, bw = 224, bh = 50;
        const felucca_font_t *vf = &FONT_M;           /* (the 31 px face for numbers was dropped: 7.6 KB of flash) */
        int32_t ly, uw = unit[0] ? tw(&FONT_S, unit) + 3 : 0;
        if ((r.kind == R_ENG && r.a == T_303) || r.kind == R_BENGINE || r.kind == R_BPRESET || r.kind == R_BSTATUS) {
            int room = bw-24-tw(&FONT_B,nm)-10-uw;
            if (tw(vf,num) > room) {
                if (tw(&FONT_B,num) <= room) vf=&FONT_B;
                else if (tw(&FONT_XS,num) <= room) vf=&FONT_XS;
                else vf=&FONT_T;
            }
        }
        ly = vc(vf, by, bh);
        box(bx, by, bw, bh, C_BLACK);
        frame(bx, by, bw, bh, part_col());
        cv_text(bx + 12, vc(&FONT_B, by, bh), &FONT_B, nm, C_GRAY);
        w = tw(vf, num);
        x = bx + bw - 12 - uw - w;
        cv_text(x, ly, vf, num, C_WHITE);
        if (unit[0])
            cv_text(bx + bw - 12 - uw + 3, base_y(vf, ly, &FONT_S), &FONT_S, unit, C_GRAY);
    }
}

static const char *action_key_cue(void)
{
#if BOARD_SMK37
    extern uint8_t smk_clip_mode_on(void);
    if(smk_clip_mode_on())return ""; /* Physical SCALE is masked; SMC dispatch stays available. */
#endif
    return UI_CAP_SEL;
}

/* Open-beta display to the left of the action arrow. Empty on an unversioned build.
 * The name and the arrow stay put; a label that would touch either one is not drawn. */
static int release_label_box(const char *label, int selected, int32_t *x, int32_t *w)
{
    int32_t name_w, lw, lx;
    if (!label || !label[0])
        return 0;
    name_w = tw(selected ? &FONT_B : &FONT_S, "ABOUT DnBOX");
    lw = tw(&FONT_XS, label);
    lx = 226 - tw(&FONT_XS, action_key_cue()) - 8 - lw;
    if (lx < 8 + name_w + 4 || lx + lw > 226 - tw(&FONT_XS, action_key_cue()) - 8)
        return 0;
    *x = lx;
    *w = lw;
    return 1;
}

/* BT NAME row (restored from 0e58b960): the connected peers joined with ", ",
 * held 700 ms at each end and moved at 24 px/s when wider than the row. */
#define PEER_TEXT_CAP (PLAT_BLE_PEER_CAP*(PLAT_BLE_PEER_NAME_MAX+2u)-1u)
static struct { char text[PEER_TEXT_CAP]; unsigned count; int state, central, active, travel; uint32_t start; } peer_scroll;
static void peer_join(char out[PEER_TEXT_CAP], const plat_ble_peers_t *peers)
{
    unsigned k=0,count=peers->count<PLAT_BLE_PEER_CAP?peers->count:PLAT_BLE_PEER_CAP;
    for(unsigned i=0;i<count;i++) {
        if(i){out[k++]=',';out[k++]=' ';}
        unsigned n=0;while(n<PLAT_BLE_PEER_NAME_MAX && peers->name[i][n]) {
            unsigned char ch=(unsigned char)peers->name[i][n++];out[k++]=(char)(ch>=32&&ch<=126?ch:'?');
        }
    }
    if(!k)out[k++]='-';
    out[k]=0;
}
static int peer_offset(const char *text,const plat_ble_peers_t *peers,int travel,uint32_t now)
{
    if(!peer_scroll.active || strcmp_s(text,peer_scroll.text) || peers->count!=peer_scroll.count ||
       peers->state!=peer_scroll.state || peers->central!=peer_scroll.central || travel!=peer_scroll.travel) {
        put_s(peer_scroll.text,text);peer_scroll.count=peers->count;peer_scroll.state=peers->state;
        peer_scroll.central=peers->central;peer_scroll.travel=travel;peer_scroll.start=now;peer_scroll.active=1;
    }
    if(travel<=0)return 0;
    uint32_t move=((uint32_t)travel*1000u+23u)/24u, phase=(now-peer_scroll.start)%(2u*(700u+move));
    if(phase<700u)return 0;
    phase-=700u;
    if(phase<move)return (int)(phase*24u/1000u);
    phase-=move;
    if(phase<700u)return travel;
    phase-=700u;
    return travel-(int)(phase*24u/1000u);
}

/* a list over the main area: six rows of 24 px */
static UI_DRAW void draw_list(int band)
{
    int i;
    for (i = 0; i < 3; i++) {
        int row = ui.list_top + band * 3 + i, y = i * 23, sel = row == ui.list_sel;
        pref_t r;
        char num[36], unit[8];
        const x0x_param_t *d;
        if (row >= ui.list_n)
            break;
        r = list_rows[row];
        if (r.kind == R_HDR) {                         /* a section: whose values follow */
            char t[28];
            hdr_name(r.a, t);
            cv_text(8, vc(&FONT_XS, y + 4, 16), &FONT_XS, t, C_AMB);
            cv_rect(8, y + 19, 220, 1, C_LINE);
            continue;
        }
        d = pref_desc(r);
        surface_panel(3,y+1,229,21,sel,sel?dim(part_col(),6):SOUND_FACE,
                      sel?part_col():SOUND_EDGE,SOUND_SIDE);
        cv_text(8, vc(sel ? &FONT_B : &FONT_S, y + 1, 18), sel ? &FONT_B : &FONT_S, caps_of(pref_name(r)), sel ? C_WHITE : C_GRAY);
        if (r.kind == R_SECTION) {                     /* a GLOBAL category: its chevron */
            cv_line(221,y+8,225,y+11,sel?C_AMB:C_DIM);cv_line(225,y+11,221,y+14,sel?C_AMB:C_DIM);continue;
        }
        if (r.kind == R_ACT) {                         /* an action: the return arrow */
            uint16_t ac = sel ? C_WHITE : C_DIM;
            if (r.a == ACT_ABOUT) {
                int32_t lx, lw;
                if (release_label_box(X0X_RELEASE_LABEL, sel, &lx, &lw))
                    cv_text(lx, vc(&FONT_XS, y + 1, 18), &FONT_XS, X0X_RELEASE_LABEL, sel ? C_WHITE : C_HI);
            }
            text_r(226,vc(&FONT_XS,y+1,18),&FONT_XS,action_key_cue(),ac);
            continue;
        }
        if(r.kind==R_BTNAME) {                       /* connected peers: one line, scrolls when long */
            plat_ble_peers_t peers;char shown[PEER_TEXT_CAP];const felucca_font_t *nf=sel?&FONT_B:&FONT_S;
            plat_ble_peers(&peers);peer_join(shown,&peers);
            int left=8+tw(nf,"NAME")+8, width=226-left, travel=tw(nf,shown)-width;
            int offset=peer_offset(shown,&peers,travel,plat_ms());
            cv_text_clip(left-offset,vc(nf,y+1,18),nf,shown,sel?C_WHITE:C_HI,left,226);continue;
        }
        if (r.kind == R_PARTON) {                      /* M7 (#815 item 7): part stripe, switch, no words */
            int on = pref_get(r);
            uint16_t ink = PART_COL[r.a % NPARTS];
            cv_rect(3, y + 1, 2, 21, ink);
            ui_pictogram(168, y + 6, on ? UI_G_CHECK : UI_G_MUTE, 1, on ? ink : C_DIM);
            ui_state_toggle(190, y + 6, on, on ? ink : C_GRAY);
            continue;
        }
        pref_value(r, num, unit);
        if (r.kind == R_BPRESET) {
            const char *name = original_sound_name((unsigned)engine_bass_requested_bank(r.b),
                                                   (unsigned)engine_bass_requested_preset(r.b));
            put_s(num,caps_of(name ? name : "USER"));
        }
        {
            const felucca_font_t *nf = sel ? &FONT_B : &FONT_S;
            if ((r.kind == R_ENG && r.a == T_303) || r.kind == R_BENGINE || r.kind == R_BPRESET || r.kind == R_BSTATUS) {
                int room = 226-8-tw(sel ? &FONT_B : &FONT_S,caps_of(pref_name(r)))-8-
                           (unit[0] ? tw(&FONT_XS,unit)+2 : 0);
                if (tw(nf,num) > room) nf = tw(&FONT_XS,num) <= room ? &FONT_XS : &FONT_T;
            }
            int32_t ny = vc(nf, y + 1, 18), ux = 226 - tw(&FONT_XS, unit);
            cv_text(ux, base_y(nf, ny, &FONT_XS), &FONT_XS, unit, C_GRAY);
            text_r(unit[0] ? ux - 2 : 226, ny, nf, num, sel ? C_WHITE : C_HI);
        }
        if (d && !d->names && d->max >= 24) {          /* a continuous value: its bar */
            int v = pref_get(r);
            rbox(108, y + 18, 70, 3, 1, C_LINE);
            if (v)
                rbox(108, y + 18, 3 + v * 67 / d->max, 3, 1, sel ? part_col() : C_DIM);
        }
    }
    if (ui.list_n > 6) {                               /* the scrollbar */
        int h = 2 * BAND_H * 6 / ui.list_n, y = 2 * BAND_H * ui.list_top / ui.list_n - band * BAND_H;
        rbox(235, 0, 3, BAND_H, 1, C_LINE);
        rbox(235, y, 3, h, 1, C_HI);
    }
}

static UI_DRAW void draw_ask(int band)
{
    uint16_t red = RGB(255, 80, 60);
    if (band == 0) {
        frame(6, 10, 228, 62, red);
        cv_rect(7, 71, 226, 1, C_BLACK);
        text_c(120, 24, &FONT_B, ui.ask_q[0], C_WHITE);
        text_c(120, 46, &FONT_S, ui.ask_q[1], C_GRAY);
    } else {
        cv_rect(6, 0, 1, 44, red);
        cv_rect(233, 0, 1, 44, red);
        cv_rect(7, 44, 226, 1, red);
        if (action_key_cue()[0]) {
            box(22, 10, 92, 24, red);
            text_c(68, vc(&FONT_B, 10, 24), &FONT_B, UI_CAP_SEL "  YES", C_BLACK);
        }
        frame(126, 10, 92, 24, C_GRAY);
        text_c(172, vc(&FONT_B, 10, 24), &FONT_B, UI_CAP_HOME "  NO", C_GRAY);
    }
}

static UI_DRAW void draw_help(int band)
{
    const char *l[HELP_LINES];
    int n = help_lines(ui.help - 1, l), k;
    uint16_t c = part_col();
    if (band == 0) {
        box(6, 4, 228, 24, c);
        text_c(120, vc(&FONT_B, 4, 24), &FONT_B, btn_label(ui.help - 1), C_BLACK);
    }
    for (k = 0; k < n; k++) {                            /* evenly spaced; a line across the bands in both */
        int32_t y = 34 + k * 18 - band * BAND_H;
        if (y > -18 && y < BAND_H)
            text_c(120, y, &FONT_XS, l[k], C_WHITE);
    }
}

#ifdef X0X_HOST
/* every card, on every kind of screen, fits the screen: 1 = yes (prints the first that does not) */
static int help_fits(void)
{
    static const uint8_t views[] = {V_PART, V_SEQ, V_HOME, V_SONG, V_GEN, V_FX, V_MIX};
    const char *l[HELP_LINES];
    ui_t keep = ui;
    uint8_t keep_any = any_button;
    int b, p, v, kb, n, k, ok = 1;
    for (v = 0; v < (int)sizeof views; v++)
        for (p = 0; p < NPARTS; p++)
            for (kb = 0; kb < 2; kb++)
                for (b = 0; b < NB; b++) {
                    ui.view = views[v];
                    ui.part = (uint8_t)p;
                    ui.rec = (uint8_t)kb;
                    {
                        const char *fa, *fb, *fc;
                        int32_t w;
                        ui.overlay = (uint8_t)(b % 3);           /* none, a list, a question */
                        ui.gen_stale[0] = (uint8_t)(b & 1);
                        ui.rec = (uint8_t)(b & 2);
                        any_button = (uint8_t)(b != 0);
                        footer_text(&fa, &fb, &fc);
                        w = 4 + tw(&FONT_T, fa) + (fb ? FOOT_GAP + tw(&FONT_T, fb) : 0) + (fc ? FOOT_GAP + tw(&FONT_T, fc) : 0);
                        if (w > 236) {
                            if (ok)
                                printf("footer too wide: \"%s / %s / %s\" (%d px)\n", fa, fb ? fb : "", fc ? fc : "", (int)w);
                            ok = 0;
                        }
                    }
                    n = help_lines(b, l);
                    if (n < 1 || n > HELP_LINES)
                        ok = 0;
                    for (k = 0; k < n; k++)
                        if (tw(&FONT_XS, l[k]) > 224) {
                            if (ok)
                                printf("help card too wide: %s: \"%s\" (%d px)\n", btn_label(b), l[k], (int)tw(&FONT_XS, l[k]));
                            ok = 0;
                        }
                }
    ui = keep;
    any_button = keep_any;
    return ok;
}
#endif

/* the footer: one line at the bottom of the main area, what the keys do on this screen (until the
 * first button, how to find out what any of them does) */
static uint16_t footer_text(const char **a, const char **b, const char **c)
{
    *a = *b = *c = 0;
    if (!any_button) {
        *a = "HOLD ANY BUTTON: WHAT IT DOES";
        return C_GRAY;
    }
    if (ui.overlay == O_ASK) {
        if (action_key_cue()[0]) {
            *a = UI_CAP_SEL ": YES";
            *b = UI_CAP_HOME ": NO";
        } else
            *a = UI_CAP_HOME ": NO";
    } else if (ui.overlay == O_LIST) {
        *a = UI_CAP_SELECT ": MOVE";
        *b = ui.view==V_GLO&&ui.glo_section<0?">: ENTER":UI_CAP_ALGO ": CHANGE";
        *c = UI_CAP_HOME ": BACK";
    } else if (ui.view == V_HOME) {
#if BOARD_SMK37
        if (smc_connected()) {
            *a = "SMC F1-5: PART LEVEL";
            *b = "F6: REV  F7: DLY  F8: FILT"; /* fader 8 = master filter; M8 mutes master out */
            return C_AMB;
        }
#endif
        *a = "WHITE: PATTERN";
        *b = "TWO: CHAIN";
        *c = "BLACK: MUTE";
    } else if (ui.view == V_SONG) {
        *a = "WHITE: THE BAR'S PATTERN";
        *b = "BLACK: MUTE";
    } else if (ui.view == V_MIX && cur_page() == 0) {
        *a = "BLACK 1-5: PART";
        *b = UI_CAP_HOME "+BLK: MUTE";
    } else if (drum_mix_page() >= 0) {
        *a = "BLACK: TRACK";
        *b = UI_CAP_HOME "+BLK: MUTE";
    } else if (ui.view == V_FX || ui.view == V_MIX) {
        *a = "AGAIN: NEXT PAGE";
        *b = UI_CAP_SEL ": ALL AS A LIST";
    } else if (ui.view == V_GEN) {
        *a = ui.gen_stale[bidx()] ? UI_CAP_OCT "+: NEW LINE *" : UI_CAP_OCT "+: NEW LINE";
        *b = UI_CAP_OCT "-: MUTATE";
        return ui.gen_stale[bidx()] ? C_WHITE : C_AMB;
    } else if (ui.view == V_PART && is_drum()) {
        *a = "BLACK: SELECT";
        *b = key_sounds() ? "WHITE: SOUND" : "KEY SOUND OFF";
        *c = "SEQ: STEPS";
    } else if (ui.view == V_PART && is_303()) {
        *a = "KEYS: SOUND";
        *b = "SEQ: STEPS";
    } else if (is_drum()) {
        *a = "BLACK: TRACK";
        *b = "WHITE: STEP";
        *c = UI_CAP_HOME "+BLK: MUTE";
    } else if (is_303() && ui.rec) {
        *a = UI_CAP_ENV "+" UI_CAP_OCT ": REST";
        *b = UI_CAP_LFO "+" UI_CAP_OCT ": TIE";
    } else if (division_pad_owner()) {
        *a = "KEYS: PLAY"; *b = division_pad_label();
    } else if (kbd_on()) {
        *a = "FREE PLAY: KEYS PLAY";
        *b = UI_CAP_OCT ": OCTAVE";
        *c = UI_CAP_REC ": WRITE";
    } else if (is_303()) {
        *a = "PRESS: ON";
        *b = "TAP: OFF";
        *c = "HOLD + KNOBS: EDIT";
    } else {
        *a = "STEP + 1-8: PIN A SLICE";                /* (1-8 play the slices numbered above) */
        *b = "9 REV 10 JUNGLE 11 STUT";
    }
    return C_DIM;
}
#define FOOT_Y 71                     /* in the knob row: its last line, in the tiny face */
static UI_DRAW void draw_footer(void)
{
    const char *a, *b, *c;
    uint16_t col = footer_text(&a, &b, &c);
    segs(4, vc(&FONT_T, FOOT_Y, 9), &FONT_T, col, FOOT_GAP, a, b, c, 0);
}

static UI_DRAW void draw_main(void)
{
    int band, readout = ui.touched >= 0 && (int32_t)(ui.touch_until - plat_ms()) > 0 &&
                        ui.overlay == O_NONE && !ui.help;
    int envelope = readout && adsr_touch_active();
    if (!readout)
        ui.touched = -1;
#if BOARD_SMK37
    {
        /* Clip mode: the main area shows the clip grid (main_fm1.c smk_clip_lcd_draw).
         * The function returns 0 when no redraw is due (rate limit). On exit, the
         * normal view below draws the full area again at the next frame. */
        extern uint8_t smk_clip_mode_on(void);
        extern uint8_t smk_clip_lcd_draw(uint32_t w, uint32_t h);
        extern void smk_clip_lcd_force(void);
        extern uint8_t smk_clip_wait(void);
        static uint8_t clip_wait_on;              /* 1: the waiting screen is on the LCD */
        if (!blit_hash[1]) clip_wait_on = 0u;      /* an SMC screen covered the waiting screen */
#if X0X_DEV_PADCAL
        extern uint8_t smk_padcal_on(void);
        extern uint8_t smk_padcal_draw(uint32_t w, uint32_t h);
        if (smk_padcal_on()) {                    /* the pad calibration page (main_fm1.c, CLP-79) */
            clip_wait_on = 0u;                    /* its LCD page replaces the waiting screen */
            if (smk_padcal_draw(240u, 2u * BAND_H))
                cv_commit_rect(1, 0, MAIN_Y);
            return;
        }
#endif
        if (smk_clip_mode_on() && ui.overlay == O_NONE && !ui.help && smk_clip_wait()) {
            if (!clip_wait_on) {                  /* CLP-80: no Loopy host: the waiting screen, not the grid */
                clip_wait_on = 1u;
                cv_begin(240, 2 * BAND_H, C_BLACK);
                cv_band(0, 2 * BAND_H);
                text_c(120, 34, &FONT_B, "WAITING FOR", C_WHITE);
                text_c(120, 56, &FONT_B, "LOOPY PRO", C_WHITE);
                text_c(120, 86, &FONT_XS, "USB OR BLUETOOTH", C_GRAY);
                cv_commit_rect(1, 0, MAIN_Y);
            }
            smk_clip_lcd_force();                 /* the grid draws at once when a host comes */
            return;
        }
        clip_wait_on = 0u;
        if (smk_clip_mode_on() && ui.overlay == O_NONE && !ui.help) {
            if (smk_clip_lcd_draw(240u, 2u * BAND_H))
                cv_commit_rect(1, 0, MAIN_Y);
            return;
        }
        if (smk_clip_mode_on())
            smk_clip_lcd_force();   /* a menu (for example GLO) is on the screen: draw the grid again after it */
    }
#endif
    cv_begin(240, 2 * BAND_H, C_BLACK);           /* both bands, then one transfer: no tear between them */
    for (band = 0; band < 2; band++) {
        cv_band(band * BAND_H, BAND_H);
        if (ui.help)
            draw_help(band);
        else if (ui.overlay == O_ASK)
            draw_ask(band);
        else if (ui.overlay == O_LIST)
            draw_list(band);
        else if (ui.view == V_HOME)
            draw_home(band);
        else if (ui.view == V_FX)
            draw_fx(band);
        else if (ui.view == V_MIX)
            draw_mix(band);
        else if (ui.view == V_SONG)
            draw_song(band);
        else if (ui.view == V_PERF)
            draw_perf(band);
        else if (ui.view == V_PART && (is_drum() || is_303()))
            draw_part_sound(band);
        else if (is_drum())
            draw_drum(band);
        else if (is_303())
            draw_303(band, ui.view == V_GEN);
        else
            draw_break(band);
        if (band == 1 && readout && !envelope &&
            !(ui.view == V_PART && (is_drum() || is_303())))
            draw_readout();
    }
    cv_band(0, 2 * BAND_H);
    cv_commit_rect(1, 0, MAIN_Y);
}

/* -------------------------------------------------------------- knob strip --- */
static void cell_value(int cx, int y, const char *num, const char *unit, uint16_t c)
{
    int32_t w = tw(&FONT_B, num) + (unit[0] ? tw(&FONT_XS, unit) + 1 : 0), x = cx - w / 2;
    x = cv_text(x, y, &FONT_B, num, c);
    if (unit[0])
        cv_text(x + 1, base_y(&FONT_B, y, &FONT_XS), &FONT_XS, unit, C_GRAY);
}

#include "ui_waveform.h"

/* A shape cue, not a sampled oscilloscope. Chicago Wave continuously crossfades
 * saw and square; Miami's carrier, modulator and LFO are discrete choices. */
static UI_DRAW int wave_shape(pref_t r, int v, int *mix)
{
    if (r.kind != R_ENG || r.a != T_303) return 0;
    /* Original control slots (ui_original_controls.h), never legacy IDs:
     * Chicago 0 WAVE; Miami 0/6 WAVE (TRI/SAW/SQR/PUL), 11 wobble SHAPE. */
    unsigned kind = (unsigned)engine_bass_sound_bank(&proj.sound,r.b);
    if (kind == ORIGINAL_SOUND_CHICAGO) {
        if (r.c == 0) { *mix = v; return 1; }
        return 0;
    }
    if (kind != ORIGINAL_SOUND_MIAMI || (r.c != 0 && r.c != 6 && r.c != 11)) return 0;
    const ui_original_control_view *o = original_text_view(r,v);
    if (!o) return 0;
    unsigned q = o->shape[r.c == 0 ? 0 : r.c == 6 ? 1 : 2];
    if (r.c == 11) { /* TRI, DOWN, UP, SQR */
        if (q == 1 || q == 2) { *mix = 0; return q == 1 ? 4 : 1; } /* 4 falls, 1 rises */
        *mix = q == 3 ? 127 : 0; return 2;
    }
    if (q == 1) { *mix = 0; return 1; }                      /* SAW */
    *mix = q == 0 ? 0 : 127; return q == 3 ? 3 : 2;          /* TRI, SQR, PUL */
}

/* Engine waveform cue (restored from ca8299b6): slot 0 is the Chicago
 * oscillator mix or the Miami carrier, 1 the Miami modulator, 2 the wobble. */
static int original_wave_slot(unsigned kind,int p)
{
    if (kind == ORIGINAL_SOUND_JUNO || kind == ORIGINAL_SOUND_DRONE) return -1;
    if(p==0)return 0;
    if(kind==ORIGINAL_SOUND_MIAMI)return p==6?1:p==11?2:-1;
    return -1;
}
static UI_DRAW void draw_original_wave(int cx,int y,const ui_original_wave_cache *v,int slot,uint16_t ink,uint16_t face)
{
    cv_rect(cx-14,y+v->zero[slot],UI_ORIGINAL_WAVE_W,1,blend(face,ink,3));
    for(int i=1;i<UI_ORIGINAL_WAVE_W;i++)
        cv_line(cx-15+i,y+v->wave[slot][i-1],cx-14+i,y+v->wave[slot][i],ink);
}

enum { MIAMI_WAVE_HEIGHT=19, MIAMI_WAVE_ZERO=9, MIAMI_WAVE_GAIN=8 };
/* One affine projection per supported range. The pulse zero is near its low
 * rail, not the midpoint: preserve its +1 / -1/9 relative amplitudes. */
static float miami_wave_plot_y(int pulse, float v)
{
    return pulse ? 1.0f+16.0f*(1.0f-v)/(1.0f+1.0f/9.0f) :
                   (float)MIAMI_WAVE_ZERO-(float)MIAMI_WAVE_GAIN*v;
}
static UI_DRAW void draw_wave_glyph(int cx, int y, int shape, int mix, uint16_t col, uint16_t face)
{
    if(shape==2 || shape==3) {
        /* Integrate line coverage in four horizontal subcolumns. Sample the
         * actual periodic function, never blur/average its amplitude or duty.
         * Tall transitions stay vertical; positive values are above the midline.
         * Use the free value-cell height: 29x19, one cycle. A single
         * affine scale preserves DC/asymmetry; never split the two polarities. */
        int x,j,k,pulse=shape==3 && mix!=0;
        int zero=(int)(miami_wave_plot_y(pulse,0)+.5f);
        cv_rect(cx-14,y+zero,29,1,blend(face,col,3)); /* zero-amplitude reference */
        for(x=0;x<29;x++) {
            unsigned coverage[MIAMI_WAVE_HEIGHT]={0};
            for(k=0;k<4;k++) {
                float p0=((float)x+(float)k*.25f)/29.0f;
                float p1=((float)x+(float)(k+1)*.25f)/29.0f;
                float a=miami_wave_plot_y(pulse,ui_miami_wave_value(shape==3,mix!=0,p0));
                float b=miami_wave_plot_y(pulse,ui_miami_wave_value(shape==3,mix!=0,p1));
                float lo=fm_minf(a,b)-.5f,hi=fm_maxf(a,b)+.5f;
                for(j=0;j<MIAMI_WAVE_HEIGHT;j++) {
                    float overlap=fm_minf(hi,(float)j+.5f)-fm_maxf(lo,(float)j-.5f);
                    if(overlap>0) coverage[j]+=(unsigned)(fm_minf(overlap,1.0f)*4.0f+.5f);
                }
            }
            for(j=0;j<MIAMI_WAVE_HEIGHT;j++) if(coverage[j])px_blend(cx-14+x,y+j,col,coverage[j]);
        }
        return;
    }
    int i,prev=0;
    for(i=0;i<29;i++) {
        int phase=i%14, saw=15-phase*30/13;
        int square=phase<7?15:-15;
        int tri=phase<7?15-phase*30/6:-15+(phase-7)*30/6;
        int pulse=phase<2?-15:15; /* small cue for Miami's 10% pulse, not an oscilloscope */
        int a=shape==4?-saw:shape==1?(saw*(127-mix)+square*mix)/127:
              shape==3?(tri*(127-mix)+pulse*mix)/127:(tri*(127-mix)+square*mix)/127;
        int py=y+(a+15)*8/30;
        if(i) cv_line(cx-14+i-1,prev,cx-14+i,py,col);
        prev=py;
    }
}

static UI_DRAW const char *matrix_name(pref_t r)
{
    if (r.kind==R_ENG && r.a==T_303) return ui_original_name((unsigned)engine_bass_sound_bank(&proj.sound,r.b),r.c);
    if (r.kind==R_ENG && r.a==T_303) {
        switch(r.c) {
        case BASS303_FATTACK: return "ATTACK";
        case BASS303_DECAY: return "DECAY";
        case BASS303_FSUSTAIN: return "SUSTAIN";
        case BASS303_FRELEASE: return "RELEASE";
        case CHI_ARP_SWITCH: return "ENABLE";
        case CHI_ARP_MODE: return "DIRECTION";
        case CHI_ARP_RANGE: return "OCTAVES";
        case CHI_ARP_SPEED: return "RATE";
        case CHI_DAMPER: return "DAMPER";
        case CHI_FX_TYPE: return "TYPE";
        case CHI_FX_EDIT1: case CHI_FX_EDIT2: {
            /* Names describe the existing algorithms, not a universal send.
             * SHAPE is a coupled macro; raw 0..127 remains a pot, not percent. */
            int ty=matrix_value(PR(R_ENG,T_303,r.b,CHI_FX_TYPE));
            if(ty==CHI_FX_OFF)return r.c==CHI_FX_EDIT1?"EDIT 1":"EDIT 2";
            if (r.c==CHI_FX_EDIT1) {
                if (ty==CHI_FX_EQ) return "TILT";
                if (ty==CHI_FX_COMP || ty==CHI_FX_DECIM) return "AMOUNT";
                if (ty==CHI_FX_RING) return "FREQ";
                return "MIX";
            }
            if(ty==CHI_FX_COMP || ty==CHI_FX_DECIM)return "EDIT 2";
            if (ty==CHI_FX_EQ || ty==CHI_FX_RING) return "MIX";
            if (ty==CHI_FX_SHORT_DLY) return "FEEDBACK";
            if (ty==CHI_FX_BPM_DLY) return "DIVISION";
            if (ty==CHI_FX_HALL) return "DECAY";
            return "SHAPE";
        }
        default: break;
        }
    }
    return caps_of(pref_name(r));
}

static int matrix_value(pref_t r)
{
    int val = pref_get(r);
    if (lock_step() >= 0) {
        int lv = lock_of(r, lock_step());
        if (lv >= 0) val = lv;
    } else if (has_motion(r)) {
        int mv = motion_now(r);
        if (mv >= 0) val = mv;
    }
    return val;
}

static UI_DRAW int adsr_touch_active(void)
{
    pref_t r;
    int page = cur_page(), i = ui.touched;
    if (ui.view != V_PART || !is_303() || i < 0 || i > 3 ||
        (int32_t)(ui.touch_until - plat_ms()) <= 0 ||
        (strcmp_s(pg.title[page], "AMP ADSR") &&
         strcmp_s(pg.title[page], "FILTER ADSR"))) return 0;
    r = pg.r[page][i];
    return matrix_touch_matches(r, i);
}

static UI_DRAW void matrix_glyph(int x,int y,int glyph,uint16_t c,uint16_t bg)
{
    if (glyph==GL_POWER) {
        cv_line(x,y+2,x,y+8,c);cv_line(x,y+8,x+3,y+10,c);
        cv_line(x+3,y+10,x+7,y+10,c);cv_line(x+7,y+10,x+10,y+8,c);
        cv_line(x+10,y+8,x+10,y+2,c);cv_line(x+5,y,x+5,y+5,c);
    } else if (glyph==GL_CLOCK) {
        dot(x+5,y+5,5,c);dot(x+5,y+5,4,bg);
        cv_line(x+5,y+2,x+5,y+5,c);cv_line(x+5,y+5,x+8,y+5,c);
    } else if (glyph==GL_PEDAL) {
        cv_line(x,y+10,x+10,y+10,c);cv_line(x+1,y+8,x+3,y+2,c);
        cv_line(x+3,y+2,x+9,y+2,c);cv_line(x+9,y+2,x+10,y+8,c);
        cv_line(x+3,y+5,x+8,y+5,c);
    } else {
        int n=glyph==GL_BOTH?2:1;
        for(int i=0;i<n;i++) {
            int xx=x+(n==2?i*6:3),up=glyph==GL_UP || (n==2 && !i),tip=y+(up?1:9);
            cv_line(xx+2,y+1,xx+2,y+9,c);
            cv_line(xx,tip+(up?2:-2),xx+2,tip,c);
            cv_line(xx+4,tip+(up?2:-2),xx+2,tip,c);
        }
    }
}

#if X0X_BASS_PRESET_PREVIEW
/* Bounded ROM names, never a preset number masquerading as its name. During a
 * publication interruption the requested identity is not coherent yet. */
static const char *matrix_preset_name(int voice)
{
    int pending=engine_bass_preset_pending(voice);
    if(pending==6) return "UPDATING";
#if X0X_BASS_TAGGED_SOUND
    if(!pending && engine_bass_sound_bank(&proj.sound,voice)<0) return "UNKNOWN";
#endif
    int bank=engine_bass_requested_bank(voice), preset=engine_bass_requested_preset(voice);
    const char *name=preset>=0?
        original_sound_name((unsigned)bank,(unsigned)preset)
        :"USER";
    return name && name[0]?name:"UNKNOWN";
}

typedef struct {
    char line[2][FACTORY_NAME_MAX];
    const felucca_font_t *font;
    int lines;
} preset_text_t;

/* Prefer whole words, then a character boundary for an unusually long word.
 * Fit both lines by measured native-font advance. Every current factory name
 * fits; a future over-wide name gets an explicit trailing '..', not overflow. */
static UI_DRAW void preset_text(preset_text_t *out,const char *name,int tall)
{
    char full[FACTORY_NAME_MAX];int n=0;
    while(name && name[n] && n<FACTORY_NAME_MAX-1) {
        unsigned char c=(unsigned char)name[n];
        full[n]=(char)(c>='a' && c<='z'?c-32:c<32 || c>126?'?':c);n++;
    }
    full[n]=0;
    if(!n) {put_s(full,"UNKNOWN");n=7;}
    const felucca_font_t *fonts[3]={&FONT_B,&FONT_XS,&FONT_T};
    for(int f=0;f<3;f++) {
        out->font=fonts[f];out->lines=1;put_s(out->line[0],full);out->line[1][0]=0;
        if(tw(out->font,full)<=54) return;
        if(!tall && f<2) continue;
        for(int words=1;words>=(f<2?1:0);words--) {
            int best=-1,score=999;
            for(int split=1;split<n;split++) {
                if(words && full[split]!=' ') continue;
                memcpy(out->line[0],full,(unsigned)split);out->line[0][split]=0;
                put_s(out->line[1],full+split+(full[split]==' '));
                int a=tw(out->font,out->line[0]),b=tw(out->font,out->line[1]);
                int d=a>b?a-b:b-a;
                if(a<=54 && b<=54 && d<score) {best=split;score=d;}
            }
            if(best>=0) {
                memcpy(out->line[0],full,(unsigned)best);out->line[0][best]=0;
                put_s(out->line[1],full+best+(full[best]==' '));out->lines=2;return;
            }
        }
    }
    out->lines=2;out->line[0][0]=out->line[1][0]=0;
    int i=0;
    for(int row=0;row<2;row++) {
        int k=0,limit=row?54-tw(out->font,".."):54;
        while(i<n && k<FACTORY_NAME_MAX-3) {
            out->line[row][k]=full[i];out->line[row][k+1]=0;
            if(tw(out->font,out->line[row])>limit) {out->line[row][k]=0;break;}
            i++;k++;
        }
        if(row) put_s(out->line[row]+k,"..");
    }
}

static UI_DRAW void draw_preset_name(int voice,int cx,int y,int height,uint16_t ink)
{
    preset_text_t text;preset_text(&text,matrix_preset_name(voice),height>49);
    int top=height>49?(text.lines==2?28:35):(text.lines==2?21:26);
    for(int i=0;i<text.lines;i++) text_c(cx,y+top+i*text.font->h,text.font,text.line[i],ink);
}
#endif

static UI_DRAW void orig_strip_glyph(pref_t r,int val,int gx,int gy,uint16_t col);
static UI_DRAW int orig_strip_slot(pref_t r);
static UI_DRAW int drum_strip_role(pref_t r);
static UI_DRAW void drum_strip_glyph(pref_t r,int val,int gx,int gy,uint16_t col);
/* glyph-strip readout: "%" stays in the caps FONT_T run; a letter unit (st, ms,
 * Hz) is drawn lowercase in FONT_XS grey after it, as cell_value does */
static UI_DRAW void strip_value(int cx, int y, char *num, const char *unit, uint16_t ink)
{
    if (!unit[0] || unit[0] == '%') { char *q = num; while (*q) q++; put_s(q, unit); text_c(cx, y, &FONT_T, num, ink); return; }
    int w = tw(&FONT_T, num) + tw(&FONT_XS, unit) + 1;
    int x = cv_text(cx - w / 2, y, &FONT_T, num, ink);
    cv_text(x + 1, base_y(&FONT_T, y, &FONT_XS), &FONT_XS, unit, C_GRAY);
}
/* drum cells: the readout must sit in x+30..x+57 (glyph left, divider right);
 * a wider one ("1.2kHz") narrows its number to FONT_XS instead of clipping */
static UI_DRAW void strip_value_fit(int x, int y, char *num, const char *unit, uint16_t ink)
{
    const felucca_font_t *f = &FONT_T;
    int wu = unit[0] && unit[0] != '%' ? tw(&FONT_XS, unit) + 1 : unit[0] ? tw(&FONT_T, unit) : 0;
    if (tw(f, num) + wu > 27) f = &FONT_XS;
    if (tw(f, num) + wu > 27 && unit[0]) {
        /* Retain full precision/unit when a horizontal pair cannot fit. The
         * two short lines stay within the original readout's right-hand lane. */
        text_c(x+44,y-5,f,num,ink);
        text_c(x+44,y+6,&FONT_XS,unit,C_GRAY);
        return;
    }
    if (unit[0] == '%') { char *q = num; while (*q) q++; put_s(q, unit); wu = 0; }
    int w = tw(f, num) + wu, l = x + 44 - w / 2;
    if (l < x + 30) l = x + 30;
    if (l + w > x + 57) l = x + 57 - w;
    int e = cv_text(l, f == &FONT_T ? y : base_y(&FONT_T, y, &FONT_XS), f, num, ink);
    if (wu) cv_text(e + 1, base_y(&FONT_T, y, &FONT_XS), &FONT_XS, unit, C_GRAY);
}
static UI_DRAW void draw_param_widget(pref_t r, int x, int y, int width, int active, uint16_t col, int height, int night)
{
    const x0x_param_t *d=pref_desc(r);
    char num[16],unit[8],value[24];
    int cx=x+width/2,val,shape=0,mix=0,lv,discrete=0,glyph=GL_NONE,unused=0,orig_glyph=0;
    const felucca_font_t *font;
    uint16_t ink=night?(active?SOUND_INK:SOUND_WHITE):(active?C_BLACK:C_WHITE);
    int value_y=height>49?35:26, bar_y=height-4;
    if(!d) return;
    val=matrix_value(r);
    if(r.kind==R_ENG && r.a==T_303 &&
       engine_bass_sound_bank(&proj.sound,r.b)==ORIGINAL_SOUND_CHICAGO) {
        /* Original Chicago slots: 13 ON, 14 MODE, 16 SPEED; readout text stays original. */
        if(r.c>=13 && r.c<=16) {
            const ui_original_control_view *o=original_text_view(PR(R_ENG,T_303,r.b,13),matrix_value(PR(R_ENG,T_303,r.b,13)));
            discrete=orig_glyph=1;
            if(r.c!=13 && o && !o->arp_on) ink=night?SOUND_DIM:(active?dim(col,4):C_GRAY);
            if(r.c==13) glyph=GL_POWER;
            if(r.c==14) { const ui_original_control_view *m=original_text_view(r,val);
                glyph=m && m->arp_mode==1?GL_DOWN:m && m->arp_mode==2?GL_UP:GL_BOTH; }
            if(r.c==16) glyph=GL_CLOCK;
        }
    }
    if(0) {
        if(r.c>=CHI_ARP_SWITCH && r.c<=CHI_ARP_SPEED) {
            discrete=1;
            if(r.c!=CHI_ARP_SWITCH && !matrix_value(PR(R_ENG,T_303,r.b,CHI_ARP_SWITCH)))
                ink=night?SOUND_DIM:(active?dim(col,4):C_GRAY);
            if(r.c==CHI_ARP_SWITCH) glyph=GL_POWER;
            if(r.c==CHI_ARP_MODE) glyph=val==CHI_ARP_DOWN?GL_DOWN:val==CHI_ARP_UP?GL_UP:GL_BOTH;
            if(r.c==CHI_ARP_SPEED) glyph=GL_CLOCK;
        }
        if(r.c==CHI_DAMPER) {discrete=1;glyph=GL_PEDAL;}
        if(r.c==CHI_FX_TYPE) discrete=1;
        if(r.c==CHI_FX_EDIT1 || r.c==CHI_FX_EDIT2) {
            int ty=matrix_value(PR(R_ENG,T_303,r.b,CHI_FX_TYPE));
            if(ty==CHI_FX_OFF || (r.c==CHI_FX_EDIT2 && (ty==CHI_FX_COMP || ty==CHI_FX_DECIM)))
                {unused=discrete=1;ink=night?SOUND_DIM:(active?dim(col,4):C_GRAY);}
        }
    }
    {
        int yy=y+(height>49?14:11);
        if(night) night_label_c(cx,yy,&FONT_T,matrix_name(r),unused?SOUND_DIM:active?SOUND_INK:SOUND_GRAY);
        else {
            int xx=cx-tw(&FONT_T,matrix_name(r))/2;
            uint16_t face=active?col:SOUND_FACE;
            cv_text(xx,yy+1,&FONT_T,matrix_name(r),blend(face,C_WHITE,2));
            cv_text(xx,yy-1,&FONT_T,matrix_name(r),blend(face,C_BLACK,6));
            text_c(cx,yy,&FONT_T,matrix_name(r),unused?SOUND_DIM:active?C_BLACK:C_GRAY);
        }
    }
#if X0X_BASS_PRESET_PREVIEW
    if(r.kind==R_BPRESET) {
        draw_preset_name(r.b,cx,y,height,ink);
        if(!pref_read_only(r)) {
            cv_rect(x+8,y+bar_y,42,1,night?(active?SOUND_SELECT_SIDE:SOUND_LINE):(active?dim(col,3):C_LINE));
            if(val>0 && d->max) cv_rect(x+8,y+bar_y,1+41*(val>d->max?d->max:val)/d->max,1,ink);
        }
        return;
    }
#endif
    if(r.kind==R_ENG && val>=0 && val<=d->max) shape=wave_shape(r,val,&mix);
    if(!shape && !unused && val>=0 && (orig_strip_slot(r) || drum_strip_role(r))) {
        /* Reuse the knob-strip control_glyph families (0e58b960/5f58a199) in the
         * wave-glyph layout: glyph left, original readout right, no extra bar.
         * 909/808 controls draw their own live glyph in the same box. */
        int drum=drum_strip_role(r)!=0;
        if(drum) drum_strip_glyph(r,val,x+3,y+22,ink);
        else orig_strip_glyph(r,val,x+3,y+22,ink);   /* 26x19 box: x+3..x+28 */
        pref_value_of(r,val,num,unit);
        if(drum) strip_value_fit(x,y+28,num,unit,ink);
        else strip_value(x+45,y+28,num,unit,ink);     /* starts >= x+32: 3 px clear of the glyph */
    } else
    if(shape) {
        int slot=original_wave_slot((unsigned)engine_bass_sound_bank(&proj.sound,r.b),r.c);
        const ui_original_wave_cache *wave=slot>=0?original_wave_view(r,val):0;
        uint16_t face=night?(active?SOUND_SELECT:SOUND_FACE):(active?col:SOUND_FACE);
        if(wave) draw_original_wave(cx-10,y+25,wave,slot,ink,face);
        else draw_wave_glyph(cx-10,y+((shape==2 || shape==3)?25:28),shape,mix,ink,face);
        pref_value_of(r,val,num,unit);           /* original readout text */
        strip_value(cx+17,y+28,num,unit,ink);
    } else {
        pref_value_of(r,val,num,unit);
        if(unused) {put_s(num,"--");unit[0]=0;}
        else if(orig_glyph) {}
        else if(glyph==GL_POWER || glyph==GL_PEDAL) put_s(num,val>=(glyph==GL_PEDAL?64:1)?"ON":"OFF");
        else if(discrete && r.c==CHI_ARP_RANGE) put_i(num,val+1);
        else if(glyph==GL_DOWN || glyph==GL_UP || glyph==GL_BOTH) put_s(num,glyph==GL_DOWN?"DN":glyph==GL_UP?"UP":"UP/DN");
        put_s(put_s(put_s(value,num),unit[0]?" ":""),unit);
        int limit=glyph?39:54;
        font=tw(&FONT_B,value)<=limit?&FONT_B:&FONT_XS;
        if(tw(font,value)>limit) font=&FONT_T;
        int w=tw(font,value), left=cx-(w+(glyph?14:0))/2;
        if(glyph) matrix_glyph(left,y+value_y+1,glyph,ink,night?(active?SOUND_SELECT:SOUND_FACE):(active?col:C_BLACK));
        cv_text(left+(glyph?14:0),y+value_y,font,value,ink);
        if(!unused && r.kind!=R_BSTATUS) {
            cv_rect(x+8,y+bar_y,42,1,night?(active?SOUND_SELECT_SIDE:SOUND_LINE):(active?dim(col,3):C_LINE));
            if(val>0 && d->max) cv_rect(x+8,y+bar_y,1+41*(val>d->max?d->max:val)/d->max,1,ink);
        }
    }
    lv=lock_of(r,lock_step());
    if(lv>=0 || (lock_step()<0 && has_motion(r)))
        cv_rect(x+53,y+24,2,2,night?SOUND_INK:(active?C_BLACK:lv>=0?C_AMB:C_HI));
}

/* Stage-normalised parameter preview, not a millisecond axis or an audio trace.
 * Chicago D/R are RC time constants: sample five tau, never quadratic easing.
 * Miami release uses a full-scale slope; its duration from sustain is s*R.
 * The hold interval is illustrative. No persistent renderer state is needed. */
typedef struct {
    float attack,decay,sustain,release;
    int curved,release_curve,gate,enabled;
} ui_adsr_t;

static void adsr_values(ui_adsr_t *e,int p)
{
    int i;
    float *time[3]={&e->attack,&e->decay,&e->release};
    e->sustain=(float)matrix_value(pg.r[p][2])/127.0f;
    e->curved=e->release_curve=e->gate=0;e->enabled=1;
    if(engine_bass_sound_bank(&proj.sound,bidx())==ORIGINAL_SOUND_CHICAGO) {
        /* Original Chicago ENVELOPE slots 7..10 (A, D, S, R): stage-normalised
         * compiled native controls include each macro's scaling; D/R are RC. */
        /* Time constants of original_vca_tick (control_math.c), seconds:
         * A 13a^4+.001 toward 1.3, D 25d^4+.001 toward S, R 25r^4+.002. */
        /* Native VCA EG controls exactly as the engine compiles them (macro
         * scaling included); q127 if the runtime view is unavailable. */
        float native[4]={0,0,0,0};unsigned gate=0;
        int nv=engine_bass_adsr_view(bidx(),native,&gate);
        if(nv){e->sustain=native[2];e->gate=(int)gate;}
        for(i=0;i<3;i++) {
            float x=nv?native[i==2?3:i]:(float)matrix_value(pg.r[p][i==2?3:i])/127.0f; x*=x; x*=x;
            *time[i]=i==0?13.0f*x+.001f:i==1?25.0f*x+.001f:25.0f*x+.002f;
        }
        e->curved=1; e->release_curve=1; e->enabled=2; /* 2: original exponential laws */
        return;
    }
    for(i=0;i<3;i++) {
        pref_t r=pg.r[p][i==2?3:i];
        *time[i]=display_env_ms(r,matrix_value(r));
    }
    e->gate=matrix_value(PR(R_ENG,T_303,bidx(),BASS303_AMPMODE))==BASS303_AMP_GATE;
    if(pg.r[p][0].c==BASS303_AATTACK) {
        e->curved=!e->gate; e->release_curve=e->gate?2:1;
    }
    else e->enabled=!e->gate && matrix_value(PR(R_ENG,T_303,bidx(),BASS303_FENV));
}

static float adsr_fall(int curved,float start,float end,float u)
{
    return curved?end+(start-end)*fm_expf(-5.0f*u):start+(end-start)*u;
}

/* Gate mode refreshes the filter release step from its current level on each
 * BASS303_CTRL block. Unlike standalone FENV it is geometric, not linear.
 * Show the normal active-render recurrence over five nominal release times;
 * idle/block-size changes and the post-envelope RC filter are not audio-traced. */
static float adsr_release(const ui_adsr_t *e,float u)
{
    if(e->release_curve==2 && e->release>0.0f) {
        float n=e->release*(BASS303_SR/(1000.0f*BASS303_CTRL));
        return e->sustain*fm_powf(fm_maxf(0.0f,1.0f-1.0f/n),5.0f*n*u);
    }
    return adsr_fall(e->release_curve,e->sustain,0.0f,u);
}

/* The envelope graph lives on the PART page itself, above the envelope row,
 * and follows the live control values. Original Chicago ENVELOPE only. */
/* Any row whose four controls are the original A/D/S/R set gets the graph,
 * active or not. Chicago: ENVELOPE (slots 7..10, one macro set that drives
 * both VCF and VCA EGs). The original Miami profile has no A/D/S/R row. */
static UI_DRAW int adsr_row(int p)
{
    return ui.view==V_PART && is_303() && p>=0 && p<pg.n &&
           engine_bass_sound_bank(&proj.sound,bidx())==ORIGINAL_SOUND_CHICAGO &&
           pg.r[p][0].kind==R_ENG && pg.r[p][0].c==7 && pg.r[p][1].c==8 &&
           pg.r[p][2].c==9 && pg.r[p][3].c==10;
}
/* Level of one original stage at time t (s): attack toward 1.3 clipped at 1,
 * decay toward sustain, release toward zero (original_vca_tick). */
static float adsr_original_level(const ui_adsr_t *e,int stage,float t)
{
    if(stage==0) return fm_minf(1.0f,1.3f-1.3f*fm_expf(-t/e->attack));
    if(stage==1) return e->sustain+(1.0f-e->sustain)*fm_expf(-t/e->decay);
    return e->sustain*fm_expf(-t/e->release);
}
/* Segment widths follow the real stage durations: attack to full scale,
 * decay to within 1% of sustain, release to the 0.04 cutoff. The sustain
 * plateau has a fixed illustrative width; it is not a time. */
static void adsr_layout(const ui_adsr_t *e,int x0,int width,int xs[5],float dur[3])
{
    float sum=0.0f;
    int k,hold=42,span=width-hold;
    dur[0]=e->attack*1.466337f;                            /* ln(1.3/0.3) */
    dur[1]=e->decay*4.6051702f;                            /* ln(100) */
    dur[2]=e->sustain>0.04f?e->release*fm_logf(e->sustain/0.04f):0.0f;
    for(k=0;k<3;k++) sum+=dur[k];
    /* Each timed stage keeps 3 px so a short stage never vanishes. */
    int w[3],free=span-9,used=0;
    for(k=0;k<3;k++) { w[k]=3+(sum>0.0f?(int)((float)free*dur[k]/sum+.5f):free/3); used+=w[k]; }
    w[1]+=span-used;                                       /* rounding remainder */
    if(w[1]<3) { w[2]-=3-w[1]; w[1]=3; }
    xs[0]=x0; xs[1]=x0+w[0]; xs[2]=xs[1]+w[1]; xs[3]=xs[2]+hold; xs[4]=x0+width;
}
static UI_DRAW void draw_adsr_inline(int p,int active,int y,int h,int off)
{
    static const char *const names[4]={"ATTACK","DECAY","SUSTAIN","RELEASE"};
    ui_adsr_t e;
    int k,edited=active && ui.touched>=0 && ui.touched<4 &&
        (int32_t)(ui.touch_until-plat_ms())>0?ui.touched:-1;
    int x0=13,y0=y+h-5,top=y+22,xs[5];
    uint16_t col=active?matrix_col():SOUND_WHITE,hi=SOUND_INK;   /* inactive: the inactive-row ink */
    float dur[3];
    adsr_values(&e,p);
    adsr_layout(&e,x0,214,xs,dur);
    int ys=y0-(int)(e.sustain*(y0-top)+0.5f);
    if(edited>=0) { /* the selected or turned stage and its live value */
        char num[16],unit[8],t[32];
        pref_value_of(pg.r[p][edited],matrix_value(pg.r[p][edited]),num,unit);
        put_s(put_s(put_s(put_s(t,names[edited])," "),num),unit);
        text_r(232,y-off,&FONT_T,t,hi);
    }
    cv_rect(x0,y0-off,215,1,SOUND_SELECT_SIDE);
    cv_line(xs[3],top-off,xs[3],ys-2-off,SOUND_DIM);       /* note-off */
    for(k=0;k<3;k++) {
        int stage=k==2?3:k, xa=xs[k==2?3:k], xb=xs[k==2?4:k+1], i, px=xa, py;
        float d=dur[k];
        float l0=stage==0?0.0f:stage==1?1.0f:e.sustain;
        py=y0-(int)(l0*(y0-top)+0.5f);
        int n=xb-xa; if(n<1) n=1;
        for(i=1;i<=n;i++) {
            float level=adsr_original_level(&e,k,d*(float)i/(float)n);
            if(k==2 && i==n) level=0.0f;
            int ny=y0-(int)(level*(y0-top)+0.5f);
            cv_line(px,py-off,xa+i,ny-off,edited==stage?hi:col);px=xa+i;py=ny;
        }
    }
    cv_line(xs[2],ys-off,xs[3],ys-off,edited==2?hi:col);
    for(k=0;k<4;k++) {
        /* Keep A/D/S/R percentage visible at rest as well as during K5-K8
         * turns. Same quantisation as the native Chicago value readout. */
        char label[20];
        char *end=put_i(put_s(label,"K"),UI_FIRST_KNOB+k);
        end=put_s(end,k==0?" A ":k==1?" D ":k==2?" S ":" R ");
        end=put_i(end,(matrix_value(pg.r[p][k])*100+63)/127);
        put_s(end,"%");
        text_c(31+k*59,y+8-off,&FONT_T,label,edited==k?hi:SOUND_GRAY);
    }
    {   /* Native state1 contains both decay and sustain. Classify within 1% of S.
         * Cursor level is always the live EG; the horizontal axis names stages. */
        float level=0,mod=0; unsigned state=6,held=0;
        if(engine_bass_voice_view(bidx(),&level,&mod,&state,&held) && state!=6) {
            if(level<0)level=0; if(level>1)level=1;
            int stage=state==0?0:state==3?3:((e.gate && held) ||
                (level-e.sustain<=.01f && e.sustain-level<=.01f))?2:1;
            /* A stage/level gauge, separate from the preview's time curve:
             * Gate mode or release during attack can differ from the schematic.
             * Dotted vertical rail names the stage; the crossbar is actual level. */
            int x=(xs[stage]+xs[stage+1])/2;
            for(int yy=top;yy<=y0;yy+=3) cv_rect(x,yy-off,1,1,SOUND_DIM);
            int yy=y0-(int)(level*(y0-top)+.5f)-off;
            cv_rect(x-2,yy,5,1,hi);
            cv_rect(x,yy-1,1,3,hi);
        }
    }
    if(edited>=0) { /* underline the highlighted segment */
        int xa=xs[edited],xb=xs[edited+1];
        if(xb<=xa) xb=xa+1;
        cv_rect(xa,y0+2-off,xb-xa+1,2,hi);
    }
    {   /* playhead: where the live VCA EG is now, on this graph's own time axis */
        float adsr[4],lv=0; int st=6,px=-1;
        if(engine_bass_env_view(bidx(),adsr,&lv,&st) && st!=6) {
            if(lv<0)lv=0; if(lv>1)lv=1;
            if(st==0) { float t=-e.attack*fm_logf(fm_maxf(1e-6f,(1.3f-lv)/1.3f));
                px=xs[0]+(int)((xs[1]-xs[0])*fm_minf(1.0f,t/fm_maxf(dur[0],1e-6f))+.5f); }
            else if(st==1) {
                float u=lv-e.sustain,full=1.0f-e.sustain;
                if(u>.01f*full && full>1e-6f) { float t=-e.decay*fm_logf(u/full);
                    px=xs[1]+(int)((xs[2]-xs[1])*fm_minf(1.0f,t/fm_maxf(dur[1],1e-6f))+.5f); }
                else px=(xs[2]+xs[3])/2;          /* holding at sustain: mid plateau */
            } else if(st==3) {
                float t=e.sustain>1e-6f&&lv>1e-6f?-e.release*fm_logf(lv/e.sustain):dur[2];
                px=xs[3]+(int)((xs[4]-xs[3])*fm_minf(1.0f,fm_maxf(0.0f,t)/fm_maxf(dur[2],1e-6f))+.5f);
            } else px=xs[4];
            int py=y0-(int)(lv*(y0-top)+.5f);
            cv_rect(px,top-off,1,y0-top,SOUND_DIM);
            cv_rect(px-1,py-1-off,3,3,hi);
        }
    }
}

static const felucca_font_t *original_value_font(const char *num, const char *unit, int width)
{
    int used = unit[0] ? tw(&FONT_XS,unit)+1 : 0;
    if (tw(&FONT_B,num)+used <= width) return &FONT_B;
    if (tw(&FONT_XS,num)+used <= width) return &FONT_XS;
    return &FONT_T;
}
static void original_cell_value(int cx, int y, const char *num, const char *unit, uint16_t c)
{
    const felucca_font_t *font = original_value_font(num,unit,54);
    int32_t width = tw(font,num)+(unit[0] ? tw(&FONT_XS,unit)+1 : 0);
    int32_t line = base_y(&FONT_B,y,font), x = cv_text(cx-width/2,line,font,num,c);
    if (unit[0]) cv_text(x+1,base_y(font,line,&FONT_XS),&FONT_XS,unit,C_GRAY);
}

/* what the knob strip shows, hashed: it is only redrawn when this changes (the arcs cost a
 * square root and an arctangent per pixel; most frames nothing in the strip moves) */
/* Schematic filter response: real mode/cutoff/resonance, not an audio plot.
 * Direct filter edits may legitimately leave the DJF macro pot unchanged. */
static void filter_display(uint8_t *mode,uint8_t *cut,int *res)
{
    /* Motion lanes and macro writes can override one another. Read the applied
     * pots rather than guessing precedence from stored project values. */
    *mode=(uint8_t)engine_master_get(MST_MODE);
    *cut=(uint8_t)engine_master_get(MST_CUTOFF);
    *res=engine_master_get(MST_RESO);
}
static UI_DRAW void filter_glyph(int cx,int y,int mode,int cutoff,int resonance,uint16_t col)
{
    int left=cx-19,right=cx+19,pivot=left+7+cutoff*24/127;
    int pass=y+8,floor=y+18,peak=pass-resonance*7/127;
    cv_rect(left,floor,39,1,C_LINE);
    if(!mode) {cv_rect(left,y+10,39,1,C_DIM);return;}
    if(mode==1) {
        cv_line(left,pass,pivot-4,pass,col);cv_line(pivot-4,pass,pivot,peak,col);
        cv_line(pivot,peak,pivot+6,floor,col);cv_line(pivot+6,floor,right,floor,col);
    } else if(mode==3) {
        cv_line(left,floor,pivot-6,floor,col);cv_line(pivot-6,floor,pivot,peak,col);
        cv_line(pivot,peak,pivot+4,pass,col);cv_line(pivot+4,pass,right,pass,col);
    } else {
        cv_line(left,floor,pivot-6,floor,col);cv_line(pivot-6,floor,pivot,peak,col);
        cv_line(pivot,peak,pivot+6,floor,col);cv_line(pivot+6,floor,right,floor,col);
    }
}
static uint8_t tape_glyph_phase, tape_glyph_running;
static uint32_t tape_glyph_at;
static void tape_glyph_tick(void)
{
    uint32_t now = plat_ms();
    uint8_t active = engine_tape_active();
    if (active && tape_glyph_running) {
        uint32_t steps = (now - tape_glyph_at) / 80u;
        tape_glyph_phase = (uint8_t)((tape_glyph_phase + steps) % 16u);
        tape_glyph_at += steps * 80u;
    } else tape_glyph_at = now;
    tape_glyph_running = active;
}
static uint8_t tempo_glyph_view; /* latched once for signature + complete knob strip */
static UI_DRAW int perform_glyph(pref_t r,int val,int cx,uint16_t col)
{
    if(r.kind==R_TEMPO) {
        cv_line(cx-10,47,cx-4,28,col);cv_line(cx-4,28,cx+4,28,col);cv_line(cx+4,28,cx+10,47,col);
        int phase=tempo_glyph_view?tempo_glyph_view-1:0;
        int arm=tempo_glyph_view?(phase<16?phase-8:24-phase):0;
        cv_line(cx-10,47,cx+10,47,col);
        cv_line(cx,43,cx+arm,30,tempo_glyph_view?C_WHITE:C_GRAY);
        cv_rect(cx+arm*3/4-2,32,5,3,col);
        if(tempo_glyph_view && phase<4) cv_rect(cx-2,45,5,2,C_WHITE);
    } else if(r.kind==R_SWING) {
        int middle=cx+val*7/127;
        cv_rect(cx-18,43,37,1,C_LINE);
        cv_rect(cx-18,30,3,14,col);cv_rect(middle,34,3,10,col);cv_rect(cx+16,30,3,14,col);
    } else if(r.kind==R_ENG && r.a==T_MST && r.c==MST_DJF) {
        uint8_t mode,cut;int res;filter_display(&mode,&cut,&res);filter_glyph(cx,28,mode,cut,res,col);
    } else if(r.kind==R_ENG && r.a==T_MST && r.c==MST_PUMP) {
        int depth=val*14/127;
        cv_line(cx-18,31,cx-9,31,col);cv_line(cx-9,31,cx-6,31+depth,col);
        cv_line(cx-6,31+depth,cx+15,31,col);cv_rect(cx+15,31,4,1,col);
        cv_rect(cx-18,48,37,1,C_LINE);
    } else return 0;
    return 1;
}

/* Shared parameter schematics from the owner-requested card vocabulary. These
 * show control values, never measured audio; labels/units below stay authoritative.
 * One dispatcher serves every ordinary knob strip. SOUND retains its matrix. */
static UI_DRAW float comp_glyph_output(int value,float input)
{
 uint8_t threshold,ratio,makeup;
 static const float ratios[]={1,1.5f,2,3,4,6};
 master_comp1_pots(value,&threshold,&ratio,&makeup);
 float t=-48.0f+48.0f*threshold/127.0f,over=input-t,slope=1.0f-1.0f/ratios[ratio],gr=0;
 if(over>=3)gr=slope*over;
 else if(over>-3)gr=slope*(over+3)*(over+3)/12.0f;
 return input-gr; /* Compression shape before makeup, not measured audio. */
}
static UI_DRAW int semantic_amount_glyph(pref_t r,int val,int cx,uint16_t col)
{
 const x0x_param_t *d=pref_desc(r);int q=d&&d->max?(val*127+d->max/2)/d->max:0,left=cx-18;
 if(r.kind==R_ENG && r.a==T_MST && r.c==MST_COMP1) {
  int py=48;
  cv_line(left,48,cx+18,28,C_LINE);
  for(int i=1;i<=36;i++) {
   float input=-48.0f+48.0f*i/36.0f;
   int y=48-(int)((comp_glyph_output(val,input)+48)*20/48+0.5f);
   cv_line(left+i-1,py,left+i,y,col);py=y;
  }
 } else if(r.kind==R_ENG && r.a==T_FX && r.c==FX_DL_FDBK) {
  float amp=10,feedback=(pref_get(PR(R_ENG,T_FX,0,FX_DL_TYPE))?1.15f:0.85f)*q/127.0f;
  for(int j=0;j<4;j++) {int h=(int)(amp+0.5f);if(h)cv_rect(left+3+j*10,47-h,2,h,col);amp*=feedback;}
  cv_rect(left,48,37,1,C_LINE);
 } else if(r.kind==R_SREP) {
  for(int j=0;j<8;j++)cv_rect(left+j*5,34,3,9,j<=val?col:C_LINE);
 } else if(r.kind==R_ENG && ((r.a==T_FX && (r.c==FX_RV_LEVEL || r.c==FX_DL_LEVEL)) || (r.a==T_MIX && (r.c==MX_REV || r.c==MX_DLY)) || name_is(d,"Rev") || name_is(d,"Dly"))) {
  int delay=(r.a==T_FX && r.c==FX_DL_LEVEL)||(r.a==T_MIX && r.c==MX_DLY)||name_is(d,"Dly");
  cv_rect(left,48,37,1,C_LINE);
  if(delay)for(int j=0;j<4;j++){int h=((16-j*3)*q+126)/127;if(h)cv_rect(left+3+j*10,47-h,2,h,col);}
  else for(int j=0;j<7;j++){int h=((2+j*2)*q+126)/127;if(h)cv_rect(left+j*6,38-h/2,2,h,col);}
 } else return 0;
 return 1;
}

static UI_DRAW int glyph_identity_index(int count,int val){if(count<=0)return -1;if(count<=8)return val;return val*7/(count-1);}
static UI_DRAW void glyph_identity(int count,int val,int l,uint16_t col){int n=count>8?8:count,selected=glyph_identity_index(count,val);for(int j=0;j<n;j++)rbox(l+(j%4)*10,30+j/4*10,7,7,1,j==selected?col:C_LINE);if(!count)cv_rect(l+12,38,13,1,C_LINE);}

/* Qualitative parameter schematics: ordinal TIME spacing, not a measured beat/ms axis. */
/* Fixed-phase sinusoid progressively flattened toward square as stored DRIVE rises.
 * Qualitative amount icon, not measured audio or selected distortion transfer. */
static UI_DRAW void drive_amount_glyph(int val,int cx,uint16_t col){
 static const int16_t wave[37]={0,5690,11207,16383,21062,25101,28377,30791,32269,32767,32269,30791,28377,25101,21062,16384,11207,5690,0,-5690,-11207,-16384,-21062,-25101,-28377,-30791,-32269,-32767,-32269,-30791,-28377,-25101,-21062,-16383,-11207,-5690,0};
 int py=38,gain=18161/(143-val);
 for(int x=0;x<=36;x++){
  int a=wave[x]*gain/127;if(a>32767)a=32767;if(a< -32767)a=-32767;
  int h=((a<0?-a:a)*8+16383)/32767;int y=38+(a<0?h:-h);
  if(x)cv_line(cx-19+x,py,cx-18+x,y,col);
  py=y;
 }
}
static UI_DRAW void loop_identity_glyph(int count,int val,int cx,uint16_t col){
 int n=count>8?8:count,selected=glyph_identity_index(count,val);
 if(!count){cv_rect(cx-6,38,13,1,C_LINE);return;}
 int rows=(n+3)/4;
 for(int row=0;row<rows;row++){int nr=n-row*4;if(nr>4)nr=4;int left=cx-(nr*10-3)/2,y=rows==1?35:30+10*row;
 for(int k=0;k<nr;k++)rbox(left+k*10,y,7,7,1,row*4+k==selected?col:C_LINE);}
}

static UI_DRAW int all_glyph_semantics(pref_t r,int val,int cx,uint16_t col){
 const x0x_param_t*d=pref_desc(r);int q=d&&d->max?(val*127+d->max/2)/d->max:0,l=cx-18;
 if(r.kind==R_ENG&&r.a==T_FX&&r.c==FX_DL_TIME){
  static const int gap[13]={2,3,4,4,5,5,6,6,7,8,8,9,10};int g=gap[val<13?val:0];
  cv_rect(l,48,37,1,C_LINE);cv_rect(l,29,2,18,col);
  for(int x=l+g;x<=cx+18;x+=g)cv_rect(x,35,1,12,col);
  cv_line(l,50,l+g,50,col);
 }else if(r.kind==R_ENG&&r.a==T_FX&&r.c==FX_RV_DECAY){
  float a=18,fb=.2f+.73f*q/127;
  cv_rect(l,48,37,1,C_LINE);
  for(int j=0;j<7;j++){int h=(int)(a+.5f);if(h)cv_rect(l+j*6,47-h,2,h,col);a*=fb;}
 }else if(r.kind==R_SPAT||r.kind==R_BRKSLOT||r.kind==R_SBAR){
  if(r.kind==R_BRKSLOT)loop_identity_glyph(engine_brk_nslots(),val,cx,col);
  else glyph_identity(d->max+1,val,l,col);
 }else if(r.kind==R_TAPE){
  if(val<16){cv_line(l,43,l+8,43,col);cv_line(l+8,43,l+8,33,col);cv_line(l+8,33,l+18,33,col);cv_line(l+18,33,l+18,43,col);cv_line(l+18,43,l+28,43,col);cv_line(l+28,43,l+28,33,col);cv_line(l+28,33,l+36,33,col);}
  else{for(int s=-1;s<=1;s+=2){int x=cx+s*10;rbox(x-7,30,15,15,5,C_LINE);rbox(x-5,32,11,11,4,SOUND_FACE);cv_rect(x-1,36,3,3,col);static const int8_t dx[16]={0,2,3,4,4,4,3,2,0,-2,-3,-4,-4,-4,-3,-2};static const int8_t dy[16]={-4,-4,-3,-2,0,2,3,4,4,4,3,2,0,-2,-3,-4};cv_line(x,37,x+dx[tape_glyph_phase],37+dy[tape_glyph_phase],col);}cv_rect(l+2,48,33,1,C_LINE);int wear=(val-16)*32/111;cv_rect(l+2,47,1+wear,2,col);}
 }else if(r.kind==R_ENG&&r.a==T_FX&&r.c==FX_DRIVE){
  drive_amount_glyph(val,cx,col);
 }else return 0;return 1;
}

static UI_DRAW int control_glyph(pref_t r,int val,int cx,uint16_t col)
{
    const x0x_param_t *d=pref_desc(r);
    int q=d && d->max?(val*127+d->max/2)/d->max:0, left=cx-18, right=cx+18;
    if(q<0)q=0;
    if(q>127)q=127;
    if(all_glyph_semantics(r,val,cx,col))return 1;
    if(semantic_amount_glyph(r,val,cx,col))return 1;
    if(is_pan(r) || r.kind==R_BTRANS ||
       (r.kind==R_ENG && ((r.a==T_BRK && r.c==1) ||
                          (r.a==T_MST && r.c==MST_DJF)))) {
        int at=left+q*36/127;
        cv_rect(left,38,37,1,C_LINE);cv_rect(cx,32,1,13,C_GRAY);
        cv_rect(left,35,1,7,C_GRAY);cv_rect(right,35,1,7,C_GRAY);
        cv_rect(at-1,34,3,9,col);
    } else if(r.kind==R_DLEN || r.kind==R_BLEN || r.kind==R_SLEN || r.kind==R_SBAR || r.kind==R_SPAT || r.kind==R_BRKSLOT) {
        for(int j=0;j<8;j++) {
            int x=left+(j%4)*10,y=30+(j/4)*10;
            rbox(x,y,7,7,1,j<=q*7/127?col:C_LINE);
        }
    } else if(r.kind==R_DRATE || r.kind==R_BRATE) {
        cv_rect(left,38,37,1,C_LINE);
        static const uint8_t gaps[4]={12,8,6,16}; /* 1/16, 1/16T, 1/32, 1/8T */
        int gap=gaps[(unsigned)val<4?(unsigned)val:0];
        for(int x=left+1;x<=right;x+=gap)cv_rect(x,31,2,15,col);
    } else if(r.kind==R_BDIR) {
        if(val==3) { /* existing random direction, not an invented trajectory */
            cv_line(left,43,cx-7,31,col);cv_line(cx-7,31,cx+7,44,col);cv_line(cx+7,44,right,33,col);
        } else {
            cv_rect(left,38,37,1,col);
            if(val!=1){cv_line(right-6,32,right,38,col);cv_line(right,38,right-6,44,col);}
            if(val!=0){cv_line(left+6,32,left,38,col);cv_line(left,38,left+6,44,col);}
        }
    } else if(r.kind==R_TAPE) {
        for(int side=-1;side<=1;side+=2) {
            int x=cx+side*10;
            rbox(x-7,30,15,15,5,C_LINE);rbox(x-5,32,11,11,4,SOUND_FACE);
            cv_line(x,37,x+q*4/127,33,col);cv_rect(x-1,36,3,3,col);
        }
        cv_rect(cx-10,46,21,1,col);
    } else if(r.kind==R_SREP || (r.kind==R_ENG && ((r.a==T_FX && (r.c==FX_DL_TIME || r.c==FX_DL_FDBK || r.c==FX_DL_LEVEL)) || (r.a==T_MIX && r.c==MX_DLY) || name_is(d,"Dly")))) {
        for(int j=0;j<4;j++) {
            int h=16-j*(4-q*3/127);
            cv_rect(left+3+j*10,47-h,3,h,col);
        }
        cv_line(left+3,29,right,29,C_GRAY);cv_line(left+3,29,left+7,26,C_GRAY);
    } else if(r.kind==R_ENG && ((r.a==T_FX && (r.c==FX_RV_DECAY || r.c==FX_RV_LEVEL)) || (r.a==T_MIX && r.c==MX_REV) || name_is(d,"Rev"))) {
        for(int j=0;j<7;j++) {int h=2+j*(q+32)/64;if(h>18)h=18;cv_rect(left+j*6,38-h/2,2,h,col);}
    } else if(r.kind==R_ENG && r.a==T_FX && (r.c==FX_RV_TONE || r.c==FX_DL_TONE || r.c==FX_RV_HPF)) {
        int pivot=left+7+q*20/127;
        cv_rect(left,47,37,1,C_LINE);cv_line(left,32,pivot,32,col);cv_line(pivot,32,right,46,col);
    } else if(r.kind==R_ENG && r.a==T_MST && r.c==MST_COMP1) {
        cv_line(left,47,cx,36,col);cv_line(cx,36,right,36-q*8/127,col);
        cv_rect(left,49,37,1,C_LINE);
    } else if(r.kind==R_ENG && r.a==T_FX && r.c==FX_DRIVE) {
        int flat=2+q*8/127;
        cv_line(left,38,cx-flat,30,col);cv_line(cx-flat,30,cx-2,30,col);
        cv_line(cx-2,30,cx+2,46,col);cv_line(cx+2,46,cx+flat,46,col);cv_line(cx+flat,46,right,38,col);
    } else if(d && d->names && d->max<12) {
        return 0; /* Named switches retain exact position pips. */
    } else {
        /* Neutral value scale for parameters without a dedicated schematic.
         * No faux rotary knob, invented response curve, or new control. */
        for(int j=0;j<7;j++) {
            int h=3+j*2;
            cv_rect(left+j*6,47-h,3,h,q && j*127/6<=q?col:C_LINE);
        }
        int at=left+q*36/127;
        cv_rect(left,49,37,1,C_LINE);cv_rect(at,48,1,3,col);
    }
    return 1;
}

/* Original Chicago/Miami controls without a PART glyph reuse the existing
 * knob-strip families: tone-lowpass, DJF filter peak, drive, bipolar, pips
 * and the neutral value scale. Strip coordinates (y 28..50); caller offsets. */
static UI_DRAW int orig_strip_slot(pref_t r)
{
    if(r.kind!=R_ENG || r.a!=T_303) return 0;
    int b=engine_bass_sound_bank(&proj.sound,r.b);
    if(b==ORIGINAL_SOUND_CHICAGO) return r.c>=1 && (r.c<=6 || r.c==11 || r.c==12 || r.c==15 || r.c==17);
    if(b==ORIGINAL_SOUND_MIAMI) return r.c>=1 && r.c<=15 && r.c!=6 && r.c!=11;
    return 0;
}
/* Original-control glyphs, 26x19 at (gx,gy). Each one pictures what the control
 * does and moves with the value. CUTOFF/PEAK follow filter_glyph and BITE
 * follows drive_amount_glyph (the old knob-strip families), scaled to the cell. */
#define OG_W 26
#define OG_H 18

/* Qualitative effect identities in the existing 26x19 box. The short name
 * beside each picture remains authoritative; these are not measured DSP plots. */
static UI_DRAW void orig_fx_glyph(int type,int gx,int gy,uint16_t col)
{
    int right=gx+OG_W-1,bot=gy+OG_H,mid=gy+OG_H/2;
    switch(type) {
    case 0: /* bypass */
        cv_line(gx,mid,right,mid,col);cv_line(gx+10,gy+2,gx+15,bot-2,col);break;
    case 1: case 7: { /* chorus pair / ensemble trio */
        int n=type==7?3:2;
        for(int row=0;row<n;row++) {
            int y=gy+(n==3?3+row*5:5+row*7),py=y;
            for(int k=1;k<=4;k++) {
                int x=gx+k*6,yy=y+(k&1?2:-2);
                cv_line(gx+(k-1)*6,py,x,yy,col);py=yy;
            }
        }
        break;
    }
    case 2: /* phaser notches */
        cv_line(gx,gy+5,gx+3,gy+5,col);
        for(int i=0;i<2;i++) {
            int x=gx+3+i*10;
            cv_line(x,gy+5,x+4,bot-2,col);cv_line(x+4,bot-2,x+8,gy+5,col);
            cv_line(x+8,gy+5,i?right:x+10,gy+5,col);
        }
        break;
    case 3: /* ring modulation: alternating lobes under an amplitude envelope */
        for(int i=0;i<6;i++) {
            int x=gx+i*4,h=i<3?2+i*2:12-i*2;
            cv_line(x,mid,x+2,mid+(i&1?h:-h),col);
            cv_line(x+2,mid+(i&1?h:-h),x+4,mid,col);
        }
        break;
    case 4: /* compressor knee */
        cv_line(gx,bot,gx+11,gy+7,col);cv_line(gx+11,gy+7,right,gy+3,col);break;
    case 5: /* decimator steps */
        for(int i=0;i<4;i++) {
            int x=gx+i*6,y=gy+15-i*4;
            cv_line(x,y,x+6,y,col);if(i<3)cv_line(x+6,y,x+6,y-4,col);
        }
        break;
    case 6: /* EQ peak */
        cv_line(gx,mid,gx+6,mid,col);cv_line(gx+6,mid,gx+12,gy+2,col);
        cv_line(gx+12,gy+2,gx+18,mid,col);cv_line(gx+18,mid,right,mid,col);break;
    case 8: /* short delay taps */
        for(int i=0;i<3;i++)cv_rect(gx+i*9,bot-12+i*4,2,12-i*4,col);
        cv_line(gx,bot,right,bot,col);break;
    case 9: /* BPM delay: clock plus taps */
        cv_line(gx,gy+3,gx+8,gy+3,col);cv_line(gx+8,gy+3,gx+8,gy+11,col);
        cv_line(gx+8,gy+11,gx,gy+11,col);cv_line(gx,gy+11,gx,gy+3,col);
        cv_line(gx+4,gy+5,gx+4,gy+7,col);cv_line(gx+4,gy+7,gx+6,gy+7,col);
        for(int i=0;i<3;i++)cv_rect(gx+12+i*6,bot-12+i*4,1,12-i*4,col);
        cv_line(gx,bot,right,bot,col);break;
    case 10: /* hall: room walls and diffuse reflections */
        cv_line(gx,bot,gx,gy+2,col);cv_line(gx,gy+2,right,gy+2,col);cv_line(right,gy+2,right,bot,col);
        for(int i=0;i<5;i++)cv_rect(gx+3+i*4,gy+5+i,1,10-i*2,col);
        break;
    case 11: /* reverb cut off at a gate */
        for(int i=0;i<4;i++)cv_rect(gx+i*5,gy+3+i*2,2,12-i*2,col);
        cv_rect(gx+20,gy+1,2,17,col);cv_line(gx+22,bot,right,bot,col);break;
    default: break;
    }
}
static float og_shift;                           /* live LFO: the wave scrolls by this much of t */
static UI_DRAW void og_wave(int gx,int gy,float (*f)(float,float),float q,uint16_t col)
{   /* f returns -1..1 (up positive) over t 0..1 */
    int py=0;
    cv_rect(gx,gy+OG_H,OG_W,1,C_LINE);
    for(int i=0;i<OG_W;i++) {
        float v=f((float)i/(OG_W-1)+og_shift,q);
        if(v>1)v=1; if(v<-1)v=-1;
        int yy=gy+OG_H/2-(int)(v*6.0f+(v<0?-.5f:.5f));
        if(i) cv_line(gx+i-1,py,gx+i,yy,col);
        py=yy;
    }
}
static float og_sin(float t,float k){return fm_sinf(6.2831853f*t*k);}
static float og_lfo_amp(float t,float q){return (.1f+.9f*q)*fm_sinf(6.2831853f*t*2.0f);}
static float og_lfo_rate(float t,float q){return fm_sinf(6.2831853f*t*(1.0f+4.0f*q));}
static float og_bite(float t,float q){float g=.3f+6.0f*q;return fm_tanhf(g*og_sin(t,1.5f))/fm_tanhf(g);}
static float og_gnaw(float t,float q){float v=og_sin(t,1.5f)*(1.0f+3.0f*q);
    while(v>1||v<-1) v=v>1?2-v:-2-v; return v;}             /* wavefolder */
static float og_crush(float t,float q){int n=12-(int)(q*10+.5f);float v=og_sin((float)((int)(t*(26-q*20))) /(26-q*20),1.5f);
    return (float)(int)(v*n+(v<0?-.5f:.5f))/(float)n;}       /* sample-rate + bit reduction */
static float og_fm(float t,float q){return fm_sinf(6.2831853f*(1.5f*t)+q*1.6f*fm_sinf(6.2831853f*1.5f*t));}
static UI_DRAW int og_states(pref_t r,int val,int *idx)
{   /* number of distinct readouts and the index of val among them */
    char a[16],u[8],prev[16]="";int n=0;*idx=0;
    for(int v=0;v<=127;v++){pref_value_of(r,v,a,u);if(strcmp_s(a,prev)){n++;put_s(prev,a);}if(v==val)*idx=n-1;}
    return n;
}
/* Chicago ENV glyph: the knee column for a filter position z (0..1). The knee
 * travels gx+2..gx+OG_W-1-ENV_FALL (19 of 26 px), so a full EG is clear to see. */
#define ENV_FALL 4
static int env_knee_x(int gx,float z)
{ z=(z+.5f)*.5f; /* bipolar: cutoff+EG*ENV spans -0.5..1.5, CUTOFF 50% sits mid-cell */
  z=z<0?0:z>1?1:z; return gx+2+(int)(z*(OG_W-3-ENV_FALL)+.5f); }
static UI_DRAW void orig_strip_glyph(pref_t r,int val,int gx,int gy,uint16_t col)
{
    const x0x_param_t *d=pref_desc(r);
    float q=d && d->max?(float)val/(float)d->max:0;
    int chi=engine_bass_sound_bank(&proj.sound,r.b)==ORIGINAL_SOUND_CHICAGO,c=r.c;
    int level_role=c==(chi?12:14) || (!chi && (c==1 || c==5));
    int top=gy+3,bot=gy+OG_H,mid=gy+OG_H/2,right=gx+OG_W-1;
    if(q<0)q=0; if(q>1)q=1;
    float amp=0,mod=0; unsigned state=6,held=0;
    int sounding=engine_bass_voice_view(r.b,&amp,&mod,&state,&held) && state!=6;
    if(amp<0)amp=0; if(amp>1)amp=1;
    if(c==(chi?2:9) || (chi && c==3)) {          /* CUTOFF / PEAK: lowpass response */
        float cq=q,pq=0;
        if(chi && c==3){pref_t cr=PR(R_ENG,T_303,r.b,2);const x0x_param_t *dc=pref_desc(cr);
            cq=dc&&dc->max?(float)matrix_value(cr)/dc->max:0;pq=q;}
        int pivot=gx+4+(int)(cq*14+.5f),peak=top+2-(int)(pq*5+.5f);
        cv_rect(gx,bot,OG_W,1,C_LINE);
        cv_line(gx,top+2,pivot-3,top+2,col);cv_line(pivot-3,top+2,pivot,peak,col);
        cv_line(pivot,peak,pivot+6>right?right:pivot+6,bot,col);
        if(pivot+6<right) cv_line(pivot+6,bot,right,bot,col);
    } else if(chi && c==4) {                     /* ENV: the lowpass knee the filter EG sweeps */
        /* chicago_voice.c mp4_prepare: z = cutoff + vcf.level * env_depth. The knee
         * and its resonance bump move LEFT/RIGHT only: x = live CUTOFF + EG x ENV.
         * The bump height is the live PEAK and never follows the EG. A dim tick
         * marks where a full EG takes the knee. */
        pref_t cr=PR(R_ENG,T_303,r.b,2),pr=PR(R_ENG,T_303,r.b,3);
        const x0x_param_t *dc=pref_desc(cr),*dp=pref_desc(pr);
        float cq=dc&&dc->max?(float)matrix_value(cr)/dc->max:0,pq=dp&&dp->max?(float)matrix_value(pr)/dp->max:0;
        float depth=2*q-1,eg=0,dd; if(engine_bass_filter_view(r.b,&eg,&dd)) depth=dd;
        if(eg<0)eg=0; if(eg>1)eg=1; if(pq<0)pq=0; if(pq>1)pq=1;
        int pivot=env_knee_x(gx,cq+eg*depth),tgt=env_knee_x(gx,cq+depth),pass=top+3;
        int peak=pass-1-(int)(pq*5+.5f);         /* fixed by PEAK: 1..6 px above the passband */
        int energy=(int)(eg*(depth<0?-depth:depth)*6.0f+.5f);
        col=depth<0?blend(C_LINE,col,16-energy):blend(col,C_WHITE,energy);
        cv_rect(gx,bot,OG_W,1,C_LINE);
        if(tgt!=pivot) cv_rect(tgt,bot-3,1,3,C_LINE);
        if(pivot-2>gx) cv_line(gx,pass,pivot-2,pass,col);
        cv_line(pivot-2,pass,pivot,peak,col);
        cv_line(pivot,peak,pivot+ENV_FALL,bot,col);
        if(pivot+ENV_FALL<right) cv_line(pivot+ENV_FALL,bot,right,bot,col);
    } else if(c==(chi?1:4)) {                    /* GLIDE: sloped pitch line, slope widens */
        /* Live: a dot rides the slope as the oscillator pitch glides to the new
         * note (current -> target from the engine); the travelled part is lit. */
        static float from[NBASS],to[NBASS]; static uint8_t seen[NBASS];
        int w=1+(int)(q*18+.5f),x0=gx+(OG_W-1-w)/2,b=r.b<NBASS?r.b:0,on=0;
        float ph,bi,cu=0,tg=0,f=1;
        if(engine_bass_motion_view(b,&ph,&bi,&cu,&tg,&on)) {
            if(!seen[b] || tg!=to[b]) { from[b]=seen[b]?cu:tg; to[b]=tg; seen[b]=1; }
            if(to[b]!=from[b]) f=(cu-from[b])/(to[b]-from[b]);
        }
        if(f<0)f=0; if(f>1)f=1;
        int dx=x0+(int)(f*w+.5f),dy=bot-1-(int)(f*(bot-1-top)+.5f);
        if(f>=1) { cv_line(gx,bot-1,x0,bot-1,col);cv_line(x0,bot-1,x0+w,top,col);cv_line(x0+w,top,right,top,col); }
        else {
            cv_line(gx,bot-1,x0,bot-1,col);cv_line(x0,bot-1,dx,dy,col);
            cv_line(dx,dy,x0+w,top,C_LINE);cv_line(x0+w,top,right,top,C_LINE);
            cv_rect(dx-1,dy-1,3,3,C_WHITE);
        }
    } else if(chi && c==5) og_wave(gx,gy,og_bite,q,col);       /* BITE: soft clip */
    else if(chi && c==6) og_wave(gx,gy,og_gnaw,q,col);         /* GNAW: fold */
    else if(!chi && c==10) og_wave(gx,gy,og_crush,q,col);      /* CRUSH: bit/rate crush */
    else if(chi && c==11) {                      /* ENV/GATE toggle */
        int idx; og_states(r,val,&idx);
        cv_rect(gx,bot,OG_W,1,C_LINE);
        if(idx){cv_line(gx+2,bot,gx+2,top,col);cv_line(gx+2,top,gx+22,top,col);cv_line(gx+22,top,gx+22,bot,col);}
        else{cv_line(gx+1,bot,gx+5,top,col);cv_line(gx+5,top,gx+10,mid,col);cv_line(gx+10,mid,gx+18,mid,col);cv_line(gx+18,mid,gx+24,bot,col);}
    } else if(level_role) {                     /* LEVEL / OUTPUT: live segmented meter */
        int ceiling=(int)(q*6.0f+.5f),lit=sounding?(int)(q*amp*6.0f+.5f):0;
        cv_rect(gx,bot,OG_W,1,C_LINE);
        for(int i=0;i<6;i++) {
            uint16_t ink=i<lit?C_WHITE:i<ceiling?(sounding?blend(C_LINE,col,6):col):C_LINE;
            cv_rect(gx+i*4,bot-3-i*2,3,2,ink);
        }
    } else if(chi && c==15) {                    /* RANGE: octave stairs */
        int idx,n=og_states(r,val,&idx),sw=OG_W/(n?n:1);
        for(int k=0;k<n;k++){int h=3+k*(OG_H-3)/(n>1?n-1:1);cv_rect(gx+k*sw,bot-h+1,sw-2,h,k<=idx?col:C_LINE);}
    } else if(chi && c==17) {                    /* FX TYPE: recognizable effect picture */
        orig_fx_glyph(val,gx,gy,col);
    } else if(!chi && c==2) {                    /* SUB: osc square + sub-octave square */
        int a=1+(int)(q*6+.5f);
        for(int i=0;i<4;i++){int xx=gx+i*6;cv_line(xx,top,xx+3,top,C_LINE);cv_line(xx+3,top,xx+3,top+4,C_LINE);cv_line(xx+3,top+4,xx+6,top+4,C_LINE);cv_line(xx+6,top+4,xx+6,top,C_LINE);}
        for(int i=0;i<2;i++){int xx=gx+i*12;cv_line(xx,bot-a,xx+6,bot-a,col);cv_line(xx+6,bot-a,xx+6,bot,col);cv_line(xx+6,bot,xx+12,bot,col);if(xx+12<right)cv_line(xx+12,bot,xx+12,bot-a,col);}
    } else if(!chi && (c==3 || c==7)) {          /* PITCH / TUNE: centre needle */
        float ang=(q*2-1)*1.05f; int px=gx+12,py=bot;
        cv_rect(px,top-2,1,2,C_LINE);cv_rect(gx+1,bot,OG_W-2,1,C_LINE);
        cv_line(px,py,px+(int)(fm_sinf(ang)*12),py-(int)(fm_cosf(ang)*14),col);
    } else if(!chi && c==8) og_wave(gx,gy,og_fm,q,col);        /* XMOD DEPTH: FM wave */
    else if(!chi && (c==12 || c==13)) {          /* WOBBLE depth / RATE: the live MG1 scrolls the wave */
        float ph=0,bi=0,cu,tg; int on=0; float cyc=c==12?2.0f:1.0f+4.0f*q;
        if(!engine_bass_motion_view(r.b,&ph,&bi,&cu,&tg,&on) || ph<-1 || ph>1) ph=-1;
        og_shift=((ph+1)*.5f)/cyc;               /* one MG cycle = one drawn cycle */
        og_wave(gx,gy,c==12?og_lfo_amp:og_lfo_rate,q,col);
        {   float v=(c==12?og_lfo_amp:og_lfo_rate)(1.0f+og_shift,q); if(v>1)v=1; if(v<-1)v=-1;
            int yy=gy+OG_H/2-(int)(v*6.0f+(v<0?-.5f:.5f)); /* og_wave scale */
            cv_rect(right-1,yy-1,2,3,on?C_WHITE:col); }   /* "now": the wobble's present value */
        og_shift=0;
    } else if(!chi && c==15) {                     /* STEREO: L/R spread */
        int s=1+(int)(q*10+.5f),cx=gx+12;
        cv_rect(cx,top,1,OG_H-3,C_LINE);
        cv_rect(cx-s-1,mid-4,2,9,col);cv_rect(cx+s,mid-4,2,9,col);
    } else {                                     /* last resort: 7-bar scale */
        for(int j=0;j<7;j++){int h=3+j*2;cv_rect(gx+j*4,bot-h,2,h,q && j*127/6<=q*127?col:C_LINE);}
    }
    if(sounding && !(chi && c==4) && !level_role) {
        /* Three sparse level pips follow actual VCA; a separate modulator cursor
         * follows the native MG, never wall-clock phase. */
        int n=(int)(amp*3.0f+.5f);
        for(int i=0;i<n;i++) cv_rect(gx+2+i*4,bot-1,2,1,C_WHITE);
        if(!chi && (c==8 || c==12 || c==13)) {
            if(mod<0)mod=0; if(mod>1)mod=1;
            cv_rect(gx+1+(int)(mod*23.0f+.5f),gy+1,1,2,C_WHITE);
        }
    }
}

/* ---- 909 / 808 part-page glyphs --------------------------------------------
 * Each one pictures what the control does in the engine, follows the value
 * with the engine's own scaling, and moves with the voice on every hit:
 * drum_live() reads the track's real amplitude envelope (909: the voice EG;
 * 808: the lane's output over its hit peak) and the ms since the hit. Same
 * 26x19 cell as orig_strip_glyph; the caller draws the readout right of it. */
enum { DG_NONE, DG_DECAY, DG_NTAIL, DG_TUNE, DG_BDSWEEP, DG_ATTACK, DG_LPF, DG_SHELLS, DG_SNAPPY, DG_SOUND, DG_ACCENT, DG_LEVEL };
static UI_DRAW int drum_strip_role(pref_t r)
{
    if(r.kind!=R_ENG || (r.a!=T_909 && r.a!=T_808)) return DG_NONE;
    const x0x_param_t *d=pref_desc(r);
    int k9=r.a==T_909;
    if(!d) return DG_NONE;
    if((ui.view==V_MIX || ui.view==V_PART) && r.b<NDRUM && name_is(d,"Level")) return DG_LEVEL;
    if(ui.view!=V_PART) return DG_NONE;
    if(r.b==NDRUM) return name_is(d,"Accent")||name_is(d,"Veloc")?DG_ACCENT:DG_NONE;
    if(k9 && r.b==0 /* BD */ && (name_is(d,"Tune")||name_is(d,"P.Dpth")||name_is(d,"Pitch"))) return DG_BDSWEEP;
    if(name_is(d,"Decay")||name_is(d,"Tail")) return DG_DECAY;
    if(name_is(d,"Tune")) return DG_TUNE;
    if(name_is(d,"Attack")) return DG_ATTACK;
    if(name_is(d,"Snappy")) return DG_SNAPPY;
    if(name_is(d,"Sound") && d->names) return DG_SOUND;
    if(name_is(d,"Tone")) return k9?(r.b==1 /* SD */?DG_NTAIL:DG_NONE):r.b==0?DG_LPF:r.b==1?DG_SHELLS:DG_NONE;   /* tracks 0 BD, 1 SD in both kits */
    return DG_NONE;
}
/* the track's live state; the kit cells follow the newest hit of the kit */
static UI_DRAW int drum_live(pref_t r,uint32_t *age,float *env)
{
    int kit=r.a==T_808;
    *age=0xffffffffu; *env=0;
    if(r.b!=NDRUM) return engine_drum_view(kit,r.b,age,env);
    int any=0;
    for(int k=0;k<NDRUM;k++){uint32_t a;float e;if(engine_drum_view(kit,k,&a,&e)&&a<*age){*age=a;*env=e;any=1;}}
    return any;
}
static UI_DRAW float dg_si(pref_t r,int c,int pot){float x=0;(void)engine_param_si(r.a,r.b,c,pot,&x);return x;}
/* where the value sits in its range on the engine's own axis: log for Hz/ms/ratio */
static UI_DRAW float dg_pos(pref_t r,int val)
{
    const x0x_param_t *d=pref_desc(r);
    float x=0; int u=engine_param_si(r.a,r.b,r.c,val,&x);
    if(u==X0X_U_HZ||u==X0X_U_MS||u==X0X_U_S||u==X0X_U_RATIO){
        float lo=dg_si(r,r.c,0),hi=dg_si(r,r.c,d->max);
        if(lo>0 && hi>lo && x>0){float p=fm_log2f(x/lo)/fm_log2f(hi/lo);return p<0?0:p>1?1:p;}
    }
    return d && d->max?(float)val/d->max:0;
}
static UI_DRAW int dg_rnd(int i){uint32_t h=(uint32_t)i*2654435761u;h^=h>>13;return (int)(h%100u);}
/* an amplitude tail: full at the hit, -60 dB at xe px; live, the part already
 * played goes dim and a playhead stands at the voice's real level */
static UI_DRAW void dg_tail(int gx,int gy,int xe,int live,float e,int noisy,uint32_t seed,uint16_t col)
{   /* idle: the tail outline, -60 dB at xe. Live: a ghost of that outline, and the
     * part still to play, filled, slid to the left edge: it is e high and
     * (1 - log2(e)/-9.966) x xe long, so it shrinks both ways as the voice decays */
    int bot=gy+OG_H,H=OG_H-2;
    if(xe<2)xe=2; if(xe>OG_W-1)xe=OG_W-1;
    float sh=0;
    if(live){ if(e<0.001f)e=0.001f; sh=(float)xe*fm_log2f(e)/-9.966f; }
    cv_rect(gx,bot,OG_W,1,C_LINE);
    int h0=-1;
    for(int x=0;x<=xe;x++){
        float a=fm_exp2f(-9.966f*(float)x/(float)xe);
        int h=(int)(a*H+.5f);
        if(noisy) h=h*(40+dg_rnd(x*7+(int)seed))/140;
        if(h<1)h=1;
        uint16_t c=live?C_LINE:col;
        if(noisy && !live) cv_rect(gx+x,bot-h,1,h,c);
        else { cv_rect(gx+x,bot-h,1,1,c); if(h0>h+1) cv_rect(gx+x-1,bot-h0,1,h0-h,c); }
        h0=h;
    }
    if(!live) return;
    for(int x=0;(float)x<=(float)xe-sh;x++){
        float a=fm_exp2f(-9.966f*((float)x+sh)/(float)xe);
        int h=(int)(a*H+.5f);
        if(noisy) h=h*(40+dg_rnd((x+(int)sh)*7+(int)seed))/140;
        if(h>0) {
            cv_rect(gx+x,bot-h,1,1,col);
            if(x==0 || (noisy && x%5==0)) cv_rect(gx+x,bot-h,1,h,x?col:C_WHITE);
        }
    }
}
static UI_DRAW int dg_tail_px(float ms){if(ms<0)ms=0;if(ms>4000)ms=4000;return 2+(int)(23.0f*fm_sqrtf(ms/4000.0f)+.5f);}
#define DG_BACK_MS 300u
static UI_DRAW void drum_strip_glyph(pref_t r,int val,int gx,int gy,uint16_t col)
{
    const x0x_param_t *d=pref_desc(r);
    float q=d && d->max?(float)val/(float)d->max:0,e=0;
    uint32_t age=0xffffffffu;
    int live=drum_live(r,&age,&e),role=drum_strip_role(r);
    int top=gy+1,bot=gy+OG_H,mid=gy+OG_H/2,right=gx+OG_W-1;
    /* after the voice ends, the idle glyph comes back over DG_BACK_MS (ink fades in,
     * the wave regrows) instead of snapping from the last live frame */
    static uint32_t dg_last[2][NDRUM+1];
    uint32_t tnow=plat_ms(); float back=1.0f; int ki=r.a==T_808,vi=r.b>NDRUM?NDRUM:r.b;
    if(live) dg_last[ki][vi]=tnow|1u;
    else if(dg_last[ki][vi] && tnow-dg_last[ki][vi]<DG_BACK_MS){
        back=(float)(tnow-dg_last[ki][vi])/(float)DG_BACK_MS;
        if(role==DG_DECAY||role==DG_NTAIL||role==DG_BDSWEEP) col=blend(C_LINE,col,(int)(16.0f*back));   /* their live end is dim */
    }
    if(q<0)q=0; if(q>1)q=1;
    switch(role){
    case DG_DECAY: {                             /* DECAY / TAIL: the tail, as long as the real time */
        float x=0; int u=engine_param_si(r.a,r.b,r.c,val,&x),xe;
        if(u==X0X_U_MS) xe=dg_tail_px(x);
        else if(u==X0X_U_S) xe=dg_tail_px(x*1000.0f);
        else xe=2+(int)(q*23+.5f);               /* 808 decays: no confirmed time (pot/127 to the circuit) */
        dg_tail(gx,gy,xe,live,e,0,0,col);
    } break;
    case DG_NTAIL: {                             /* 909 SD TONE: the snare noise's decay (noise_decay ms: 24 ms hold + 0.7 x) */
        float x=dg_si(r,r.c,val);
        dg_tail(gx,gy,dg_tail_px(24.0f+0.7f*x),live,e,1,live?age/40u:0,col);
    } break;
    case DG_TUNE: {                              /* TUNE: a wave whose cycles follow the real pitch; rings on a hit */
        /* 808 TUNE and the 909 cymbal TUNE are bipolar semitones (pot 64 = 0 st):
         * a centre mark shows 0, the tick moves both ways and 2 cycles = no shift.
         * Pitch occupies rows1..5; the wave stays in rows8..16, with a clear
         * two-row gutter even at maximum live amplitude. Baseline remains18. */
        float p=dg_pos(r,val),cyc=1.0f+p*2.0f,amp=live?(1.0f+3.0f*e):(1.0f+3.0f*back),ph=0;
        int wave_mid=gy+12,py=wave_mid; char n0[16],u0[8];
        pref_value_of(r,0,n0,u0);
        cv_rect(gx,bot,OG_W,1,C_LINE);
        if(n0[0]=='-') cv_rect(gx+OG_W/2,bot-3,1,3,C_GRAY);
        cv_rect(gx+(int)(p*(OG_W-1)+.5f),bot-1,1,2,col);
        /* A pitch contour is schematic on non-kick voices; only BD909 claims
         * the measured Hz/time law. It descends toward the tuned floor. */
        cv_line(gx,top,gx+8,top+3,col);
        cv_line(gx+8,top+3,right,top+4,col);
        if(live) {int x=(int)((1.0f-e)*24.0f+.5f);cv_rect(gx+x,top+3,1,2,C_WHITE);}
        for(int i=0;i<OG_W;i++){
            int yy=wave_mid-(int)(amp*fm_sinf(6.2831853f*((float)i*cyc/(OG_W-1)+ph))+(.5f));
            if(i) cv_line(gx+i-1,py,gx+i,yy,col);
            py=yy;
        }
    } break;
    case DG_BDSWEEP: {                           /* 909 BD TUNE / P.DPTH / PITCH: the kick's pitch drop */
        /* drum909_bd_hz: the formula the kick plays (49 Hz base x pitch, 16 ms hold,
         * then a drop with time constant TUNE ms, deeper with P.DPTH). Axis: 0..100 ms,
         * 40..400 Hz log. Live: a dot rides the curve at the real time since the hit. */
        int c0=0,c4=4,c5=5;
        float tau=dg_si(r,c0,r.c==c0?val:matrix_value(PR(R_ENG,T_909,0,c0)));
        float m=.01f*dg_si(r,c4,r.c==c4?val:matrix_value(PR(R_ENG,T_909,0,c4))); /* readout percent -> engine 0..1 */
        float pm=dg_si(r,c5,r.c==c5?val:matrix_value(PR(R_ENG,T_909,0,c5)));
        int py=0,H=OG_H-2;
        cv_rect(gx,bot,OG_W,1,C_LINE);
        for(int i=0;i<OG_W;i++){
            float hz=engine_bd909_hz(tau,m,pm,(float)i*100.0f/(OG_W-1));
            float y=fm_log2f(hz/40.0f)/3.32f; if(y<0)y=0; if(y>1)y=1;
            int yy=bot-1-(int)(y*H+.5f);
            int played=live && (float)i*100.0f/(OG_W-1)<(float)age;
            if(i) cv_line(gx+i-1,py,gx+i,yy,played?C_LINE:col);
            py=yy;
        }
        if(live && age<100u){
            int i=(int)((float)age*(OG_W-1)/100.0f+.5f);
            if(i<1)i=1; if(i>OG_W-2)i=OG_W-2; /* 3px marker stays in the cell */
            float y=fm_log2f(engine_bd909_hz(tau,m,pm,(float)age)/40.0f)/3.32f; if(y<0)y=0; if(y>1)y=1;
            int yy=bot-1-(int)(y*H+.5f);
            cv_rect(gx+i-1,yy-1,3,3,C_WHITE);
        }
    } break;
    case DG_ATTACK: {                            /* ATTACK: the click spike in front of the body */
        int h=2+(int)(q*(OG_H-3)+.5f),flash=live && age<30u;
        float body=live?e:back;
        cv_rect(gx,bot,OG_W,1,C_LINE);
        cv_rect(gx+2,bot-h,2,h,flash?C_WHITE:col);
        for(int x=5;x<OG_W;x++){
            int bh=(int)(body*7.0f*fm_exp2f(-(float)(x-5)/6.0f)+.5f);
            if(bh>0) cv_rect(gx+x,bot-bh,1,1,col);
        }
    } break;
    case DG_LPF: {                               /* 808 BD TONE: its lowpass (300 Hz x 20^(pot/127), bd_trigger) */
        float hz=300.0f*fm_exp2f(q*4.3219f),p=fm_log2f(hz/100.0f)/fm_log2f(100.0f);
        int knee=gx+(int)(p*(OG_W-1)+.5f),lvl=top+3;
        cv_rect(gx,bot,OG_W,1,C_LINE);
        if(live) for(int x=0;x<OG_W;x+=2){   /* the hit's spectrum under the curve, fading with it */
            int lim=gx+x<=knee?bot-lvl:(bot-lvl)-(gx+x-knee)*2;
            /* highs die first (a decaying lowpassed hit): bin x falls as e^(1+2x/W) */
            float tilt=fm_exp2f(fm_log2f(e<0.001f?0.001f:e)*(1.0f+2.0f*(float)x/(float)OG_W));
            int h=(int)((float)lim*tilt*(70+dg_rnd(x+(int)(age/80u))/3)/103.0f);
            if(h>0) cv_rect(gx+x,bot-h,1,h,blend(C_LINE,col,7));
        }
        cv_line(gx,lvl,knee,lvl,col);
        int x2=knee+(bot-lvl)/2; if(x2>right)x2=right;
        cv_line(knee,lvl,x2,lvl+(x2-knee)*2,col);
        if(x2<right) cv_line(x2,bot,right,bot,col);
    } break;
    case DG_SHELLS: {                            /* 808 SD TONE: the two shell resonators' mix (sd_trigger mix1/mix2) */
        int tp=val;
        float t=(tp<=64?(float)tp/128.0f:0.5f+(float)(tp-64)*(0.5f/63.0f))*1.5708f;
        float g1=fm_cosf(t),g2=fm_sinf(t),k=live?(0.3f+0.7f*e):(0.3f+0.7f*back);
        int x1=gx+7,x2=gx+17,H=OG_H-3;      /* 173 Hz and 336 Hz: one octave apart */
        cv_rect(gx,bot,OG_W,1,C_LINE);
        for(int s=0;s<2;s++){
            int xc=s?x2:x1,h=(int)((s?g2:g1)*H*k+.5f);
            cv_line(xc-4,bot,xc,bot-h,col);cv_line(xc,bot-h,xc+4,bot,col);
        }
    } break;
    case DG_SNAPPY: {                            /* SNAPPY: the noise burst; louder with the amount, fades on a hit */
        float k=live?e:back;
        uint32_t s=live?age/40u:0;
        cv_rect(gx,bot,OG_W,1,C_LINE);
        for(int x=0;x<OG_W;x+=2){
            float env=fm_exp2f(-(float)x/9.0f);
            int h=(int)(q*k*env*(OG_H-2)*(35+dg_rnd(x*3+(int)s))/135.0f+.5f);
            if(h>0) cv_rect(gx+x,bot-h,1,h,col); else cv_rect(gx+x,bot-1,1,1,C_LINE);
        }
    } break;
    case DG_SOUND: {                             /* SOUND switch: one pip per position, the hit lights it */
        int n=d->max+1,w=(OG_W-2)/n;
        for(int k=0;k<n;k++){
            int x=gx+1+k*w,h=9;
            if(k==val){ if(live) h+=(int)(e*4+.5f); cv_rect(x,mid+4-h,w-3,h,col); }
            else rbox(x,mid-5,w-3,9,1,C_LINE);
        }
    } break;
    case DG_LEVEL: {                            /* value is ceiling, real envelope pulses segments */
        cv_rect(gx,bot,OG_W,1,C_LINE);
        int ceiling=(int)(q*6.0f+.5f),lit=live?(int)(q*e*6.0f+.5f):0;
        for(int i=0;i<6;i++) {
            int h=3+i*2;
            cv_rect(gx+i*4,bot-h,3,2,i<lit?C_WHITE:i<ceiling?col:C_LINE);
        }
    } break;
    case DG_ACCENT: {                            /* ACCENT: a plain hit next to an accented one, the gap is the depth */
        float k=live?(0.6f+0.4f*e):0.6f;           /* a hit in the kit pulses the bars up */
        int H=OG_H-2,hn=(int)(H*(1.0f-0.7f*q)*k+.5f),ha=(int)(H*k+.5f);
        cv_rect(gx,bot,OG_W,1,C_LINE);
        for(int j=0;j<2;j++){
            int x=gx+3+j*13,h=j?ha:hn;if(h<1)h=1;
            cv_line(x-3,bot,x,bot-h,col);cv_line(x,bot-h,x+4,bot,col);
            if(live)cv_rect(x,bot-h,1,2,C_WHITE);
        }
        cv_line(gx+7,top,gx+9,top+2,col);cv_line(gx+9,top+2,gx+7,top+4,col);   /* ">" accent marks */
        cv_line(gx+19,top,gx+21,top+2,col);cv_line(gx+21,top+2,gx+19,top+4,col);
    } break;
    default: break;
    }
}

static uint32_t knobs_sig(void)
{
    uint32_t h = 2166136261u, i;
    int pgi = cur_page();
#define MIXIN(v) (h = (h ^ (uint32_t)(v)) * 16777619u)
    if (ui.view == V_PART && is_303()) {
        const uint8_t *cell=proj.sound.v[T_303][bidx()];
        for (unsigned byte=0; byte<ORIGINAL_SOUND_BYTES; byte++) MIXIN(cell[byte]);
        MIXIN(engine_bass_status(bidx()));
        { float eg=0,dd=0; if(engine_bass_filter_view(bidx(),&eg,&dd)) MIXIN(env_knee_x(0,eg*dd*(eg>0))); } /* ENV glyph motion: one step per knee pixel */
        { float a=0,m=0;unsigned s=6,key=0;
          if(engine_bass_voice_view(bidx(),&a,&m,&s,&key)) {
              MIXIN((int)(a*32.0f)); MIXIN((int)(m*24.0f)); MIXIN(s); MIXIN(key);
          }
        }
        { float ph=0,bi=0,cu=0,tg=0; int on=0; if(engine_bass_motion_view(bidx(),&ph,&bi,&cu,&tg,&on)) { MIXIN((int)(ph*64.0f)); MIXIN((int)((tg-cu)*16.0f)); } } /* wobble / glide motion */
        MIXIN(engine_bass_preset_pending(bidx()));
        MIXIN(engine_bass_requested_bank(bidx())); MIXIN(engine_bass_requested_preset(bidx()));
    }
    MIXIN(ui.view);
    MIXIN(ui.part);
    MIXIN(division_pad_owner());
    if (division_pad_owner()) MIXIN(division_pad_index());
#if X0X_BASS_PRESET_PREVIEW
    if(is_303()) MIXIN(engine_bass_preset_pending(bidx()));
#endif
    MIXIN(pgi);
    MIXIN(ui.touched);
    MIXIN(ui.held_step);
    MIXIN(lock_step() + 1);
    MIXIN(proj.set.palette);
    MIXIN(ui.sel[0] | ui.sel[1] << 8);
    MIXIN(seq.ppat[ui.part]);
    MIXIN(ui.song_sel);
    {
        const char *fa, *fb, *fc;
        MIXIN(footer_text(&fa, &fb, &fc));
        MIXIN((uintptr_t)fa ^ ((uintptr_t)fb << 3) ^ ((uintptr_t)fc << 7));
        MIXIN(pg.n);
    }
    for (i = 0; i < 4; i++) {
        pref_t r = pg.r[pgi][i];
        MIXIN(r.kind | r.a << 8 | r.b << 16 | (uint32_t)r.c << 24);
        MIXIN(pref_get(r));
        if(r.kind==R_ENG && (r.a==T_909 || r.a==T_808)) {
            uint32_t age=0;float e=0;int live=drum_live(r,&age,&e);
            MIXIN(live);if(live){MIXIN((int)(e*32.0f));MIXIN(age/40u);}
        }
        if(r.kind==R_TEMPO) MIXIN(tempo_glyph_view);
        if(r.kind==R_TAPE && pref_get(r)>=16) MIXIN(tape_glyph_phase);
        if(r.kind==R_BRKSLOT) MIXIN(engine_brk_nslots());
        if(r.kind==R_SBAR) MIXIN(pref_desc(r)->max);
        if(r.kind==R_ENG && r.a==T_FX && r.c==FX_DL_FDBK)
            MIXIN(pref_get(PR(R_ENG,T_FX,0,FX_DL_TYPE)));
        if(r.kind==R_ENG && r.a==T_MST && r.c==MST_DJF) {
            MIXIN(engine_master_get(MST_MODE));
            MIXIN(engine_master_get(MST_CUTOFF));
            MIXIN(engine_master_get(MST_RESO));
        }
        MIXIN(has_motion(r) | (motion_now(r) + 1) << 1);
        MIXIN(lock_of(r, lock_step()) + 1);
    }
    if (ui.held_step >= 0) {
        const bstep_t *st = &cur_pat()->bass[bidx()].step[ui.held_step];
        MIXIN(st->note | st->flags << 8 | st->velocity << 16);
    }
#undef MIXIN
    return h;
}

static int strcmp_s(const char *a, const char *b)
{
    while (*a && *a == *b) {
        a++;
        b++;
    }
    return *a != *b;
}

/* the knob row's tag: whose knobs these are (BD, 909 KIT, P3 PATTERN, 909 MIX: BD, 303A STEP 5) */
static void knob_tag(char *t)
{
    int g = pg.group[cur_page()], dm = drum_mix_page();
    const char *ti = pg.title[cur_page()];
    if (lock_step() >= 0) {
        put_i(put_s(put_s(t, is_drum() ? engine_voice_name(ui.part == PART_909 ? T_909 : T_808, ui.sel[ui.part])
                                        : part_name(ui.part)), " P-LOCK STEP "), lock_step() + 1);
    } else if (ui.view == V_SEQ && is_303() && ui.held_step >= 0) {
        put_i(put_s(put_s(t, part_name(ui.part)), " STEP "), ui.held_step + 1);
    } else if (dm >= 0)
        put_s(put_s(put_s(t, ti), ": "), engine_voice_name(dm ? T_808 : T_909, ui.sel[dm]));
    else if (ui.view == V_MIX && cur_page() == 0)
        put_s(put_s(t, "PARTS: "), part_display(ui.mixsel));
    else if (g == GR_PAT)
        put_s(put_s(put_i(put_s(t, "P"), seq.ppat[ui.part] + 1), " "), ti);
    else if (g == GR_KIT || g == GR_SOUND) {
#if X0X_BASS_PRESET_PREVIEW
        if(is_303()) put_s(t,ti);
        else
#endif
        put_s(put_s(put_s(t,part_display(ui.part)), " "), ti);
    }
    else
        put_s(t, ti);
    {   /* a section over several pages (same name): which of them, "BD (1/2)" */
        int p = cur_page(), a = p, b = p;
        while (a > 0 && !strcmp_s(pg.title[a - 1], ti))
            a--;
        while (b + 1 < pg.n && !strcmp_s(pg.title[b + 1], ti))
            b++;
        if (b > a) {
            char *q = t;
            while (*q)
                q++;
            put_s(put_i(put_s(put_i(put_s(q, " ("), p - a + 1), "/"), b - a + 1), ")");
        }
    }
}

static UI_DRAW void draw_knobs(void)
{
    static uint32_t last_sig;
    int i, pgi = cur_page();
    uint32_t sig;
#if BOARD_SMK37
    {   /* clip mode, no menu: the KEYS panel (main_fm1.c smk_ck_panel) takes the strip */
        extern uint8_t smk_ck_knobs_owned(void);
        extern uint8_t smk_ck_panel(uint32_t *last, uint32_t force);
        if (smk_ck_knobs_owned()) {
            blit_hash[3] = 0;                         /* (the knob strip draws all again after it) */
            if (smk_ck_panel(&last_sig, !blit_hash[2]))
                cv_commit(2, 0, KNOB_Y);
            return;
        }
        blit_hash[2] = 0;
    }
#endif
    if (ui.view == V_PART && (is_drum() || is_303())) {
        /* Continuation of the same 4x4 matrix, not a duplicate knob row. */
        cv_begin(240, KNOB_H, C_BLACK);
        if (ui.overlay==O_NONE && !ui.help) draw_part_sound(2);
        cv_commit_knobs(3);
        last_sig = 0;
        return;
    }
    tape_glyph_tick();
    tempo_glyph_view = seq.metro_view;
    sig = knobs_sig();
    if (sig == last_sig && blit_hash[3])
        return;
    last_sig = sig;
    cv_begin(240, KNOB_H, C_BLACK);
    night_panel(3,0,234,11,0);
    for(i=0;i<4;i++) night_panel(i*60+3,13,54,55,ui.touched==i);
    night_panel(0,70,240,12,0);
    {   /* the rule; at its right end, where you are: the tag, then the page dots */
        char t[36];                    /* room for "303A P-LOCK STEP 16 · WBL1 (1/2)" */
        int dots = pg.n > 1 && ui.view != V_GLO;
        int32_t xd = 237 - (dots ? pg.n * 5 : 0), xt;
        knob_tag(t);
        /* The context caption is a label, not an unexplained horizontal rail. */
        xt=8;
        cv_text(xt, vc(&FONT_XS, 0, 11), &FONT_XS, t, C_HI);
        if (dots) {
            int k;
            for (k = 0; k < pg.n; k++)
                cv_rect(xd + k * 5, 4, 3, 3, k == cur_page() ? C_HI : C_LINE);
        }
    }
    draw_footer();
    if (ui.view == V_SEQ && is_303() && ui.held_step >= 0) {     /* SEQ: the held step's own knobs */
        static const char *const SN[4] = {"NOTE", "GATE", "ACCENT", "SLIDE"};
        static const char *const G[3] = {"REST", "NOTE", "TIE"};
        const bpart_t *bp = &cur_pat()->bass[bidx()];
        const bstep_t *st = &bp->step[ui.held_step];
        for (i = 0; i < 4; i++) {
            char v[12];
            int cx = i * 60 + 30;
            if (i)
                cv_rect(i * 60, 14, 1, 50, C_LINE);
            if (i == 0)
                put_note(v, held_note_of(bp, ui.held_step) + bp->transpose - 24);
            else if (i == 1)
                put_s(v, G[bstep_gate(st)]);
            else
                put_s(v, (st->flags & (i == 2 ? BS_ACCENT : BS_SLIDE)) ? "ON" : "OFF");
            text_c(cx, vc(&FONT_XS, 13, 10), &FONT_XS, SN[i], C_GRAY);
            text_c(cx, vc(&FONT_M, 30, 34), &FONT_M, v, C_WHITE);
        }
        cv_commit_knobs(3);
        return;
    }
    for (i = 0; i < 4; i++) {
        pref_t r = pg.r[pgi][i];
        const x0x_param_t *d = pref_desc(r);
        char num[16], unit[8];
        int cx = i * 60 + 30, val, touched = ui.touched == i;
        uint16_t col = drum_mix_page() >= 0 ? PART_COL[drum_mix_page()] : part_col();   /* MIX: 909 in the 909's */
        if (i)
            cv_rect(i * 60, 14, 1, 50, C_LINE);
        if (!d)
            continue;
        /* Selected control keeps the shared raised face; value/lock semantics below are unchanged. */
        night_label_c(cx-1, vc(&FONT_XS, 13, 10), &FONT_XS, caps_of(pref_name(r)), touched ? C_WHITE : C_GRAY);
        val = pref_get(r);
        if (lock_step() >= 0) {                        /* a held step: its own value (amber mark: locked) */
            int lv = lock_of(r, lock_step());
            if (lv >= 0)
                val = lv;
            if (lockable(r))
                dot(i * 60 + 52, 17, 2, lv >= 0 ? C_AMB : C_LINE);
        } else if (has_motion(r)) {                    /* recorded motion: a mark, and what it plays now */
            int mv = motion_now(r);
            dot(i * 60 + 52, 17, 2, mv >= 0 ? C_WHITE : C_DIM);
            if (mv >= 0)
                val = mv;
        }
        if(drum_strip_role(r)==DG_LEVEL) {
            drum_strip_glyph(r,val,cx-13,28,col);
        } else if(perform_glyph(r,val,cx,col) || control_glyph(r,val,cx,col)) {
            /* Its existing value/motion/lock path is retained below. */
        } else if (d->names && d->max < 12) {           /* a switch: positions as pips */
            int n = d->max + 1, k, pw = n > 6 ? 3 : 6, gap = 2, w0 = n * (pw + gap) - gap;
            for (k = 0; k < n; k++)
                box(cx - w0 / 2 + k * (pw + gap), 33, pw, 9, k == val ? col : C_LINE);
        }
        pref_value_of(r,val,num,unit);
        if(r.kind==R_ENG && r.a==T_MST && r.c==MST_DJF) {
            uint8_t mode,cut;int res;filter_display(&mode,&cut,&res);
            pref_value_of(PR(R_ENG,T_MST,0,MST_MODE),mode,num,unit);
        }
        if ((r.kind == R_ENG && r.a == T_303) || r.kind == R_BENGINE || r.kind == R_BPRESET || r.kind == R_BSTATUS)
            original_cell_value(cx,vc(&FONT_B,53,13),num,unit,touched ? C_WHITE : C_HI);
        /* Existing FWD/REV/PING/RND pictures already show the direction.
         * Barlow number/unit ink is 0.5–1px right of the PUMP card center. */
        else if(r.kind!=R_BDIR)
            cell_value(cx-(r.kind==R_ENG && r.a==T_MST && r.c==MST_PUMP),
                       vc(&FONT_B,53,13),num,unit,touched?C_WHITE:C_HI);
    }
    cv_commit_knobs(3);
}

/* ===================================================================== LEDs === */
static uint32_t drum_step_lights(int kit)
{
    const dpart_t *d = &pat_of(kit)->drum[kit];
    const uint32_t *bits = (ui.btn & (1u << B_ENV)) ? d->accent : d->hit[ui.sel[kit]];
    int ph = eng_step[TRK_DRUM + kit];
    uint32_t lit = 0;
    for (int i = 0; i < 16; i++) {
        int s = step_of(i), on = s < d->len && sm_get(bits, s);
        if (seq.playing && s == ph) on = !on;
        if (on) lit |= 1u << WHITE_KEY[i];
    }
    return lit;
}

static void leds(void)
{
    uint32_t b = 0, k = 0, d = 0, i;
    int blink = (ui.frame & 8u) != 0;
#if BOARD_SMK37
    extern uint8_t smk_clip_mode_on(void);
    extern uint8_t smk_apc_transport_led_state(uint8_t note);
#endif
    if (seq_clock_waiting(&seq) ? (ui.frame & 32u) != 0 : seq.playing && eng_step[TRK_DRUM] % 4 == 0)
        b |= 1u << B_PLAY;                            /* EXTERNAL waits for the clock: a slow blink */
    if (ui.rec)
        b |= 1u << B_REC;
#if BOARD_SMK37
    if (smk_clip_mode_on()) {
        b &= ~((1u << B_PLAY) | (1u << B_REC));
        if (smk_apc_transport_led_state(0x5Bu))
            b |= 1u << B_PLAY;
        if (smk_apc_transport_led_state(0x5Du))
            b |= 1u << B_REC;
    }
#endif
    if (ui.view == V_HOME || ui.view == V_SONG || (seq.song_on && blink))
        b |= 1u << B_HOME;
    if (ui.view == V_SEQ)
        b |= 1u << B_SEQ;
    if (ui.view == V_PART)
        b |= 1u << B_EDIT;
    if (ui.view == V_GEN)
        b |= 1u << B_ARP;
    if (ui.view == V_FX)
        b |= 1u << B_FX;
    if (ui.view == V_MIX)
        b |= 1u << B_LFO;
    if (ui.view == V_GLO)
        b |= 1u << B_GLO;
    if (ui.overlay != O_NONE && (ui.overlay != O_ASK || action_key_cue()[0]))
        b |= 1u << B_SEL;
    if (ui.view == V_HOME || ui.view == V_SONG ? ui.pbank : ui.spage)
        b |= 1u << B_OCTUP;
    if (save_state() == SAVE_QUEUED || (save_state() == SAVE_FAILED ? (ui.frame & 2u) : save_state() == SAVE_UNSAVED && blink))
        b |= 1u << B_SAVE;
    if (proj.set.keyled) {                           /* bright: on / chosen; dim: there, not chosen */
        if (ui.view == V_HOME || ui.view == V_SONG) {
            const song_t *sg = song();
            int bar = ui.view == V_SONG && ui.song_sel < sg->len;
            int pp = (bar ? sg->bar[ui.song_sel].pat[PART_909] : seq.ppat[PART_909]) - ui.pbank * 16;
            int cu = seq_cue_of(&seq, PART_909) - ui.pbank * 16;
            for (i = 0; i < 16; i++)                  /* patterns with notes */
                if (pattern_used(&proj.pat[ui.pbank * 16 + i]))
                    d |= 1u << WHITE_KEY[i];
            if (pp >= 0 && pp < 16 && (ui.view == V_HOME || bar))
                k |= 1u << WHITE_KEY[pp];
            if (ui.view == V_HOME && seq_cue_of(&seq, PART_909) >= 0 && blink && cu >= 0 && cu < 16)
                k |= 1u << WHITE_KEY[cu];
            for (i = 0; i < NPARTS; i++) {            /* the parts: playing bright, muted dim */
                int p = part_at((int)i);
                int muted = ui.view == V_HOME ? part_muted(p) : bar ? (int)(sg->bar[ui.song_sel].mute >> p & 1u) : 1;
                if (muted)
                    d |= 1u << BLACK_KEY[i];
                else
                    k |= 1u << BLACK_KEY[i];
            }
        } else if (ui.view == V_MIX && (cur_page() == 0 || drum_mix_page() >= 0)) {
            int dm = drum_mix_page(), n = dm >= 0 ? NDRUM : NPARTS, on = dm >= 0 ? ui.sel[dm] : part_position(ui.mixsel);
            if (dm >= 0) k |= drum_step_lights(dm);
            for (i = 0; i < (uint32_t)n && i < 11u; i++) {  /* the knobs' channel bright (blinking: muted), */
                int mu = dm >= 0 ? track_muted(dm, (int)i) : part_muted(part_at((int)i));   /* the others dim, muted dark */
                if ((int)i == on ? !mu || blink : 0)
                    k |= 1u << BLACK_KEY[i];
                else if ((int)i != on && !mu)
                    d |= 1u << BLACK_KEY[i];
            }
        } else if (ui.view == V_MIX || ui.view == V_FX) {
            /* the master and the effects: the keys have nothing to choose */
        } else if (is_drum()) {
            const dpart_t *d0 = &cur_pat()->drum[ui.part];
            k |= drum_step_lights(ui.part);
            for (i = 0; i < NDRUM && i < 11u; i++) {    /* the track bright (blinking: muted), the others */
                int mu = track_muted(ui.part, (int)i);  /* with hits dim, muted dark */
                if ((int)i == ui.sel[ui.part] ? !mu || blink : 0)
                    k |= 1u << BLACK_KEY[i];
                else if ((int)i != ui.sel[ui.part] && sm_any(d0->hit[i]) && !mu)
                    d |= 1u << BLACK_KEY[i];
            }
        } else if (is_303() && !kbd_on()) {           /* notes bright, ties dim */
            const bpart_t *bp = &cur_pat()->bass[bidx()];
            int ph = eng_step[TRK_BASS0 + bidx()];
            for (i = 0; i < 16; i++) {
                int s = step_of((int)i), g = s < bp->len ? bstep_gate(&bp->step[s]) : G_REST, on = g == G_NOTE;
                if (seq.playing && s == ph)
                    on = !on;
                if (on)
                    k |= 1u << WHITE_KEY[i];
                else if (g == G_TIE)
                    d |= 1u << WHITE_KEY[i];
            }
        } else if (is_303()) {                        /* the keyboard: its Cs dim, to find your place */
            for (i = 0; i < NKEYS; i++)
                if (i % 12u == 7u)                    /* F3 = 0: C4 = 7, C5 = 19 */
                    d |= 1u << i;
        } else if (ui.part == PART_BRK) {
            int ph = eng_step[TRK_BRK];
            for (i = 0; i < 16; i++) {
                int on = (cur_pat()->brk.steps >> i) & 1u;
                if (seq.playing && (int)i == ph)
                    on = !on;
                if (on)
                    k |= 1u << WHITE_KEY[i];
            }
            for (i = 0; i < 8; i++)                   /* the slice pads */
                d |= 1u << BLACK_KEY[i];
        }
    }
    k |= ui.keys;
    if (division_pad_owner()) {
        k = d = 0; /* no fake keybed notes from physical pad LEDs */
        if (proj.set.keyled) {
            for (i = 0; i < 8 + DIVISION_SHAPE_PADS; i++) d |= 1u << WHITE_KEY[i];
            k = 1u << WHITE_KEY[division_pad_index()] | 1u << WHITE_KEY[8 + division_shape_index()];
        }
    }
    plat_keys_dim(d & ~k);
    plat_glow(proj.set.keyled == 1);
    plat_play_red(ui.rec);                           /* PLAY green; red while recording */
    plat_leds(b, k);
}

/* ===================================================================== frame === */
X0X_COLD void ui_init(void)
{
    part_header_snapshot_valid = 0;
#if BOARD_SMK37
    smc_ui_cancel();
#endif
    int i;
    bass_layout_pending_mask = bass_layout_on_sound_page = 0;
    memset(&ui, 0, sizeof ui);
    (void)plat_division_pad(0);
    original_controls.valid = 0;
    original_wave.valid = 0;
    memset(kbd_held_note, 0, sizeof kbd_held_note);
    memset(kbd_held_key, 0, sizeof kbd_held_key);
    memset(kbd_arp_n, 0, sizeof kbd_arp_n);
    memset(bass_rec_step, 0, sizeof bass_rec_step);
    memset(bass_rec_pat, 0, sizeof bass_rec_pat);
    memset(bass_rec_playing, 0, sizeof bass_rec_playing);
    undo_lanes = 0;
    ui.view = V_SEQ;                  /* start on the visible step grid; EDIT opens sound */
    ui.prev_view = V_PART;
    ui.part = PART_909;
    ui.held_step = -1;
    ui.brk_held = -1;
    ui.hold_step = -1;
    ui.chain_first = -1;
    ui.touched = -1;
    ui.overlay = O_NONE;
    ui.outline_ok = 0;
    ui.dirty = 0;
    ui.save_failed = 0;
    save_wait = 0;
    palette_set(proj.set.palette);
    for (i = 0; i < 4; i++) {
        blit_hash[i] = 0;
        cv_tile_valid[i] = 0;
    }
    header_full_hash = popup_knob_full_hash = 0;
    build_pages();
    undo_start();                                   /* the project as loaded is where undo stops */
    if (project_storage_unsupported()) {
        ui.save_failed = 1;
        if (project_storage_unsupported() != 2) say("NEWER DATA: LOAD BLOCKED", 0);
    }
}

/* A transaction borrows the undo baseline and holds the audio engine. Setting the hold before
 * the transport check closes the gap in which the audio ISR could consume a queued Start. */
X0X_COLD static int project_acquire(int reset)
{
    if (project_busy || perf_testing() || (!reset && (ui.rec || ui.keys || plat_keys() ||
        plat_physical_keys() ||
        ui.held_step >= 0 || ui.hold_step >= 0 || ui.brk_held >= 0)))
        return UI_PROJECT_BUSY;
#if BOARD_SMK37
    {
        extern int smk_project_active(void), smc_project_active(void);
        if (!reset && (smk_project_active() || smc_project_active()))
            return UI_PROJECT_BUSY;
    }
#endif
    engine_project_hold(1);
    if (!reset && (seq.playing || seq.req_start || seq.req_cont || seq.req_stop || engine_project_notes())) {
        engine_project_hold(0);
        return UI_PROJECT_BUSY;
    }
    project_busy = 1;
    undo_commit_stable();                       /* no uncommitted gesture is lost when staging borrows shadow */
    return 0;
}

int ui_project_begin(void) { return project_acquire(0); }

X0X_COLD void ui_project_end(int apply)
{
    if (!project_busy)
        return;
    if (apply) {
        engine_project_flush();                     /* old note-offs use the channels that sent the notes */
#if BOARD_SMK37
        {
            extern void smk_project_reset(void), smc_project_reset(void);
            smk_project_reset();                    /* clip key notes depend on the old project's scale/chord */
            smc_project_reset();
        }
#endif
        project_commit_stage();
        engine_init(proj.pat, &proj.arr.song, proj.arr.lane, &proj.sound);
        seq.bpm = (float)proj.set.bpm_x10 / 10.0f;
        seq.ext_bpm = seq.bpm;
        seq.accent_q7 = proj.set.accent_q7;
        project_apply_io();
        seq.clk_src = PROJ_CLK_SRC(proj.set.bt);
#if BOARD_SMK37
        extern uint8_t smk_clip_mode_on(void);
        if (smk_clip_mode_on())
            seq.clk_src = SEQ_CLK_AUTO;
#endif
        engine_apply_sound(&proj.sound);
        engine_brk_loops();
        memset(pattern_sound_seen_pat, 0xFF, sizeof pattern_sound_seen_pat);
        ui_init();
        mark_dirty();                               /* reset/import are saved only by the ordinary save policy */
        project_revision++;
    } else {
        memcpy(undo_shadow, (uint8_t *)&proj + UNDO_OFF, UNDO_BYTES);
    }
    project_input_sync();                            /* consume controls held or turned during the transaction */
    ui.act_t = plat_ms();
    project_busy = 0;
    engine_project_release();
}

X0X_COLD int ui_project_load(void)
{
    int rc = ui_project_begin();
    if (rc) {
        say("STOP PLAYING TO LOAD", 0);
        return rc;
    }
    rc = project_load_stage();
    ui_project_end(rc == 0);
    if (!rc)
        ui.dirty = 0;                                /* the last saved project is now the live project */
    say(rc ? "NO VALID SAVED PROJECT" : "SAVED PROJECT LOADED", 0);
    return rc;
}

X0X_COLD int ui_project_reset(void)
{
    int rc = project_acquire(1);
    if (rc) {
        say("PROJECT BUSY", 0);
        return rc;
    }
    project_reset_stage();
    ui_project_end(1);
    say("PROJECT RESET: SAMPLES KEPT", 0);
    return 0;
}

/* Device Bluetooth intent bypasses project autosave (restored from 0e58b960).
 * No erase during notes, transport, capture or staged flash use. Reject busy
 * audio before acquiring a hold; recheck after the hold for a queued Start.
 * A failed write retries after 1 s. Reset/load must not drop this request. */
static void device_bt_save(void)
{
    int rc;
    static uint32_t retry_at;
    if (!project_device_bt_pending() || project_busy || perf_testing() ||
        (retry_at && (int32_t)(plat_ms() - retry_at) < 0)) return;
#ifndef X0X_HOST
    { extern int store_stage_held(void); if (store_stage_held()) return; }
#endif
    if (ui_boot_flash_busy()) return;
    engine_project_hold(1);
    if (ui_boot_flash_busy()) { engine_project_hold(0); return; }
    rc = project_device_bt_save();
    engine_project_hold(0);
    retry_at = rc ? plat_ms() + 1000u : 0;
    say(rc ? "BT SAVE FAILED: RETRYING" : "BLUETOOTH SAVED", 0);
}

/* Per-pattern preset recall: the pattern a bass part plays next (its cue, else the playing
 * one) asks for its preset once, gated to that pattern; the engine switches when that pattern
 * plays and the voice is quiet (engine_bass_select_preset). Unset: nothing is requested. */
static void pattern_sound_tick(void)
{
    for (int b = 0; b < NBASS; b++) {
        int t = TRK_BASS0 + b, cue = seq_cue_of(&seq, t), pat = cue >= 0 ? cue : seq.ppat[t];
        int gate = engine_bass_preset_gate(b);
        unsigned ps = proj.pat[pat].rsv[b];
        uint32_t epoch=engine_bass_pattern_epoch(b);
        if (gate >= 0 && gate != pat && gate != seq.ppat[t] && engine_bass_preset_pending(b))
            engine_bass_cancel_preset(b);                /* its cue was taken back */
        /* A future OFF may be inspected before the current unavailable request
         * adopts. Revisit OFF after actual adoption, while preserving explicit
         * manual overrides of a cached nonzero pattern request. */
        if (pattern_sound_seen_pat[b] == pat && pattern_sound_seen_val[b] == ps &&
            (ps || pattern_sound_seen_epoch[b]==epoch)) continue;
        pattern_sound_seen_pat[b] = (uint8_t)pat; pattern_sound_seen_val[b] = (uint8_t)ps;
        pattern_sound_seen_epoch[b]=epoch;
        if (!ps) { (void)engine_bass_pattern_inherit(b,&proj.sound,pat); continue; }
        unsigned kind, one_based;
        if (!bass_pattern_preset_decode(ps, &kind, &one_based) || !one_based) continue;
        int bank = (int)kind, preset = (int)one_based - 1;
        if (engine_bass_requested_bank(b) == bank && engine_bass_requested_preset(b) == preset &&
            !engine_bass_preset_edited(b) && !engine_bass_preset_pending(b)) continue;
        if (!original_runtime_kind_available(bank))
            (void)engine_bass_recall_unavailable_at(b,bank,preset,&proj.sound,pat);
        else
            (void)engine_bass_select_preset_at(b, bank, preset, &proj.sound, pat);
    }
}

/* AUTOSAVE: changes are saved by themselves while the pattern is stopped and nothing has been touched
 * for AUTOSAVE_QUIET ms, at most every AUTOSAVE_GAP ms. Stopped only: a flash erase silences the
 * audio. Only the objects that changed are written (project.c), usually one or two sectors. */
#define AUTOSAVE_GAP 20000u
static void autosave(void)
{
    uint32_t now = plat_ms();
#if BOARD_SMK37
    extern uint8_t smk_ck_flash_busy(void), smk_clip_mode_on(void);
#endif
    if (project_busy || ui_boot_flash_busy() || project_storage_unsupported())
        return;
    if (save_wait && !seq.playing && !seq.req_start && !seq.req_cont && !seq.req_stop && !ui.rec && !perf_save_busy()) {
#if BOARD_SMK37
        if (smk_clip_mode_on() && (smk_ck_flash_busy() || now - ui.act_t < AUTOSAVE_QUIET))
            return;                                    /* keep the queued SAVE until clip playing has gone quiet */
#endif
        save_project();
        return;
    }
#if BOARD_SMK37
    if (smk_ck_flash_busy())                          /* ui_frame runs before smk_ck_poll on display frames */
        return;
#endif
    if (!ui.dirty || (proj.set.autosave_off && !ui.last_autosave) || seq.playing || seq.req_start || seq.req_cont || seq.req_stop || ui.rec || perf_testing() ||
        ui.overlay == O_ASK || now - ui.act_t < AUTOSAVE_QUIET || (ui.saved_t && now - ui.saved_t < AUTOSAVE_GAP))
        return;
    ui.saved_t = now;
    ui.last_autosave = 0;
    switch (project_save()) {
    case 0:
        ui.dirty = 0;
        ui.save_failed = 0;
        say("AUTOSAVED", 0);
        break;
    case -9:
        ui.save_failed = 1;
        say("NEWER DATA: NOT SAVED", 0);
        break;
    case -7:
        ui.save_failed = 1;
        say("MEMORY FULL: NOT SAVED", 0);
        break;
    default:
        ui.save_failed = 1;
        say("SAVE FAILED", 0);
        break;
    }
}

void ui_frame(void)
{
    uint32_t i;
    input();
    division_pad_input();
    ext_rec_drain();
    if (project_busy) {
#if BOARD_SMK37
        smc_ui_cancel();
#endif
        draw_header();                             /* keep transfer status visible; samples and runtime stay untouched */
        return;
    }
#if BOARD_SMK37
    smc_frame();
    division_pad_input(); /* Update pad owner after SMC may take the UI. */
#endif
    if (!project_busy) {   /* GLO > MIDI > CLOCK SOURCE; clip mode always uses AUTO */
        static uint8_t waited;
        uint8_t w;
#if BOARD_SMK37
        extern uint8_t smk_clip_mode_on(void);
        seq.clk_src = smk_clip_mode_on() ? SEQ_CLK_AUTO : PROJ_CLK_SRC(proj.set.bt);
#else
        seq.clk_src = PROJ_CLK_SRC(proj.set.bt);
#endif
        w = (uint8_t)seq_clock_waiting(&seq);
        if (w && !waited)
            say("WAITING FOR CLOCK", 0);
        waited = w;
    }
#if X0X_BASS_TAGGED_SOUND
    if(undo_wait) {
        int direction=undo_wait==2;
        if(undo.cur!=undo_wait_cur || undo.used!=undo_wait_used ||
           engine_bass_choice_serial()!=undo_wait_serial ||
           memcmp(undo.region,undo.shadow,undo.len))undo_wait=0;
        else do_undo(direction);
    }
#endif
    if(ui.overlay!=O_LIST || ui.help) peer_scroll.active=0;
    else { int visible=0;for(unsigned row=ui.list_top;row<ui.list_n && row<ui.list_top+6u;row++)
        if(list_rows[row].kind==R_BTNAME)visible=1;
        if(!visible)peer_scroll.active=0; }
    undo_tick();
    pattern_sound_tick();
    engine_note_lock_refresh();
    device_bt_save();
    autosave();
    if (!project_busy)
        perf_test_tick();
    if (ui.view == V_PERF && !perf_testing())
        perf_window(0);
    for (i = 0; i < NPARTS; i++)
        eng_peak[i] = (uint16_t)(eng_peak[i] - (eng_peak[i] >> 3));
    for (i = 0; i < NKIT * NDRUM; i++) {              /* the drum tracks' hits fall as the part meters do */
        volatile uint8_t *h = &eng_hit[i / NDRUM][i % NDRUM];
        *h = (uint8_t)(*h - (*h >> 3) - (*h ? 1 : 0));
    }
#if BOARD_SMK37
    if (smc_ui_active()) {
        smc_ui_draw();
        /* Pattern cues use the existing header toast above a retained popup. */
        if (ui.msg_until && (int32_t)(ui.msg_until - plat_ms()) > 0 &&
            !memcmp(ui.msg, "NEXT: PAT ", 10))
            draw_header();
    }
    else
#endif
    {
        draw_header();
        draw_main();
        draw_knobs();
    }
    leds();
    ui.frame++;
}

void ui_input_only(void) { input(); division_pad_input(); }
int ui_dirty(void) { return ui.dirty != 0; }
void ui_say(const char *a, const char *b) { say(a, b); }


