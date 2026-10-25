/* SPDX-License-Identifier: GPL-3.0-only */
/* Real production UI, framebuffer, engine, SMC queues and clip editor routing.
 * Hardware, clip field storage and the clip grid painter alone are substitutes.
 * The assertions protect the end user's restore/navigation/pickup contract. */
#define BOARD_SMK37 1
#define X0X_DEV_PADCAL 1
#define main simulator_main
#include "../../host/x0x_host.c"
#undef main
#include <assert.h>
#define CK_FN __attribute__((unused))
#include "app/smk_clip_keys.h"
static struct { uint8_t pg; } ck;
static uint8_t clip_grid_mode, fields[CK_NE], clip_waiting, clip_dirty;
static unsigned clip_forces;
static uint32_t ck_get(uint32_t f) { return fields[f]; }
static void ck_set(uint32_t f, uint32_t v) { fields[f] = (uint8_t)v; }
static const char *ck_val_txt(uint32_t f, uint32_t v, char *s)
{ (void)f; sprintf(s, "%u", (unsigned)v); return s; }
#include "clip_smc.inc"
uint8_t smk_clip_mode_on(void) { return clip_grid_mode; }
uint8_t smk_clip_transport_button(uint8_t b, uint8_t p) { (void)b; (void)p; return 0; }
uint8_t smk_clip_history_button(uint8_t b, uint8_t p, uint8_t h) { (void)b; (void)p; (void)h; return 0; }
void smk_play_note_button(uint8_t p, uint8_t h) { (void)p; (void)h; }
uint8_t smk_ck_flash_busy(void) { return 0; }
uint8_t smk_ck_ext(void) { return 0; }
uint8_t smk_ck_knobs_owned(void) { return 0; }
uint8_t smk_ck_panel(uint32_t *p, uint32_t f) { (void)p; (void)f; return 0; }
uint8_t smk_clip_lcd_draw(uint32_t w, uint32_t h)
{
    if (!clip_dirty) return 0;
    clip_dirty = 0;
    cv_begin(w, h, C_BLACK);
    cv_band(0, h);
    cv_rect(12, 8, 212, 92, RGB(30, 60, 90));
    return 1;
}
void smk_clip_lcd_force(void) { clip_forces++; clip_dirty = 1; }
uint8_t smk_clip_wait(void) { return clip_waiting; }
uint8_t smk_apc_transport_led_state(uint8_t n) { (void)n; return 0; }
uint8_t smk_padcal_on(void) { return 0; }
void smk_padcal_enter(void) {}
uint8_t smk_padcal_draw(uint32_t w, uint32_t h) { (void)w; (void)h; return 0; }
int plat_ble_smc_send(const uint8_t *m, uint8_t n) { (void)m; (void)n; return 1; }
#ifndef SMC_SOURCE_FILE
#define SMC_SOURCE_FILE "app/smc_mixer.c"
#endif
#include SMC_SOURCE_FILE

