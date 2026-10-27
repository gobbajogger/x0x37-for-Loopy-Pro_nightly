# EC-026: sample snapshot admission to OTA

## Purpose and limits

A valid retained backup can become stale while its confirmation dialog is open.
Another normal client can replace a sample with different bytes of the same
length and metadata. A browser CRC reread still leaves a check-to-update gap.
This protocol closes that gap for a supporting running firmware: mutation after
START invalidates the snapshot, and COMMIT checks it in the same main-loop
iteration that enters OTA. It does not hold audio, UI or project scratch while
the user checks their backup.

This is a normal-client concurrency contract, **not authentication**. The token
correlates one attempt. Full hostile replay of START plus COMMIT across a reboot,
arbitrary register/memory writes and physical corruption are outside its scope.
Host tests are not physical-device evidence. Older firmware does not acquire
this capability merely because the browser has been updated.

## Wire contract, version 1

Requests use the existing editor framing `F0 7D 46 4C cmd args F7`. The read-only
INFO reply retains its existing version string and six fields, then appends
`58 53 47 01 30` (`XSG`, version 1, command 48). A host must see this exact
extension on an X0X identity before sending command 48. Do not probe an unknown
write command on stock or other custom firmware.

| Operation | Arguments after command 48 |
| --- | --- |
| START | `1`, 16-byte nonzero seven-bit token |
| CANCEL | `2`, token, ticket |
| COMMIT | `3`, token, ticket |

Tickets have exactly four seven-bit bytes, least significant chunk first. They
are nonzero, monotonically increasing within one boot and never wrap. Exhaustion
requires a fresh boot, not truncation. Each normal reply is `op, rc, token,
ticket`; malformed requests receive only `op, 1`. Codes are 0 success, 1 malformed,
2 busy/unavailable, 3 stale/consumed, 4 samples changed and 5 exhausted.

START must precede the first SMP_INFO/risk/empty decision. The browser uses a
fresh cryptographic token per attempt and sends START once. Missing START ACK
abandons the attempt; an unsolicited/new-ticket ACK cannot repair it. A duplicate
START for the same current token cannot clear dirty or consumed state. A client
replacing token A with B advances the ticket; a later A gets a new ticket, so an
old A COMMIT still fails. CANCEL needs both token and ticket.

START and COMMIT refuse in-progress sample imports/erased sectors, project or
recovery ownership, boot/store staging, pending intentional restart, pending
legacy OTA/UBOOT requests, or unavailable flash. Every sample command 11–14
attempt marks an active watch dirty **before argument validation**: BEGIN and
failed END can restore a shadow, and an empty-slot WRITE need not have BEGIN.
Startup recovery precedes any active watch. Reads and INFO do not reset it.

COMMIT consumes the ticket before queuing its ACK. Only complete successful ACK
enqueue sets the dedicated OTA request. A failed/refused COMMIT also discards
legacy requests that arrived while its response was queued; it cannot inherit
one as an accidental update authorization. The main loop consumes authorization
before OTA entry, with no intervening editor/UI handler. Queued sample commands
cannot run in `ota_session`/`ota_idle`. Pending state is cleared on session return
and on legacy update, UBOOT or intentional restart entry. A reboot loses the
volatile watch; an old COMMIT alone is rejected.

Successful enqueue does not prove ACK delivery. The host sends COMMIT once and
never retries an uncertain authorization. The actual Updater binds the selected
device first, rechecks the exact read-only INFO capability on that fresh link,
then sends this COMMIT instead of legacy UPGRADE and preserves later
queued OTA reads. Missing/malformed/mismatched ACK or observed link loss stops
the browser. Existing package/model, finish-ack, loader, application readback and
sample-restore checks remain in place. A same-family reconnect alone is not a
capability promise; absent final capability never receives command 48, and the
host never sends a new START to rearm the old archive.

## Preservation and compatibility

Occupied at-risk slots still require an independently validated archive and
explicit retained-backup acknowledgement. A dirty watch requires a new attempt,
new archive and acknowledgement; it never silently uses the older file. An
initially empty slot is still watched through COMMIT. No project or calibration
bytes are changed by this protocol.

The current companion browser fails closed for sample-protocol firmware without
this capability. A future legacy exception must prove that the exact admitted
target loader cannot write any retained slot's **entire capacity**, and that the
same explicit physical offsets/capacities remain. A map marker, current used
length, empty status, or general catalog admission alone is insufficient. The
existing narrowly identified stock firmware with no sample protocol remains a
separate compatibility exception. No legacy device installation is claimed by
this source repair.

## Source-only checks

`sh tests/host/run_install_snapshot.sh` compiles the actual editor parser and
actual main-loop dispatch with observable platform sentinels and RAM-backed
flash. It covers correlation, dirty attempts, replay/replacement, reset, busy
ownership, ACK enqueue failure, late sample/legacy requests and return cleanup.
Existing project/parser, sample-cancel and editor/OTA dispatch tests remain
applicable. The NIGHTLY counterpart exercises the actual browser installer,
Updater, confirmation Promise and external sample-write API.

On the current GCC 14 host, existing DSP weak-inline declarations make the
default `-Werror` fixture build fail before runtime. `SAN_FLAGS=-Wno-error`
executes this fixture with those pre-existing diagnostics visible. This is
supplemental scoped behavior evidence, not a clean default compiler gate.
Exact native DEV budgets and independent exact-source review are separate gates.
