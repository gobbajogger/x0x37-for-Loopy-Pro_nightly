/* SPDX-License-Identifier: GPL-3.0-only */
/* SMK-37 Bluetooth MIDI (BLE only, no audio): the app side.
 *
 * A separate controller image (ble/ctl: the MPL shim and JieLi's own files, built on the user's
 * computer, never part of this program) sits in the flash block at 0x8B000. This file:
 *   - checks it (header, CRC, entries, RAM window, interrupts) before anything starts it;
 *   - starts it on core 1 at power-on (its init entry, core 0 in RAM meanwhile, fm1_cpu1.h) and
 *     hands core 1's idle loop its poll entry;
 *   - talks to it only through standard HCI packets in the mailbox rings (x0x_ble_abi.h), with
 *     the BLE-MIDI host (ble/ble_midi_host.c, MPL-2.0, from felucca-bsp);
 *   - puts BLE-MIDI in into the USB MIDI in queue and mirrors the MIDI out (clock, notes) to BLE.
 * Without an image, or with BLUETOOTH OFF at power-on, nothing of this runs and core 1 starts as
 * before. Service: the TIMER5 interrupt, next to usb_poll (2 kHz, never inside the render). */
#include "fm1_ble.h"
#include "fm1_supply.h"
#include "ble/ble_midi_host.c"
#include "ble/ble_midi_central.c"
#include "ble/ble_glue.h"

/* All of it in BLERAM (main RAM is full): not cleared at boot, so ble_start sets every field it
 * reads, and nothing reads them before (ble_host_on, in .bss, stays 0 until then). */
#define BLE_OQ 56u                              /* MIDI out to mirror: USB-MIDI packets (SMK pool floor) */
typedef struct {
    xb_mbox_t mb;                               /* first: 64-byte aligned (the rings' cache lines) */
    union { bleh_t h; struct { blec_t c, c2; }; } host;
    xb_boot_t boot;
    uint8_t fr[XB_FRAME_MAX];                   /* one frame from the controller */
    volatile uint32_t ow, orr;
    uint32_t sysex_drops;
    char nm[9];                                 /* the name it advertises */
} ble_ram_t;
_Static_assert(sizeof(blec_t) * 2u <= sizeof(bleh_t), "two central peers must fit the peripheral union");
static ble_ram_t ble_r __attribute__((section(".ble_ram"), aligned(64)));
/* attempt 32: the MIDI out mirror in the pool (zeroed at boot), so BLERAM has room for a 64-message
 * MIDI in queue. Written by the audio ISR and read by ble_service, both on core 0. */
static uint32_t ble_oq[BLE_OQ] __attribute__((section(".pool")));
/* core 0's last Bluetooth tick (ms since boot) and core 1's poll count then. In .ble_ram (not
 * cleared): after a watchdog reset, DIAG shows when core 0 stopped and if core 1 still ran. */
static uint32_t ble_alive[2] __attribute__((section(".ble_ram")));
static uint32_t ble_rails[2] __attribute__((section(".ble_ram")));   /* attempt 27: before, after the stock supply setup
                                                                      * (CON5 | CON6 << 8 | CON9 << 16 | CON0 << 24) */

static void ble_record(void);
static uint8_t ble_central_role;                 /* active role; changed only by TIMER5 after the old role stops */
/* attempt 34 (DIAG): interval | end reason << 16 | pairing refusals << 24;
 * MIDI in drops | asked MTU << 8 (10 bits) | request sent << 18 | result << 19 | latency << 21 (3) | L2CAP requests << 24 */
static uint32_t ble_sat(uint32_t v, uint32_t m) { return v > m ? m : v; }
extern uint32_t smc_rx_diag(void);
static uint32_t ble_h_link0(void)
{
    if (ble_central_role) return (uint32_t)ble_r.host.c.rx_acl | (uint32_t)ble_r.host.c.rx_notify << 8 |
                                 (uint32_t)ble_r.host.c.rx_midi << 16 | (uint32_t)ble_r.host.c.rx_reject << 24;
    return ble_r.host.h.conn_int | (uint32_t)ble_r.host.h.disc_reason << 16 | ble_sat(ble_r.host.h.smp_rejects, 255u) << 24;
}
static uint32_t ble_h_link1(void)
{
    if (ble_central_role) return smc_rx_diag();
    return ble_sat(ble_r.host.h.drops_in, 255u) | ble_sat(ble_r.host.h.mtu_req, 1023u) << 8 | (uint32_t)(ble_r.host.h.cpu_state & 1u) << 18 |
           (uint32_t)(ble_r.host.h.cpu_result & 3u) << 19 | ble_sat(ble_r.host.h.conn_lat, 7u) << 21 | (uint32_t)ble_r.host.h.sig_reqs << 24;
}
static uint8_t ble_img = BLE_IMG_NONE, ble_boot_on, ble_up, ble_want, ble_host_on, ble_dead, ble_blocked;
extern int smc_ble_role_get(void);
extern void smc_ble_midi_slot(unsigned slot, const uint8_t *msg, uint8_t len);
extern void smc_ble_link_slot(unsigned slot, int up);
extern void smc_mmc_host(uint8_t cmd, uint8_t src);
static uint32_t ble_ok_at;                      /* fm1_ms when the controller became READY */
/* the start guard (ble_glue.h): survives a reset, so a start that crashes or freezes the unit is not
 * tried again at the next power-on */
