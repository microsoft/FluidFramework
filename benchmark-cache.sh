#!/bin/bash

# Benchmarking script for Fluid Framework build cache
# Compares build performance with and without the shared cache

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="${1:-packages/framework/aqueduct}"
BENCHMARK_RUNS="${2:-5}"
PREPARE_RUNS="${3:-2}"

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

# Clean build artifacts
clean_build() {
    echo -e "${YELLOW}Cleaning build artifacts...${NC}"
    rm -rf dist lib *.tsbuildinfo node_modules/.cache 2>/dev/null || true
    # Clean any build log files
    rm -rf *.done.build.log 2>/dev/null || true
}

# Function to disable cache
disable_cache() {
    export FLUID_BUILD_CACHE_DISABLED=1
    echo -e "${YELLOW}Cache disabled (FLUID_BUILD_CACHE_DISABLED=1)${NC}"
}

# Function to enable cache
enable_cache() {
    unset FLUID_BUILD_CACHE_DISABLED
    echo -e "${YELLOW}Cache enabled${NC}"
}

echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Running benchmarks...${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Navigate back to root for fluid-build
cd ../../..

# Benchmark command - use package name pattern matching
# Extract just the package name (e.g., "aqueduct" from "packages/framework/aqueduct")
PACKAGE_NAME=$(basename "${PROJECT_DIR}")

# Build command - fluid-build can take package name patterns
BUILD_CMD="pnpm fluid-build --task compile ${PACKAGE_NAME}"

# Clean command - runs pnpm clean to clear local cached build artifacts
CLEAN_CMD="pnpm clean"

# Run hyperfine benchmark
hyperfine \
    --runs "${BENCHMARK_RUNS}" \
    --warmup "${PREPARE_RUNS}" \
    --export-markdown "benchmark-results-${PROJECT_NAME}.md" \
    --export-json "benchmark-results-${PROJECT_NAME}.json" \
    --show-output \
    --command-name "with-cache" \
    --prepare "${CLEAN_CMD}" \
    "${BUILD_CMD}" \
    --command-name "without-cache" \
    --prepare "${CLEAN_CMD}" \
    "FLUID_BUILD_CACHE_DISABLED=1 ${BUILD_CMD}"

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
