# EC019: resumed completion requires a returning application

This is a distinct child change after the independently reviewed PR34 composition
`eece3f368c4c48cc65e05d7bc1a85337e945cc73` (tree
`2dab9e9f7f45a80a7af0475359b65e33c57461c4`). That exact prior head completed
all-in-one `npm test` exit0 and independent Sol round1 APPROVE. Its evidence
does not by itself qualify this subsequent completion repair.

Original regression PR48 is `f7d58ac2a85abbc5ee0b0ff84a7cc08b45fd8a88`;
`tests/edge-ota-resume-app-readback.test.mjs` remains byte-identical to blob
`cbfd73774b0fd35016605b2225e5a0ffccb1fd3d`. It failed on the prior composed
source: loader ACK returned success without any postboot application check.

Both full install and resume now use the same bounded post-write completion:
emit reboot, allow 3 seconds to restart, then discover a non-loader application
for up to 40 seconds. Recheck the sole observable compatible port and model
family after the handshake; close the returned link on success or refusal.
Only a matching application marker sets `verified` and emits `done`, binding
the observed renamed sole port for subsequent readback/restore. Failed loader
ACK remains false and never begins application-return validation.

The caller no longer maps a loader-transfer boolean directly to Done/100%.
Firmware transfer and pre-application sample-backup progress remain below100;
post-application restore progress still reaches100. Deliberate stock/custom
marker-mismatch policy is retained only after a real same-family application
response under the single-port guard. Absent application, lingering loader,
cross-family response or ambiguity cannot use that exception. A tolerated
foreign marker mismatch leaves `verified=false`.

`tests/edge-ota-resume-caller-completion.test.mjs` executes production Link,
handshake, find, bind, serve, write, resume, waitFor and the actual HTML run/scan
bodies with synthetic WebMIDI/DOM and accelerated time. The same behavioral
suite was 2 pass /9 expected failures before, and11/11 after. It includes absent
or still-loader application, wrong marker/family, ambiguity before and during
the return handshake, sole-port rename and loader alias positive, explicit
foreign policy, lost ACK and premature progress/boolean completion negatives.
Existing legitimate-alias and successful retry fixtures now provide a returning
application; prior refusal and transport assertions remain intact.

**Identity limits:** the 27-byte model/version marker has neither unit serial
nor installed-package hash. A matching `_900` can be shared by different DEV
builds. This establishes a fresh application response and marker agreement,
not cryptographic flash-byte verification or unique physical-unit identity.
Package SHA/model/controller/catalog qualification remains separate.

No device, sample flash, native firmware, SDK/toolchain, catalog/publication or
production promotion is part of this change. Actual rendered desktop/mobile
browser testing and owner preview remain pending; synthetic tests are not
browser or hardware proof.
