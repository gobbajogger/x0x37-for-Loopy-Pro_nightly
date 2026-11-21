#!/usr/bin/env python3
"""Exact Remote generated-copy recovery. Preparation is not execution authority.

prepare: read/hash all planned files; create a fsynced journal OUTSIDE all sites.
unlink: require the externally retained preflight hash; repeat the ENTIRE preflight
        before first unlink; recheck original identities before each literal unlink.
restore: stream exact keepers to exclusive sibling temps; link only absent targets.

No recursion for removal, no directory removal, no workload admission. All directory
enumeration is bounded to the 29 exact generated groups, solely to protect neighbors.
PID 2 opacity must be acknowledged explicitly; every other opaque process blocks.
Unix lacks compare-inode-and-unlink: anchored dirfds + immediate rechecks detect
observed races but require root's exclusive-writer/quiescence arrangement. They do
not defend against a hostile same-UID actor racing after the final name check.
"""
import argparse
import base64
import datetime
import fcntl
import gzip
import hashlib
import io
import json
import os
import socket
import stat
import sys
import time
import uuid

INPUT_SHA = "dbde029be1e00807bd644088cefcddc3172294ab3aa4560bcd377e8341efe773"
INPUT_JSON_BYTES = 3427925
PLAN_SHA = "69b9549766ffa65b4302ab0226d2a87ae90fa7f167eb639e3ab4289034505844"
LEDGER_SHA = "47106e47ca56a4f1c0477839b5a64334c790adb96d709b886fefa8fdb85f5f80"
ROOT = "/tmp/dnbox-classic-remote-7dfde7909d3b"
HOST = "ab35235f2a25"
CHUNK = 1024 * 1024
DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
READ_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | getattr(os, "O_NOATIME", 0)


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def path_parts(path):
    require(isinstance(path, str) and path.startswith("/") and "\x00" not in path,
            "absolute literal path required")
    parts = path.split("/")[1:]
    require(all(p and p not in (".", "..") for p in parts), "noncanonical path")
    return parts


def beneath(path, parent):
    return path == parent or path.startswith(parent + "/")


def parent_fd(path):
    """Open EVERY ancestor from / with O_DIRECTORY|O_NOFOLLOW, never realpath."""
    parts = path_parts(path)
    fd = os.open("/", DIR_FLAGS)
    try:
        for part in parts[:-1]:
            newfd = os.open(part, DIR_FLAGS, dir_fd=fd)
            os.close(fd)
            fd = newfd
        return fd, parts[-1]
    except BaseException:
        os.close(fd)
        raise


def directory_fd(path, no_atime=False):
    parent, name = parent_fd(path)
    try:
        return os.open(name, DIR_FLAGS | (os.O_NOATIME if no_atime else 0), dir_fd=parent)
    finally:
        os.close(parent)


def identity(s):
    return {"dev": str(s.st_dev), "inode": str(s.st_ino), "mode": s.st_mode,
            "nlink": s.st_nlink, "size": s.st_size,
            "mtime_ns": str(s.st_mtime_ns), "ctime_ns": str(s.st_ctime_ns),
            "allocated_bytes": s.st_blocks * 512}


def same(s, expected, path):
    require(identity(s) == expected, "identity mismatch: " + path)


def xattrs(fd):
    return {k: base64.b64encode(os.getxattr(fd, k)).decode()
            for k in sorted(os.listxattr(fd))}


def metadata(fd):
    s = os.fstat(fd)
    return {"identity": identity(s), "uid": s.st_uid, "gid": s.st_gid,
            "atimeNs": str(s.st_atime_ns), "xattrs": xattrs(fd)}


def checked_file(path, expected):
    parent, name = parent_fd(path)
    try:
        fd = os.open(name, READ_FLAGS, dir_fd=parent)
        try:
            s = os.fstat(fd)
            require(stat.S_ISREG(s.st_mode), "not regular: " + path)
            same(s, expected, path)
            same(os.stat(name, dir_fd=parent, follow_symlinks=False), expected, path)
            require(s.st_uid == 1000 and s.st_gid == 1000, "owner mismatch: " + path)
            return fd
        except BaseException:
            os.close(fd)
            raise
    finally:
        os.close(parent)