ble_guard_t ble_guard __attribute__((section(".noinit")));
extern uint32_t _ram_sink[], _ram_sink_end[];   /* app.ld: 1 KiB at 0x01C00000 that nothing uses */
#define BLE_SINK_FILL(i) (0x5A17C0DEu ^ ((i) * 0x01010101u))
static void ble_sink_fill(void)
{
    uint32_t i, n = (uint32_t)(_ram_sink_end - _ram_sink);
    for (i = 0; i < n; i++)
        _ram_sink[i] = BLE_SINK_FILL(i);
}
/* how many words of the sink changed since ble_sink_fill: a write by the radio (or its DMA) */
/* core 0's record of its start wait (fm1_cpu1.h), kept in the guard */
static void ble_wait_record(void)
{
    uint32_t i;
    ble_guard.wait_ms = fm1_c1_wait_ms;
    for (i = 0; i < 4u; i++)
        ble_guard.seen[i] = fm1_c1_wait_seen[i];
    ble_guard.code_bad = fm1_c1_sum_bad;
    ble_guard.code_sum = fm1_c1_sum_got;
}
static void ble_sink_check(void)
{
    uint32_t i, n = (uint32_t)(_ram_sink_end - _ram_sink), bad = 0;
    for (i = 0; i < n; i++)
        if (_ram_sink[i] != BLE_SINK_FILL(i)) {
            if (!bad++) {
                ble_guard.sink_at = (uint32_t)(uintptr_t)&_ram_sink[i];
                ble_guard.sink_val = _ram_sink[i];
            }
        }
    ble_guard.sink_n = bad;
}

static int ble_send(uint8_t t, const uint8_t *p, uint16_t n, void *ctx)
{
    (void)ctx;
    return xb_frame_put(&ble_r.mb.h2c, t, p, n);
}
/* attempt 29: the APC40 mkII identity and introduction over Bluetooth (Loopy Pro on a BLE port), as
 * usb.c does on USB. Other SysEx from Bluetooth is not taken (counted). */
extern uint8_t smk_apc_usb_event(uint32_t pkt);
extern void smk_apc_ble_host_seen(void);
extern void smk_apc_host_generic(uint8_t ble);
extern void smk_apc_ble_link(uint8_t connected, uint8_t notifying);
extern uint8_t smk_apc_ble_event(uint32_t pkt, uint8_t notifying);
extern void smk_inlog(uint32_t src, uint32_t pkt);   /* a76: the inbound recorder (main_fm1.c) */
static uint8_t ble_sx[16], ble_sx_n, ble_sx_over, ble_sx_reply, ble_sx_ch;
static void ble_sysex_in(const uint8_t *p, uint32_t n, int end, void *ctx)
{
    (void)ctx;
    if (smc_ble_role_get()) {
        ble_sx_n = ble_sx_over = ble_sx_reply = 0;
        return;                                 /* discard the old device link during a role change */
    }
    if (!end) {
        while (n--) {
            if (ble_sx_n < sizeof ble_sx) ble_sx[ble_sx_n++] = *p++;
            else ble_sx_over = 1;
        }
        return;
    }
    if (end > 0 && !ble_sx_over && ble_sx_n == 4u && ble_sx[0] == 0x7Eu && ble_sx[2] == 0x06u &&
        ble_sx[3] == 0x01u && (ble_sx[1] <= 0x0Fu || ble_sx[1] == 0x7Fu)) {
        ble_sx_ch = ble_sx[1];                    /* Universal Device Inquiry */
        ble_sx_reply = 1;
        smk_apc_ble_host_seen();
    } else if (end > 0 && !ble_sx_over && ble_sx_n == 10u && ble_sx[0] == 0x47u && ble_sx[1] == 0x7Fu &&
               ble_sx[2] == 0x29u && ble_sx[3] == 0x60u && ble_sx[4] == 0x00u && ble_sx[5] == 0x04u &&
               (ble_sx[6] == 0x40u || ble_sx[6] == 0x41u || ble_sx[6] == 0x42u)) {
        ble_sx_reply = 2;                         /* the APC40 mkII introduction */
        smk_apc_ble_host_seen();
        if (ble_sx[6] == 0x40u)
            smk_apc_host_generic(1u);             /* CLP-18: generic mode: the Bluetooth host feedback ends */
    } else if (end > 0 && !ble_sx_over && ble_sx_n == 4u && ble_sx[0] == 0x7Fu && ble_sx[1] == 0x7Fu &&
               ble_sx[2] == 0x06u && ble_sx[3] >= 1u && ble_sx[3] <= 43u) {
        smc_mmc_host(ble_sx[3], 1u);
    } else if (end)
        ble_r.sysex_drops++;
    ble_sx_n = 0;
    ble_sx_over = 0;
}
static void ble_sx_answer(bleh_t *h)
{
    uint8_t m[35];
    uint32_t i, n;
    if (!ble_sx_reply || !bleh_notifying(h))
        return;
    for (i = 0; i < sizeof m; i++) m[i] = 0;
    if (ble_sx_reply == 1u) {                     /* the same reply as usb.c apc40_device_inquiry */
        m[0] = 0xF0; m[1] = 0x7E; m[2] = ble_sx_ch; m[3] = 0x06; m[4] = 0x02;
        m[5] = 0x47; m[6] = 0x29; m[7] = 0x00; m[8] = 0x19;
        m[9] = 0x01; m[10] = 0x02; m[13] = 0x7F;
        m[34] = 0xF7;
        n = 35u;
    } else {                                      /* usb.c apc40_introduction_reply */
        m[0] = 0xF0; m[1] = 0x47; m[2] = 0x7F; m[3] = 0x29; m[4] = 0x61; m[5] = 0x00; m[6] = 0x09;
        m[16] = 0xF7;
        n = 17u;
    }
    if (bleh_sysex_send(h, m, n, (uint16_t)(fm1_ms & 0x1FFFu)) != -2)
        ble_sx_reply = 0;                         /* sent (or refused): busy only waits */
}

