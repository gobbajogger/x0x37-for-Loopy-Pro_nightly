#!/usr/bin/env python3
"""Print the eight Remote FX display tables from DnBOX firmware c7ce8684."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("firmware", type=Path)
args = parser.parse_args()
root = args.firmware.resolve()
dsp = root / "firmware/src/dsp"
ui = (root / "firmware/src/app/ui.c").read_text()
pins = json.loads(Path(__file__).with_name("inputs.json").read_text())
for name, expected in pins.items():
    if hashlib.sha256((root / name).read_bytes()).hexdigest() != expected:
        raise SystemExit(f"Unexpected firmware input: {name}")

definitions = []
for name in ("put_s", "put_i", "put_d1", "unit_value"):
    match = re.search(r"^static (?:void |char \*)" + name + r"\([^;{}]*\)\n\{.*?^\}", ui, re.M | re.S)
    if not match:
        raise SystemExit(f"Missing formatter: {name}")
    definitions.append(match.group())
with tempfile.TemporaryDirectory() as tmp:
    work = Path(tmp)
    subprocess.run([sys.executable, root / "tools/gen_drum_samples.py", work / "x0x_drum_samples.h"],
                   check=True, stdout=subprocess.DEVNULL)
    source = Path(__file__).with_name("readout.c").read_text()
    (work / "readout.c").write_text(source.replace("/* UI formatters */", "\n".join(definitions)))
    binary = work / "readout"
    subprocess.run(["cc", "-std=c11", "-O2", "-DX0X_HOST", "-ffp-contract=off",
                    "-ffunction-sections", "-fdata-sections", f"-I{dsp}", f"-I{work}",
                    work / "readout.c", dsp / "fxbus.c", dsp / "drum909.c",
                    dsp / "x0x_param.c", "-Wl,--gc-sections", "-o", binary], check=True)
    rows = {}
    for line in subprocess.check_output([binary], text=True).splitlines():
        slot, display = line.split("\t")
        rows.setdefault("1:4:0:" + slot, []).append(display)
    print("{\n" + ",\n".join("  " + json.dumps(key) + ": " + json.dumps(values)
                              for key, values in rows.items()) + "\n}")
