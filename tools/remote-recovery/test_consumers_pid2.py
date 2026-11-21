"""Local-only consumers() contract tests; no real /proc access or operator modes.

Only the actual consumers() AST is loaded. Every process surface is a strict fake.
Run explicitly with --operator and --proof; this test is outside the product gate.
"""

import argparse
import ast
import builtins
import hashlib
import io
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


class ForbiddenPID2Path(AssertionError):
    """Raised even when the operator merely constructs the forbidden path."""


class PIDText:
    """Catch '/proc/' + str(2) before a fake filesystem operation can occur."""

    def __init__(self, filesystem):
        self.filesystem = filesystem

    def __radd__(self, prefix):
        path = prefix + "2"
        if path == "/proc/2" or path.startswith("/proc/2/"):
            self.filesystem.operations.append(
                {"operation": "path-construction", "path": path}
            )
            raise ForbiddenPID2Path(
                "Forbidden synthetic PID 2 path construction: " + path
            )
        raise AssertionError("Unexpected PID token use: " + prefix)


class SyntheticProc:
    """Exact fake APIs used by consumers(); unknown paths never delegate to OS IO."""

    def __init__(self, pids, opaque=None, visible=None):
        self.pids = pids
        self.opaque = opaque
        self.visible = visible
        self.operations = []

    def path(self, operation, value):
        path = builtins.str(value)
        self.operations.append({"operation": operation, "path": path})
        if path == "/proc/2" or path.startswith("/proc/2/"):
            raise ForbiddenPID2Path(
                "Forbidden synthetic PID 2 " + operation + ": " + path
            )
        if path != "/proc" and not path.startswith(("/proc/20/", "/proc/31/")):
            raise AssertionError("Unexpected fake path; no real IO: " + path)
        return path

    def stringify(self, value, *args, **kwargs):
        if type(value) is int and value == 2:
            return PIDText(self)
        return builtins.str(value, *args, **kwargs)

    def deny(self, path, surface):
        if self.opaque == surface and path.startswith("/proc/31/"):
            raise PermissionError("Synthetic opaque " + surface)

    def open(self, path, mode="r", *args, **kwargs):
        path = self.path("open", path)
        surface = path.rsplit("/", 1)[-1]
        self.deny(path, surface)
        if surface == "cmdline":
            command = (
                "/approved-generated/output worker"
                if self.visible == "path"
                else "worker --read-only"
            )
            data = command.encode() + b"\0"
        elif surface == "comm":
            # A cloud-agent name never exempts a PID other than the explicit PID 2.
            data = b"cloud-agent-des\n" if path.startswith("/proc/31/") else b"worker\n"
        elif surface == "maps":
            data = (
                b"00400000-00401000 r--p 00000000 08:01 1234 /other-file\n"
                if self.visible == "mmap"
                else b""
            )
        else:
            raise AssertionError("Unexpected fake open: " + path)
        return io.BytesIO(data) if "b" in mode else io.StringIO(data.decode())

    def listdir(self, path):
        path = self.path("listdir", path)
        if path == "/proc":
            return [builtins.str(pid) for pid in self.pids]
        self.deny(path, "fd")
        if path.endswith("/fd"):
            return ["3"] if self.visible == "fd" else []
        raise AssertionError("Unexpected fake listdir: " + path)

    def readlink(self, path):
        path = self.path("readlink", path)
        surface = path.rsplit("/", 1)[-1]
        self.deny(path, surface)
        if surface in ("cwd", "exe"):
            return "/ordinary-worker"
        if path.endswith("/fd/3"):
            return "/other-file"
        raise AssertionError("Unexpected fake readlink: " + path)

    def stat(self, path):
        path = self.path("stat", path)
        if not path.endswith("/fd/3"):
            raise AssertionError("Unexpected fake stat: " + path)
        return SimpleNamespace(st_dev=2049, st_ino=1234)

    def fake_os(self):
        return SimpleNamespace(
            listdir=self.listdir,
            readlink=self.readlink,
            stat=self.stat,
            getpid=lambda: 901,
            makedev=lambda major, minor: (major << 8) | minor,
        )


def load_function(source, filesystem):
    """Compile the unmodified function body without importing the operator module."""
    tree = ast.parse(source)
    function = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "consumers"
    )
    if any(isinstance(node, (ast.Import, ast.ImportFrom)) for node in ast.walk(function)):
        raise AssertionError("consumers() must not import a real process API")

    safe_builtins = dict(vars(builtins))
    safe_builtins.update(open=filesystem.open, str=filesystem.stringify)
    safe_builtins.pop("__import__", None)

    def require(condition, message):
        if not condition:
            raise RuntimeError(message)

    namespace = {
        "__builtins__": safe_builtins,
        "os": filesystem.fake_os(),
        "open": filesystem.open,
        "str": filesystem.stringify,
        "utc": lambda: "SYNTHETIC_TIME",
        "require": require,
        "json": json,
    }
    code = compile(
        ast.Module(body=[function], type_ignores=[]),
        "<exact consumers source>",
        "exec",
    )
    exec(code, namespace)
    return namespace["consumers"]