/* Power-on: initialize a valid controller even if Bluetooth is OFF, but
 * preserve the requested radio state. RF initialization cannot run from a
 * live UI setter, and only TIMER5 starts advertising or SMC scanning. */
static void ble_prepare(int on)
{
    const xb_header_t *h = FM1_BLE_HDR;
    fm1_t5w_boot();                             /* before TIMER5 starts: keep the last boot's frame watch */
    ble_img = (uint8_t)ble_img_check(FM1_BLE_IMG, XB_FLASH_SIZE, XB_FLASH_XIP);
    ble_want = (uint8_t)(on != 0);
    ble_central_role = (uint8_t)(smc_ble_role_get() != 0);
    if (ble_guard.magic == BLE_GUARD_MAGIC && ble_guard.trying) {
        if (ble_r.mb.magic == XB_MBOX_MAGIC)
            ble_record();                       /* the start that reset the unit: its mailbox (BLERAM) */
        ble_sink_check();                       /* (the boot may have used that RAM too) */
        ble_guard.sink_n |= 0x80000000u;        /* bit 31: checked at the next boot, not after the init */
        ble_guard.reset = fm1_boot.p3_rst | (fm1_boot.rst_src & 0xFFFFFFu) << 8;   /* what reset it */
        ble_guard.wait_end = fm1_c1_wait_end;   /* how core 0's wait ended (RAM code) */
        ble_wait_record();
    }
    /* Preserve the real boot guard even for a saved OFF preference. */
    if (!ble_guard_boot(&ble_guard, ble_img == BLE_IMG_OK, 1)) {
        if (ble_img == BLE_IMG_OK && ble_guard.blocked) {
            ble_blocked = 1;                    /* the last start failed: not now (STATUS FAILED) */
            ble_dead = 1;
        }
        return;
    }
    ble_boot_on = 1;
    fm1_cpu1_ble_stacks(h->isr_stack_hi, h->ram_lo);
    fm1_guard_xip_hi = XB_FLASH_XIP + XB_FLASH_SIZE - 1u;
    fm1_guard_ram_hi = h->ram_hi;
}

/* power-on, after core 1 started and before the audio and TIMER5: run the image's init on core 1
 * with core 0 in RAM (the controller's RF trim), then hand core 1 its poll entry */
/* The controller's init runs on core 0 at power-on, before core 1 starts (one core runs, as in
 * fm1-ctl). Tests 1-11 ran it on core 1 while core 0 waited in RAM: core 0 stopped about 48 ms
 * into every start (in the TX IQ trim), with its RAM code unchanged; core 1 then went on to READY.
 * ble_attach hands the controller to core 1 after plat_cpu2_set. */
