#!/usr/bin/env python3
"""Read a separately supplied original bank archive and check the 13 Remote fixture fields."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FIELDS = {
    78: "layer1PWM", 79: "layer2PWM", 82: "layer1Waveform", 83: "layer2Waveform",
    88: "lfo1Rate", 96: "lfo2Rate", 100: "lfo3Rate", 195: "lfo1HzEnable",
    196: "lfo2HzEnable", 197: "lfo3HzEnable", 202: "subVolume",
    210: "layer1PWMEnable", 211: "layer2PWMEnable",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    model = json.loads(subprocess.check_output([
        "node", "--input-type=module", "-e",
        "import {SUPERJ6_PROGRAM,superJ6Specs} from './web/product-site/remote/superj6.mjs';"
        "console.log(JSON.stringify({program:SUPERJ6_PROGRAM,specs:superJ6Specs}));",
    ], cwd=ROOT))
    program = model["program"]
    digest = hashlib.sha256(args.archive.read_bytes()).hexdigest()
    if digest != program["bankArchiveSha256"]:
        raise ValueError("Source archive SHA-256 mismatch")
    with zipfile.ZipFile(args.archive) as archive:
        bank = json.loads(archive.read("J6presets/Intro Bank.superj6.bank.json"))
    if (bank["uuid"], bank["name"]) != (program["bankId"], program["bank"]):
        raise ValueError("Original bank identity mismatch")
    [record] = [r for r in bank["presets"] if r["uid"] == program["programId"]]
    if record["name"] != program["name"]:
        raise ValueError("Original program name mismatch")
    values = {r["identifier"]: r["value"] for r in record["parameterValues"]}
    for slot in (0, 1):
        specs = {s["field"]: s for s in model["specs"] if s["slot"] == slot}
        if specs.keys() != FIELDS.keys():
            raise ValueError("Unexpected original field inventory")
        for field, name in FIELDS.items():
            original = struct.pack("<f", values["neon" + name])
            if struct.pack("<f", specs[field]["value"]) != original:
                raise ValueError(f"Source word mismatch at slot {slot}, field {field}")
    print(json.dumps({"archiveSha256": digest, "bank": bank["uuid"],
                      "program": record["uid"], "matchedOriginalFields": len(FIELDS),
                      "owners": 2}))


if __name__ == "__main__":
    main()
