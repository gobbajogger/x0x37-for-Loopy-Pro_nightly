#!/usr/bin/env bash
# DnBOX Local gate (nightly repo: website + Remote). One command:  scripts/dnbox-gate.sh [<lane>]
# Last line "DNBOX-GATE RESULT PASS|FAIL|VOID sha=<40>"; exit 0/1/2. NOT_RUN counts as FAIL.
# Browser tests use Playwright's bundled Chromium with its normal sandbox and a profile dir inside the workspace.
# Offline is the default: no git fetch, clone or ls-remote, and no npm ci when node_modules exists.
# Set DNBOX_GATE_ONLINE=1 to allow network Git and npm ci. A skipped network step prints [SKIP].
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2
LANE="${1:-unknown}"; SHA=$(git rev-parse HEAD); BASE=origin/integration/dnbox-consolidated
TS=$(TZ=Asia/Vladivostok date +%Y%m%d-%H%M); OUT=build/dnbox-gate; mkdir -p "$OUT"
LOG="$OUT/${SHA:0:8}-$TS.log"; exec > >(tee "$LOG") 2>&1
# Temp files and browser profile go OUTSIDE the checkout (some tests require output outside the repo) but in a folder we own.
export TMPDIR="${DNBOX_GATE_TMPDIR:-${HOME}/.cache/dnbox-gate/tmp}"
# Launchers use only Playwright's bundled Chromium; external executable overrides are forbidden.
echo "browser: Playwright bundled Chromium (normal sandbox)"
fail=0; void=0
step() {
  local n=$1; shift
  echo "== $n"
  if "$@"; then
    echo "[PASS] $n"
  else
    rc=$?
    if [ "$rc" -eq 3 ]; then
      echo "[SKIP] $n"
    elif [ "$rc" -eq 2 ]; then
      echo "[VOID] $n"; void=1
    else
      echo "[FAIL] $n"; fail=1
    fi
  fi
}
echo "DNBOX-GATE repo=nightly lane=$LANE sha=$SHA started=$TS (UTC+10)"
clean()   { git diff --quiet && git diff --cached --quiet; }
setup()   { mkdir -p -- "$TMPDIR" && [ -w "$TMPDIR" ] || { echo "Set DNBOX_GATE_TMPDIR to a writable directory outside the checkout"; return 2; }
            # Chromium can cancel a completed Blob download when TMPDIR contains a parent segment.
            TMPDIR=$(CDPATH= cd -P -- "$TMPDIR" && pwd -P) || return 2
            command -v node >/dev/null && command -v python3 >/dev/null || return 2
            if [ -f package-lock.json ]; then
              if [ "${DNBOX_GATE_ONLINE:-0}" = "1" ]; then
                npm ci --no-audit --no-fund >/dev/null || return 2
              elif [ -d node_modules ]; then
                echo "SKIP npm ci: offline default, using existing node_modules (set DNBOX_GATE_ONLINE=1 to reinstall)"
              else
                echo "node_modules missing; npm ci skipped (offline default). Set DNBOX_GATE_ONLINE=1 or run npm ci first."
                return 2
              fi
            fi
            python3 -c 'import playwright' 2>/dev/null || { echo "pip install playwright && python3 -m playwright install chromium"; return 2; }; }
fetch_base() { if [ "${DNBOX_GATE_ONLINE:-0}" = "1" ]; then
                 git fetch -q origin integration/dnbox-consolidated || return 1
                 return 0
               fi
               echo "SKIP fetch of origin/integration/dnbox-consolidated: offline default (set DNBOX_GATE_ONLINE=1 to fetch)"
               return 3; }
resolve_base() { if git rev-parse -q --verify 'refs/remotes/origin/integration/dnbox-consolidated^{commit}' >/dev/null; then
                   BASE=origin/integration/dnbox-consolidated
                 elif git rev-parse -q --verify 'refs/heads/integration/dnbox-consolidated^{commit}' >/dev/null; then
                   BASE=integration/dnbox-consolidated
                 else
                   echo "no local integration/dnbox-consolidated ref; merge it in or run with DNBOX_GATE_ONLINE=1"
                   return 1
                 fi
                 echo "using BASE=$BASE"; }
no_loss() { resolve_base || return 1
            git merge-base --is-ancestor "$BASE" HEAD || { echo "merge $BASE in (no rebase)"; return 1; }
            local miss=0; while read -r f; do [ -z "$f" ] && continue; grep -qF -- "$f" "docs/lanes/$LANE.md" 2>/dev/null || { echo "deleted without reason: $f"; miss=1; }; done <<< "$(git diff --name-only --diff-filter=D "$BASE" HEAD)"; return $miss; }
limits()  { resolve_base || return 1
            local bad=0
            git diff --name-only "$BASE" HEAD | grep -E '^\.github/workflows/' && bad=1
            git grep -nIE '(ghp_|gho_|github_pat_)[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}' -- . ':!*.md' && bad=1
            git ls-files | grep -iE '\.ipa$|\.fwsc$|ctl\.img$' && bad=1
            [ "$LANE" != remote ] || grep -rqi 'funkybeats' LICENSES web 2>/dev/null || { echo "FunkyBeats MIT notice missing"; bad=1; }
            return $bad; }
build()   { npm run build; }
unit()    { npm test; }
# browser_fixtures.py needs --output; its product mode needs an immutable old Remote root, so the
# gate runs the detector contract on the real browser (--fixtures-only).
browser() { python3 tests/browser-sandbox-contract.py || return 1; rm -rf "$OUT/web-structural"; npm run test:browser && python3 tests/visual/fixtures/web-structural/browser_fixtures.py --fixtures-only --output "$OUT/web-structural"; }
step clean-tree clean; step setup setup; step fetch-base fetch_base; step no-loss no_loss; step limits limits
if [ $void = 0 ]; then step build build; step unit-tests unit; step browser-tests browser; fi
R=PASS; [ $fail = 1 ] && R=FAIL; [ $void = 1 ] && R=VOID
echo "DNBOX-GATE RESULT $R sha=$SHA lane=$LANE log=$LOG"; [ $R = PASS ] && exit 0; [ $R = VOID ] && exit 2; exit 1
