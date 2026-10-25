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


static void capture(int view, int part, const char *name) {
 memset(&ui,0,sizeof ui); memset(&smc,0,sizeof smc); boot(); now_ms=1000;
 proj.set.autosave_off=1; proj.set.bt=PROJ_BT_SMC_CENTRAL;
 smc_ble_link(1); smc_poll(); ui.part=part; set_view(view); build_pages();
 ui.touched=-1; ui.msg_until=0;
 if(view==V_HOME) {ui.mixsel=3;ui.spage=1;ui.pbank=1;ui.sel[0]=10;ui.sel[1]=8;}
 ui_frame(); char path[1024];snprintf(path,sizeof path,"%s/%s.png",getenv("SMC_UI_SHOTS"),name);png_write(path);
}
int main(void){capture(V_HOME,PART_303A,"home");capture(V_MIX,PART_909,"mixer");capture(V_FX,PART_303A,"effects");return 0;}
