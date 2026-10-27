# Numbered NIGHTLY package admission

Base site: `30e54656b97ccfdab45dbe4d903d65465f500596`.
Authoritative firmware source: `85976ecaed11317de73718589693e034061447a8`,
`tools/firmware_build_labels.py`, `tools/release_alloc.py` and
`tools/package_nightly.py`.

The existing renderer and browser accepted only `SMK-37 Pro_900` /
`SMK-37 Elite_900`, rejecting real numbered packages such as
`SMK-37 Pro_9000100` / `SMK-37 Elite_9000100`. The exact producer codec is
`model_9XXYYZZ`: three two-digit components decode to canonical `X.Y.Z` in
0..99, with readable display `X.Y.Z_openbeta`. `_900` remains unversioned.

The repair accepts only those exact Pro/Elite identities. Any supplied
`firmware_version` or `release_display` on a version/package/qualification
receipt must agree with the decoded package. Omitted metadata remains allowed;
legacy records permit omitted/null metadata but cannot acquire a numeric label.
Catalog `version` remains its existing independent catalog ID, not a new
mandatory copy of `firmware_version`. Public projection retains the two safe
metadata fields; private qualification receipts still are not published.

The website does not allocate versions or independently certify allocation.
`package_nightly.py` retains its allocated-ledger requirement. Existing exact
source/tree/product/hash/size/controller receipts, independent gates, immutable
HTTPS download checks, revocation and verified-Blob/write safeguards are
unchanged. Installer fingerprint changes with this repair, so a publisher must
use a matching current installer receipt rather than reuse a stale one.

Executed producer evidence uses the exact pinned pure functions (no allocation,
ledger write, native build or package publication): 10 Pro/Elite codec/display
round trips, six refused noncanonical version strings and first-version0.1.0.
The generated public fact vectors are in
`tests/fixtures/numeric-product-identity.json`. Native regression tests exercise
both actual renderer and browser predicates, plus byte/hash/controller checks
on synthetic nonexecutable packages. No SDK, executable firmware, private
sample or real candidate bytes are included.

Layout/styles, catalog contents and device transport are unchanged. Prior
rendered UI proof is reused only for unchanged layout; no new browser/device
execution is implied. This source compatibility fix does not itself qualify,
allocate, merge or publish any firmware candidate.
