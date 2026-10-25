/* SPDX-License-Identifier: GPL-3.0-only */
/* Main-body replacement for isolated renderer_capture.c, not firmware source. */
int main(void) {
    setup(V_HOME, PART_303A);
    ui.mixsel = 3; ui.spage = 1; ui.pbank = 1;
    ui.sel[0] = 10; ui.sel[1] = 8; ui_frame();
    fader(0, 0); ui_frame(); shot("smc-historical");
    return 0;
}
