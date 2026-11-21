# SPDX-License-Identifier: GPL-3.0-only
"""Run the packed TouchOSC companion against the stock DnBOX host simulator.

Requires a local DnBOX Git repository containing the selected firmware commit, a C
compiler, the normal host build dependencies, and Lua or texlua. All builds and
tests run in a temporary directory. No MIDI devices are opened.

python3 tests/product-remote/touchosc-host.py /path/to/DnBOX [--firmware-ref SHA] [--json result.json]
"""
import argparse
import hashlib
import json
import os
import re
import runpy
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
import zlib
from pathlib import Path

FIRMWARE = "76040daa5b52d686a8b7b544296ba5d79610a95d"
DRUM_NOTES = (36, 38, 42, 46)


def build_host(repo, work, revision):
    # The archive binds the host, packer, scripts, samples and synth inputs to
    # the same commit, independent of the caller's branch or working changes.
    fw = work / "firmware"
    fw.mkdir()
    archive = work / "firmware.tar"
    paths = ("assets/909", "assets/fonts", "experiments/original_synth", "experiments/wobble",
             "firmware", "host", "tests/host", "tools", "web/offline-sequencer/touchosc")
    subprocess.run(["git", "-C", repo, "archive", "-o", archive, revision, *paths], check=True)
    subprocess.run(["tar", "-xf", archive, "-C", fw], check=True)
    subprocess.run([sys.executable, "tools/check_original_inputs.py"], cwd=fw, check=True)
    # Keep all build products in this archive and use the stock synth/sample settings.
    stock_env = {key: value for key, value in os.environ.items() if not key.startswith("X0X_")}
    subprocess.run(["sh", "host/build_host.sh"], cwd=fw, env=stock_env, check=True)
    return fw


def extract_layout(firmware, work):
    layout = firmware / "web/offline-sequencer/touchosc"
    packed = work / "companion.tosc"
    subprocess.run([sys.executable, layout / "pack.py", "--output", packed], check=True)
    root = ET.fromstring(zlib.decompress(packed.read_bytes()))
    controls = {}
    for node in root.iter("node"):
        properties = {p.findtext("key"): p.findtext("value") for p in node.findall("properties/property")}
        name = properties["name"]
        if name in controls:
            raise ValueError(f"duplicate packed control: {name}")
        controls[name] = (node.get("type"), properties.get("script"))
    buttons = [script for kind, script in controls.values() if kind == "BUTTON"]
    if len(buttons) != 20 or len(set(buttons)) != 1 or not buttons[0]:
        raise ValueError("expected 20 packed buttons sharing the TouchOSC input callback")
    (work / "controls.txt").write_text("\n".join(controls), encoding="utf-8")
    (work / "button.lua").write_text(buttons[0], encoding="utf-8")
    (work / "controller.lua").write_text(controls["dnbox_companion"][1], encoding="utf-8")
    return hashlib.sha256(packed.read_bytes()).hexdigest()


