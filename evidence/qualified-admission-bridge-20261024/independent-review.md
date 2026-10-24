# Independent combined website review (scoped)

Disposition: SCOPED REVIEWED after repairs; final complete committed-root independent acceptance remains pending. No source edits, push, protected merge, firmware/controller artifact, publication or device operation performed by reviewer.

## Findings and resolution

1. Actual run() previously awaited MIDI before acquiring the writer lock. A deferred-permission source-function probe reproduced two simulated installer calls. Parent moved guard/lock/buttons before permission, invalidated pending loads, and restored denial/retry state. Actual run+scan permanent test covers seven scenarios: concurrent entry, denial+retry, normal/partial/total restoration, stock layout and failed backup; all pass on repaired source. Before-source permanent test fails as expected.
2. Newly filtered qualified picker still preferred absent/revoked catalogLive.latest, leaving the select empty while an older approved candidate existed. Parent now checks latest membership. Actual fillVersions permanent test covers six scenarios; all pass after, fail before.
3. Inherited history/evidence hrefs accepted arbitrary schemes. Parent added a HTTPS/no-credentials helper and source-executed regression, preserving legitimate evidence fragments. No cross-browser exploit is alleged.

## Core adapter review

No additional blocking NEW issue found in inspected source. prepareInstaller clones catalog/qualification before asynchronous HTTP, validates distinct source commit/root/compiled-tree pins, verifies actual downloaded byte size/hash/model with redirects forbidden, rechecks source fingerprint, and only then compiles per-model approval map. Normalized catalog is returned for both embedded HTML and versions.json. Empty source approval map cannot be bypassed by catalog QA flags. Actual controller click handler requires a matching owner-supplied controller, then rechecks current package object, selection generation, product, image, controller and approval after hash await. Qualified renderer and browser package-URL rules now align.

I ran npm test successfully during catalog integration, including119 pinned historical records and malicious continuity tests; that mutable-worktree execution is supporting evidence, NOT certification of a final immutable root. Sources may continue to advance until parent commits them. No real HTTP package, qualified firmware build, hardware identity, published URL or device was established.

## Reproduction evidence

review-results.json contains exact commands, exits and SHA256s for both before/after permanent tests. index-installer.html is a textual snapshot read from git index before parent fixes, SHA25674055f0d287cdd7bca5501e7eebd96ca620261dc186aa1079f5bcba11ef4b310. Test candidates are installer-write-lock.test.mjs and installer-qualified-selection.test.mjs (parent copied them into its test runner).

Final existing sole Independent QA should consume the committed combined root, actual complete logs and all outstanding native/installer/model/controller/backup/OTA/legal/HTTP gates before any publication. This report does not replace that role or approve installation.

Inspected file SHA256s at report time:
{
  "scripts/render-qualified-nightly.mjs": "d5b91d0690bf8e6741043e895140aabfe8d8b67ade3a47b7c3e8d34cb302a411",
  "web/x0x_installer.html": "650534dc041eb4cd39035a8256a0a9e0a2d8ce9ec365217beaadbe8425166e24",
  "tests/qualified-catalog.test.mjs": "e1eee8c3f953759d98799da684dff93d529101e8886349eac13184c83bb23cec"
}