static uint8_t ble_c0_ready;
static void ble_central_link_notify_slot(unsigned slot, int up);
static void ble_central_link_notify(int up);
static void ble_central_midi(const uint8_t *p, uint8_t n, void *ctx)
{
    unsigned slot = (unsigned)(uintptr_t)ctx;
    blec_t *c = slot ? &ble_r.host.c2 : &ble_r.host.c;
    /* Subscription completion and the first MIDI notification can arrive
     * within one TIMER5 receive batch. Publish the new connection boundary
     * BEFORE enqueueing that packet; the late service-level notification
     * would otherwise cut away genuine new-session controls. */
    if (blec_connected(c))
        ble_central_link_notify_slot(slot, 1);
    /* Reuse the bounded ISR-owned INLOG ring; MMC records command in d1. */
    if (n == 3u)
        smk_inlog(4u, (uint32_t)p[0] << 8 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 24);
    else if (n == 6u)
        smk_inlog(4u, (uint32_t)p[0] << 8 | (uint32_t)p[4] << 16);
    /* TIMER5: stop old-role input as soon as a role change is requested. */
    if (ble_want && smc_ble_role_get()) smc_ble_midi_slot(slot, p, n);
}
static void ble_start(void)
{
    const xb_header_t *h = FM1_BLE_HDR;
    xb_mbox_t *mb = &ble_r.mb;
    int rc;
    uint32_t bus, stk, top;
    uint8_t addr[6];
    {
        static const uint8_t none[1] = {0};
        if (flash_ok)                           /* the factory record (USRTRIM): one address per unit */
            ble_addr_of(fm1_xip_ptr(SMK_TRIM_FLASH), 0x22Cu, addr, ble_r.nm);
        else
            ble_addr_of(none, 1u, addr, ble_r.nm);
    }
    ble_r.ow = ble_r.orr = 0;
    ble_r.sysex_drops = 0;
    ble_c0_ready = 0;
    if (!ble_boot_on)
        return;
    {
        uint8_t *z = (uint8_t *)mb;
        uint32_t i;
        for (i = 0; i < sizeof *mb; i++)
            z[i] = 0;
    }
    mb->magic = XB_MBOX_MAGIC;
    mb->abi = XB_ABI;
    xb_ring_init(&mb->h2c);
    xb_ring_init(&mb->c2h);
    fm1_ble_boot_fill(&ble_r.boot, mb);
    if (ble_central_role) {
        blec_init(&ble_r.host.c, ble_send, ble_central_midi, 0, addr);
        blec_init(&ble_r.host.c2, ble_send, ble_central_midi, (void *)1, addr);
        blec_pair_bind(&ble_r.host.c, &ble_r.host.c2);
    } else {
        blec_pair_bind(0, 0);
        bleh_init(&ble_r.host.h, ble_send, 0, ble_r.nm, addr);
        bleh_set_sysex(&ble_r.host.h, ble_sysex_in);
    }
    fm1_ble_sync();
    ble_guard.start_ms = fm1_ms;
    ble_guard.sink_n = ble_guard.sink_at = ble_guard.sink_val = ble_guard.wait_end = 0;
    ble_guard.xosc_pre = fm1_ble_xosc();
    ble_guard.xosc_post = 0;
    ble_sink_fill();
    fm1_guard_enable(FM1_GUARD_PC);             /* the PC windows with the image's flash and RAM (ble_prepare) */
    bus = fm1_guard_bus_pause();                /* JieLi's RF code: not for the bus-invalid checks */
    top = (uint32_t)fm1_guard_top_locked();
    if (top)
        fm1_guard_unlock_top();                 /* request_irq writes the vectors */
    fm1_wdt_feed();                             /* init takes about 0.6 s of the 8 s */
    {   /* attempt 27: the stock supply setup (DCDC13, VDC14 1.60 V, SYSVDD 1.38 V) before the RF init */
        uint32_t f = irq_save();
        ble_rails[0] = fm1_rails_read() | (uint32_t)fm1_p33_read(0x00u) << 24;
        (void)fm1_supply_stock();               /* its read-back: rails[1] (DIAG) */
        ble_rails[1] = fm1_rails_read() | (uint32_t)fm1_p33_read(0x00u) << 24;
        irq_restore(f);
    }
    {
        uint32_t f = irq_save(), t0 = fm1_ticks();
        stk = fm1_guard_stack_pause();          /* the image's run stack */
        rc = fm1_ble_init_here(h->init, &ble_r.boot);
        fm1_guard_stack_resume(stk);
        ble_guard.init_ms = (fm1_ticks() - t0) / (FM1_TICKS_PER_US * 1000u);
        irq_restore(f);
    }
    if (top)
        fm1_guard_lock_top();
    fm1_wdt_feed();
    ble_guard.xosc_post = fm1_ble_xosc();
    ble_record();
    ble_sink_check();
    ble_guard_started(&ble_guard, 0, rc == 0 && mb->state == XB_ST_READY);
    if (rc != 0 || mb->state != XB_ST_READY) {
        fm1_guard_bus_resume(bus);
        ble_dead = 1;
        return;
    }
    ble_c0_ready = 1;                           /* the bus-invalid checks stay off while it runs */
}

