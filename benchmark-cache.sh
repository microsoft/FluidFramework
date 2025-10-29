#!/bin/bash

# Benchmarking script for Fluid Framework build cache
# Tests the shared cache by comparing:
#   1. Fresh build with empty shared cache (no local donefiles, no shared cache)
#   2. Fresh build with populated shared cache (no local donefiles, yes shared cache)
# Both scenarios clean local donefiles to isolate shared cache performance

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="${1:-packages/framework/aqueduct}"
BENCHMARK_RUNS="${2:-5}"
PREPARE_RUNS="${3:-1}"

echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Fluid Framework Build Cache Benchmark                 ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo -e "  Project: ${PROJECT_DIR}"
echo -e "  Benchmark runs: ${BENCHMARK_RUNS}"
echo -e "  Prepare runs: ${PREPARE_RUNS}"
echo ""

# Check if hyperfine is installed
if ! command -v hyperfine &> /dev/null; then
    echo -e "${RED}Error: hyperfine is not installed${NC}"
    echo "Install it with:"
    echo "  - Ubuntu/Debian: sudo apt install hyperfine"
    echo "  - macOS: brew install hyperfine"
    echo "  - Cargo: cargo install hyperfine"
    exit 1
fi

# Check if project directory exists
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}Error: Project directory '$PROJECT_DIR' does not exist${NC}"
    exit 1
fi

# Navigate to project directory
cd "$PROJECT_DIR"
PROJECT_NAME=$(basename "$PROJECT_DIR")

echo -e "${YELLOW}Project: ${PROJECT_NAME}${NC}"
echo ""

echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Running benchmarks...${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Navigate back to root for fluid-build
cd ../../..

# Benchmark command - use package name pattern matching
# Extract just the package name (e.g., "aqueduct" from "packages/framework/aqueduct")
PACKAGE_NAME=$(basename "${PROJECT_DIR}")

# Build command - fluid-build uses the shared cache
BUILD_CMD="/home/tylerbu/code/FluidFramework/fluid-build-cache/build-tools/packages/build-tools/bin/fluid-build build"

# Clean command - removes both donefiles and build artifacts
CLEAN_CMD="pnpm clean"

# Run hyperfine benchmark
# Both scenarios clean build artifacts and donefiles to test shared cache impact
hyperfine \
    --runs "${BENCHMARK_RUNS}" \
    --warmup "${PREPARE_RUNS}" \
    --export-markdown "benchmark-results-${PROJECT_NAME}.md" \
    --export-json "benchmark-results-${PROJECT_NAME}.json" \
    --show-output \
    --command-name "with-shared-cache" \
    --prepare "${CLEAN_CMD}" \
    "${BUILD_CMD}" \
    --command-name "without-shared-cache" \
    --prepare "${CLEAN_CMD}; export FLUID_BUILD_CACHE_DIR=\$(mktemp -d)" \
    "${BUILD_CMD}"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Benchmark complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Results saved to:${NC}"
echo -e "  - benchmark-results-${PROJECT_NAME}.md"
echo -e "  - benchmark-results-${PROJECT_NAME}.json"
echo ""

# Display markdown results if they exist
if [ -f "benchmark-results-${PROJECT_NAME}.md" ]; then
    echo -e "${GREEN}Summary:${NC}"
    cat "benchmark-results-${PROJECT_NAME}.md"
fi
