# EC020: unknown sample-layout metadata must not suppress backup

This is a distinct local child change after frozen PR34 integration
`88a5e5582f02e5512775ea351a6a7ac76fd06194` (tree
`7e53e33aaf39f1b3f8bab70803fd4d11fbd48ed7`). Prior aggregate and Sol receipts
remain evidence for that exact prior head, not an automatic pass for this child.

Original test-only PR49 is `39842ee457085cad2d527aa04caf30ef3fcd2b2a`, based
on main `d8660c2caf01f67ca07628fef7a8489570ccb96a`. Its full-module regression
`tests/edge-smp-info-unknown-extension.test.mjs` is retained byte-identically to
blob `b2686b2dd17de3980aa2e98f7c0df023de8193f3`.

Running that test against the actual complete production module at the frozen
integration produced 2 passes and 1 failure (missing expected exception).
The synthetic valid reply is:

```
01 50 01 41 00 0A 58 01 30 01 0B 00 0A 00
```

Its occupied slot is at `0xB0000`, not the guessed legacy offset `0xC2000`.
Changing byte 6 from `58` to `59` previously hid the extension and changed
`atRisk` from `[0]` to `[]` against a package retaining only the legacy offset.

The source repair adds one rejection condition: bytes remaining after the slot
descriptors must begin with the supported `X` extension marker. Unknown metadata
is refused, never downgraded. Existing version, exact extension length, range,
overlap and zero-count safeguards are unchanged. Complete genuine legacy replies
remain accepted; a completely absent extension is indistinguishable from legacy
and is not newly claimed detectable. This change does not broaden the parser's
other descriptor validation or alter native firmware/sample formats.

The additional full-module tests cover all unsupported 7-bit markers and
versions, each partial recognized extension, every extra 7-bit trailing byte,
and genuine legacy occupied/empty layouts. On the actual preflash caller,
malformed metadata permits only the read-only SMP_INFO request, closes the link,
and refuses before sample reads/writes, backup save, progress or OTA. A stock
identity cannot waive an invalid reply. Expanded regressions were 4/8 before;
all 8 pass after. The affected preservation/retention/migration group passes
60/60. Final exact-child aggregate and independent review receipts are retained
separately by the integration owner.

These are synthetic source tests, not physical-device or rendered-browser
proof. No firmware/catalog publication, sample/device action or remote PR update
is part of this local repair. The pre-existing blocked remote delivery remains
paused independently of this source fix.
