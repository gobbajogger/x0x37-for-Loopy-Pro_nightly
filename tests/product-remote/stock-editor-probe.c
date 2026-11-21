/* SPDX-License-Identifier: GPL-3.0-only
 * Use the firmware's own host wire boundary; both protocol dispatchers and the
 * INFO payload are production C. Accept only read-only INFO and DNR2 HELLO.
 */
#include <stdlib.h>
#define main unused_project_test_main
#include "tests/host/project_protocol_test.c"
#undef main
#define FELUCCA_ID "FM-1_900"
#include "firmware/src/ota.c"

/* This probe only steps the normal main-loop dispatch. */
static uint32_t ota_now_ms(void) { abort(); }
static void ota_idle(void) { abort(); }
static int ota_erase(uint32_t off) { abort(); }
static int ota_prog(uint32_t off, const void *p, uint32_t n) { abort(); }
static int ota_fread(uint32_t off, void *p, uint32_t n) { abort(); }
static void ota_show(uint32_t step, int32_t code) { abort(); }
static void ota_commit(const uint8_t *parm) { abort(); }

int main(int argc, char **argv)
{
    static const uint8_t info[] = {0x7D, 0x46, 0x4C, 1};
    static const uint8_t hello[] = {0x7D, 0x44, 0x4E, 2, 0};
    if (argc != 2) return 2;
    size_t chars = strlen(argv[1]);
    if ((chars != 12 && chars != 102) || strncmp(argv[1], "f0", 2) ||
        strcmp(argv[1] + chars - 2, "f7")) return 2;
    for (size_t i = 2; i < chars-2; i += 2) {
        unsigned value;
        if (sscanf(argv[1] + i, "%2x", &value) != 1 || value > 127) return 2;
        frame[frame_n++] = (uint8_t)value;
    }
    if (!(frame_n == sizeof info && !memcmp(frame, info, sizeof info)) &&
        !(frame_n == 49 && !memcmp(frame, hello, sizeof hello))) return 2;
    int pending = ed_service();
    if (pending) ota_service();
    if (frame_n || flash_writes || flash_erases || usb.ota_req || usb.uboot_req) return 1;
    printf("{\"editor_deferred\":%s,\"reply_hex\":\"", pending ? "true" : "false");
    for (uint32_t i = 0; i < reply_n; ++i) printf("%02x", reply[i]);
    puts("\"}");
    return 0;
}
