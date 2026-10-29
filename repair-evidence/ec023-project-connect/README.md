# EC023: pending Project Workspace connection after disconnect

Baseline site `1ff193839a03609112870c80f0eb339584a301d2` retained project-page
blob `57f93e754d08e77b6197835c92f208c1775832a0`. The original PR53 full-HTML
regression (`e842ca5cc3f8b903ced484170ffcf9e246d820f7`) reproduced RED 2/3:
resolving a pending identity after disconnect restored a stale device and
re-enabled project mutation controls. The original regression is unchanged.

The pending link object now acts as a connection-generation token. Success and
failure recheck the existing disconnected-port invalidation and refuse to
publish an invalidated connection. Late rejection no longer dereferences the
cleared global link or overwrites the disconnect message. Replug does not make
an old completion current; an explicit fresh connection is still supported.

Source scope is the page's connect/disconnect completion handling, generated
project page and regression/provenance. Protocol/device methods, sample writes,
firmware/native inputs, workspace exclusion, recovery/download retention and
normal import validation/confirmation rules are unchanged.

Focused native proof: original 3/3 repaired; 20 actual-page-handler contracts;
33 existing project protocol/transaction tests. New cases cover input/output
unplug followed by resolve/reject, missing state event, replug plus fresh retry,
and a valid delayed recovery connection with busy exclusion. All device and
MIDI services are synthetic; no physical device operation was performed.

This is distinct from canonical firmware PR398's MIDI port-pairing integration.
No new claim of hardware compatibility, audible output, installation,
publication or merge follows from these source/UI tests.

The existing responsive browser regression was attempted but Chromium could
not start in this execution environment (missing bundled binary; system browser
socket restriction). No new responsive-browser PASS is claimed for this child;
page layout/styles and the previously rendered baseline are unchanged.
