/* SPDX-License-Identifier: GPL-3.0-only */
/* Direct HCI central. The controller image enables master/scan/init roles; this host never
 * advertises, so a central link and the X0X BLE peripheral link cannot coexist. */
#include "ble_midi_central.h"
#include "ble_midi_uuid.h"             /* one SVC/CHR UUID pair shared with ble_midi_host.c */

enum { H4_CMD = 1, H4_ACL = 2, H4_EVT = 4 };
enum { COP_RESET = 0x0c03, COP_EV_MASK = 0x0c01, COP_LE_MASK = 0x2001,
       COP_LE_BUF = 0x2002, COP_RAND = 0x2005, COP_SCAN_PARAM = 0x200b,
       COP_SCAN_ENABLE = 0x200c, COP_CREATE = 0x200d, COP_CANCEL = 0x200e,
       COP_UPDATE = 0x2013, COP_DISCONNECT = 0x0406 };
enum { S_RESET, S_EVENT, S_LE_EVENT, S_BUFFER, S_RANDOM, S_SCAN_PARAM,
       S_SCAN_ON, S_SCAN_OFF, S_CREATE, S_CANCEL, S_SERVICE, S_CHAR, S_CCCD, S_SUBSCRIBE, S_READY };
enum { D_SENT = 1, D_STOP = 2, D_CONTROL = 4 };
#define blec_U_SVC BLE_MIDI_UUID_SVC
#define blec_U_CHAR BLE_MIDI_UUID_CHR
static unsigned blec_rd16(const uint8_t *p) { return (unsigned)p[0] | (unsigned)p[1] << 8; }
static void blec_wr16(uint8_t *p, unsigned v) { p[0] = (uint8_t)v; p[1] = (uint8_t)(v >> 8); }
static int blec_eq(const uint8_t *a, const uint8_t *b, unsigned n)
{ unsigned i; for (i = 0; i < n; i++) if (a[i] != b[i]) return 0; return 1; }

static void blec_rx_reset(blec_t *c)
{
    c->running = c->in_sysex = c->sx_len = c->rx_have = c->rx_need = 0;
    c->sig_read = c->sig_count = 0;
    c->mtu_need = c->mtu_rsp = c->smp_reply = 0;
}
static void blec_reject(blec_t *c, uint8_t reason)
{
    c->rx_reject++; c->rx_reason = reason;
}
static void blec_acl_reject(blec_t *c, const uint8_t *p, unsigned n, uint8_t reason)
{
    for (unsigned i = 0; i < sizeof c->reject_head; i++)
        c->reject_head[i] = i < n ? p[i] : 0;
    c->reject_n = (uint16_t)n;
    c->reject_reason = reason;
    blec_reject(c, reason);
}
static void blec_emit(blec_t *c, const uint8_t *p, uint8_t n)
{
    c->rx_midi++;
    if (c->midi) c->midi(p, n, c->ctx);
}

