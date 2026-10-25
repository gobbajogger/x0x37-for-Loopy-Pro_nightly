/* Production project/UI/engine regression. Flash and input use the host platform;
 * reset/load must replace a complete live runtime without touching sample slots. */
#define main x0x_host_main
#include "host/x0x_host.c"
#undef main
#include <assert.h>

static project_t before, expected;
static seq_t seq_before;
static int32_t block[512];
static uint32_t sample_crc;

static void render(void) { engine_render(block, 256); }
static void check_samples(void)
{
    assert(st_crc32(slot_img, sizeof slot_img) == sample_crc);
    assert(store_len[OBJ_PANEL] == 4 && !memcmp(store[OBJ_PANEL], "CAL!", 4));
}
static void released(void)
{
    held_btn = held_keys = 0;
    ui_input_only();
}
static int action_row(int action)
{
    for (int i = 0; i < ui.list_n; i++)
        if (list_rows[i].kind == R_ACT && list_rows[i].a == action)
            return i;
    return -1;
}
static void open_action(int action)
{
    set_view(V_GLO);
    open_global();
    int row = action_row(action);
    assert(row >= 0);
    ui.list_sel = (uint8_t)row;
    ui.list_top = (uint8_t)(row > 2 ? row - 2 : 0);
    list_enter();
}
static void check_stopped(void)
{
    assert(!seq.playing && !seq.req_start && !seq.req_cont && !seq.req_stop && !seq.req_rt);
    assert(!seq.mute && !seq.vmute && !seq.song_on && !seq.song_rec && !seq.song_pos && !seq.song_start);
    assert(!seq.chain_a && !seq.chain_b && !seq.ext && !seq.ext_pending);
    assert(!ui.rec && !save_wait && !undo.n && !undo.cur);
    assert(ui.held_step == -1 && ui.hold_step == -1 && ui.brk_held == -1);
    for (int i = 0; i < NTRACKS; i++) {
        assert(seq.ppat[i] == 0 && seq.pcue[i] == 0xFF && eng_step[i] == 0);
        assert(!seq.t[i].started && !seq.t[i].sounding && !seq.t[i].rec_skip);
    }
    for (int i = 0; i < NBASS; i++)
        assert(!kbd_held_note[i] && !kbd_held_key[i] && !bass_rec_step[i] && !ui.freeplay[i]);
    assert(!engine_midi_held());
}

static void reset_during_play(void)
{
    bstep_t *note = &proj.pat[0].bass[0].step[0];
    note->note = 48;
    note->flags = G_NOTE | BS_SLIDE;
    note->velocity = 100;
    seq.bpm = 197.3f;
    seq.accent_q7 = 31;
    seq.ch[TRK_BASS0] = 7;
    seq.send_notes = seq.send_clock = 1;
    seq.clk_src = SEQ_CLK_INT;
    proj.set.bt = PROJ_BT_CLK_IN | PROJ_BT_SMC_CENTRAL | PROJ_BT_SMC_USER | 1u;
    seq_start(&seq);
    render();
    assert(seq.playing && engine_midi_held() && seq.bass_out_valid[0]);
    for (int i = 0; i < NTRACKS; i++) seq.pcue[i] = (uint8_t)(i + 2);
    seq.chain_a = 2; seq.chain_b = 8;
    seq.song_on = seq.song_rec = 1;
    seq.song_pos = 12; seq.song_start = 6;
    seq.mute = 0x1234; seq.vmute = 0x40;
    seq.req_start = seq.req_stop = seq.req_cont = 1;
    seq.t[TRK_BASS0].rec_skip = 1;
    ui.rec = ui.freeplay[0] = 1;
    ui.held_step = ui.hold_step = ui.brk_held = 3;
    kbd_held_note[0] = 48; kbd_held_key[0] = 7; bass_rec_step[0] = 1;
    held_keys = 1u << 6;
    ui.keys = held_keys;
    save_wait = 1;
    engine_motion_rec(0);
    engine_bass_on(1, 72, 1, 0);       /* commands and MIDI queued before replacement must not replay */
    engine_drum(0, 0, 1.0f);
    min_q[mi_w++ % MQ] = 0xFA0Fu;
    uint32_t writes = store_writes, ons = note_ons, transports = transport_out_count;
    assert(ui_project_reset() == 0);
    check_stopped();
    assert(seq.bpm == 125.0f && seq.accent_q7 == 88 && seq.clk_src == SEQ_CLK_AUTO);
    assert(seq.send_clock == 1 && seq.send_notes == 0 && seq.ch[TRK_BASS0] == 1);
    assert((proj.set.bt & PROJ_DEVICE_BT) == (PROJ_BT_SMC_CENTRAL | PROJ_BT_SMC_USER | 1u));
    assert(ui.dirty && store_writes == writes && transport_out_count == transports + 1);
    assert(!strcmp(ui.msg, "PROJECT RESET: SAMPLES KEPT"));
    render();
    assert(!seq.playing && !engine_midi_held() && note_ons == ons);
    for (int i = 0; i < 512; i++) assert(block[i] == 0); /* old voices and effect tails are gone */
    for (int i = 0; i < NLANE; i++) assert(engine_motion_value(i) == -1);
    project_reset_stage();
    assert(!memcmp(&proj, &project_stage, sizeof proj));
    undo_start();
    check_samples();
    released();
}

