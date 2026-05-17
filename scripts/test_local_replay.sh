#!/bin/bash
# Copyright 2026 Glassbox Users
# SPDX-License-Identifier: Apache-2.0

# Test script for local WASM replay functionality
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

echo "Testing local WASM replay functionality..."

# Ensure we have a built binary
if [ ! -f "./Glassbox" ] && [ ! -f "./glassbox.exe" ]; then
    echo "Building Glassbox binary..."
    go build -o Glassbox ./cmd/glassbox
fi

BIN="./Glassbox"
if [ -f "./glassbox.exe" ]; then
    BIN="./glassbox.exe"
fi

# Run a help command to verify it works
$BIN debug --help | grep -q "--wasm"
echo "[OK] debug --wasm flag present"

echo "WASM replay smoke test passed"