#ifndef X0X_RAM_CANARY
#define X0X_RAM_CANARY 0  /* 1: arm the test-26 RAM canary (0x01C72000-0x01C74000, test builds only) */
#endif

/* after plat_cpu2_set: core 1 runs the controller from now on (its interrupts, its poll) */
static void ble_attach(void)
{
    const xb_header_t *h = FM1_BLE_HDR;
    if (!ble_c0_ready)
        return;
    if (!fm1_c1_on) {                           /* one core (fm1-x0x#10): no Bluetooth */
        ble_guard.trying = 0;                   /* not the controller's fault: no block */
        fm1_guard_bus_resume(FM1_GUARD_BUS_BITS);
        ble_dead = 1;
        return;
    }
    fm1_guard_watch_c0_stacks();               /* test 21: who changes core 0's interrupt stack */
    fm1_t5w_arm = 1;                            /* test 23: the timer 5 frame closed to all writers */
#if X0X_RAM_CANARY
    /* Test 26: the RAM canary, core 1 watches it. Test builds only: the area
     * overlaps the end of .pool when less than 8 KiB of the pool is free. */
    for (uint32_t *cw = (uint32_t *)(uintptr_t)FM1_CAN_LO; cw < (uint32_t *)(uintptr_t)FM1_CAN_HI; cw++)
        *cw = 0xFFFFFFFFu;
    fm1_can.n = fm1_can.scans = 0;
    fm1_can.armed = 0xCA9A11E5u;
#else
    fm1_can.armed = 0;                          /* .ble_ram survives a reset: clear an old arm */
#endif
    fm1_c0_dead.magic = 0;                      /* test 24: core 1 watches core 0's clock */
    fm1_c0_dead.n = 0;
    fm1_ble_sync();
    fm1_c1_c0_clock = &fm1_ms;
    fm1_c1_mb.poll = (void (*)(void))(uintptr_t)h->poll;
    fm1_ble_sync();
    ble_ok_at = fm1_ms;
    ble_up = 1;
}

/* the image's start record and the mailbox, kept in the guard (ED_DIAG reads it) */
static void ble_record(void)
{
    uint32_t i;
    fm1_ble_sync();
    ble_guard.mb_state = ble_r.mb.state;
    ble_guard.mb_err = ble_r.mb.err;
    for (i = 0; i < 6u; i++)
        ble_guard.dbg[i] = ble_r.mb.dbg[i];
}

/* CIN 8 / CIN 9 vel0 — same release class as usb.c midi_pkt_is_note_off. */
static int ble_out_is_note_off(uint32_t pkt)
{
    uint32_t cin = pkt & 0xFu;
    return cin == 8u || (cin == 9u && ((pkt >> 24) & 0x7Fu) == 0u);
}

/* USB-MIDI single-byte realtime transport (CIN 0xF): Start/Continue/Stop.
 * Mirror usb.c midi_pkt_is_rt_transport on the BLE out ring. */
static int ble_out_is_rt_transport(uint32_t pkt)
{
    uint32_t st;
    if ((pkt & 0xFu) != 0xFu)
        return 0;
    st = (pkt >> 8) & 0xFFu;
    return st == 0xFAu || st == 0xFBu || st == 0xFCu;
}

static int ble_out_pkt_is_keep(uint32_t pkt)
{
    return ble_out_is_note_off(pkt) || ble_out_is_rt_transport(pkt);
}

/* the audio ISR (single producer): mirror one MIDI out packet */
static void ble_out(uint32_t pkt)
{
    uint32_t i, pass, ww, rr;
    if (ble_central_role || smc_ble_role_get() || !ble_want ||
        !ble_host_on || !bleh_notifying(&ble_r.host.h))
        return;
    ww = ble_r.ow;
    rr = ble_r.orr;
    if (ww - rr < BLE_OQ) {
        ble_oq[ww % BLE_OQ] = pkt;
        RING_PUBLISH();
        ble_r.ow = ww + 1u;
        return;
    }
    /* Full BLE out mirror: drop CCs under notify backpressure; never drop Note Off
     * or Start/Continue/Stop (stuck note / sticky transport into Loopy over BLE). */
    if (!ble_out_pkt_is_keep(pkt))
        return;
    for (pass = 0; pass < 2u; pass++) {
        for (i = rr; i != ww; i++) {
            uint32_t p = ble_oq[i % BLE_OQ];
            if (ble_out_pkt_is_keep(p))
                continue;
            if (pass == 0u && (p & 0xFu) != 0xBu)
                continue;
            ble_oq[i % BLE_OQ] = pkt;
            RING_PUBLISH();
            return;
        }
    }
}