def hash_file(path, expected, wanted_hash):
    fd = checked_file(path, expected)
    try:
        before = metadata(fd)
        require(before["xattrs"] == {}, "unexpected xattrs: " + path)
        h = hashlib.sha256()
        count = 0
        while True:
            chunk = os.read(fd, CHUNK)
            if not chunk:
                break
            h.update(chunk)
            count += len(chunk)
        same(os.fstat(fd), expected, path)
        require(metadata(fd) == before, "metadata changed during O_NOATIME hash: " + path)
        p, n = parent_fd(path)
        try:
            same(os.stat(n, dir_fd=p, follow_symlinks=False), expected, path)
        finally:
            os.close(p)
        require(count == expected["size"] and h.hexdigest() == wanted_hash,
                "content mismatch: " + path)
        return before
    finally:
        os.close(fd)


def load_input(path):
    p, n = parent_fd(path)
    try:
        fd = os.open(n, READ_FLAGS, dir_fd=p)
        try:
            require(0 < os.fstat(fd).st_size <= INPUT_JSON_BYTES, "input size outside bound")
            pieces, size = [], 0
            while True:
                piece = os.read(fd, CHUNK)
                if not piece:
                    break
                pieces.append(piece)
                size += len(piece)
                require(size <= INPUT_JSON_BYTES, "input grew beyond bound")
            raw = b"".join(pieces)
        finally:
            os.close(fd)
    finally:
        os.close(p)
    if raw.startswith(b"\x1f\x8b"):
        with gzip.GzipFile(fileobj=io.BytesIO(raw)) as stream:
            raw = stream.read(INPUT_JSON_BYTES + 1)
    require(len(raw) == INPUT_JSON_BYTES and digest(raw) == INPUT_SHA,
            "plain/decompressed input JSON SHA or size mismatch")
    d = json.loads(raw)
    require(d["schema"] == 1 and d["root"] == ROOT and d["host"] == HOST,
            "input scope mismatch")
    require(d["planSha256"] == PLAN_SHA and d["ledgerSha256"] == LEDGER_SHA,
            "plan/ledger hash mismatch")
    require(len(d["items"]) == 6167 and len(d["keepers"]) == 3794
            and len(d["groups"]) == 29 and len(d["observedProtected"]) == 318,
            "input counts mismatch")
    outputs = set()
    keeper_paths = set()
    output_inodes = set()
    keeper_inodes = set()
    for path, sha, expected in d["keepers"]:
        path_parts(path)
        require(beneath(path, ROOT) and path not in keeper_paths, "keeper scope/duplicate")
        require(not any(beneath(path, g) for g in d["groups"]), "keeper inside generated groups")
        keeper_paths.add(path)
        keeper_inodes.add((expected["dev"], expected["inode"]))
        require(len(sha) == 64 and stat.S_ISREG(expected["mode"]), "keeper schema")
    for path, ki, sha, expected, gi in d["items"]:
        path_parts(path)
        group = d["groups"][gi]
        require(beneath(group, ROOT) and "/.output/" in group, "group scope")
        require(beneath(path, group) and path != group and path not in outputs,
                "output scope/duplicate")
        require(not any(x in path_parts(path)[len(path_parts(group)):] for x in
                        (".git", "node_modules", "test-results")), "protected namespace")
        require(expected["dev"] == "51" and expected["nlink"] == 1
                and expected["mode"] == stat.S_IFREG | 0o600, "output type/link/device")
        require(sha == d["keepers"][ki][1] and expected["size"] ==
                d["keepers"][ki][2]["size"], "restore mapping mismatch")
        outputs.add(path)
        output_inodes.add((expected["dev"], expected["inode"]))
    require(len(output_inodes) == 6167 and len(keeper_inodes) == 3794,
            "unique inode count mismatch")
    require(not outputs.intersection(keeper_paths) and not output_inodes.intersection(keeper_inodes),
            "output/keeper overlap")
    require(sum(i[3]["allocated_bytes"] for i in d["items"]) == 811089920,
            "allocated byte mismatch")
    protected = {p for p, _ in d["observedProtected"]}
    require(not protected.intersection(outputs), "protected output overlap")
    return d


