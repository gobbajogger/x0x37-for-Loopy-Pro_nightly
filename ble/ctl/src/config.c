// SPDX-License-Identifier: MPL-2.0
// Copyright (C) 2026 M. Geisler (genkigenki/makkuro)
/*
 * Controller configuration for a standalone LE-only controller image.
 * Supports a peripheral role or up to two direct SMC central links.
 * Symbol names and meanings follow the JieLi AC79 SDK (Apache-2.0)
 * header btcontroller_modules.h. Values are chosen for this image.
 */
#include <stdint.h>

#define BIT(n) (1UL << (n))
#define BT_MODULE_LE  BIT(1)
#define LE_SLAVE      BIT(1)
#define LE_ADV        BIT(2)
#define LE_MASTER     BIT(0)
#define LE_SCAN       BIT(3)
#define LE_INIT       BIT(4)
#define LL_FEAT_ENCRYPTION ((uint64_t)1 << 0)
#define BT_NORMAL     0x01

/* Peripheral keyboard or direct SMC-Mixer central, selected by the app; up to two central links. */
const int config_btctler_modules = BT_MODULE_LE;
const int config_btctler_le_roles = LE_ADV | LE_SLAVE | LE_MASTER | LE_SCAN | LE_INIT;
const uint64_t config_btctler_le_features = 0; /* SMC BLE-MIDI uses an unpaired link. */

/* Standard HCI over the in-memory H4 transport. Normal (non-test) mode.
 * The SDK pairs hci_standard=1 only with test modes; this pairing is a
 * Stage-1 assumption that needs a hardware test. */
int config_btctler_mode = BT_NORMAL;
int config_btctler_hci_standard = 1;

/* A: one SMC central link, five controller ACL transmit buffers. */
const int config_btctler_le_hw_nums = 1;
const int config_btctler_le_rx_nums = 5;
const int config_btctler_le_acl_packet_length = 27;
const int config_btctler_le_acl_total_nums = 5;
const int config_btctler_le_slave_conn_update_winden = 2500;
const int config_btctler_le_afh_en = 0;
const int config_btctler_le_master_multilink = 0;
const int config_btctler_le_tws = 0;
const int config_btctler_single_carrier_en = 0;
const uint32_t config_vendor_le_bb = 0;
const int ble_disable_wait_enable = 1;

/* Classic (BR/EDR) features: all off. */
const int config_bt_function = 0;
const int config_btctler_dual_a2dp = 0;
unsigned char config_btctler_bredr_master = 0;
const int config_bredr_afh_user = 0;
const int config_btctler_role_switch_fail_disconnect = 1;
const int config_btctler_role_switch_fail_back_to_slave = 0;
const int config_multilink_support_esco_enalbe = 0;
const int config_bt_security_vulnerability = 0;
const int config_fix_fre_enable = 0;
const int config_force_bt_pwr_tab_using_normal_level = 0;
const unsigned char rx_fre_offset_adjust_enable = 1;
const int CONFIG_BREDR_INQUIRY = 0;
const int CONFIG_BTCTLER_FAST_CONNECT_ENABLE = 0;
const int CONFIG_BTCTLER_TWS_ENABLE = 0;
const int CONFIG_TWS_POWER_BALANCE_ENABLE = 0;
const int CONFIG_TWS_SUPER_TIMEOUT = 0;
const int CONFIG_ESCO_MUX_RX_BULK_ENABLE = 0;
const int CONFIG_INQUIRY_PAGE_OFFSET_ADJUST = 0;
const int CONFIG_LMP_MASTER_ESCO_ENABLE = 0;
const int CONFIG_LMP_NAME_REQ_ENABLE = 0;
const int CONFIG_LMP_PASSKEY_ENABLE = 0;
const int CONFIG_TEST_DUT_CODE = 0;
const int CONFIG_TEST_DUT_ONLY_BOX_CODE = 0;
const int CONFIG_TEST_FCC_CODE = 0;

/* Platform. */
const int CONFIG_WIFI_DETECT_ENABLE = 0;
const int config_update_mode = 0;
const int config_asser = 0; /* felucca-bsp #2: must be a const int */
