"""Render the source-derived SuperJ6 LFO component and measure PCM cycles."""
import argparse
import csv
import hashlib
import io
import json
from fractions import Fraction
from pathlib import Path
import subprocess
import tempfile
import wave
import zipfile

SOURCE = {
    "lfo_laws.cpp": "1806b4befb1c26f536c7026318c0a2ad40b37c5fb5c51fedf595b309805625c9",
    "lfo_laws.hpp": "b231495620273baab20e5e29e5f808c363a01c58a9a386b6c6c22fcb67325eb2",
    "conductor.hpp": "3d78c291a4aada3616d2acbbbd700b1594f76f183048c6195fb4d315ebd7c745",
}
PERIODS = [
    ("1/64 note", "1/16"), ("1/32-note triplet", "1/12"),
    ("1/32 note", "1/8"), ("1/16-note triplet", "1/6"),
    ("1/16 note", "1/4"), ("1/8-note triplet", "1/3"),
    ("1/8 note", "1/2"), ("1/4-note triplet", "2/3"),
    ("1/4 note", "1"), ("1/2-note triplet", "4/3"),
    ("1/2 note", "2"), ("whole-note triplet", "8/3"),
    ("whole note", "4"), ("2 whole notes", "8"),
    ("about 3 whole notes", "12"), ("4 whole notes", "16"),
    ("about 6 whole notes", "24"), ("8 whole notes", "32"),
]

def run(source, out):
    for name, digest in SOURCE.items():
        if hashlib.sha256((source / name).read_bytes()).hexdigest() != digest:
            raise ValueError(f"source identity mismatch for {name}")
    out.mkdir()
    with tempfile.TemporaryDirectory() as directory:
        temporary = Path(directory)
        binary = temporary / "lfo-render"
        subprocess.run(["c++", "-std=c++11", "-O2", "-fno-fast-math", "-ffp-contract=off",
                        "-Wall", "-Wextra", "-Werror", "-I", str(source),
                        str(Path(__file__).with_name("render.cpp")), str(source / "lfo_laws.cpp"),
                        "-o", str(binary)], check=True)
        raw = subprocess.check_output([binary, temporary], text=True)
        data = []
        with zipfile.ZipFile(out / "lfo-component-wav.zip", "w") as archive:
            for fields in csv.DictReader(io.StringIO(raw)):
                index = int(fields["bin"])
                tempo = int(fields["bpm"])
                rate = int(fields["sample_rate"])
                name = f"bin-{index:02d}-{tempo}"
                pcm = (temporary / (name + ".u8")).read_bytes()
                edges = [i for i in range(1, len(pcm)) if pcm[i-1] > 128 > pcm[i]]
                if edges != [int(fields[key]) for key in ("edge1", "edge2", "edge3")]:
                    raise ValueError(f"PCM edge mismatch for {name}")
                period = (edges[2]-edges[0])/2
                label, beats_text = PERIODS[index]
                ideal = float(Fraction(beats_text)) * 60 * rate / tempo
                allowed = 1 + (ideal * 0.00021 if index in (14, 16) else 0)
                if abs(period-ideal) > allowed:
                    raise ValueError(f"musical duration mismatch for {name}")
                blob = io.BytesIO()
                with wave.open(blob, "wb") as wav:
                    wav.setparams((1, 1, rate, 0, "NONE", "not compressed"))
                    wav.writeframes(pcm)
                payload = blob.getvalue()
                archive.writestr(zipfile.ZipInfo(name + ".wav"), payload,
                                 compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
                data.append(dict(bin=index, bpm=tempo, normalized=float(fields["normalized"]),
                                 hz=float(fields["hz"]), sample_rate=rate, frames=len(pcm),
                                 falling_edges=edges, measured_quarter_beats=period*tempo/rate/60,
                                 equivalent=label, equivalent_quarter_beats=beats_text,
                                 wav_sha256=hashlib.sha256(payload).hexdigest()))
    expected = {(i, tempo) for i in range(18) for tempo in (90,120,180)}
    if len(data) != 54 or {(row["bin"], row["bpm"]) for row in data} != expected:
        raise ValueError("incomplete tempo matrix")
    (out / "measurements.json").write_text(json.dumps(data, indent=2) + "\n")
    print(f"{len(data)} waveforms measured; all three PCM edges and all musical periods matched.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="pinned SuperJ6 Conductor source directory")
    parser.add_argument("out", type=Path, help="new output directory")
    args = parser.parse_args()
    run(args.source, args.out)