static void save_and_load(void)
{
    seq.bpm = 147.3f;
    seq.accent_q7 = 51;
    seq.send_notes = 1;
    seq.send_clock = 0;
    seq.clk_src = SEQ_CLK_EXT;
    seq.ch[TRK_BASS0] = 12;
    seq.ch[TRK_BRK] = SEQ_CH_OFF;
    proj.set.palette = 2;
    proj.set.bt = (uint8_t)((proj.set.bt & ~PROJ_BT_CLK_MASK) | SEQ_CLK_EXT << 1);
    proj.sound.v[T_303][0][BASS303_CUTOFF] = 102;
    proj.pat[31].drum[1].hit[3][1] = 0x2000;
    mark_dirty();
    assert(ui_project_save() == 0 && !ui.dirty);
    expected = proj;
    seq.bpm = 212.0f;
    seq.accent_q7 = 100;
    seq.ch[TRK_BASS0] = 4;
    proj.sound.v[T_303][0][BASS303_CUTOFF] = 3;
    mark_dirty();
    open_action(ACT_LOAD);
    assert(ui.overlay == O_ASK && ui.ask_act == ACT_LOAD);
    assert(!strcmp(ui.ask_q[1], "DISCARD UNSAVED EDITS"));
    before = proj; seq_before = seq;
    int sel = ui.list_sel, top = ui.list_top;
    uint32_t writes = store_writes;
    button_tap(B_HOME);
    assert(ui.overlay == O_LIST && ui.list_sel == sel && ui.list_top == top);
    assert(!memcmp(&proj, &before, sizeof proj) && !memcmp(&seq, &seq_before, sizeof seq));
    assert(ui.dirty && store_writes == writes);
    list_enter();
    button_tap(B_SEL);
    assert(!memcmp(&proj, &expected, sizeof proj));
    assert(seq.bpm == 147.3f && seq.ext_bpm == seq.bpm && seq.accent_q7 == 51);
    assert(seq.ch[TRK_BASS0] == 12 && seq.ch[TRK_BRK] == SEQ_CH_OFF);
    assert(seq.send_notes == 1 && seq.send_clock == 0 && seq.clk_src == SEQ_CLK_EXT);
    assert(!ui.dirty && !ui_project_busy() && store_writes == writes);
    check_stopped();
    check_samples();
    render();
}