static void ble_fail(void)
{
    fm1_guard_bus_resume(FM1_GUARD_BUS_BITS);   /* the controller stops: the app's checks again */
    fm1_c1_mb.poll = 0;                         /* core 1 stops calling it */
    fm1_ble_sync();
    fm1_cpu1_irqs_off();
    ble_up = 0;
    ble_host_on = 0;
    ble_dead = 1;
}

/* BLE-16, MID-15: when the link ends, usb.c midi_link_check puts one PLAT_MIDI_LINK_END(1) into the MIDI in
 * queue. The engine then releases the notes that came from Bluetooth and the clock of Bluetooth. It goes after
 * the MIDI in of this tick, so no note of the old link comes after it. */
static uint8_t ble_link_st;
static uint8_t ble_central_link_seen[2];
static void ble_central_link_notify_slot(unsigned slot, int up)
{
    uint8_t next = (uint8_t)(up != 0);
    if (next != ble_central_link_seen[slot]) {
        ble_central_link_seen[slot] = next;
        smc_ble_link_slot(slot, next);
    }
}
static void ble_central_link_notify(int up)
{
    ble_central_link_notify_slot(0, up);
    ble_central_link_notify_slot(1, up);
}

/* One TIMER5 owns shared HCI arbitration; peers retain independent ATT state. */
static void ble_central_service(void)
{
    blec_t *a = &ble_r.host.c, *b = &ble_r.host.c2;
    uint8_t t;
    int want = ble_want && smc_ble_role_get();
    if (!ble_up) { ble_central_link_notify(0); return; }
    if (ble_r.mb.state != XB_ST_READY || !fm1_c1_on) {
        ble_record(); ble_fail(); ble_central_link_notify(0); return;
    }
    ble_alive[0] = fm1_ms; ble_alive[1] = ble_r.mb.polls;
    if (ble_guard.trying && fm1_ms - ble_ok_at > BLE_GUARD_OK_MS) ble_guard_ok(&ble_guard);
    for (uint32_t k = 0; k < 8u; k++) {
        int n = xb_frame_get(&ble_r.mb.c2h, &t, ble_r.fr, sizeof ble_r.fr);
        if (n == 0) break;
        if (n > 0) blec_pair_rx(a, b, t, ble_r.fr, (uint16_t)n, fm1_ms);
    }
    if (blec_pair_stopped(a, b)) ble_host_on = 0;
    if (!ble_host_on) {
        if (!want || xb_ring_used(&ble_r.mb.c2h)) return;
        b->disconnect_flags = 0;
        ble_host_on = 1;
        blec_pair_bind(a, b);
        blec_start(a, fm1_ms);
    }
    blec_pair_poll(a, b, fm1_ms, want);
    ble_central_link_notify_slot(0, want && blec_connected(a));
    ble_central_link_notify_slot(1, want && blec_connected(b));
    if (!want && blec_pair_stopped(a, b)) ble_host_on = 0;
}