DATA = {
    "groups": ["/approved-generated/output"],
    "items": [["unused-output", 0, "unused-hash", {"dev": "2049", "inode": "1234"}, 0]],
}


class ConsumersContract(unittest.TestCase):
    source = ""
    traces = []

    def invoke(self, filesystem, accepted):
        try:
            return load_function(self.source, filesystem)(DATA, accepted)
        finally:
            self.traces.append(
                {
                    "test": self.id(),
                    "syntheticPids": filesystem.pids,
                    "opaqueSurface": filesystem.opaque,
                    "visibleMatch": filesystem.visible,
                    "acceptPID2": accepted,
                    "operations": filesystem.operations,
                    "realProcAccess": False,
                }
            )

    def assert_pid2_untouched(self, filesystem):
        self.assertFalse(
            [
                operation
                for operation in filesystem.operations
                if operation["path"] == "/proc/2"
                or operation["path"].startswith("/proc/2/")
            ]
        )

    def test_known_pid2_is_exempt_before_path_construction(self):
        filesystem = SyntheticProc([2])
        result = self.invoke(filesystem, True)
        self.assert_pid2_untouched(filesystem)
        self.assertFalse(result["globalIdleClaim"])
        self.assertEqual(result["matches"], [])
        self.assertEqual(len(result["opaque"]), 1)
        entry = result["opaque"][0]
        self.assertEqual(entry["pid"], 2)
        self.assertIs(entry["inspectionSkipped"], True)
        self.assertIs(entry["acceptedKnownControlServiceLimit"], True)
        self.assertTrue(entry["reason"])

    def test_unaccepted_pid2_is_not_inspected_but_still_blocks(self):
        filesystem = SyntheticProc([2])
        with self.assertRaisesRegex(RuntimeError, "unexpected opaque process"):
            self.invoke(filesystem, False)
        self.assert_pid2_untouched(filesystem)

    def test_every_other_opaque_surface_blocks_despite_acceptance(self):
        for surface in ("cmdline", "comm", "cwd", "exe", "fd", "maps"):
            with self.subTest(surface=surface):
                filesystem = SyntheticProc([31], opaque=surface)
                with self.assertRaisesRegex(RuntimeError, "unexpected opaque process") as error:
                    self.invoke(filesystem, True)
                result = json.loads(str(error.exception).split(": ", 1)[1])
                self.assertFalse(result["globalIdleClaim"])
                self.assertEqual(result["opaque"][0]["pid"], 31)
                self.assertIs(result["opaque"][0]["acceptedKnownControlServiceLimit"], False)

    def test_visible_non_pid2_path_fd_and_mmap_consumers_still_block(self):
        for kind in ("path", "fd", "mmap"):
            with self.subTest(kind=kind):
                filesystem = SyntheticProc([20], visible=kind)
                with self.assertRaisesRegex(RuntimeError, "active generated-group consumer") as error:
                    self.invoke(filesystem, True)
                result = json.loads(str(error.exception).split(": ", 1)[1])
                self.assertFalse(result["globalIdleClaim"])
                self.assertTrue(result["matches"])
                self.assertTrue(all(match["pid"] == 20 for match in result["matches"]))

    def test_clear_other_process_is_inspected_without_global_idle_claim(self):
        filesystem = SyntheticProc([2, 20, 901])
        result = self.invoke(filesystem, True)
        self.assert_pid2_untouched(filesystem)
        self.assertFalse(result["globalIdleClaim"])
        self.assertEqual(result["selfExcluded"], 901)
        self.assertEqual(result["matches"], [])
        paths = {operation["path"] for operation in filesystem.operations}
        expected = {
            "/proc/20/cmdline",
            "/proc/20/comm",
            "/proc/20/cwd",
            "/proc/20/exe",
            "/proc/20/fd",
            "/proc/20/maps",
        }
        self.assertTrue(expected.issubset(paths))
        self.assertFalse(any(path.startswith("/proc/901") for path in paths))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--operator", required=True)
    parser.add_argument("--proof", required=True)
    args = parser.parse_args()
    path = Path(args.operator).absolute()
    if str(path).startswith("/proc/"):
        raise AssertionError("The operator source must be an ordinary local file")
    ConsumersContract.source = path.read_text()
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(ConsumersContract)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    proof = {
        "operator": str(path),
        "operatorSHA256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "testSHA256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "testsRun": result.testsRun,
        "errors": len(result.errors),
        "failures": len(result.failures),
        "successful": result.wasSuccessful(),
        "realProcAccess": False,
        "operatorModesExecuted": [],
        "traces": ConsumersContract.traces,
    }
    Path(args.proof).write_text(json.dumps(proof, indent=2) + "\n")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
