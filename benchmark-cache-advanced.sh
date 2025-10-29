#!/bin/bash

# Advanced benchmarking script for Fluid Framework build cache
# Supports multiple scenarios and detailed comparison

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
PACKAGE_NAME="aqueduct"  # Package to build (e.g., "aqueduct", "container-runtime", etc.)
PROJECT_DIR="packages/framework/aqueduct"
BENCHMARK_RUNS=5
PREPARE_RUNS=2
BUILD_TASK="compile"
OUTPUT_DIR="benchmark-results"
COMPARE_MODE="standard"

# Parse command line arguments
show_help() {
    cat << EOF
${GREEN}Fluid Framework Build Cache Benchmark Tool${NC}

Usage: $0 [OPTIONS]

Options:
    -p, --project DIR       Project directory to benchmark (default: packages/framework/aqueduct)
    -r, --runs NUM          Number of benchmark runs (default: 5)
    -w, --warmup NUM        Number of warmup runs (default: 2)
    -t, --task TASK         Build task to benchmark (default: compile)
                            Options: compile, build, tsc, lint, ci:build
    -m, --mode MODE         Comparison mode (default: standard)
                            standard: Compare with/without cache
                            cold-warm: Compare cold vs warm cache
                            incremental: Test incremental build performance
    -o, --output DIR        Output directory for results (default: benchmark-results)
    -h, --help              Show this help message

Examples:
    # Basic benchmark
    $0

    # Benchmark specific project with more runs
    $0 -p packages/runtime/container-runtime -r 10

    # Test different task
    $0 -t build -r 8

    # Compare cold vs warm cache
    $0 -m cold-warm

    # Test incremental builds
    $0 -m incremental -r 10

EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--project)
            PROJECT_DIR="$2"
            shift 2
            ;;
        -r|--runs)
            BENCHMARK_RUNS="$2"
            shift 2
            ;;
        -w|--warmup)
            PREPARE_RUNS="$2"
            shift 2
            ;;
        -t|--task)
            BUILD_TASK="$2"
            shift 2
            ;;
        -m|--mode)
            COMPARE_MODE="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Fluid Framework Build Cache Benchmark                 ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
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

PROJECT_NAME=$(basename "$PROJECT_DIR")

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo -e "${YELLOW}Configuration:${NC}"
echo -e "  ${BLUE}Project:${NC} ${PROJECT_DIR}"
echo -e "  ${BLUE}Build Task:${NC} ${BUILD_TASK}"
echo -e "  ${BLUE}Mode:${NC} ${COMPARE_MODE}"
echo -e "  ${BLUE}Benchmark runs:${NC} ${BENCHMARK_RUNS}"
echo -e "  ${BLUE}Warmup runs:${NC} ${PREPARE_RUNS}"
echo -e "  ${BLUE}Output:${NC} ${OUTPUT_DIR}/"
echo ""

# Build command - fluid-build uses the shared cache
BUILD_CMD="/home/tylerbu/code/FluidFramework/fluid-build-cache/build-tools/packages/build-tools/bin/fluid-build --task build ${PACKAGE_NAME}"

# Clean command - runs pnpm clean to clear local cached build artifacts
CLEAN_CMD="pnpm clean"

# Timestamp for unique filenames
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RESULT_PREFIX="${OUTPUT_DIR}/${PROJECT_NAME}-${BUILD_TASK}-${COMPARE_MODE}-${TIMESTAMP}"

echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Running benchmarks in ${COMPARE_MODE} mode...${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""

case "$COMPARE_MODE" in
    standard)
        # Standard comparison: with cache vs without cache
        hyperfine \
            --runs "${BENCHMARK_RUNS}" \
            --warmup "${PREPARE_RUNS}" \
            --export-markdown "${RESULT_PREFIX}.md" \
            --export-json "${RESULT_PREFIX}.json" \
            --show-output \
            --command-name "with-cache" \
            --prepare "${CLEAN_CMD}" \
            "${BUILD_CMD}" \
            --command-name "without-cache" \
            --prepare "${CLEAN_CMD}; export FLUID_BUILD_CACHE_PATH=\$(mktemp -d)" \
            "${BUILD_CMD}"
        ;;
    
    cold-warm)
        # Compare cold cache (after clearing) vs warm cache (primed)
        echo -e "${YELLOW}Priming cache for warm runs...${NC}"
        eval "${CLEAN_CMD}"
        eval "${BUILD_CMD}" > /dev/null 2>&1
        echo ""
        
        hyperfine \
            --runs "${BENCHMARK_RUNS}" \
            --warmup "${PREPARE_RUNS}" \
            --export-markdown "${RESULT_PREFIX}.md" \
            --export-json "${RESULT_PREFIX}.json" \
            --show-output \
            --command-name "cold-cache" \
            --prepare "${CLEAN_CMD}" \
            "${BUILD_CMD}" \
            --command-name "warm-cache" \
            --prepare "touch ${PROJECT_DIR}/src/index.ts" \
            "${BUILD_CMD}"
        ;;
    
    incremental)
        # Test incremental build performance
        echo -e "${YELLOW}Setting up for incremental builds...${NC}"
        eval "${CLEAN_CMD}"
        eval "${BUILD_CMD}" > /dev/null 2>&1
        echo ""
        
        hyperfine \
            --runs "${BENCHMARK_RUNS}" \
            --warmup "${PREPARE_RUNS}" \
            --export-markdown "${RESULT_PREFIX}.md" \
            --export-json "${RESULT_PREFIX}.json" \
            --show-output \
            --command-name "no-change-rebuild" \
            --prepare ":" \
            "${BUILD_CMD}" \
            --command-name "single-file-change" \
            --prepare "touch ${PROJECT_DIR}/src/index.ts" \
            "${BUILD_CMD}" \
            --command-name "full-rebuild" \
            --prepare "${CLEAN_CMD}" \
            "${BUILD_CMD}"
        ;;
    
    *)
        echo -e "${RED}Unknown comparison mode: ${COMPARE_MODE}${NC}"
        echo "Valid modes: standard, cold-warm, incremental"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Benchmark complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Results saved to:${NC}"
echo -e "  - ${RESULT_PREFIX}.md"
echo -e "  - ${RESULT_PREFIX}.json"
echo ""

# Display results
if [ -f "${RESULT_PREFIX}.md" ]; then
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}Summary:${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    cat "${RESULT_PREFIX}.md"
    echo ""
fi

# Create a symlink to latest results
ln -sf "$(basename ${RESULT_PREFIX}.md)" "${OUTPUT_DIR}/latest-${PROJECT_NAME}.md"
ln -sf "$(basename ${RESULT_PREFIX}.json)" "${OUTPUT_DIR}/latest-${PROJECT_NAME}.json"

echo -e "${BLUE}Tip: View latest results anytime with:${NC}"
echo -e "  cat ${OUTPUT_DIR}/latest-${PROJECT_NAME}.md"
