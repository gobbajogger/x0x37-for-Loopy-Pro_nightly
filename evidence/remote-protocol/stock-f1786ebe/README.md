# Stock firmware parameter handshake at f1786ebe

Firmware [`f1786ebe`](https://github.com/gobbajogger/DnBOX/commit/f1786ebec2616477163b62b029c7e77405a9c3de) merged the updated stock screen catalog for both keyboard models. A fresh C build used its production editor and OTA dispatchers. The dependency check verified 30 tracked files against the pinned Git blobs, and the stock generator rebuilt one header. Sandboxed Chromium 151.0.7922.34 loaded the identity page from the 303-file Remote product at [`59d83425`](https://github.com/gobbajogger/DnBOX-nightly/commit/59d8342569d494dc587cafde456ed71b5130978d).

The stock editor answered the INFO request with a 25-byte reply identifying `X0X DEV`. The Remote's production encoder then sent a 51-byte DNR2 HELLO. The dispatcher deferred that request and returned zero bytes. The native parameter catalog was therefore unavailable on this stock path. The fixture admits INFO and HELLO only and fails on a flash write, erase or USB upgrade request. [Request and reply bytes, compiler and source hashes](exchange.json) · [Browser output](browser.log)

This host used the normal firmware dispatch code with a test transport. Physical USB/BLE keyboard round trips and audio-applied readback remain open. The [archived native parameter browser run](../pilot-246ea371/browser-undo/README.md) covers editing and Undo using the real UI and engine at its own revision.

To reproduce, provide checkouts of the two pinned commits, generate the stock drum header, then use the published [read-only C probe](https://github.com/gobbajogger/DnBOX-nightly/blob/59d8342569d494dc587cafde456ed71b5130978d/tests/product-remote/stock-editor-probe.c) and [identity browser harness](https://github.com/gobbajogger/DnBOX-nightly/blob/59d8342569d494dc587cafde456ed71b5130978d/tests/product-remote/stock-identity-browser.py). The following commands take `FIRMWARE`, `NIGHTLY`, `PRODUCT` and `PROBE` as paths to the stock checkout, Remote checkout, its built product and the desired probe executable.

```sh
python3 "$FIRMWARE/tools/gen_drum_samples.py" "$FIRMWARE/build/gen/x0x_drum_samples.h"
cc -std=c11 -O2 -I"$FIRMWARE" -I"$FIRMWARE/build/gen" "$NIGHTLY/tests/product-remote/stock-editor-probe.c" -o "$PROBE"
python3 - "$NIGHTLY" "$PRODUCT" "$PROBE" <<'PYTHON'
import json, runpy, sys
from pathlib import Path
nightly, product, probe = map(Path, sys.argv[1:])
check = runpy.run_path(str(nightly / 'tests/product-remote/stock-identity-browser.py'))['check_identity']
print(json.dumps(check(product.resolve(), probe.resolve()), indent=2))
PYTHON
```
