#!/bin/bash
# Baseline Performance Metrics Script
# Measures current build performance for comparison against shared cache implementation
# Usage: ./scripts/baseline-metrics.sh [package-name]

set -e

# Configuration
RESULTS_DIR="./metrics-results"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RESULTS_FILE="$RESULTS_DIR/baseline-$TIMESTAMP.json"
PACKAGE_NAME="${1:-@fluidframework/build-tools}"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Fluid Build Baseline Metrics ===${NC}"
echo "Package: $PACKAGE_NAME"
echo "Timestamp: $TIMESTAMP"
echo ""

# Create results directory
mkdir -p "$RESULTS_DIR"

# Collect system information
echo -e "${GREEN}Collecting system information...${NC}"
NODE_VERSION=$(node --version)
PNPM_VERSION=$(pnpm --version)
OS_INFO=$(uname -a)
CPU_COUNT=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo "unknown")

echo "Node: $NODE_VERSION"
echo "pnpm: $PNPM_VERSION"
echo "CPUs: $CPU_COUNT"
echo ""

# Initialize JSON results
cat > "$RESULTS_FILE" << EOF
{
  "timestamp": "$TIMESTAMP",
  "package": "$PACKAGE_NAME",
  "system": {
    "node": "$NODE_VERSION",
    "pnpm": "$PNPM_VERSION",
    "os": "$OS_INFO",
    "cpuCount": $CPU_COUNT
  },
  "metrics": {}
}
EOF

# Function to measure build time and memory
measure_build() {
  local build_type=$1
  local build_command=$2

  echo -e "${GREEN}Measuring $build_type build...${NC}"

  # Start memory monitoring in background
  local mem_log="$RESULTS_DIR/memory-$build_type-$TIMESTAMP.log"
  (
    while true; do
      ps aux | grep "fluid-build\|node" | grep -v grep >> "$mem_log"
      sleep 1
    done
  ) &
  local mem_pid=$!

  # Measure build time
  local start_time=$(date +%s.%N)

  # Run the build command
  eval "$build_command" > "$RESULTS_DIR/${build_type}-output-$TIMESTAMP.log" 2>&1

  local end_time=$(date +%s.%N)

  # Stop memory monitoring
  kill $mem_pid 2>/dev/null || true

  # Calculate duration
  local duration=$(echo "$end_time - $start_time" | bc)

  # Calculate peak memory (rough estimate from logs)
  local peak_mem=0
  if [ -f "$mem_log" ]; then
    peak_mem=$(awk '{sum+=$6} END {print sum/1024}' "$mem_log" 2>/dev/null || echo 0)
  fi

  echo "  Duration: ${duration}s"
  echo "  Peak Memory: ~${peak_mem}MB"
  echo ""

  # Update results JSON
  local temp_file=$(mktemp)
  jq ".metrics.\"$build_type\" = {\"duration\": $duration, \"peakMemoryMB\": $peak_mem}" "$RESULTS_FILE" > "$temp_file"
  mv "$temp_file" "$RESULTS_FILE"
}

# Clean workspace before measurements
echo -e "${YELLOW}Cleaning workspace...${NC}"
pnpm run clean > /dev/null 2>&1 || true
rm -rf node_modules/.cache 2>/dev/null || true
echo ""

# Measure 1: Clean Build Time
measure_build "clean_build" "pnpm run build"

# Measure 2: No-op Build (nothing changed)
measure_build "noop_build" "pnpm run build"

# Measure 3: Incremental Build (touch one file)
echo -e "${GREEN}Measuring incremental build (single file change)...${NC}"
TOUCH_FILE="src/index.ts"
if [ -f "$TOUCH_FILE" ]; then
  touch "$TOUCH_FILE"
  measure_build "incremental_single_file" "pnpm run build"
else
  echo -e "${YELLOW}Warning: $TOUCH_FILE not found, skipping incremental test${NC}"
fi

# Measure 4: TypeScript compilation only
measure_build "tsc_only" "pnpm run tsc"

# Collect file statistics
echo -e "${GREEN}Collecting file statistics...${NC}"
if [ -d "dist" ]; then
  OUTPUT_FILE_COUNT=$(find dist -type f | wc -l)
  OUTPUT_SIZE=$(du -sh dist 2>/dev/null | cut -f1)
else
  OUTPUT_FILE_COUNT=0
  OUTPUT_SIZE="0"
fi

echo "  Output files: $OUTPUT_FILE_COUNT"
echo "  Output size: $OUTPUT_SIZE"
echo ""

# Update results with file stats
temp_file=$(mktemp)
jq ".metrics.fileStats = {\"outputFileCount\": $OUTPUT_FILE_COUNT, \"outputSize\": \"$OUTPUT_SIZE\"}" "$RESULTS_FILE" > "$temp_file"
mv "$temp_file" "$RESULTS_FILE"

# Display summary
echo -e "${BLUE}=== Summary ===${NC}"
cat "$RESULTS_FILE" | jq '.'

echo ""
echo -e "${GREEN}Results saved to: $RESULTS_FILE${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Run this script multiple times for statistical significance"
echo "2. Compare results after implementing shared cache"
echo "3. Calculate improvement percentages"