/* TIMER5, next to usb_poll (same context: the MIDI in queue has one writer) */
static void ble_device_service(void)
{
    bleh_t *h = &ble_r.host.h;
    uint32_t k;
    uint8_t t;
    bleh_msg_t m;
    int want = ble_want && !smc_ble_role_get();
    if (!ble_up) {
        midi_link_check(&ble_link_st, 0u, 1u);   /* (after a failure: the release, when the queue has room) */
        return;
    }
    if (ble_r.mb.state != XB_ST_READY || !fm1_c1_on) {
        ble_record();
        ble_fail();
        midi_link_check(&ble_link_st, 0u, 1u);
        return;
    }
    ble_alive[0] = fm1_ms;
    ble_alive[1] = ble_r.mb.polls;
    if (ble_guard.trying && fm1_ms - ble_ok_at > BLE_GUARD_OK_MS)
        ble_guard_ok(&ble_guard);               /* it ran: the next power-on starts it again */
    if (!ble_host_on) {
        if (!want)
            return;                             /* OFF since power-on: the host never starts */
        ble_host_on = 1;
        bleh_start(h);
    }
    bleh_radio(h, want);
    for (k = 0; k < 8u; k++) {                  /* events and data from the controller */
        int n = xb_frame_get(&ble_r.mb.c2h, &t, ble_r.fr, sizeof ble_r.fr);
        if (n == 0)
            break;
        if (n > 0) {
            bleh_rx(h, t, ble_r.fr, (uint16_t)n);
        }
    }
    if (smc_ble_role_get()) {
        /* End the old input before entering host mode, even with a full MIDI queue.
         * Discard feedback and output from this link while Disconnect completes. */
        h->q_r = h->q_w; h->in_r = h->in_w; h->sx_on = 0;
        smk_apc_ble_link(0, 0);
        bleh_poll(h);
        midi_link_check(&ble_link_st, 0u, 1u);
        return;
    }
    smk_apc_ble_link((uint8_t)bleh_connected(h), (uint8_t)bleh_notifying(h));   /* a71: Loopy gone: clip feedback off */
    while (ble_r.orr != ble_r.ow) {             /* MIDI out, mirrored */
        uint8_t b[3];
        uint32_t len = ble_msg_of_usb(ble_oq[ble_r.orr % BLE_OQ], b);
        if (len && bleh_notifying(h) && bleh_midi_send(h, b, (uint8_t)len, (uint16_t)(fm1_ms & 0x1FFFu)) == -2)
            break;                              /* the host's queue is full: next tick */
        ble_r.orr++;
    }
    smk_inlog(2u, (uint32_t)((bleh_connected(h) ? 1u : 0u) | (bleh_notifying(h) ? 2u : 0u)) << 24);   /* a76: edges */
    ble_sx_answer(h);
    /* attempt 37: no parameter request (test 34's, accepted by the iPhone, came with a huge MIDI delay) */
    bleh_poll(h);
    /* MIDI in: same midi_in_q as USB/TRS. Cap MQ pulls/tick (BLE-08). Note Off never
     * drops when the ring is full of CCs — midi_in_put displaces (usb.c). */
    for (uint32_t n = 0; n < MQ && bleh_midi_next(h, &m); n++) {
        uint32_t pkt = ble_usb_of_msg(&m);
        if (pkt && ((pkt & 0xFu) == 8u || (pkt & 0xFu) == 9u || (pkt & 0xFu) == 0xBu) &&
            smk_apc_ble_event(pkt, (uint8_t)bleh_notifying(h)))   /* a76: notify off: no pad colour */
            continue;                             /* attempt 29: APC clip and transport feedback, as on USB */
        if (pkt)
            (void)midi_in_put(pkt | 0x10u);         /* cable bits: the input, 1 Bluetooth (MID-15) */
    }
    midi_link_check(&ble_link_st, (uint32_t)bleh_connected(h), 1u);
}

#include "ble/ble_role.h"

int plat_ble_state(void)
{
    if (ble_img == BLE_IMG_NONE)
        return PLAT_BLE_NOIMG;
    if (ble_img == BLE_IMG_BAD)
        return PLAT_BLE_BADIMG;
    if (ble_dead)
        return PLAT_BLE_FAILED;
    if (!ble_boot_on)
        return ble_want ? PLAT_BLE_RESTART : PLAT_BLE_OFF;
    if (!ble_want)
        return PLAT_BLE_OFF;
    if (ble_role_changing || ble_central_role != (uint8_t)(smc_ble_role_get() != 0))
        return PLAT_BLE_STARTING;
    if (ble_central_role) {
        if (blec_connected(&ble_r.host.c) || blec_connected(&ble_r.host.c2)) return PLAT_BLE_CONNECTED;
        if (!ble_up || ble_r.host.c.state == BLEC_STARTING) return PLAT_BLE_STARTING;
        if (ble_r.host.c.state == BLEC_FAILED &&
            (ble_r.host.c2.state == BLEC_FAILED || ble_r.host.c2.state == BLEC_OFF)) return PLAT_BLE_FAILED;
        return blec_connected(&ble_r.host.c) ? PLAT_BLE_CONNECTED : PLAT_BLE_READY;
    }
    if (!ble_up || ble_r.host.h.state == BLEH_STARTING || ble_r.host.h.state == BLEH_IDLE)
        return PLAT_BLE_STARTING;
    if (ble_r.host.h.state == BLEH_ERROR)
        return PLAT_BLE_FAILED;
    return bleh_connected(&ble_r.host.h) ? PLAT_BLE_CONNECTED : PLAT_BLE_READY;
}
const char *plat_ble_name(void)
{
    if (!ble_central_role) return ble_r.nm;
    const blec_t *c = blec_connected(&ble_r.host.c2) && !blec_connected(&ble_r.host.c) ? &ble_r.host.c2 : &ble_r.host.c;
    return c->link_name[0] ? (const char *)c->link_name : "SMC-Mixer";
}
int plat_ble_smc_send_slot(unsigned slot, const uint8_t *msg, uint8_t len)
{
    if (slot >= 1u) return 0; /* A: peer zero is the sole SMC central */
    uint32_t f = irq_save();
    int sent = ble_central_role && smc_ble_role_get() && ble_up && ble_host_on && ble_want &&
               blec_midi_send(&ble_r.host.c, msg, len);
    irq_restore(f);                             /* TIMER5 must not replace the host union mid-enqueue */
    return sent;
}
int plat_ble_smc_send(const uint8_t *msg, uint8_t len)
{ return plat_ble_smc_send_slot(0, msg, len); }
void plat_ble_set(int on)
{
    ble_want = (uint8_t)(on != 0);
    if (!on && ble_guard.blocked) {             /* BLUETOOTH OFF: the next power-on tries again */
        ble_guard_user_off(&ble_guard);
        if (ble_blocked) {
            ble_blocked = 0;
            ble_dead = 0;                       /* nothing started this boot: OFF, then RESTART */
        }
    }
}