def resources():
    memory = {}
    with open("/proc/meminfo") as f:
        for line in f:
            k, value = line.split(":", 1)
            if k in ("MemFree", "MemAvailable", "SwapFree", "Shmem"):
                memory[k] = int(value.split()[0]) * 1024
    filesystems = {}
    for path in (ROOT, "/home/agent/.cache/dnbox-gate/tmp"):
        s = os.statvfs(path)
        filesystems[path] = {"availableBytes": s.f_bavail * s.f_frsize,
                             "freeBytes": s.f_bfree * s.f_frsize,
                             "totalBytes": s.f_blocks * s.f_frsize}
    return {"utc": utc(), "memory": memory, "filesystems": filesystems,
            "noAdmissionClaim": True, "noGuaranteedRAMRelease": True}


def consumers(d, accept_pid2):
    """Check visible consumers; never construct or inspect a PID 2 proc path."""
    groups = d["groups"]
    wanted = {(int(i[3]["dev"]), int(i[3]["inode"])) for i in d["items"]}
    matches, opaque, vanished = [], [], []
    seen = 0
    for pid in sorted(int(x) for x in os.listdir("/proc") if x.isdigit()):
        if pid == 2:
            opaque.append({"pid": 2, "inspectionSkipped": True,
                           "reason": "Known opaque cloud control service; deliberately uninspected",
                           "acceptedKnownControlServiceLimit": bool(accept_pid2)})
            continue
        if pid == os.getpid():
            continue
        seen += 1
        proc = "/proc/" + str(pid)
        errors = []
        texts = []
        for name in ("cmdline", "comm"):
            try:
                with open(proc + "/" + name, "rb") as f:
                    texts.append((name, f.read(1048576).replace(b"\x00", b" ").decode(errors="replace")))
            except FileNotFoundError:
                vanished.append(pid)
            except PermissionError as e:
                errors.append((name, str(e)))
        for name in ("cwd", "exe"):
            try:
                texts.append((name, os.readlink(proc + "/" + name)))
            except FileNotFoundError:
                pass
            except PermissionError as e:
                errors.append((name, str(e)))
        try:
            for name in os.listdir(proc + "/fd"):
                fp = proc + "/fd/" + name
                try:
                    target = os.readlink(fp)
                    s = os.stat(fp)
                    if (s.st_dev, s.st_ino) in wanted:
                        matches.append({"pid": pid, "kind": "fd-inode", "fd": name,
                                        "dev": s.st_dev, "inode": s.st_ino})
                    texts.append(("fd:" + name, target))
                except FileNotFoundError:
                    pass
                except PermissionError as e:
                    errors.append(("fd:" + name, str(e)))
        except FileNotFoundError:
            pass
        except PermissionError as e:
            errors.append(("fdlist", str(e)))
        try:
            with open(proc + "/maps") as f:
                for line in f:
                    fields = line.split(None, 5)
                    major, minor = (int(x, 16) for x in fields[3].split(":"))
                    ino = int(fields[4])
                    if (os.makedev(major, minor), ino) in wanted:
                        matches.append({"pid": pid, "kind": "mmap-inode",
                                        "dev": os.makedev(major, minor), "inode": ino})
                    if len(fields) > 5:
                        texts.append(("maps", fields[5].strip()))
        except FileNotFoundError:
            pass
        except PermissionError as e:
            errors.append(("maps", str(e)))
        for kind, value in texts:
            for group in groups:
                if group in value:
                    matches.append({"pid": pid, "kind": kind, "matchedGroup": group})
        if errors:
            comm = next((v.strip() for k, v in texts if k == "comm"), "")
            opaque.append({"pid": pid, "comm": comm, "errors": errors,
                           "acceptedKnownControlServiceLimit": False})
    result = {"utc": utc(), "examined": seen, "selfExcluded": os.getpid(),
              "matches": matches, "opaque": opaque, "vanishedDuringRead": sorted(set(vanished)),
              "globalIdleClaim": False}
    require(not matches, "active generated-group consumer: " + json.dumps(result))
    require(all(p["acceptedKnownControlServiceLimit"] for p in opaque),
            "unexpected opaque process: " + json.dumps(result))
    return result


