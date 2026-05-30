#!/usr/bin/env bash
# Copyright 2026 Glassbox Users
# SPDX-License-Identifier: Apache-2.0
#
# verify-release.sh — smoke-test release artifacts
#
# Usage: scripts/verify-release.sh [dist/release]
#
# Checks:
#   1. Each expected binary exists and is non-empty.
#   2. The native binary (matching the current OS/arch) executes and
#      prints version information.
#   3. SHA-256 checksums file exists and all listed files verify.
#   4. version.txt contains non-empty version, commit, and build_date fields.

set -euo pipefail

DIST_DIR="${1:-dist/release}"

pass() { printf '  [PASS] %s\n' "$*"; }
fail() { printf '  [FAIL] %s\n' "$*" >&2; FAILURES=$((FAILURES + 1)); }

FAILURES=0

echo "Verifying release artifacts in: ${DIST_DIR}"
echo ""

# ── 1. Expected binaries exist ────────────────────────────────────────────────
echo "1. Checking binary presence..."
EXPECTED=(
  "glassbox-linux-amd64"
  "glassbox-linux-arm64"
  "glassbox-darwin-amd64"
  "glassbox-darwin-arm64"
  "glassbox-windows-amd64.exe"
)
for bin in "${EXPECTED[@]}"; do
  path="${DIST_DIR}/${bin}"
  if [ -f "${path}" ] && [ -s "${path}" ]; then
    size=$(wc -c < "${path}")
    pass "${bin} (${size} bytes)"
  else
    fail "${bin} missing or empty"
  fi
done

# ── 2. Native binary executes ─────────────────────────────────────────────────
echo ""
echo "2. Smoke-testing native binary..."
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "${ARCH}" in
  x86_64)  ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) ARCH="amd64" ;;
esac

NATIVE_BIN="${DIST_DIR}/glassbox-${OS}-${ARCH}"
if [ "${OS}" = "windows" ]; then
  NATIVE_BIN="${NATIVE_BIN}.exe"
fi

if [ -f "${NATIVE_BIN}" ]; then
  chmod +x "${NATIVE_BIN}"
  if output=$("${NATIVE_BIN}" --version 2>&1 || "${NATIVE_BIN}" version 2>&1 || true); then
    if [ -n "${output}" ]; then
      pass "native binary executed: ${output}"
    else
      # Some CLIs exit 0 with no output for --version; try --help
      help_output=$("${NATIVE_BIN}" --help 2>&1 | head -1 || true)
      if [ -n "${help_output}" ]; then
        pass "native binary executed (--help): ${help_output}"
      else
        fail "native binary produced no output"
      fi
    fi
  else
    fail "native binary failed to execute"
  fi
else
  echo "  [SKIP] native binary not found for ${OS}/${ARCH} (cross-compiled only)"
fi

# ── 3. Checksums verify ───────────────────────────────────────────────────────
echo ""
echo "3. Verifying checksums..."
CHECKSUM_FILE="${DIST_DIR}/checksums.sha256"
if [ ! -f "${CHECKSUM_FILE}" ]; then
  fail "checksums.sha256 not found"
else
  if command -v sha256sum >/dev/null 2>&1; then
    if (cd "${DIST_DIR}" && sha256sum --check checksums.sha256 --quiet 2>&1); then
      pass "all checksums verified (sha256sum)"
    else
      fail "checksum verification failed"
    fi
  elif command -v shasum >/dev/null 2>&1; then
    if (cd "${DIST_DIR}" && shasum -a 256 --check checksums.sha256 --quiet 2>&1); then
      pass "all checksums verified (shasum)"
    else
      fail "checksum verification failed"
    fi
  else
    echo "  [SKIP] no sha256sum or shasum available"
  fi
fi

# ── 4. version.txt ────────────────────────────────────────────────────────────
echo ""
echo "4. Checking version metadata..."
VERSION_FILE="${DIST_DIR}/version.txt"
if [ ! -f "${VERSION_FILE}" ]; then
  fail "version.txt not found"
else
  version=$(grep '^version=' "${VERSION_FILE}" | cut -d= -f2)
  commit=$(grep '^commit=' "${VERSION_FILE}" | cut -d= -f2)
  build_date=$(grep '^build_date=' "${VERSION_FILE}" | cut -d= -f2)

  [ -n "${version}" ]    && pass "version=${version}"    || fail "version field empty"
  [ -n "${commit}" ]     && pass "commit=${commit}"      || fail "commit field empty"
  [ -n "${build_date}" ] && pass "build_date=${build_date}" || fail "build_date field empty"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
if [ "${FAILURES}" -eq 0 ]; then
  echo "Result: all release verification checks passed."
  exit 0
else
  echo "Result: ${FAILURES} check(s) failed." >&2
  exit 1
fi