static unsigned checks;
#define CHECK(x) do { checks++; if (!(x)) { fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #x); exit(1); } } while (0)
typedef struct {
    uint8_t view, part, prev_view, sel[NKIT], page[NVIEWS][NPARTS];
    uint8_t spage, pbank, mixsel, overlay, list_sel, list_top, list_n, help;
    uint8_t ask_act, ask_overlay, song_sel, clip, clip_page;
    uint16_t ask_arg;
    int8_t touched;
    uint32_t touch_until, msg_until;
    char msg[sizeof ui.msg], ask_q[sizeof ui.ask_q];
} screen_state_t;
static screen_state_t screen_state(void)
{
    screen_state_t s;
    memset(&s, 0, sizeof s);
    s.view = ui.view; s.part = ui.part; s.prev_view = ui.prev_view;
    memcpy(s.sel, ui.sel, sizeof s.sel); memcpy(s.page, ui.page, sizeof s.page);
    s.spage = ui.spage; s.pbank = ui.pbank; s.mixsel = ui.mixsel;
    s.overlay = ui.overlay; s.list_sel = ui.list_sel; s.list_top = ui.list_top;
    s.list_n = ui.list_n; s.help = ui.help; s.ask_act = ui.ask_act;
    s.ask_overlay = ui.ask_overlay; s.ask_arg = ui.ask_arg; s.song_sel = ui.song_sel;
    s.touched = ui.touched; s.touch_until = ui.touch_until;
    s.msg_until = ui.msg_until; memcpy(s.msg, ui.msg, sizeof s.msg);
    memcpy(s.ask_q, ui.ask_q, sizeof s.ask_q);
    s.clip = clip_grid_mode; s.clip_page = ck.pg;
    return s;
}
static void unchanged(screen_state_t before)
{
    screen_state_t after = screen_state();
    if (memcmp(&before, &after, sizeof before)) {
        const uint8_t *a = (const uint8_t *)&before, *b = (const uint8_t *)&after;
        for (unsigned i = 0; i < sizeof before; i++)
            if (a[i] != b[i]) fprintf(stderr, "state byte %u: %u -> %u\n", i, a[i], b[i]);
    }
    CHECK(!memcmp(&before, &after, sizeof before));
}
static void shot(const char *name)
{
    const char *dir = getenv("SMC_UI_SHOTS"); char path[1024];
    if (!dir) return;
    snprintf(path, sizeof path, "%s/%s.png", dir, name); png_write(path);
}
static void setup(int view, int part)
{
    held_btn = held_keys = 0;
    memset(enc_acc, 0, sizeof enc_acc);
    memset(&ui, 0, sizeof ui);
    memset(&smc, 0, sizeof smc);
    smc_ui_cancel();
    clip_grid_mode = clip_waiting = ck.pg = 0; clip_dirty = 1;
    memset(fields, 0, sizeof fields);
    boot();
    now_ms = 1000;
    proj.set.autosave_off = 1;
    proj.set.bt = PROJ_BT_SMC_CENTRAL;
    smc_ble_link(1); smc_poll();
    ui.part = (uint8_t)part; set_view(view); build_pages();
    ui.touched = -1; ui.msg_until = 0;
    ui_frame();
}
static void message(int st, int a, int b)
{
    uint8_t msg[3] = {(uint8_t)st, (uint8_t)a, (uint8_t)b};
    smc_ble_midi(msg, 3); smc_poll();
}
static void fader(int n, int value) { message(0xE0 + n, 0, value); }
static void knob(int n, int delta) { message(0xB0, 16 + n, delta > 0 ? delta : 64 - delta); }
static void expire(void) { now_ms += 1200; ui_frame(); CHECK(!smc_ui_active()); }
static uint16_t before_fb[240 * 240], active_fb[240 * 240];
static unsigned changed_rows(int lo, int hi, const uint16_t *a, const uint16_t *b)
{
    unsigned n = 0;
    for (int y = lo; y < hi; y++) n += memcmp(a + 240 * y, b + 240 * y, 480) != 0;
    return n;
}