static void blec_command(blec_t *c, unsigned op, const uint8_t *p, unsigned n)
{
    uint8_t b[32];
    unsigned i;
    blec_wr16(b, op); b[2] = (uint8_t)n;
    for (i = 0; i < n; i++) b[3 + i] = p[i];
    if (!c->send(H4_CMD, b, (uint16_t)(n + 3u), c->ctx)) {
        c->cmd_op = (uint16_t)op;
        c->waiting = 1;
    }
}
/* Connection update must not occupy the discovery command slot or advance step. */
static int blec_command_quiet(blec_t *c, unsigned op, const uint8_t *p, unsigned n)
{
    uint8_t b[32];
    unsigned i;
    blec_wr16(b, op); b[2] = (uint8_t)n;
    for (i = 0; i < n; i++) b[3 + i] = p[i];
    return !c->send(H4_CMD, b, (uint16_t)(n + 3u), c->ctx);
}
static int blec_acl_cid(blec_t *c, unsigned cid, const uint8_t *p, unsigned n)
{
    uint8_t b[35];
    unsigned i;
    if (!c->credits || n > 23u) return 0;
    blec_wr16(b, c->conn); blec_wr16(b + 2, n + 4u);
    blec_wr16(b + 4, n); blec_wr16(b + 6, cid);
    for (i = 0; i < n; i++) b[i + 8u] = p[i];
    if (c->send(H4_ACL, b, (uint16_t)(n + 8u), c->ctx)) return 0;
    c->credits--;
    return 1;
}
static int blec_acl(blec_t *c, const uint8_t *p, unsigned n)
{ return !c->sig_count && blec_acl_cid(c, 4, p, n); }
static void blec_disconnect(blec_t *c)
{
    uint8_t b[3];
    /* Every entry path must obey the original cutoff, including stop and cancel. */
    if ((int32_t)(c->now_ms - c->deadline) >= 0) {
        c->state = BLEC_FAILED; c->waiting = 0;
        return;
    }
    if (c->disconnect_flags & D_SENT) return;
    blec_wr16(b, c->conn); b[2] = 0x13;
    c->waiting = 0;
    blec_command(c, COP_DISCONNECT, b, 3);
    if (c->waiting) c->disconnect_flags |= D_SENT;
}
/* A stop retains the original operation until its completion is known. */
static void blec_stop_progress(blec_t *c)
{
    if (c->linked) { blec_disconnect(c); return; }
    if ((int32_t)(c->now_ms - c->deadline) >= 0) {
        c->state = BLEC_FAILED; c->waiting = 0; return;
    }
    if (c->waiting || (c->disconnect_flags & D_CONTROL)) return;
    if (c->step == S_CREATE || c->step == S_CANCEL) {
        c->step = S_CANCEL;
        blec_command(c, COP_CANCEL, 0, 0);
    } else if (c->step == S_SCAN_ON || c->step == S_SCAN_OFF) {
        const uint8_t b[2] = {0, 0};
        c->step = S_SCAN_OFF;
        blec_command(c, COP_SCAN_ENABLE, b, 2);
    } else { c->state = BLEC_OFF; return; }
    if (c->waiting) c->disconnect_flags |= D_CONTROL;
}
static void blec_fail(blec_t *c)
{
    c->errors++;
    blec_rx_reset(c);
    c->qr = c->qw;
    c->att_waiting = 0;
    if (c->linked) {
        c->waiting = 0;
        c->state = BLEC_DISCONNECTING;
        c->deadline = c->now_ms + 3000u;
        blec_disconnect(c);
    } else {
        c->state = BLEC_FAILED;
        c->waiting = 0;
    }
}
static void blec_scan_again(blec_t *c, uint32_t now)
{
    c->waiting = 0;
    c->found = 0;
    c->state = BLEC_SCANNING;
    c->step = S_SCAN_ON;
    c->deadline = now + 10000u;
}
static void blec_signal_flush(blec_t *c)
{
    if (c->sig_count) {
        const uint8_t *s = c->sig[c->sig_read];
        uint8_t b[8] = {s[0], s[1], 2, 0, s[2], 0, sizeof c->rx, 0};
        unsigned n = s[0] == 1u && s[2] == 1u ? 8u : 6u;
        b[2] = (uint8_t)(n - 4u);
        if (blec_acl_cid(c, 5, b, n)) {
            c->sig_read = (uint8_t)((c->sig_read + 1u) % 4u);
            c->sig_count--;
        }
    }
}
static int blec_param_ok(unsigned min, unsigned max, unsigned lat, unsigned to)
{
    if (min < 6u || max < 6u || min > max || min > 0x0c80u || max > 0x0c80u)
        return 0;
    if (lat > 0x01f3u || to < 10u || to > 0x0c80u)
        return 0;
    /* Timeout is 10 ms; interval is 1.25 ms. Spec: timeout > (1 + latency) * max * 2. */
    return (uint32_t)to * 4u > (1u + (uint32_t)lat) * max;
}
static int blec_conn_update(blec_t *c, unsigned min, unsigned max, unsigned lat, unsigned to)
{
    uint8_t b[14];
    if ((c->state != BLEC_CONNECTED && c->state != BLEC_DISCOVERING) || !c->linked)
        return 0;
    blec_wr16(b, c->conn);
    blec_wr16(b + 2, min); blec_wr16(b + 4, max);
    blec_wr16(b + 6, lat); blec_wr16(b + 8, to);
    blec_wr16(b + 10, 0); blec_wr16(b + 12, 0);
    return blec_command_quiet(c, COP_UPDATE, b, 14);
}
static void blec_signal_in(blec_t *c, const uint8_t *p, unsigned n)
{
    unsigned slot;
    uint8_t code = 1, reason = 0;
    if (n < 4u || !p[1]) { blec_reject(c, BLEC_RX_LENGTH); return; }
    /* No signaling request is outstanding. Do not reply to identified responses. */
    if (p[0] == 1u || p[0] == 7u || p[0] == 0x13u || p[0] == 0x15u ||
        p[0] == 0x18u || p[0] == 0x1au) return;
    if (n > sizeof c->rx) reason = 1; /* Report our signaling MTU. */
    else {
        if (blec_rd16(p + 2) != n - 4u || (p[0] == 0x12u && n != 12u)) {
            blec_reject(c, BLEC_RX_LENGTH); return;
        }
        /* In-range requests are applied. Illegal values are still refused. */
        if (p[0] == 0x12u) {
            unsigned min = blec_rd16(p + 4), max = blec_rd16(p + 6);
            unsigned lat = blec_rd16(p + 8), to = blec_rd16(p + 10);
            code = 0x13; reason = 1;
            if (blec_param_ok(min, max, lat, to) && blec_conn_update(c, min, max, lat, to))
                reason = 0;
        }
    }
    blec_signal_flush(c);
    if (c->sig_count == 4u) { blec_fail(c); return; }
    if (!c->sig_count) c->sig_deadline = c->now_ms + 3000u;
    slot = (c->sig_read + c->sig_count) % 4u;
    c->sig[slot][0] = code; c->sig[slot][1] = p[1]; c->sig[slot][2] = reason;
    c->sig_count++;
    blec_signal_flush(c);
}
static void blec_progress(blec_t *c)
{
    uint8_t b[25] = {0};
    unsigned i;
    if (c->waiting || c->att_waiting) return;
    switch (c->step) {
    case S_RESET: blec_command(c, COP_RESET, 0, 0); break;
    case S_EVENT:
        for (i = 0; i < 8; i++) b[i] = 0xff;
        b[7] = 0x3f; blec_command(c, COP_EV_MASK, b, 8); break;
    case S_LE_EVENT:
        b[0] = 0xff; b[1] = 0x0f; blec_command(c, COP_LE_MASK, b, 8); break;
    case S_BUFFER: blec_command(c, COP_LE_BUF, 0, 0); break;
    case S_RANDOM: blec_command(c, COP_RAND, c->addr, 6); break;
    case S_SCAN_PARAM:
        b[0] = 1; blec_wr16(b + 1, 0x30); blec_wr16(b + 3, 0x30);
        b[5] = 1; b[6] = 0; blec_command(c, COP_SCAN_PARAM, b, 7); break;
    case S_SCAN_ON:
        b[0] = 1; b[1] = 0; blec_command(c, COP_SCAN_ENABLE, b, 2); break;
    case S_SCAN_OFF:
        b[0] = 0; b[1] = 0; blec_command(c, COP_SCAN_ENABLE, b, 2); break;
    case S_CREATE:
        blec_wr16(b, 0x30); blec_wr16(b + 2, 0x30); b[4] = 0; b[5] = c->target_type;
        for (i = 0; i < 6; i++) b[6 + i] = c->target[i];
        b[12] = 1; blec_wr16(b + 13, 24); blec_wr16(b + 15, 40); blec_wr16(b + 17, 0);
        blec_wr16(b + 19, 400); blec_wr16(b + 21, 0); blec_wr16(b + 23, 0);
        blec_command(c, COP_CREATE, b, 25); break;
    case S_CANCEL: blec_command(c, COP_CANCEL, 0, 0); break;
    case S_SERVICE:
        b[0] = 0x10; blec_wr16(b + 1, c->query_start); blec_wr16(b + 3, 0xffff);
        blec_wr16(b + 5, 0x2800); c->att_waiting = (uint8_t)blec_acl(c, b, 7); break;
    case S_CHAR:
        b[0] = 0x08; blec_wr16(b + 1, c->query_start); blec_wr16(b + 3, c->svc_end);
        blec_wr16(b + 5, 0x2803); c->att_waiting = (uint8_t)blec_acl(c, b, 7); break;
    case S_CCCD:
        b[0] = 0x04; blec_wr16(b + 1, c->query_start);
        blec_wr16(b + 3, c->svc_end); c->att_waiting = (uint8_t)blec_acl(c, b, 5); break;
    case S_SUBSCRIBE:
        b[0] = 0x12; blec_wr16(b + 1, c->cccd_handle); b[3] = 1; b[4] = 0;
        c->att_waiting = (uint8_t)blec_acl(c, b, 5); break;
    default: break;
    }
}
void blec_init(blec_t *c, blec_send_fn send, blec_midi_fn midi, void *ctx, const uint8_t addr[6])
{
    unsigned i;
    uint8_t *z = (uint8_t *)c;
    for (i = 0; i < sizeof *c; i++) z[i] = 0;
    c->send = send; c->midi = midi; c->ctx = ctx;
    for (i = 0; i < 6; i++) c->addr[i] = addr[i];
}
void blec_start(blec_t *c, uint32_t now)
{
    /* Do not erase an unresolved stop or its controller handle. */
    if ((c->disconnect_flags & D_STOP) && c->state != BLEC_OFF) return;
    blec_rx_reset(c);
    c->midi_handle = c->cccd_handle = c->svc_end = 0;
    c->now_ms = now;
    c->waiting = c->att_waiting = c->conn = c->credits = c->linked = 0;
    c->disconnect_flags = 0;
    c->qr = c->qw = 0;
    c->state = BLEC_STARTING; c->step = S_RESET; c->query_start = 1;
    c->deadline = now + 3000u; blec_progress(c);
}
void blec_stop(blec_t *c)
{
    if (c->state == BLEC_OFF || (c->disconnect_flags & D_STOP)) return;
    c->disconnect_flags |= D_STOP;
    if (c->state == BLEC_FAILED && c->linked) return;
    if (c->state != BLEC_DISCONNECTING && c->step != S_CANCEL)
        c->deadline = c->now_ms + 3000u;
    /* An automatic Cancel that was accepted must not be submitted again. */
    if (c->step == S_CANCEL && c->cmd_op == COP_CANCEL)
        c->disconnect_flags |= D_CONTROL;
    blec_rx_reset(c);
    c->state = BLEC_STOPPING;
    c->qr = c->qw;
    c->att_waiting = 0;
    blec_stop_progress(c);
}
static void blec_midi_packet(blec_t *c, const uint8_t *p, unsigned n)
{
    unsigned i = 1;
    if (n < 3 || (p[0] & 0xc0u) != 0x80u) { blec_reject(c, BLEC_RX_MIDI); return; }
    while (i < n) {
        uint8_t st, m[3], len;
        if (c->in_sysex) {
            uint8_t b = p[i++];
            if (b == 0xf7u && i < n && (p[i] == 0xf7u || !(p[i] & 0x80u)))
                continue; /* timestamp low 127 before more SysEx data or EOX */
            if (b == 0xf7u) {
                if (c->sx_len < sizeof c->sx) c->sx[c->sx_len++] = b;
                if (c->sx_len == 6u) blec_emit(c, c->sx, 6u);
                c->in_sysex = c->sx_len = 0;
            } else if (!(b & 0x80u)) {
                if (c->sx_len < sizeof c->sx) c->sx[c->sx_len++] = b;
                else { c->in_sysex = c->sx_len = 0; c->errors++; }
            } else if (b >= 0xf8u) {
                blec_emit(c, &b, 1u);
            } /* timestamp bytes inside SysEx are skipped */
            continue;
        }
        if (p[i] & 0x80u) i++;             /* timestamp low */
        if (i >= n) break;
        st = p[i];
        if (st & 0x80u) {
            i++; if (st < 0xf0u) c->running = st;
            else if (st < 0xf8u) c->running = 0;
        } else {
            if (!c->running) { blec_reject(c, BLEC_RX_MIDI); i++; continue; }
            st = c->running;
        }
        if (st == 0xf0u) {
            c->in_sysex = 1; c->sx_len = 1; c->sx[0] = 0xf0u;
            continue;
        }
        len = st >= 0xf8u ? 1u : st >= 0xf0u ? 0u :
              (st & 0xe0u) == 0xc0u ? 2u : 3u;
        if (!len) continue;                 /* control surface has no SysEx input */
        m[0] = st; m[1] = m[2] = 0;
        if (i + len - 1u > n) { blec_reject(c, BLEC_RX_MIDI); break; }
        if (len > 1u) m[1] = p[i++];
        if (len > 2u) m[2] = p[i++];
        blec_emit(c, m, len);
    }
}
static int blec_att_tx(blec_t *c, uint8_t op)
{
    uint8_t b[3] = {op, (uint8_t)sizeof c->rx, (uint8_t)(sizeof c->rx >> 8)};
    return blec_acl(c, b, 3);
}
static void blec_smp_in(blec_t *c, const uint8_t *p, unsigned n)
{
    uint8_t b[2] = {0x05, 0x05}; /* Pairing Failed: Pairing Not Supported */
    if (!n || p[0] != 0x01u) return;
    if (!blec_acl_cid(c, 6, b, 2)) c->smp_reply = 1;
}
static void blec_att_in(blec_t *c, const uint8_t *p, unsigned n)
{
    unsigned i, es;
    if (!n) return;
    c->att_op = p[0];
    c->att_handle = n >= 3u && p[0] == 0x1b ? (uint16_t)blec_rd16(p + 1) : 0;
    if (p[0] == 0x1b) {
        if (n < 4u || !c->midi_handle || blec_rd16(p + 1) != c->midi_handle) {
            blec_reject(c, BLEC_RX_HANDLE); return;
        }
        c->rx_notify++;
        blec_midi_packet(c, p + 3, n - 3u);
        return;
    }
    c->att_waiting = 0;
    if (p[0] == 0x02u && n >= 3u) {
        if (!blec_att_tx(c, 0x03)) c->mtu_rsp = 1; /* answer; do not drop the link */
        return;
    }
    if (p[0] == 0x03u) return; /* peer MTU response */
    if (p[0] == 0x01) { blec_fail(c); return; }
    if (c->step == S_SERVICE && p[0] == 0x11 && n >= 2u) {
        es = p[1];
        for (i = 2; es == 20u && i + es <= n; i += es)
            if (blec_eq(p + i + 4, blec_U_SVC, 16)) {
                c->midi_handle = (uint16_t)(blec_rd16(p + i) + 1u);
                c->svc_end = (uint16_t)blec_rd16(p + i + 2);
                c->query_start = c->midi_handle;
                c->step = S_CHAR; blec_progress(c); return;
            }
        if (es >= 6u && (n - 2u) >= es && (n - 2u) % es == 0u) {
            unsigned last = blec_rd16(p + n - es + 2u);
            if (last < 0xffffu) {
                c->query_start = (uint16_t)(last + 1u);
                blec_progress(c); return;
            }
        }
    } else if (c->step == S_CHAR && p[0] == 0x09 && n >= 2u) {
        es = p[1];
        for (i = 2; es == 21u && i + es <= n; i += es)
            if (blec_eq(p + i + 5, blec_U_CHAR, 16)) {
                c->midi_handle = (uint16_t)blec_rd16(p + i + 3);
                c->query_start = c->midi_handle + 1u;
                c->step = S_CCCD; blec_progress(c); return;
            }
        if (es >= 7u && (n - 2u) >= es && (n - 2u) % es == 0u) {
            unsigned last = blec_rd16(p + n - es);
            if (last < c->svc_end) {
                c->query_start = (uint16_t)(last + 1u);
                blec_progress(c); return;
            }
        }
    } else if (c->step == S_CCCD && p[0] == 0x05 && n >= 2u && p[1] == 1u) {
        for (i = 2; i + 4u <= n; i += 4u)
            if (blec_rd16(p + i + 2) == 0x2902u) {
                c->cccd_handle = (uint16_t)blec_rd16(p + i);
                c->step = S_SUBSCRIBE; blec_progress(c); return;
            }
        if (n >= 6u && (n - 2u) % 4u == 0u) {
            unsigned last = blec_rd16(p + n - 4u);
            if (last < c->svc_end) {
                c->query_start = (uint16_t)(last + 1u);
                blec_progress(c); return;
            }
        }
    } else if (c->step == S_SUBSCRIBE && p[0] == 0x13) {
        c->step = S_READY; c->state = BLEC_CONNECTED; c->connects++;
        c->mtu_need = 1;
        if (blec_att_tx(c, 0x02)) c->mtu_need = 0;
        return;
    }
    blec_fail(c);
}
static void blec_acl_in(blec_t *c, const uint8_t *p, unsigned n)
{
    unsigned hd, pb, len, need, have, i;
    uint8_t reason;
    c->rx_acl++;
    if (n < 4u) { blec_acl_reject(c, p, n, BLEC_RX_HEADER); return; }
    hd = blec_rd16(p); pb = hd >> 12 & 3u;
    if ((c->state != BLEC_DISCOVERING && c->state != BLEC_CONNECTED) ||
        (hd & 0xfffu) != c->conn) { blec_acl_reject(c, p, n, BLEC_RX_LINK); return; }
    len = blec_rd16(p + 2);
    reason = BLEC_RX_LENGTH;
    if (len != n - 4u) goto reject;
    reason = BLEC_RX_FRAGMENT;
    if (pb == 1u) {
        if (!len || !c->rx_need || len > (unsigned)(c->rx_need - c->rx_have)) goto reject;
        for (i = 0; i < len && c->rx_have + i < sizeof c->rx; i++) c->rx[c->rx_have + i] = p[4 + i];
        c->rx_have = (uint16_t)(c->rx_have + len);
    } else {
        c->rx_have = c->rx_need = 0;
        /* Flags 0, 2 and 3 start a PDU. Flag 3 is one complete L2CAP PDU. */
        if (len < 4u) goto reject;
        reason = BLEC_RX_CID;
        need = blec_rd16(p + 6);
        if (need != 4u && need != 5u && need != 6u) goto reject;
        c->rx_cid = (uint8_t)need;
        need = blec_rd16(p + 4); have = len - 4u;
        reason = BLEC_RX_SIZE;
        if (!need || (c->rx_cid != 5u && need > sizeof c->rx) || have > need) goto reject;
        c->rx_need = (uint16_t)need;
        c->rx_have = (uint16_t)have;
        for (i = 0; i < have && i < sizeof c->rx; i++) c->rx[i] = p[8 + i];
    }
    if (c->rx_have == c->rx_need) {
        unsigned complete = c->rx_need;
        c->rx_have = c->rx_need = 0;
        if (c->rx_cid == 5u) blec_signal_in(c, c->rx, complete);
        else if (c->rx_cid == 6u) blec_smp_in(c, c->rx, complete);
        else blec_att_in(c, c->rx, complete);
    }
    return;
reject:
    c->rx_have = c->rx_need = 0;
    blec_acl_reject(c, p, n, reason);
}
static void blec_adv_report(blec_t *c, const uint8_t *p, unsigned n)
{
    unsigned i = 2, j, k;
    if (n < 12u || p[0] != 2u) return;
    /* Each LE Advertising Report: blec_event type, address type, address, data length, data, RSSI. */
    for (j = 0; j < p[1] && i + 10u <= n; j++) {
        unsigned data = p[i + 8u], end = i + 9u + data;
        if (end >= n) break;
        for (k = i + 9u; k + 2u <= end && p[k]; k += p[k] + 1u) {
            if (k + p[k] + 1u > end) break;
            if ((p[k + 1u] == 8u || p[k + 1u] == 9u) && p[k] >= 4u &&
                p[k + 2u] == 'S' && p[k + 3u] == 'M' && p[k + 4u] == 'C') {
                unsigned z, name_len = p[k] - 1u;
                c->target_type = p[i + 1u];
                for (z = 0; z < 6; z++) c->target[z] = p[i + 2u + z];
                if (name_len > 20u) name_len = 20u;
                for (z = 0; z < name_len; z++) c->link_name[z] = p[k + 2u + z];
                c->link_name[name_len] = 0;
                c->found = 1;
                c->step = S_SCAN_OFF; blec_progress(c);
                return;
            }
        }
        i = end + 1u;
    }
}
static void blec_event(blec_t *c, const uint8_t *p, unsigned n, uint32_t now)
{
    unsigned code, pl, op, status;
    if (c->state == BLEC_OFF) return;
    if (n < 2u || p[1] > n - 2u) return;
    code = p[0]; pl = p[1]; p += 2;
    if ((c->state == BLEC_DISCONNECTING || c->state == BLEC_STOPPING) &&
        c->waiting && c->cmd_op == COP_DISCONNECT &&
        ((code == 0x0e && pl >= 4u && blec_rd16(p + 1) == COP_DISCONNECT) ||
         (code == 0x0f && pl >= 4u && blec_rd16(p + 2) == COP_DISCONNECT))) {
        c->waiting = 0;
        if (p[code == 0x0e ? 3 : 0]) c->state = BLEC_FAILED;
        return;
    }
    if (c->state == BLEC_STOPPING ||
        (c->state == BLEC_FAILED && (c->disconnect_flags & D_STOP))) {
        if ((code == 0x0e || code == 0x0f) && pl >= 4u) {
            op = blec_rd16(p + (code == 0x0e ? 1 : 2));
            status = p[code == 0x0e ? 3 : 0];
            if (op != c->cmd_op || (!c->waiting && !(c->disconnect_flags & D_CONTROL))) return;
            /* Successful Status does not complete a synchronous command. */
            if (code == 0x0f && !status && op != COP_CREATE && op != COP_DISCONNECT) return;
            c->waiting = 0;
            if (op == COP_CREATE && status) c->state = BLEC_OFF;
            else if (status) c->state = BLEC_FAILED;
            else if (code == 0x0e && op != COP_CANCEL && op != COP_CREATE && op != COP_DISCONNECT) {
                if (c->step != S_SCAN_ON) c->state = BLEC_OFF;
                else if (c->state == BLEC_STOPPING) blec_stop_progress(c);
            } else if (op == COP_CREATE && c->state == BLEC_STOPPING) blec_stop_progress(c);
        } else if (code == 0x05 && pl >= 4u && c->linked && !p[0] && blec_rd16(p + 1) == c->conn) {
            c->credits = c->acl_total;
            c->conn = 0; c->linked = 0;
            c->disconnect_flags = 0;
            c->waiting = 0;
            c->state = BLEC_OFF;
        } else if (code == 0x3e && pl >= 19u && (p[0] == 1u || p[0] == 0x0au) && !c->linked) {
            if (p[1]) {
                if (c->step == S_CREATE || c->step == S_CANCEL) {
                    c->state = BLEC_OFF; c->waiting = 0;
                }
            }
            else {
                c->conn = (uint16_t)(blec_rd16(p + 2) & 0x0fffu); c->linked = 1;
                c->disconnect_flags = D_STOP;
                c->state = BLEC_STOPPING;
                blec_disconnect(c);
            }
        }
        return;
    }
    /* A connection-update status must not advance discovery or drop the link. */
    if ((code == 0x0e || code == 0x0f) && pl >= 4u &&
        blec_rd16(p + (code == 0x0e ? 1u : 2u)) == COP_UPDATE)
        return;
    if (code == 0x0e && pl >= 4u) {
        op = blec_rd16(p + 1); status = p[3];
        if (!c->waiting || op != c->cmd_op) return;
        c->waiting = 0;
        if (status && op != COP_CANCEL) {
            if (c->state == BLEC_DISCONNECTING) { c->state = BLEC_FAILED; return; }
            blec_fail(c); return;
        }
        if (c->state == BLEC_DISCONNECTING) return;
        if (op == COP_LE_BUF && pl >= 7u) c->credits = c->acl_total = p[6];
        if (c->step == S_SCAN_ON) {
            c->state = BLEC_SCANNING; c->deadline = now + 10000u;
            return;
        }
        if (c->step == S_SCAN_OFF) { c->state = BLEC_CONNECTING; c->step = S_CREATE; c->deadline = now + 7000u; }
        else if (c->step == S_CANCEL) { blec_scan_again(c, now); blec_progress(c); return; }
        else if (c->step != S_CREATE) c->step++;
        blec_progress(c);
    } else if (code == 0x0f && pl >= 4u) {
        op = blec_rd16(p + 2); status = p[0];
        if (op == COP_CREATE && c->waiting && op == c->cmd_op) {
            c->waiting = 0;
            if (status) { blec_scan_again(c, now); blec_progress(c); }
        }
    } else if (code == 0x3e && pl >= 2u) {
        if (p[0] == 2u && c->state == BLEC_SCANNING) blec_adv_report(c, p, pl);
        else if ((p[0] == 1u || p[0] == 0x0au) && pl >= 19u && c->state == BLEC_CONNECTING) {
            if (p[1] || p[4] != 0u) {
                if (c->step != S_CANCEL) { blec_scan_again(c, now); blec_progress(c); }
                return;
            }
            blec_rx_reset(c);
            c->midi_handle = c->cccd_handle = c->svc_end = 0;
            c->conn = (uint16_t)(blec_rd16(p + 2) & 0x0fffu); c->linked = 1;
            c->disconnect_flags = 0;
            if (c->step == S_CANCEL) c->waiting = 0; /* connection won the cancel race */
            c->state = BLEC_DISCOVERING; c->step = S_SERVICE; c->query_start = 1; c->att_waiting = 0;
            c->deadline = now + 5000u; blec_progress(c);
        }
    } else if (code == 0x05 && pl >= 4u && !p[0] && c->state != BLEC_OFF && c->linked && blec_rd16(p + 1) == c->conn) {
        blec_rx_reset(c);
        /* HCI disconnection frees this sole link's outstanding controller buffers. */
        c->credits = c->acl_total;
        c->conn = 0; c->linked = 0; c->qr = c->qw; c->att_waiting = c->waiting = 0;
        if (c->disconnect_flags & D_STOP) c->state = BLEC_OFF;
        else { blec_scan_again(c, now); blec_progress(c); }
        c->disconnect_flags = 0;
    } else if (code == 0x13 && pl >= 5u) {
        unsigned i;
        for (i = 0; i < p[0] && 1u + 4u * (i + 1u) <= pl; i++)
            if (c->linked && (blec_rd16(p + 1u + 4u * i) & 0x0fffu) == c->conn) {
                unsigned credits = c->credits + blec_rd16(p + 3u + 4u * i);
                c->credits = (uint8_t)(credits > c->acl_total ? c->acl_total : credits);
            }
    }
}
void blec_rx(blec_t *c, uint8_t h4, const uint8_t *p, uint16_t n, uint32_t now)
{
    c->now_ms = now;
    if (h4 == H4_EVT) blec_event(c, p, n, now);
    else if (h4 == H4_ACL) blec_acl_in(c, p, n);
}
int blec_midi_send(blec_t *c, const uint8_t *p, uint8_t n)
{
    unsigned i;
    if (!blec_connected(c) || n < 1u || n > 3u || (uint8_t)(c->qw - c->qr) == 32u) {
        c->drops++; return 0;
    }
    for (i = 0; i < n; i++) c->q[c->qw % 32u][i] = p[i];
    c->qlen[c->qw % 32u] = n;
    __asm__ volatile("" ::: "memory");
    c->qw++;
    return 1;
}
void blec_poll(blec_t *c, uint32_t now)
{
    c->now_ms = now;
    if (c->state == BLEC_STOPPING) { blec_stop_progress(c); return; }
    if (c->state == BLEC_DISCONNECTING) { blec_disconnect(c); return; }
    if (c->sig_count) {
        if ((int32_t)(now - c->sig_deadline) >= 0) blec_fail(c);
        else blec_signal_flush(c);
        if (c->sig_count) return; /* Required replies precede ATT and light feedback. */
    }
    if (c->state == BLEC_STARTING || c->state == BLEC_SCANNING ||
        c->state == BLEC_CONNECTING || c->state == BLEC_DISCOVERING ||
        c->state == BLEC_DISCONNECTING || c->state == BLEC_STOPPING) {
        if ((int32_t)(now - c->deadline) >= 0) {
            if (c->state == BLEC_STARTING) blec_fail(c);
            else if (c->state == BLEC_SCANNING) c->deadline = now + 10000u;
            else if (c->state == BLEC_CONNECTING) {
                if (c->step == S_CANCEL) blec_fail(c);
                else if (!c->waiting) {
                    c->step = S_CANCEL; c->deadline = now + 3000u; blec_progress(c);
                }
            } else if (c->state == BLEC_DISCOVERING) blec_fail(c);
            else if (c->state == BLEC_STOPPING) { c->state = BLEC_FAILED; c->waiting = 0; }
            else { c->state = BLEC_FAILED; c->waiting = 0; } /* disconnect stalled */
        }
    }
    if (c->state == BLEC_DISCOVERING) blec_progress(c);
    if (c->smp_reply) {
        uint8_t b[2] = {0x05, 0x05};
        if (!blec_acl_cid(c, 6, b, 2)) return;
        c->smp_reply = 0;
    }
    if (c->mtu_rsp) {
        if (!blec_att_tx(c, 0x03)) return;
        c->mtu_rsp = 0;
    }
    if (c->mtu_need && c->state == BLEC_CONNECTED) {
        if (!blec_att_tx(c, 0x02)) return;
        c->mtu_need = 0;
    }
    if (c->state == BLEC_CONNECTED && c->credits && c->qr != c->qw) {
        uint8_t p[23], n = c->qlen[c->qr % 32u], i;
        __asm__ volatile("" ::: "memory"); /* acquire the message published by the UI */
        p[0] = 0x52; blec_wr16(p + 1, c->midi_handle);
        p[3] = (uint8_t)(0x80u | ((now >> 7) & 0x3fu));
        p[4] = (uint8_t)(0x80u | (now & 0x7fu));
        for (i = 0; i < n; i++) p[5u + i] = c->q[c->qr % 32u][i];
        if (blec_acl(c, p, 5u + n)) c->qr++;
    }
}

/* A's verified one-peer HCI/ATT transport. Keep modern app entrypoints;
 * peer B stays idle and never receives HCI, scan, MIDI or a connection. */
void blec_pair_bind(blec_t *a, blec_t *b) { (void)a; (void)b; }
int blec_pair_stopped(const blec_t *a, const blec_t *b)
{ (void)b; return a->state == BLEC_OFF && !a->waiting; }
void blec_pair_rx(blec_t *a, blec_t *b, uint8_t h4, const uint8_t *p, uint16_t n, uint32_t now)
{ (void)b; if (p) blec_rx(a, h4, p, n, now); }
void blec_pair_poll(blec_t *a, blec_t *b, uint32_t now, int want)
{ (void)b; if (!want) blec_stop(a); blec_poll(a, now); }
