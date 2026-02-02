#!/bin/bash

# Lint Performance Benchmark Script
# Run from the packages/dds/tree directory
#
# This script compares lint performance:
# 1. ESLint only (direct execution)
# 2. Biome lint only (direct execution)
# 3. ESLint + Biome parallel (background processes)
# 4. ESLint + Biome sequential (for comparison)
#
# Note: fluid-build orchestration adds overhead and dependency checking,
# so direct execution is used for accurate timing of the linting tools themselves.
# In practice, fluid-build runs lint:biome in parallel with eslint when
# lint:biome's dependency is set to ["^eslint"] (upstream packages only).
#
# Prerequisites:
# - hyperfine must be installed (brew install hyperfine)
# - Package must be built (pnpm build:compile)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TREE_DIR="$(dirname "$SCRIPT_DIR")"
cd "$TREE_DIR"

echo "=== Lint Performance Benchmark ==="
echo "Directory: $TREE_DIR"
echo "Branch: $(git branch --show-current)"
echo ""

# Check if hyperfine is installed
if ! command -v hyperfine &> /dev/null; then
    echo "Error: hyperfine is not installed"
    echo "Install with: brew install hyperfine"
    exit 1
fi

# Check if package is built
if [ ! -d "lib" ]; then
    echo "Error: Package not built. Run 'pnpm build:compile' first."
    exit 1
fi

OUTPUT_DIR="${TMPDIR:-/tmp}/lint-benchmark-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUTPUT_DIR"

echo "Results will be saved to: $OUTPUT_DIR"
echo ""

# Number of runs and warmup
RUNS=5
WARMUP=1

echo "Running benchmark ($RUNS runs each, $WARMUP warmup)..."
echo ""

# Run the benchmark
# Using shell-level parallelism for accurate timing of the tools themselves
hyperfine \
    --warmup "$WARMUP" \
    --runs "$RUNS" \
    --export-markdown "$OUTPUT_DIR/lint-benchmark.md" \
    --export-json "$OUTPUT_DIR/lint-benchmark.json" \
    -n "ESLint only" "pnpm eslint 2>/dev/null || true" \
    -n "Biome lint only" "pnpm lint:biome 2>/dev/null || true" \
    -n "ESLint + Biome (parallel)" "(pnpm eslint 2>/dev/null || true) & (pnpm lint:biome 2>/dev/null || true) & wait" \
    -n "ESLint + Biome (sequential)" "(pnpm eslint 2>/dev/null || true); (pnpm lint:biome 2>/dev/null || true)"

echo ""
echo "=== Benchmark Complete ==="
echo ""
echo "Results saved to:"
echo "  $OUTPUT_DIR/lint-benchmark.md   - Markdown table"
echo "  $OUTPUT_DIR/lint-benchmark.json - JSON data"
echo ""
echo "=== Markdown Results ==="
cat "$OUTPUT_DIR/lint-benchmark.md"
echo ""

# Calculate and display parallel speedup if jq is available
if command -v jq &> /dev/null; then
    echo "=== Performance Analysis ==="

    ESLINT_TIME=$(jq '.results[] | select(.command | contains("ESLint only")) | .mean' "$OUTPUT_DIR/lint-benchmark.json")
    BIOME_TIME=$(jq '.results[] | select(.command | contains("Biome lint only")) | .mean' "$OUTPUT_DIR/lint-benchmark.json")
    PARALLEL_TIME=$(jq '.results[] | select(.command | contains("parallel")) | .mean' "$OUTPUT_DIR/lint-benchmark.json")
    SEQUENTIAL_TIME=$(jq '.results[] | select(.command | contains("sequential")) | .mean' "$OUTPUT_DIR/lint-benchmark.json")

    # Calculate expected sequential time (eslint + biome)
    EXPECTED_SEQUENTIAL=$(echo "$ESLINT_TIME + $BIOME_TIME" | bc)

    # Calculate speedup
    if [ "$(echo "$PARALLEL_TIME > 0" | bc)" -eq 1 ]; then
        SPEEDUP=$(echo "scale=2; $SEQUENTIAL_TIME / $PARALLEL_TIME" | bc)
        TIME_SAVED=$(echo "scale=2; $SEQUENTIAL_TIME - $PARALLEL_TIME" | bc)
        PERCENT_FASTER=$(echo "scale=1; (1 - $PARALLEL_TIME / $SEQUENTIAL_TIME) * 100" | bc)

        echo ""
        printf "ESLint time:                %.2fs\n" "$ESLINT_TIME"
        printf "Biome time:                 %.2fs\n" "$BIOME_TIME"
        printf "Expected sequential:        %.2fs\n" "$EXPECTED_SEQUENTIAL"
        printf "Actual sequential:          %.2fs\n" "$SEQUENTIAL_TIME"
        printf "Parallel:                   %.2fs\n" "$PARALLEL_TIME"
        echo ""
        echo "Parallel speedup:           ${SPEEDUP}x faster than sequential"
        echo "Time saved:                 ${TIME_SAVED}s (${PERCENT_FASTER}% faster)"
        echo ""
        echo "Note: fluid-build orchestrates these tasks in parallel automatically"
        echo "when lint:biome depends on [\"^eslint\"] (upstream packages only)."
    fi
fi