static void test_restore(void)
{
    const int views[] = {V_HOME, V_PART, V_GEN, V_FX, V_MIX, V_GLO, V_SONG, V_SEQ};
    for (unsigned i = 0; i < sizeof views / sizeof *views; i++) {
        setup(views[i], PART_303A);
        ui.mixsel = 3; ui.spage = 1; ui.pbank = 1; ui.sel[0] = 10; ui.sel[1] = 8;
        ui_frame(); memcpy(before_fb, fb, sizeof fb);
        screen_state_t before = screen_state();
        pref_t target = smc_target(0);
        int value = pref_get(target);
        fader(0, 0);
        CHECK(smc_ui_active()); CHECK(pref_get(target) == value); unchanged(before);
        ui_frame(); CHECK(smc_ui_active()); unchanged(before);
        CHECK(changed_rows(0, 32, before_fb, fb) > 0);
        CHECK(changed_rows(40, 150, before_fb, fb) > 20);
        CHECK(changed_rows(160, 240, before_fb, fb) > 0);
        if (!i) shot("01-main-pickup");
        expire(); unchanged(before);
        CHECK(!memcmp(before_fb, fb, sizeof fb));
        if (!i) shot("02-home-restored");
    }
}
static void test_activity(void)
{
    setup(V_HOME, PART_303A);
    pref_t r = smc_target(0); pref_set(r, 64); smc_frame();
    screen_state_t before = screen_state();
    fader(0, 0); CHECK(smc_ui_active()); CHECK(!(smc.picked & 1));
    ui_frame(); memcpy(before_fb, fb, sizeof fb);
    now_ms += 1199; ui_frame(); CHECK(smc_ui_active());
    fader(2, 0); CHECK(smc_ui_active()); unchanged(before);
    now_ms += 1; ui_frame(); CHECK(smc_ui_active());
    now_ms += 1198; ui_frame(); CHECK(smc_ui_active());
    now_ms += 1; ui_frame(); CHECK(!smc_ui_active()); unchanged(before);
    fader(0, 0); ui_frame(); memcpy(active_fb, fb, sizeof fb);
    pref_set(r, 23); ui_frame(); CHECK(memcmp(active_fb, fb, sizeof fb));
    fader(0, smc_scaled(r)); CHECK(smc.picked & 1);
    ui_frame(); shot("03-picked-fader");
    knob(6, 1); CHECK(smc_ui_active()); ui_frame(); shot("04-delay-knob");
    now_ms = UINT32_MAX - 600u;
    fader(0, 0); CHECK(smc_ui_active());
    now_ms += 1199; CHECK(smc_ui_active()); now_ms++; CHECK(!smc_ui_active());
    puts("PASS activity: pickup, live values, repeated controls, exact boundary and wrap");
}
static void test_existing_feedback(void)
{
    setup(V_FX, PART_303A);
    ui.touched = 0; ui.touch_until = now_ms + 5000;
    strcpy(ui.msg, "PRIOR FEEDBACK"); ui.msg_until = now_ms + 10000;
    ui_frame(); memcpy(before_fb, fb, sizeof fb);
    screen_state_t before = screen_state();
    fader(0, 0); CHECK(smc_ui_active()); unchanged(before);
    ui_frame(); unchanged(before); expire(); unchanged(before);
    CHECK(!memcmp(before_fb, fb, sizeof fb));
    puts("PASS feedback: existing header message and local knob readout survive temporary UI");
}
static void test_navigation(void)
{
    setup(V_PART, PART_303A); fader(0, 0); CHECK(smc_ui_active());
    held_btn = 1u << B_FX; input(); CHECK(!smc_ui_active());
    held_btn = 0; input(); CHECK(ui.view == V_FX);
    int view = ui.view; now_ms += 1500; ui_frame(); CHECK(ui.view == view && !smc_ui_active());
    fader(0, 0); CHECK(smc_ui_active()); enc_acc[EN_SELECT] = 1; input(); CHECK(!smc_ui_active());
    int page = cur_page(); now_ms += 1500; ui_frame(); CHECK(cur_page() == page);
    fader(0, 0); CHECK(smc_ui_active()); held_keys = 1; input(); CHECK(!smc_ui_active());
    held_keys = 0; input();
    fader(0, 0); CHECK(smc_ui_active());
    message(0x90, 0x2F, 127); /* SMC SEQ navigation */
    CHECK(!smc_ui_active());
    puts("PASS navigation: physical buttons, encoder, key and SMC navigation cancel");
}
static void test_overlays(void)
{
    setup(V_SEQ, PART_303A);
    fader(0, 0); CHECK(smc_ui_active());
    ask(ACT_SONG_CLR, 3, "TEST CONFIRM", "KEEP STATE");
    screen_state_t saved = screen_state();
    CHECK(!smc_ui_active()); fader(0, 127); knob(0, 1); CHECK(!smc_ui_active());
    now_ms += 1500; ui_frame(); unchanged(saved);
    setup(V_SEQ, PART_303A);
    message(0x90, 5, 127); CHECK(ui.overlay == O_LIST);
    ui.list_sel = ui.list_n > 3 ? 3 : 0; ui.list_top = 1;
    saved = screen_state(); fader(0, 0); unchanged(saved);
    now_ms += 1500; ui_frame(); unchanged(saved);
    fader(0, 0); CHECK(smc_ui_active());
    message(0x90, 0x61, 127); CHECK(ui.overlay == O_LIST && !smc_ui_active());
    saved = screen_state(); now_ms += 1500; ui_frame(); unchanged(saved);
    setup(V_SEQ, PART_303A); fader(0, 0); CHECK(smc_ui_active());
    ui.help = 1; held_btn = ui.btn = 1u << (ui.help - 1);
    CHECK(!smc_ui_active()); saved = screen_state();
    fader(0, 0); knob(0, 1); unchanged(saved);
    now_ms += 1500; ui_frame(); unchanged(saved);
    puts("PASS overlays: confirmation blocks input; menu/help state survives activity and timeout");
}
static void test_clip(void)
{
    for (int waiting = 0; waiting < 2; waiting++) {
        setup(V_SEQ, PART_303A); clip_grid_mode = 1; clip_waiting = (uint8_t)waiting;
        smk_clip_lcd_force(); ui_frame(); memcpy(before_fb, fb, sizeof fb);
        screen_state_t before = screen_state(); unsigned forces = clip_forces;
        fader(0, 0); CHECK(smc_ui_active()); ui_frame(); unchanged(before);
        CHECK(memcmp(before_fb, fb, sizeof fb));
        shot(waiting ? "06-clip-wait-smc" : "05-clip-grid-smc");
        expire(); unchanged(before); CHECK(!memcmp(before_fb, fb, sizeof fb));
        CHECK(clip_forces > forces);
    }
    setup(V_SEQ, PART_303A); clip_grid_mode = 1; ck.pg = 1;
    screen_state_t before = screen_state();
    knob(0, 1); CHECK(fields[CK_PAGE_FIELDS[0][0]] == 1); CHECK(smc_ui_active());
    ui_frame(); unchanged(before); shot("07-clip-field");
    expire(); unchanged(before);
    puts("PASS clip: grid/waiting framebuffer restores; actual extracted CK turn shows full field UI");
}
static void test_actions_and_reset(void)
{
    setup(V_HOME, PART_303A);
    strcpy(ui.msg, "PRIOR MESSAGE"); ui.msg_until = now_ms + 10000;
    screen_state_t before = screen_state();
    message(0x90, 16, 127); CHECK(smc_ui_active()); CHECK(part_muted(0));
    unchanged(before); ui_frame(); shot("08-mute-action");
    CHECK(!strcmp(ui.msg, "PRIOR MESSAGE"));
    expire(); unchanged(before);
    message(0x90, 8, 127); CHECK(smc_ui_active()); CHECK(smc.solo & 1);
    ui_frame(); memcpy(before_fb, fb, sizeof fb);
    message(0x80, 8, 0); CHECK(!(smc.solo & 1));
    ui_frame(); CHECK(!smc_ui_active() || memcmp(before_fb, fb, sizeof fb));
    setup(V_SEQ, PART_909); ui.sel[0] = 8; build_pages();
    for (int strip = 3; strip < 8; strip++) {
        fader(strip, 127); CHECK(!smc_ui_active());
        for (int row = 0; row < 3; row++) {
            message(0x90, row * 8 + strip, 127); CHECK(!smc_ui_active());
        }
    }
    setup(V_PART, PART_303A); fader(0, 0); CHECK(smc_ui_active());
    ui_init(); CHECK(!smc_ui_active());
    fader(0, 0); CHECK(smc_ui_active());
    CHECK(ui_project_begin() == 0); CHECK(!smc_ui_active());
    fader(0, 0); CHECK(!smc_ui_active()); ui_project_end(0);
    fader(0, 0); CHECK(smc_ui_active()); smc_project_reset(); CHECK(!smc_ui_active());
    puts("PASS actions/reset: mute+Solo, inactive strips, init/project lock/reset");
}
int main(void)
{
    test_restore(); puts("PASS restore: eight views preserve complete navigation state and exact framebuffer");
    test_activity(); test_existing_feedback(); test_navigation(); test_overlays(); test_clip(); test_actions_and_reset();
    setup(V_MIX, PART_909); ui_frame(); shot("feature-drum-mixer");
    setup(V_FX, PART_303A); ui_frame(); shot("feature-effects");
    printf("smc_ui: PASS (%u checks)\n", checks);
    return 0;
}