static void invalid_load_and_undo(void)
{
    undo_start();
    uint8_t cutoff = proj.sound.v[T_303][0][BASS303_CUTOFF];
    proj.sound.v[T_303][0][BASS303_CUTOFF]++;
    mark_dirty();
    before = proj; seq_before = seq;
    uint32_t writes = store_writes;
    uint8_t old = store[OBJ_PAT0][16];
    store[OBJ_PAT0][16] ^= 0x55;
    assert(ui_project_load() != 0);
    assert(!memcmp(&proj, &before, sizeof proj) && !memcmp(&seq, &seq_before, sizeof seq));
    assert(ui.dirty && !ui_project_busy() && store_writes == writes && undo.n == 1);
    assert(!memcmp(undo_shadow, (uint8_t *)&proj + UNDO_OFF, UNDO_BYTES));
    do_undo(0);
    assert(proj.sound.v[T_303][0][BASS303_CUTOFF] == cutoff);
    store[OBJ_PAT0][16] = old;
    check_samples();
    render();
}

static void abort_and_apply_transfer(void)
{
    before = proj; seq_before = seq;
    uint32_t writes = store_writes, dirty = ui.dirty;
    int history = undo.n;
    assert(ui_project_begin() == 0 && ui_project_busy());
    project_capture_stage();
    assert(project_validate_stage() == 0);
    memset(&project_stage, 0xA5, sizeof project_stage);
    held_btn = 1u << B_PLAY;
    held_keys = 1u << 3;
    enc_acc[EN_K1] = 12;
    now_ms += AUTOSAVE_QUIET + AUTOSAVE_GAP;
    ui_frame();
    assert(enc_acc[EN_K1] == 0 && store_writes == writes);
    assert(ui_project_begin() == UI_PROJECT_BUSY && ui_project_save() == UI_PROJECT_BUSY);
    assert(ui_project_reset() == UI_PROJECT_BUSY && ui_project_load() == UI_PROJECT_BUSY);
    for (int i = 0; i < 512; i++) block[i] = 123;
    render();
    for (int i = 0; i < 512; i++) assert(block[i] == 0);
    assert(!memcmp(&seq, &seq_before, sizeof seq));
    min_q[mi_w++ % MQ] = 0xFA0Fu;
    min_q[mi_w++ % MQ] = 0x7F409C09u;
    ui_project_end(0);
    assert(!ui_project_busy() && !memcmp(&proj, &before, sizeof proj));
    assert(!memcmp(&seq, &seq_before, sizeof seq) && ui.dirty == dirty && undo.n == history);
    assert(!memcmp(undo_shadow, (uint8_t *)&proj + UNDO_OFF, UNDO_BYTES));
    ui_input_only();
    assert(!seq.req_start);                          /* PLAY pressed during the transfer was consumed */
    released();
    render();
    assert(!seq.playing && !engine_midi_held());
    assert(ui_project_begin() == 0);
    project_reset_stage();
    project_stage.set.bpm_x10 = 1660;
    project_stage.set.accent_q7 = 29;
    project_stage.set.midi_ch[TRK_BASS0] = 6;
    project_stage.sound.v[T_303][0][BASS303_CUTOFF] = 71;
    assert(project_validate_stage() == 0);
    ui_project_end(1);
    assert(ui.dirty && seq.bpm == 166.0f && seq.accent_q7 == 29 && seq.ch[TRK_BASS0] == 5);
    assert(proj.sound.v[T_303][0][BASS303_CUTOFF] == 71);
    assert(store_writes == writes);
    check_stopped();
    check_samples();
    render();
}

static void busy_and_save_status(void)
{
    before = proj;
    seq_start(&seq);
    render();
    seq_before = seq;
    uint32_t writes = store_writes;
    assert(ui_project_begin() == UI_PROJECT_BUSY);
    assert(ui_project_load() == UI_PROJECT_BUSY);
    assert(ui_project_save() == UI_PROJECT_BUSY);
    assert(!memcmp(&proj, &before, sizeof proj) && !memcmp(&seq, &seq_before, sizeof seq));
    assert(seq.playing && store_writes == writes);
    save_project();
    assert(save_wait);
    seq_stop(&seq);
    render();
    ui_frame();
    assert(!save_wait && !ui.dirty && store_writes > writes);
    proj.sound.v[T_303][0][BASS303_CUTOFF]++;
    mark_dirty();
    store_fail = 1;
    assert(ui_project_save() == -2);                 /* sound-storage failure is distinct from busy */
    assert(ui.save_failed && ui.dirty);
    store_fail = 0;
    assert(ui_project_save() == 0);
    check_samples();
}

