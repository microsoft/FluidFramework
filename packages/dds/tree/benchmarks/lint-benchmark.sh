#!/bin/bash

# Simple benchmark script to compare lint performance
# Run from the packages/dds/tree directory
#
# This script compares:
# 1. ESLint only (current branch with strictBiome)
# 2. Biome only
# 3. Both ESLint + Biome sequentially
#
# Prerequisites:
# - hyperfine must be installed (brew install hyperfine)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TREE_DIR="$(dirname "$SCRIPT_DIR")"
cd "$TREE_DIR"

echo "=== Lint Performance Comparison ==="
echo "Directory: $TREE_DIR"
echo "Branch: $(git branch --show-current)"
echo ""

# Check if hyperfine is installed
if ! command -v hyperfine &> /dev/null; then
    echo "Error: hyperfine is not installed"
    echo "Install with: brew install hyperfine"
    exit 1
fi

echo "Running benchmark (5 runs each, 1 warmup)..."
echo ""

hyperfine \
    --warmup 1 \
    --runs 5 \
    --export-markdown /tmp/lint-benchmark.md \
    --export-json /tmp/lint-benchmark.json \
    -n "ESLint (strictBiome config)" "pnpm eslint src 2>/dev/null || true" \
    -n "Biome lint" "pnpm biome lint src" \
    -n "ESLint + Biome (sequential)" "pnpm eslint src 2>/dev/null || true; pnpm biome lint src"

echo ""
echo "Results saved to:"
echo "  /tmp/lint-benchmark.md   - Markdown table"
echo "  /tmp/lint-benchmark.json - JSON data"
echo ""
echo "Markdown results:"
cat /tmp/lint-benchmark.md
