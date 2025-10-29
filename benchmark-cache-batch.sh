#!/bin/bash

# Batch benchmarking script for multiple Fluid Framework projects
# Useful for comparing cache effectiveness across different package types

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BENCHMARK_RUNS="${1:-5}"
OUTPUT_DIR="benchmark-results"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Projects to benchmark (can be customized)
declare -a PROJECTS=(
    "packages/framework/aqueduct"
    "packages/runtime/container-runtime"
    "packages/dds/tree"
    "packages/loader/container-loader"
    "packages/dds/map"
)

echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Fluid Framework Batch Build Cache Benchmark           ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check dependencies
if ! command -v hyperfine &> /dev/null; then
    echo -e "${RED}Error: hyperfine is not installed${NC}"
    exit 1
fi

echo -e "${YELLOW}Configuration:${NC}"
echo -e "  ${BLUE}Projects to benchmark:${NC} ${#PROJECTS[@]}"
echo -e "  ${BLUE}Runs per project:${NC} ${BENCHMARK_RUNS}"
echo -e "  ${BLUE}Output directory:${NC} ${OUTPUT_DIR}/"
echo ""

# List projects
echo -e "${YELLOW}Projects:${NC}"
for project in "${PROJECTS[@]}"; do
    if [ -d "$project" ]; then
        echo -e "  ${GREEN}✓${NC} $project"
    else
        echo -e "  ${RED}✗${NC} $project (not found)"
    fi
done
echo ""

mkdir -p "$OUTPUT_DIR"

# Summary file
SUMMARY_FILE="${OUTPUT_DIR}/batch-summary-${TIMESTAMP}.md"
cat > "$SUMMARY_FILE" << EOF
# Batch Benchmark Summary

**Date:** $(date)
**Runs per project:** ${BENCHMARK_RUNS}

## Results

EOF

# Track overall stats
TOTAL_PROJECTS=0
SUCCESSFUL_PROJECTS=0

# Benchmark each project
for project in "${PROJECTS[@]}"; do
    if [ ! -d "$project" ]; then
        echo -e "${RED}Skipping $project (not found)${NC}"
        continue
    fi
    
    TOTAL_PROJECTS=$((TOTAL_PROJECTS + 1))
    PROJECT_NAME=$(basename "$project")
    
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}Benchmarking: ${PROJECT_NAME} (${TOTAL_PROJECTS}/${#PROJECTS[@]})${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    
    BUILD_CMD="pnpm fluid-build --task compile --root ${project}"
    CLEAN_CMD="rm -rf ${project}/dist ${project}/lib ${project}/*.tsbuildinfo ${project}/*.done.build.log 2>/dev/null || true"
    
    RESULT_FILE="${OUTPUT_DIR}/${PROJECT_NAME}-${TIMESTAMP}"
    
    # Run benchmark
    if hyperfine \
        --runs "${BENCHMARK_RUNS}" \
        --warmup 2 \
        --export-markdown "${RESULT_FILE}.md" \
        --export-json "${RESULT_FILE}.json" \
        --command-name "${PROJECT_NAME}-with-cache" \
        --prepare "${CLEAN_CMD}" \
        "${BUILD_CMD}" \
        --command-name "${PROJECT_NAME}-without-cache" \
        --prepare "${CLEAN_CMD}" \
        "FLUID_BUILD_CACHE_DISABLED=1 ${BUILD_CMD}"; then
        
        SUCCESSFUL_PROJECTS=$((SUCCESSFUL_PROJECTS + 1))
        
        # Extract key metrics and add to summary
        echo "" >> "$SUMMARY_FILE"
        echo "### ${PROJECT_NAME}" >> "$SUMMARY_FILE"
        echo "" >> "$SUMMARY_FILE"
        cat "${RESULT_FILE}.md" >> "$SUMMARY_FILE"
        echo "" >> "$SUMMARY_FILE"
        
        echo -e "${GREEN}✓ Completed successfully${NC}"
    else
        echo -e "${RED}✗ Failed to benchmark${NC}" >> "$SUMMARY_FILE"
        echo -e "${RED}✗ Failed to benchmark${NC}"
    fi
    
    echo ""
done

# Add summary statistics
cat >> "$SUMMARY_FILE" << EOF

---

## Summary Statistics

- **Total projects tested:** ${TOTAL_PROJECTS}
- **Successful benchmarks:** ${SUCCESSFUL_PROJECTS}
- **Failed benchmarks:** $((TOTAL_PROJECTS - SUCCESSFUL_PROJECTS))

EOF

echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Batch benchmark complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Summary:${NC}"
echo -e "  Total projects: ${TOTAL_PROJECTS}"
echo -e "  Successful: ${GREEN}${SUCCESSFUL_PROJECTS}${NC}"
echo -e "  Failed: ${RED}$((TOTAL_PROJECTS - SUCCESSFUL_PROJECTS))${NC}"
echo ""
echo -e "${YELLOW}Results saved to:${NC}"
echo -e "  ${SUMMARY_FILE}"
echo ""
echo -e "${BLUE}View summary:${NC}"
echo -e "  cat ${SUMMARY_FILE}"
echo ""

# Display summary
if [ -f "$SUMMARY_FILE" ]; then
    cat "$SUMMARY_FILE"
fi
