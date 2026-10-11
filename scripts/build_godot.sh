#!/usr/bin/env bash
set -euo pipefail

# Determine script directory and repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Godot 4 WebAssembly Build Pipeline ==="
echo "Repository Root: $REPO_ROOT"

# Auto-detect Godot binary
if [[ -n "${GODOT_BIN:-}" && -x "${GODOT_BIN}" ]]; then
    echo "Using Godot from GODOT_BIN: $GODOT_BIN"
elif [[ -x "/Applications/Godot.app/Contents/MacOS/Godot" ]]; then
    GODOT_BIN="/Applications/Godot.app/Contents/MacOS/Godot"
    echo "Using Godot from Applications: $GODOT_BIN"
elif command -v godot >/dev/null 2>&1; then
    GODOT_BIN="$(command -v godot)"
    echo "Using Godot from PATH: $GODOT_BIN"
elif command -v godot4 >/dev/null 2>&1; then
    GODOT_BIN="$(command -v godot4)"
    echo "Using Godot from PATH: $GODOT_BIN"
else
    echo "ERROR: Godot 4 binary not found!" >&2
    echo "Please set GODOT_BIN environment variable or install Godot to /Applications/Godot.app." >&2
    exit 1
fi

GODOT_VERSION="$("$GODOT_BIN" --version 2>&1 || true)"
echo "Godot Version: $GODOT_VERSION"

# Ensure output directory exists
DEST_DIR="$REPO_ROOT/godot"
mkdir -p "$DEST_DIR"

echo "Exporting Web target to: $DEST_DIR/index.html"
"$GODOT_BIN" --headless --path "$REPO_ROOT/godot_project" --export-release "Web" "$DEST_DIR/index.html"

# Verify generated artifacts
EXPECTED_FILES=("index.html" "index.js" "index.wasm" "index.pck")
MISSING=0

echo ""
echo "=== Build Artifact Verification ==="
for file in "${EXPECTED_FILES[@]}"; do
    if [[ -f "$DEST_DIR/$file" ]]; then
        SIZE="$(du -h "$DEST_DIR/$file" | cut -f1)"
        echo "  ✓ $file ($SIZE)"
    else
        echo "  ✗ Missing artifact: $file" >&2
        MISSING=$((MISSING + 1))
    fi
done

if [[ $MISSING -gt 0 ]]; then
    echo "ERROR: $MISSING required artifact(s) were not generated!" >&2
    exit 1
fi

echo ""
echo "=== Godot 3D Web Client build completed successfully! ==="
