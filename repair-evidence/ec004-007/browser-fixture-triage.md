# Browser failure triage

The five candidate browser failures reproduce or are explained against unchanged baseline `2b11200c8cc69b7f80d8cd2ccef968adb6cc3a75`; they are test-double assumptions, not an observed EC004–007 repair regression.

`run()` in existing `web/x0x_installer.html` awaits `scan(true)` after a successful install. That post-write scan calls `midiAccess()` again. The real implementation caches access in `midi`; repeated calls do not represent a second permission prompt.

The bundled test replaces `midiAccess` with an uncached async counter. It correctly observes one install write and released lock, but incorrectly expects one function invocation: the install and postscan invoke it twice. The exact baseline suite reproduces all four candidate failures; diagnostic states show `permissions=2`, `writes=1`, `writing=false` for Elite/Pro bundled and legacy paths.

The admission test replaces `midiAccess` with a new held promise on every invocation. It grants the initial install promise, resolves `installDone`, then checks the lock without granting the new postscan promise. The focused baseline reproduces `permissions=2, writing=true`; granting that second mock promise causes `writing=false` immediately. It is not evidence of a permanently leaked production lock.

Recommended narrow repair: make test permission doubles distinguish API function calls from actual permission requests and cache a successful access object, while preserving controllable initial denial/retry. Explicitly wait for the post-install scan/lock completion rather than a 30ms delay. Preserve assertions of one install/write and single-writer denial. No production source or test assertion needs weakening.

No source edits, commits, hardware operations or publication occurred. `browser-baseline` is a clean isolated checkout. Probe scripts are temporary instrumentation of exact baseline tests with ROOT explicitly pinned to it. See receipt.json and logs for commands/exits/digests.


## Authorized fixture repair and final validation

Only `site-repair/tests/browser-admission.py` and `tests/bundled-browser.py` changed. Successful mocked access is now cached. A denied initial request still requires another permission attempt; an interrupted install reuses its already granted access while still requiring a second installer entry. The grant/interruption cases wait for actual `writing=false` after postscan instead of sleeping30ms. No installer source or safety assertion was removed.

Against the unchanged repaired website source `e4e3d42c3573e73629c03b0a1dd819bc47c80c7e`, full affected suites passed:
- bundled-browser:61/61, exit0 (baseline57/61).
- browser-admission:679/679, exit0 (previous candidate676/677; two new permission retry/cache checks).

Both suites ran with headless Chromium148.0.7778.96, Python3.9 and Playwright1.60.0 using only synthetic package/MIDI doubles. No physical device was touched. Exact source/test blobs, log digests and commands are in receipt.json. Coordinator owns commit/integration and independent final review.