def neighbors(d):
    """Read metadata only under exact groups; no symlink traversal or content opens."""
    allowed = {i[0] for i in d["items"]}
    result = {}

    def visit(fd, path):
        s = os.fstat(fd)
        # Child unlinks legitimately change directory mtime/ctime/link counts.
        result[path] = {"kind": "directory", "dev": str(s.st_dev), "inode": str(s.st_ino),
                        "mode": s.st_mode, "uid": s.st_uid, "gid": s.st_gid,
                        "atimeNs": str(s.st_atime_ns), "xattrs": xattrs(fd)}
        for name in sorted(os.listdir(fd)):
            require(name not in (".", "..") and "/" not in name, "directory entry")
            child = path + "/" + name
            s = os.stat(name, dir_fd=fd, follow_symlinks=False)
            if child in allowed:
                require(stat.S_ISREG(s.st_mode), "planned output changed type")
                continue
            if stat.S_ISDIR(s.st_mode):
                sub = os.open(name, DIR_FLAGS | os.O_NOATIME, dir_fd=fd)
                try:
                    require(identity(os.fstat(sub)) == identity(s), "neighbor directory race")
                    visit(sub, child)
                finally:
                    os.close(sub)
            else:
                row = {"kind": "unlisted", "identity": identity(s),
                       "uid": s.st_uid, "gid": s.st_gid, "atimeNs": str(s.st_atime_ns)}
                if stat.S_ISLNK(s.st_mode):
                    row["symlinkNotTraversedOrRead"] = True
                elif stat.S_ISREG(s.st_mode):
                    neighbor_fd = os.open(name, READ_FLAGS, dir_fd=fd)
                    try:
                        same(os.fstat(neighbor_fd), identity(s), child)
                        row["xattrs"] = xattrs(neighbor_fd)
                    finally:
                        os.close(neighbor_fd)
                result[child] = row
    for group in d["groups"]:
        fd = directory_fd(group, no_atime=True)
        try:
            visit(fd, group)
        finally:
            os.close(fd)
    for path, expected in d["observedProtected"]:
        require(path in result and result[path]["identity"] == expected,
                "observed protected neighbor changed: " + path)
    return result


def full_preflight(d, accept_pid2, progress):
    first_consumers = consumers(d, accept_pid2)
    outputs, keepers = [], []
    for n, (path, sha, expected) in enumerate(d["keepers"]):
        keepers.append(hash_file(path, expected, sha))
        if n % 500 == 0:
            progress("keeper-rehash", n, len(d["keepers"]))
    for n, (path, ki, sha, expected, gi) in enumerate(d["items"]):
        outputs.append(hash_file(path, expected, sha))
        if n % 500 == 0:
            progress("output-rehash", n, len(d["items"]))
    protected = neighbors(d)
    final_consumers = consumers(d, accept_pid2)
    return {"utc": utc(), "inputSha256": INPUT_SHA, "planSha256": PLAN_SHA,
            "ledgerSha256": LEDGER_SHA, "outputMetadata": outputs,
            "keeperMetadata": keepers, "protectedNeighbors": protected,
            "consumerBefore": first_consumers, "consumerAfter": final_consumers,
            "resources": resources(), "hashReadsUseO_NOATIME": True,
            "streamChunkBytes": CHUNK, "allBeforeAnyUnlink": True}


class Journal:
    def __init__(self, path, create):
        require(beneath(path, ROOT) and path != ROOT, "journal must be under Remote root")
        require(path.rsplit("/", 1)[0] == ROOT, "journal must be a direct child of Remote root")
        require(path.rsplit("/", 1)[1].startswith("remote-output-recovery-journal-"),
                "dedicated journal name required")
        p, n = parent_fd(path)
        try:
            if create:
                os.mkdir(n, 0o700, dir_fd=p)
                os.fsync(p)
            self.fd = os.open(n, DIR_FLAGS, dir_fd=p)
        finally:
            os.close(p)
        self.path = path
        flags = os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC
        self.lock = os.open("operator.lock", flags, 0o600, dir_fd=self.fd)
        fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # A global lock prevents two independently named Remote operator journals.
        rootfd = directory_fd(ROOT)
        try:
            self.global_lock = os.open("remote-output-recovery.lock", flags, 0o600, dir_fd=rootfd)
        finally:
            os.close(rootfd)
        fcntl.flock(self.global_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        self.eventfd = os.open("events.jsonl", os.O_WRONLY | os.O_APPEND | os.O_CREAT |
                               os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=self.fd)
        os.fsync(self.fd)

    def emit(self, kind, **values):
        data = encoded({"utc": utc(), "kind": kind, **values}) + b"\n"
        view = memoryview(data)
        while view:
            count = os.write(self.eventfd, view)
            require(count > 0, "journal short write")
            view = view[count:]
        os.fsync(self.eventfd)

    def save(self, name, value):
        data = encoded(value) + b"\n"
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW |
                     os.O_CLOEXEC, 0o600, dir_fd=self.fd)
        try:
            view = memoryview(data)
            while view:
                count = os.write(fd, view)
                require(count > 0, "journal snapshot short write")
                view = view[count:]
            os.fsync(fd)
        finally:
            os.close(fd)
        os.fsync(self.fd)
        return digest(data)

    def read(self, name):
        fd = os.open(name, READ_FLAGS, dir_fd=self.fd)
        try:
            chunks = []
            while True:
                b = os.read(fd, CHUNK)
                if not b:
                    break
                chunks.append(b)
            return b"".join(chunks)
        finally:
            os.close(fd)

    def events(self):
        raw = self.read("events.jsonl")
        require(not raw or raw.endswith(b"\n"), "truncated journal; root must audit before recovery")
        return [json.loads(line) for line in raw.splitlines()]

    def close(self):
        for fd in (self.eventfd, self.global_lock, self.lock, self.fd):
            os.close(fd)