/* ED_DIAG (editor.c): the start guard and the controller's state, as 32-bit words */
static uint32_t ble_diag(uint32_t *w, uint32_t max)
{
    uint32_t n = 0, i;
    const uint32_t *g = (const uint32_t *)&ble_guard;
    for (i = 0; i < sizeof ble_guard / 4u && n < max; i++)
        w[n++] = g[i];
    if (n + 17u > max)
        return n;
    w[n++] = ble_img | (uint32_t)ble_boot_on << 8 | (uint32_t)ble_up << 16 | (uint32_t)ble_dead << 24;
    w[n++] = ble_want | (uint32_t)ble_host_on << 8 | (uint32_t)ble_blocked << 16 | (uint32_t)fm1_c1_on << 24;
    w[n++] = fm1_c1_gave_up;
    w[n++] = (uint32_t)plat_ble_state();
    w[n++] = ble_r.mb.state;                    /* raw: after a reset, the last start's */
    w[n++] = ble_r.mb.err;
    w[n++] = ble_r.mb.polls;
    w[n++] = fm1_c1_mb.poll_max;
    w[n++] = ble_central_role ? ble_r.host.c.state : ble_r.host.h.state;
    w[n++] = fm1_c1_trace;
    w[n++] = fm1_boot.p3_rst | (fm1_boot.rst_src & 0xFFFFFFu) << 8;   /* this boot's reset */
    if (n + 6u > max)
        return n;
    w[n++] = ble_r.mb.h2c.head | ble_r.mb.h2c.tail << 16;   /* the HCI rings: written, read */
    w[n++] = ble_r.mb.c2h.head | ble_r.mb.c2h.tail << 16;
    w[n++] = ble_r.mb.c2h_drops;
    w[n++] = ble_central_role ? (uint32_t)ble_r.host.c.step | (uint32_t)ble_r.host.c.waiting << 8 |
                                 (uint32_t)ble_r.host.c.credits << 16 |
                                 (uint32_t)ble_r.host.c.rx_reason << 24 | 0x80000000u :
                                 (uint32_t)ble_r.host.h.step | (uint32_t)ble_r.host.h.cmd_wait << 8 |
                                 (uint32_t)ble_r.host.h.credits << 16;
    w[n++] = ble_r.mb.dbg[XB_DBG_INIT_MS];     /* frames the controller took */
    w[n++] = ble_r.mb.dbg[XB_DBG_MS];          /* frames it gave to the app */
    if (n + 2u > max)
        return n;
    w[n++] = ble_h_link0();                                 /* attempt 34: interval, latency in use */
    w[n++] = ble_h_link1();                                 /* MIDI in drops, request state and result */
    if (n + 4u > max)                                       /* a76: 4 words follow (was 2: one word past w[]) */
        return n;
    w[n++] = ble_alive[0];
    w[n++] = ble_alive[1];
    w[n++] = ble_rails[0];
    w[n++] = ble_rails[1];
    if (n + 6u > max)
        return n;
    /* Versioned tail, present in both roles; central fields are valid only in central role. */
    w[n++] = 0x534D4301u;
    w[n++] = ble_central_role ? ble_r.host.c.midi_handle | (uint32_t)ble_r.host.c.cccd_handle << 16 : 0;
    w[n++] = ble_central_role ? blec_rd16(ble_r.host.c.reject_head) |
                               (uint32_t)blec_rd16(ble_r.host.c.reject_head + 2) << 16 : 0;
    w[n++] = ble_central_role ? blec_rd16(ble_r.host.c.reject_head + 4) |
                               (uint32_t)blec_rd16(ble_r.host.c.reject_head + 6) << 16 : 0;
    w[n++] = ble_central_role ? ble_r.host.c.reject_n | (uint32_t)ble_r.host.c.reject_reason << 16 |
                               (uint32_t)ble_r.host.c.att_op << 24 : 0;
    w[n++] = ble_central_role ? ble_r.host.c.att_handle | (uint32_t)ble_r.host.c.att_waiting << 16 : 0;
    return n;
}
