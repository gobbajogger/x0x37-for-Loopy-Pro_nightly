/* Song action no-ops and confirmation cancellation must report truth and preserve context. */
#define main x0x_host_main
#include "host/x0x_host.c"
#undef main

static int fails;
#define CHECK(c, msg) do { if (!(c)) { fails++; printf("FAIL: %s\n", msg); } } while (0)

static void fill_bar(song_bar_t *bar, int seed)
{
    int p;
    for (p = 0; p < NPARTS; p++)
        bar->pat[p] = (uint8_t)(seed + p);
    bar->mute = (uint8_t)(seed << 1);
}

static int action_row(int act)
{
    int i;
    for (i = 0; i < ui.list_n; i++)
        if (list_rows[i].kind == R_ACT && list_rows[i].a == act)
            return i;
    return -1;
}

int original_test_main(void)
{
    song_t before;
    int row, sel, top;

    boot();

    song()->len = NSONG;
    for (int i = 0; i < NSONG; i++)
        fill_bar(&song()->bar[i], i);
    before = *song();
    ui.song_sel = 17;
    ui.dirty = 0;
    run_action(ACT_SONG_INS, 0);
    CHECK(!memcmp(song(), &before, sizeof before), "full insertion must leave the song unchanged");
    CHECK(ui.dirty == 0, "full insertion must not mark the project dirty");
    CHECK(!strcmp(ui.msg, "SONG FULL"), "full insertion must report SONG FULL");

    song()->len = 3;
    fill_bar(&song()->bar[0], 10);
    fill_bar(&song()->bar[1], 20);
    fill_bar(&song()->bar[2], 30);
    song_bar_t old1 = song()->bar[1], old2 = song()->bar[2];
    ui.song_sel = 1;
    ui.dirty = 0;
    run_action(ACT_SONG_INS, 0);
    CHECK(song()->len == 4, "normal insertion must extend the song");
    CHECK(!memcmp(&song()->bar[1], &old1, sizeof old1), "normal insertion must keep the selected bar in place");
    CHECK(!memcmp(&song()->bar[2], &old1, sizeof old1), "normal insertion must duplicate the selected bar");
    CHECK(!memcmp(&song()->bar[3], &old2, sizeof old2), "normal insertion must shift later bars");
    CHECK(ui.dirty == 1, "normal insertion must mark the project dirty");
    CHECK(!strcmp(ui.msg, "BAR INSERTED"), "normal insertion must report success");

    ui.song_sel = 2;
    ui.dirty = 0;
    run_action(ACT_SONG_DEL, 0);
    CHECK(song()->len == 3, "normal deletion must shorten the song");
    CHECK(!memcmp(&song()->bar[1], &old1, sizeof old1), "normal deletion must keep the preceding bar");
    CHECK(!memcmp(&song()->bar[2], &old2, sizeof old2), "normal deletion must shift later bars");
    CHECK(ui.dirty == 1, "normal deletion must mark the project dirty");
    CHECK(!strcmp(ui.msg, "BAR DELETED"), "normal deletion must report success");

    ui.song_sel = song()->len;
    ui.dirty = 0;
    before = *song();
    run_action(ACT_SONG_INS, 0);
    CHECK(!memcmp(song(), &before, sizeof before), "append-row insertion must leave the song unchanged");
    CHECK(ui.dirty == 0, "append-row insertion must not mark the project dirty");
    CHECK(!strcmp(ui.msg, "NO BAR SELECTED"), "append-row insertion must report its no-op");
    run_action(ACT_SONG_DEL, 0);
    CHECK(!memcmp(song(), &before, sizeof before), "append-row deletion must leave the song unchanged");
    CHECK(ui.dirty == 0, "append-row deletion must not mark the project dirty");
    CHECK(!strcmp(ui.msg, "NO BAR SELECTED"), "append-row deletion must report its no-op");

    song()->len = 0;
    ui.song_sel = 0;
    ui.dirty = 0;
    run_action(ACT_SONG_DEL, 0);
    CHECK(ui.dirty == 0, "empty-song deletion must not mark the project dirty");
    CHECK(!strcmp(ui.msg, "NO BAR SELECTED"), "empty-song deletion must report its no-op");

    set_view(V_SONG);
    open_list_of_pages();
    row = action_row(ACT_SONG_CLR);
    CHECK(row >= 0, "Song menu must contain CLEAR SONG");
    ui.list_sel = (uint8_t)row;
    ui.list_top = (uint8_t)(row > 2 ? row - 2 : 0);
    sel = ui.list_sel;
    top = ui.list_top;
    list_enter();
    CHECK(ui.overlay == O_ASK, "CLEAR SONG must ask for confirmation");
    button_tap(B_HOME);
    CHECK(ui.overlay == O_LIST, "Song cancellation must return to its list");
    CHECK(ui.list_sel == sel && ui.list_top == top, "Song cancellation must preserve list position");

    set_view(V_GLO);
    open_global();
    row = action_row(ACT_CLEAR_PAT);
    CHECK(row >= 0, "Global menu must contain CLEAR PATTERN");
    ui.list_sel = (uint8_t)row;
    ui.list_top = (uint8_t)(row > 2 ? row - 2 : 0);
    sel = ui.list_sel;
    top = ui.list_top;
    list_enter();
    button_tap(B_HOME);
    CHECK(ui.overlay == O_LIST, "Global cancellation must return to its list");
    CHECK(ui.list_sel == sel && ui.list_top == top, "Global cancellation must preserve list position");

    set_view(V_SONG);
    ui.overlay = O_NONE;
    ask(ACT_SONG_CLR, 0, "CLEAR THE SONG?", 0);
    button_tap(B_HOME);
    CHECK(ui.overlay == O_NONE, "main-screen cancellation must return to the main screen");

    song()->len = 2;
    ui.song_sel = 1;
    ui.dirty = 0;
    open_list_of_pages();
    row = action_row(ACT_SONG_CLR);
    ui.list_sel = (uint8_t)row;
    list_enter();
    button_tap(B_SEL);
    CHECK(song()->len == 0 && ui.song_sel == 0, "confirmation must still clear the song");
    CHECK(ui.dirty == 1, "confirmed clear must mark the project dirty");
    CHECK(ui.overlay == O_NONE, "confirmed Song action must retain its completion behavior");
    CHECK(!strcmp(ui.msg, "SONG CLEARED"), "confirmed clear must report success");

    printf("song_actions: %s\n", fails ? "FAIL" : "ok");
    return fails != 0;
}

int main(void) {
  static project_t expected;
  uint32_t slots_before;
  if (original_test_main()) return 1;
  proj.arr.song.len = 7;
  expected = proj;
  expected.arr.song.len = 0;
  slots_before = st_crc32(slot_img, sizeof slot_img);
  ui.song_sel = 5;
  run_action(ACT_SONG_CLR, 0);
  CHECK(!memcmp(&proj, &expected, sizeof proj), "arrangement-only clear preserves every other project byte including stored bar bytes");
  CHECK(slots_before == st_crc32(slot_img, sizeof slot_img), "arrangement-only clear preserves all sample image bytes");
  CHECK(ui.song_sel == 0, "arrangement clear resets selection");
  printf("extended arrangement byte invariants: %s\n", fails ? "FAIL" : "ok");
  return fails != 0;
}