def progress(kind, done, total):
    print(json.dumps({"utc": utc(), "stage": kind, "done": done, "total": total}), flush=True)


def require_prepared(journal, expected_sha):
    raw = journal.read("preflight.json")
    require(digest(raw) == expected_sha, "externally retained preflight SHA mismatch")
    p = json.loads(raw)
    require(p["inputSha256"] == INPUT_SHA and p["planSha256"] == PLAN_SHA
            and p["ledgerSha256"] == LEDGER_SHA, "journal binding mismatch")
    return p


def exact_unlink(d, p, index, journal):
    path, ki, sha, expected, gi = d["items"][index]
    keeper, keeper_sha, keeper_expected = d["keepers"][ki]
    ofd = checked_file(path, expected)
    kfd = checked_file(keeper, keeper_expected)
    parent, name = parent_fd(path)
    try:
        require(metadata(ofd) == p["outputMetadata"][index], "output metadata race")
        require(metadata(kfd) == p["keeperMetadata"][ki], "keeper metadata race")
        journal.emit("unlink-intent", index=index, path=path, keeper=keeper,
                     outputIdentity=expected, keeperIdentity=keeper_expected, sha256=sha)
        # Reopen the current literal parent path and match the anchored parent inode.
        current_parent, current_name = parent_fd(path)
        try:
            a, b = os.fstat(parent), os.fstat(current_parent)
            require((a.st_dev, a.st_ino) == (b.st_dev, b.st_ino), "parent path race")
        finally:
            os.close(current_parent)
        # LAST checks after durable intent, immediately before anchored literal unlink.
        require(metadata(ofd) == p["outputMetadata"][index], "late output race")
        require(metadata(kfd) == p["keeperMetadata"][ki], "late keeper race")
        kp, kn = parent_fd(keeper)
        try:
            same(os.stat(kn, dir_fd=kp, follow_symlinks=False), keeper_expected, keeper)
        finally:
            os.close(kp)
        same(os.stat(name, dir_fd=parent, follow_symlinks=False), expected, path)
        os.unlink(name, dir_fd=parent)
        try:
            os.stat(name, dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise RuntimeError("removed path unexpectedly exists: " + path)
        os.fsync(parent)
        journal.emit("unlink-completed", index=index, path=path)
    finally:
        os.close(parent)
        os.close(ofd)
        os.close(kfd)


def status_paths(d):
    rows = []
    for index, (path, ki, sha, expected, gi) in enumerate(d["items"]):
        p, n = parent_fd(path)
        try:
            try:
                s = os.stat(n, dir_fd=p, follow_symlinks=False)
                state = "original-present" if identity(s) == expected else "unexpected-present"
                rows.append({"index": index, "path": path, "state": state,
                             "identity": identity(s)})
            except FileNotFoundError:
                rows.append({"index": index, "path": path, "state": "missing"})
        finally:
            os.close(p)
    return rows


def verify_protected(d, p):
    for ki, (path, sha, expected) in enumerate(d["keepers"]):
        require(hash_file(path, expected, sha) == p["keeperMetadata"][ki],
                "protected keeper metadata changed: " + path)
    actual = neighbors(d)
    require(actual == p["protectedNeighbors"], "unlisted neighbor/directory changed")
    return {"keeperFilesRehashed": len(d["keepers"]),
            "protectedNeighborEntries": len(actual),
            "protectedNeighborMetadataSha256": digest(encoded(actual))}


def restore_equivalent(actual, original, expected):
    return (actual["uid"] == original["uid"] and actual["gid"] == original["gid"]
            and actual["xattrs"] == original["xattrs"]
            and actual["atimeNs"] == original["atimeNs"]
            and actual["identity"]["mode"] == expected["mode"]
            and actual["identity"]["mtime_ns"] == expected["mtime_ns"]
            and actual["identity"]["nlink"] == 1)


def restore_target_preflight(d, p, targets):
    """Check ALL destination states before creating even one restore temporary."""
    target_set = set(targets)
    states = []
    for index, (path, ki, sha, expected, gi) in enumerate(d["items"]):
        parent, name = parent_fd(path)
        try:
            try:
                actual_id = identity(os.stat(name, dir_fd=parent, follow_symlinks=False))
            except FileNotFoundError:
                require(index in target_set, "unattempted output unexpectedly missing: " + path)
                states.append({"index": index, "state": "missing-restore-target"})
                continue
        finally:
            os.close(parent)
        actual = hash_file(path, actual_id, sha)
        if index not in target_set:
            require(actual == p["outputMetadata"][index], "unattempted output changed: " + path)
        else:
            require(restore_equivalent(actual, p["outputMetadata"][index], expected),
                    "existing restore target not equivalent: " + path)
        states.append({"index": index, "state": "verified-present-never-overwrite",
                       "identity": actual_id})
    return states


def restore_one(d, p, index, journal):
    path, ki, sha, expected, gi = d["items"][index]
    keeper, keeper_sha, keeper_expected = d["keepers"][ki]
    original = p["outputMetadata"][index]
    parent, name = parent_fd(path)
    try:
        try:
            present = os.stat(name, dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError:
            present = None
        if present is not None:
            require(stat.S_ISREG(present.st_mode), "unexpected existing target: " + path)
            actual = hash_file(path, identity(present), sha)
            # Never overwrite. Accept original or exact restore-equivalent bytes/attrs.
            require(restore_equivalent(actual, original, expected),
                    "existing target not restore-equivalent: " + path)
            journal.emit("restore-existing-equivalent-not-overwritten", index=index, path=path,
                         identity=actual["identity"])
            return
        kfd = checked_file(keeper, keeper_expected)
        temp = ".remote-restore-" + uuid.uuid4().hex
        tfd = None
        try:
            require(metadata(kfd) == p["keeperMetadata"][ki], "restore keeper race")
            tfd = os.open(temp, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW |
                          os.O_CLOEXEC | os.O_NOATIME, 0o600, dir_fd=parent)
            journal.emit("restore-temp-created", index=index, path=path,
                         tempPath=path.rsplit("/", 1)[0] + "/" + temp,
                         inode=identity(os.fstat(tfd)))
            h = hashlib.sha256()
            count = 0
            while True:
                chunk = os.read(kfd, CHUNK)
                if not chunk:
                    break
                h.update(chunk)
                count += len(chunk)
                view = memoryview(chunk)
                while view:
                    written = os.write(tfd, view)
                    require(written > 0, "restore short write")
                    view = view[written:]
            require(count == expected["size"] and h.hexdigest() == sha, "restore copy hash mismatch")
            same(os.fstat(kfd), keeper_expected, keeper)
            require(metadata(kfd) == p["keeperMetadata"][ki], "restore source changed")
            require(os.fstat(tfd).st_uid == original["uid"] and os.fstat(tfd).st_gid == original["gid"],
                    "restore temporary owner mismatch")
            os.fchmod(tfd, stat.S_IMODE(expected["mode"]))
            require(xattrs(tfd) == original["xattrs"], "restore temporary xattrs mismatch")
            os.lseek(tfd, 0, os.SEEK_SET)
            check = hashlib.sha256()
            while True:
                chunk = os.read(tfd, CHUNK)
                if not chunk:
                    break
                check.update(chunk)
            require(check.hexdigest() == sha, "restored destination readback mismatch")
            os.utime(tfd, ns=(int(original["atimeNs"]), int(expected["mtime_ns"])))
            os.fsync(tfd)
            temporary_identity = identity(os.fstat(tfd))
            same(os.stat(temp, dir_fd=parent, follow_symlinks=False), temporary_identity, temp)
            journal.emit("restore-install-intent", index=index, path=path, sha256=sha,
                         tempPath=path.rsplit("/", 1)[0] + "/" + temp,
                         newIdentity=temporary_identity)
            same(os.fstat(kfd), keeper_expected, keeper)
            kp, kn = parent_fd(keeper)
            try:
                same(os.stat(kn, dir_fd=kp, follow_symlinks=False), keeper_expected, keeper)
            finally:
                os.close(kp)
            cp, cn = parent_fd(path)
            try:
                require((os.fstat(cp).st_dev, os.fstat(cp).st_ino) ==
                        (os.fstat(parent).st_dev, os.fstat(parent).st_ino), "restore parent race")
            finally:
                os.close(cp)
            # link() is atomic and fails EEXIST: it NEVER replaces a destination.
            os.link(temp, name, src_dir_fd=parent, dst_dir_fd=parent, follow_symlinks=False)
            require((os.stat(name, dir_fd=parent, follow_symlinks=False).st_dev,
                     os.stat(name, dir_fd=parent, follow_symlinks=False).st_ino) ==
                    (os.fstat(tfd).st_dev, os.fstat(tfd).st_ino), "restore installation race")
            current = os.stat(temp, dir_fd=parent, follow_symlinks=False)
            require((current.st_dev, current.st_ino) == (os.fstat(tfd).st_dev, os.fstat(tfd).st_ino),
                    "restore temp path race")
            os.unlink(temp, dir_fd=parent)  # ONLY the exact newly created temporary.
            os.fsync(parent)
            journal.emit("restore-completed", index=index, path=path, sha256=sha,
                         newIdentity=identity(os.fstat(tfd)))
        finally:
            if tfd is not None:
                os.close(tfd)
            os.close(kfd)
        # On failure the temp is deliberately retained and journaled for root audit.
    finally:
        os.close(parent)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("mode", choices=("prepare", "unlink", "restore"))
    ap.add_argument("--input", required=True)
    ap.add_argument("--journal", required=True)
    ap.add_argument("--accept-opaque-pid2", action="store_true")
    ap.add_argument("--retained-preflight-sha256")
    ap.add_argument("--execute-reviewed-unlink", action="store_true")
    ap.add_argument("--execute-reviewed-restore", action="store_true")
    args = ap.parse_args()
    require(socket.gethostname() == HOST and os.geteuid() == 1000, "wrong host or UID")
    require(hasattr(os, "O_NOATIME"), "O_NOATIME required; no atime-changing fallback")
    require(args.accept_opaque_pid2, "root's explicit PID 2 visibility acknowledgment required")
    d = load_input(args.input)
    require(not any(beneath(args.journal, g) or beneath(g, args.journal) for g in d["groups"]),
            "journal overlaps generated groups")
    if args.mode != "prepare":
        require(args.retained_preflight_sha256 and len(args.retained_preflight_sha256) == 64,
                "prepare journal must be externally retained first")
    if args.mode == "unlink":
        require(args.execute_reviewed_unlink, "explicit root unlink execution flag required")
    if args.mode == "restore":
        require(args.execute_reviewed_restore, "explicit root restore execution flag required")
    journal = Journal(args.journal, args.mode == "prepare")
    started = time.monotonic()
    try:
        if args.mode == "prepare":
            p = full_preflight(d, args.accept_opaque_pid2, progress)
            sha = journal.save("preflight.json", p)
            journal.emit("prepared-no-unlinks", preflightSha256=sha, outputCount=6167,
                         keeperCount=3794)
            print(json.dumps({"mode": "prepare", "preflightSha256": sha,
                              "journal": args.journal, "bytesReleased": 0,
                              "next": "Retain preflight.json and its hash off this host before unlink."}), flush=True)
        elif args.mode == "unlink":
            p = require_prepared(journal, args.retained_preflight_sha256)
            require(not any(e["kind"] == "unlink-intent" for e in journal.events()),
                    "one-shot unlink already attempted; audit/restore, never blindly resume")
            fresh = full_preflight(d, args.accept_opaque_pid2, progress)
            for key in ("outputMetadata", "keeperMetadata", "protectedNeighbors"):
                require(fresh[key] == p[key], "prepared snapshot drift: " + key)
            journal.save("execution-preflight.json", fresh)
            journal.emit("all-preflight-passed-before-first-unlink", outputCount=6167,
                         keeperCount=3794, inputSha256=INPUT_SHA)
            for index in range(len(d["items"])):
                # Frequent checks are lightweight and include all group paths/inodes.
                if index % 128 == 0:
                    journal.emit("consumer-check", evidence=consumers(d, args.accept_opaque_pid2))
                exact_unlink(d, p, index, journal)
            protected = verify_protected(d, p)
            rows = status_paths(d)
            require(all(r["state"] == "missing" for r in rows), "not all planned outputs absent")
            events = journal.events()
            completed = [e["index"] for e in events if e["kind"] == "unlink-completed"]
            require(completed == list(range(6167)), "completion sequence mismatch")
            report = {"mode": "unlink", "utc": utc(), "completedCount": len(completed),
                      "missingCount": sum(r["state"] == "missing" for r in rows),
                      "perPath": rows, "protected": protected,
                      "consumers": consumers(d, args.accept_opaque_pid2),
                      "beforeResources": fresh["resources"], "afterResources": resources(),
                      "allocatedBytesOfUnlinkedIndependentInodes": 811089920,
                      "allocatedBytesAreNotGuaranteedRAMRelease": True,
                      "elapsedSeconds": time.monotonic() - started, "noAdmissionClaim": True}
            result_sha = journal.save("unlink-result.json", report)
            journal.emit("unlink-finished", resultSha256=result_sha, completedCount=6167)
            print(json.dumps({k: v for k, v in report.items() if k != "perPath"}), flush=True)
        else:
            p = require_prepared(journal, args.retained_preflight_sha256)
            events = journal.events()
            targets = sorted({e["index"] for e in events if e["kind"] == "unlink-intent"})
            require(targets and all(0 <= i < 6167 for i in targets), "no valid unlink intents")
            require(all(e["path"] == d["items"][e["index"]][0]
                        for e in events if e["kind"] == "unlink-intent"), "intent path mismatch")
            # Entire retained set and all unlisted neighbors are verified BEFORE restore.
            protected = verify_protected(d, p)
            consumers(d, args.accept_opaque_pid2)
            target_states = restore_target_preflight(d, p, targets)
            before = resources()
            missing_allocation = sum(d["items"][s["index"]][3]["allocated_bytes"]
                                     for s in target_states if s["state"] == "missing-restore-target")
            require(before["filesystems"][ROOT]["availableBytes"] >= missing_allocation + 16777216,
                    "insufficient current tmpfs restoration space including journal reserve")
            journal.save("restore-preflight-" + uuid.uuid4().hex + ".json", target_states)
            journal.emit("restore-all-protected-preflight-passed", targetCount=len(targets))
            for index in targets:
                restore_one(d, p, index, journal)
            verify_protected(d, p)
            verified = []
            for index in targets:
                path, ki, sha, expected, gi = d["items"][index]
                parent, name = parent_fd(path)
                try:
                    actual_id = identity(os.stat(name, dir_fd=parent, follow_symlinks=False))
                finally:
                    os.close(parent)
                actual_meta = hash_file(path, actual_id, sha)
                orig = p["outputMetadata"][index]
                require(restore_equivalent(actual_meta, orig, expected), "restored metadata mismatch")
                verified.append({"index": index, "path": path, "sha256": sha,
                                 "newIdentity": actual_id})
            result = {"mode": "restore", "utc": utc(), "verified": verified,
                      "protected": protected, "beforeResources": before,
                      "afterResources": resources(), "noAdmissionClaim": True,
                      "consumers": consumers(d, args.accept_opaque_pid2),
                      "inodeCtimeNotIdenticalToOriginal": True}
            result_sha = journal.save("restore-result-" + uuid.uuid4().hex + ".json", result)
            journal.emit("restore-finished", resultSha256=result_sha, targetCount=len(targets))
            print(json.dumps({"mode": "restore", "verifiedCount": len(verified),
                              "resultSha256": result_sha, "resources": result["afterResources"]}), flush=True)
    except BaseException as e:
        # Never auto-continue or auto-rollback. Preserve exact completed/missing state.
        try:
            journal.emit("aborted", mode=args.mode, error=repr(e),
                         elapsedSeconds=time.monotonic() - started, resources=resources())
            journal.save("abort-path-status-" + uuid.uuid4().hex + ".json", status_paths(d))
        except BaseException as diagnostic_error:
            print(json.dumps({"journalDiagnosticError": repr(diagnostic_error)}), file=sys.stderr)
        raise
    finally:
        journal.close()


if __name__ == "__main__":
    main()
