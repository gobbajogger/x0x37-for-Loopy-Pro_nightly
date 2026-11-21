#!/usr/bin/env python3
"""Rebuild the Remote's Draft drum readouts from the original 909/808 and UI C."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
REMOTE = ROOT / "web/product-site/remote"
PIN = json.loads((ROOT / "tools/drum-source/identity.json").read_text())


def original_function(text, name):
    signature = re.search(r"^static (?:void |char \*)" + name + r"\(", text, re.M)
    if not signature:
        raise ValueError(f"Missing UI function {name}")
    # These four functions end with an unindented closing brace in the pinned source.
    end = text.index("\n}", signature.end()) + 2
    return text[signature.start():end]


def run_oracle(firmware, identities, work):
    for name, expected in PIN["inputs"].items():
        data = (firmware / name).read_bytes()
        blob = hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()
        if blob != expected:
            raise ValueError(f"Original firmware input changed: {name}")
    dsp = firmware / "firmware/src/dsp"
    ui = (firmware / "firmware/src/app/ui.c").read_text()
    engine = (firmware / "firmware/src/app/engine.c").read_text()
    for kit in ("909", "808"):
        assert f"case T_{kit}: return drum{kit}_param_si(v, i, pot, val);" in engine
    assert "int u = engine_param_si(r.a, r.b, r.c, v, &x);" in ui
    assert "if (u != X0X_U_NONE) { unit_value(u, x, num, unit); return; }" in ui
    assert 'put_s(num, v >= 0 && v <= d->max ? d->names[v] : "INVALID");' in ui
    # Generate the native lookup headers locally from their pinned generator and WAVs.
    subprocess.run([sys.executable, str(firmware / "tools/gen_drum_samples.py"),
                    str(work / "x0x_drum_samples.h")], check=True, stdout=subprocess.DEVNULL)
    helpers = "\n".join(original_function(ui, name) for name in ("put_s", "put_i", "put_d1", "unit_value"))
    source = """#include <stdio.h>
#include "drum808.h"
#include "drum909.h"
#include "fastmath.h"
""" + helpers + r"""
int main(void) {
    unsigned kit, voice, param;
    while (scanf("%u %u %u", &kit, &voice, &param) == 3) {
        const x0x_param_t *desc = kit ? drum808_param(voice, param) : drum909_param(voice, param);
        if (!desc) return 1;
        for (int raw = 0; raw <= desc->max; ++raw) {
            char number[32] = {0}, unit[32] = {0};
            if (desc->names) {
                put_s(number, desc->names[raw]);
            } else {
                float value = 0;
                int kind = kit ? drum808_param_si(voice, param, raw, &value)
                               : drum909_param_si(voice, param, raw, &value);
                if (kind == X0X_U_NONE) put_i(number, raw);
                else unit_value(kind, value, number, unit);
            }
            printf("1:%u:%u:%u %d %s%s\n", kit, voice, param, raw, number, unit);
        }
    }
    return 0;
}
"""
    (work / "readout.c").write_text(source)
    binary = work / "readout"
    subprocess.run(["cc", "-std=c11", "-O2", "-DX0X_HOST", "-ffp-contract=off",
                    "-ffunction-sections", "-fdata-sections", f"-I{dsp}", f"-I{work}",
                    str(work / "readout.c"), str(dsp / "drum808.c"), str(dsp / "drum909.c"),
                    str(dsp / "x0x_param.c"), "-Wl,--gc-sections", "-o", str(binary)], check=True)
    commands = "".join(" ".join(identity.split(":")[1:]) + "\n" for identity in identities)
    output = subprocess.check_output([binary], input=commands, text=True)
    rows = {identity: [] for identity in identities}
    for line in output.splitlines():
        identity, raw, display = line.split(" ", 2)
        assert int(raw) == len(rows[identity])
        rows[identity].append(display)
    return rows


def build_module(rows):
    indices = {}
    curves = []
    for identity, values in rows.items():
        if values not in curves:
            curves.append(values)
        indices[identity] = curves.index(values)
    lines = ["// SPDX-License-Identifier: GPL-3.0-only",
             "// Generated from pinned original C by tools/generate-drum-displays.py.",
             "const curves = ["]
    lines.extend("  " + json.dumps(curve, separators=(",", ":")) + "," for curve in curves)
    lines.extend(["];", "const indexByIdentity = " + json.dumps(indices, indent=2) + ";", "",
                  "export function drumDisplay(identity, raw) {",
                  "  if (!Object.hasOwn(indexByIdentity, identity) || !Number.isInteger(raw)) return null;",
                  "  return curves[indexByIdentity[identity]][raw] ?? null;", "}", ""])
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("firmware", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    components = json.loads((REMOTE / "components.json").read_bytes())
    controls = [control for screen in components["screens"] if "-voice-" in screen["path"]
                for control in screen["controls"]]
    identities = sorted({control["identity"] for control in controls})
    assert len(controls) == 83
    with tempfile.TemporaryDirectory(prefix="remote-drum-formats-") as temp:
        rows = run_oracle(args.firmware.resolve(), identities, Path(temp))
    # The original SVG examples retain the numbers printed by their older firmware.
    # Qualify today's editable projection at those same stored raw settings.
    defaults = {}
    for screen in components["screens"]:
        if "-voice-" not in screen["path"]:
            continue
        defaults[screen["path"]] = [
            rows[control["identity"]][int(control["context"]["raw"])]
            for control in screen["controls"]
        ]
    products = {
        REMOTE / "drum-format.mjs": build_module(rows),
        ROOT / "tests/product-remote/fixtures/drum-firmware-defaults.json":
            json.dumps(defaults, indent=2) + "\n",
    }
    for target, expected in products.items():
        if args.check:
            if target.read_text() != expected:
                raise SystemExit(f"{target.name} differs from the pinned firmware output")
        else:
            target.write_text(expected)
    print(f"DRUM_DISPLAY {len(controls)} source presentations, {len(rows)} unique controls, "
          f"{sum(map(len, rows.values()))} source readouts")


if __name__ == "__main__":
    main()