def run_host(binary, work, name, lines):
    directory = work / name
    directory.mkdir()
    script = directory / "probe.x0x"
    script.write_text("\n".join(lines) + "\n", encoding="ascii")
    host_env = {key: value for key, value in os.environ.items() if not key.startswith("X0X_")}
    result = subprocess.run([binary, script, directory], env=host_env, capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise RuntimeError(f"{name}: host exit {result.returncode}\n{result.stdout}{result.stderr}")
    return result.stdout, directory / "midi_out.txt"


def outbound_notes(lua, host, work):
    cases = []
    for channel, notes in ((2, range(60, 72)), (3, range(60, 72)), (10, DRUM_NOTES), (11, DRUM_NOTES)):
        for note in notes:
            result = subprocess.run([*lua, "send", str(channel), str(note)], check=True, stdout=subprocess.PIPE, text=True)
            note_on, note_off = result.stdout.strip().splitlines()
            held = {2: 1, 3: 2, 10: 0, 11: 0}[channel]
            # Each note starts from a new, quiet host. Require actual audio,
            # correct synth ownership, complete release and no emitted notes.
            lines = [
                "wait 300", "expect midiheld 0", "peakreset", "wait 20", "expect peak_db_max -90",
                note_on, "wait 100", "expect peak_db_min -70", f"expect midiheld {held}",
                note_off, "wait 20", "expect midiheld 0", "expect noteons 0",
            ]
            log, _ = run_host(host, work, f"ch{channel}-note{note}", lines)
            quiet, sounding = re.findall(r"ok peak ([-.\d]+) dBFS", log)
            cases.append([channel, note, note_on, note_off, float(quiet), float(sounding)])
        print(f"TouchOSC -> firmware: channel {channel}, {len(notes)} note pairs passed")
    return cases


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repository", type=Path)
    parser.add_argument("--firmware-ref", default=FIRMWARE, help="firmware commit to qualify")
    parser.add_argument("--lua", default=shutil.which("lua") or shutil.which("texlua"))
    parser.add_argument("--json", type=Path)
    parser.add_argument("--browser-identity", action="store_true",
                        help="also run the shipped identity page in Chromium against the stock USB dispatcher")
    args = parser.parse_args()
    if not args.lua:
        parser.error("provide a Lua interpreter with --lua")
    repo = args.repository.resolve()
    revision = subprocess.check_output(
        ["git", "-C", repo, "rev-parse", "--verify", "--end-of-options", args.firmware_ref + "^{commit}"],
        text=True,
    ).strip()
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        firmware = build_host(repo, work, revision)
        host = firmware / "build/host/x0x_host"
        packed_sha = extract_layout(firmware, work)
        lua = [args.lua, Path(__file__).with_suffix(".lua").resolve(), work]
        cases = outbound_notes(lua, host, work)
        # Channel 16 is unassigned on the stock firmware. Send a real packed
        # button there as a negative audio/ownership control.
        unbound = subprocess.run([*lua, "send", "16", "60"], check=True, stdout=subprocess.PIPE, text=True)
        on, off = unbound.stdout.splitlines()
        run_host(host, work, "unbound", [
            "wait 300", "peakreset", on, "wait 100", "expect peak_db_max -90",
            "expect midiheld 0", off, "wait 20", "expect midiheld 0", "expect noteons 0",
        ])
        # Author one 909 kick and enable Notes Out via the stock UI.
        _, midi = run_host(host, work, "sequencer", [
            "wait 300", "tapkey b0", "tapkey w0", "expect hit0.0.0 1",
            "tap GLO", "tap SEL", "turn SELECT 2", "turn ALGO 1", "tap GLO", "tap EDIT",
            "expect noteons 0", "tap PLAY", "wait 2200", "tap PLAY", "expect noteons >0",
        ])
        subprocess.run([*lua, "receive", "10", midi], check=True)
        browser = None
        if args.browser_identity:
            here = Path(__file__).resolve().parent
            probe = work / "stock-editor"
            subprocess.run(["cc", "-std=c11", "-O2", "-I", firmware, "-I", firmware / "build/gen",
                            here / "stock-editor-probe.c", "-o", probe], check=True)
            check_identity = runpy.run_path(str(here / "stock-identity-browser.py"))["check_identity"]
            browser = check_identity(here.parents[1] / "web/product-site", probe)
            print(browser["status"], " / DNR2 HELLO has no reply")
        if args.json:
            report = {
                "firmware_commit": revision,
                "packed_layout_sha256": packed_sha,
                "result": "PASS",
                "outbound_columns": ["channel", "note", "note_on", "note_off", "idle_dbfs", "sounding_dbfs"],
                "outbound": cases,
                "unassigned_channel_16": "silent",
                "host_midi_output": midi.read_text(encoding="ascii").splitlines(),
                "scope": "Packed Lua scripts at TouchOSC's callback boundary and stock firmware host; no physical MIDI or native TouchOSC application.",
            }
            if browser:
                report["browser_identity"] = browser
                report["scope"] = ("TouchOSC Lua callbacks to the stock audio engine and Chromium Web MIDI "
                                   "callbacks to the stock editor/OTA dispatchers. No physical MIDI or native "
                                   "TouchOSC application.")
            args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