static void performance_save_window(void)
{
    seq.bpm = 171.0f;
    proj.sound.v[T_303][0][BASS303_CUTOFF]++;
    mark_dirty();
    seq_start(&seq);
    render();
    uint32_t writes = store_writes;
    perf_test_start();
    render();                                      /* consume the performance test's initial stop */
    assert(perf.phase == 0 && !seq.playing && !seq.req_stop && seq.pat == proj.pat);
    now_ms += AUTOSAVE_QUIET + AUTOSAVE_GAP;
    autosave();                                    /* ordinary quiet-time autosave stays disabled throughout the test */
    assert(ui.dirty && !save_wait && store_writes == writes);
    assert(ui_project_begin() == UI_PROJECT_BUSY); /* phase 0 allows the queued save, not a project replacement */
    save_project();                                /* an explicit save is safe before perf_build */
    assert(store_writes > writes && !save_wait && !ui.dirty);
    ui_frame();
    assert(perf.phase == 1 && seq.pat != proj.pat);
    render();
    assert(seq.playing);

    proj.sound.v[T_303][0][BASS303_CUTOFF]++;
    mark_dirty();
    save_project();
    assert(save_wait);
    writes = store_writes;
    perf_test_abort();
    render();                                      /* stopped, but temporary sound/settings still own the runtime */
    assert(perf.phase == 3 && !seq.playing && !seq.req_stop && seq.pat != proj.pat);
    assert(ui_project_save() == UI_PROJECT_BUSY);
    assert(ui_project_begin() == UI_PROJECT_BUSY);
    save_project();
    autosave();
    assert(save_wait && ui.dirty && store_writes == writes);
    perf_test_tick();
    assert(perf.phase == 4 && seq.pat == proj.pat && seq.bpm == 171.0f);
    ui_frame();
    assert(!save_wait && !ui.dirty && store_writes > writes);
    assert(project_load_stage() == 0 && project_stage.set.bpm_x10 == 1710);
    check_samples();
}

int original_test_main(void)
{
    memset(slot_img, 0xA5, sizeof slot_img);
    sample_crc = st_crc32(slot_img, sizeof slot_img);
    memcpy(store[OBJ_PANEL], "CAL!", 4);
    store_len[OBJ_PANEL] = 4;
    midi_log = tmpfile();
    assert(midi_log);
    boot();
    render();
    reset_during_play();
    fflush(midi_log);
    rewind(midi_log);
    char log[4096];
    size_t n = fread(log, 1, sizeof log - 1, midi_log);
    log[n] = 0;
    assert(strstr(log, "87 30 00"));                 /* old bass note released on its original channel */
    fclose(midi_log); midi_log = 0;
    save_and_load();
    invalid_load_and_undo();
    abort_and_apply_transfer();
    busy_and_save_status();
    performance_save_window();
    puts("project_runtime: reset, load, cancel, invalid, transfer, save and sample preservation ok");
    return 0;
}

int main(void) {
  if (original_test_main()) return 1;
  proj.set.autosave_off = 1;
  seq.clk_src = SEQ_CLK_EXT;
  seq.ext = seq.ext_pending = 1;
  seq.playing = seq.req_start = seq.req_cont = 1;
  seq.song_rec = ui.rec = 1;
  assert(ui_project_reset() == 0);
  check_stopped();
  assert(!proj.set.autosave_off && ui.dirty && seq.clk_src == SEQ_CLK_AUTO);
  check_samples();
  uint32_t writes = store_writes;
  now_ms += AUTOSAVE_QUIET + AUTOSAVE_GAP;
  autosave();
  assert(!ui.dirty && store_writes > writes);
  expected = proj;
  check_samples();
  boot();
  assert(!memcmp(&proj, &expected, sizeof proj));
  check_samples();
  puts("extended reset external-clock/record/autosave/reboot invariants: ok");
  return 0;
}
