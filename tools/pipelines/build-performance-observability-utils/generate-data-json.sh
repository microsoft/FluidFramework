#!/bin/bash

# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# Generates combined data JSON from builds and timeline data
# Combines initial build data with timeline data and processes into aggregated metrics
#
# Required environment variables:
#   MODE       - "public" or "internal" (determines output filename)
#   OUTPUT_DIR - Directory containing metrics/ subdirectory and for final output

set -eu -o pipefail

# Validate required environment variables
: "${MODE:?MODE environment variable is required}"
: "${OUTPUT_DIR:?OUTPUT_DIR environment variable is required}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
METRICS_PATH="$OUTPUT_DIR/metrics"

echo "=========================================="
echo "Generating data JSON ($MODE mode)"
echo "=========================================="

BUILDS_FILE="$METRICS_PATH/builds-raw.json"
TOTAL_BUILDS=$(jq '.value | length' "$BUILDS_FILE")
echo "Total builds: $TOTAL_BUILDS"

# Set output filename based on mode
if [ "$MODE" = "public" ]; then
    OUTPUT_FILE="$OUTPUT_DIR/public-data.json"
else
    OUTPUT_FILE="$OUTPUT_DIR/internal-data.json"
fi

# Intermediate raw data file
RAW_FILE="$METRICS_PATH/raw-combined.json"

# Combine timeline files into a single object keyed by build ID
# Write to file to avoid "argument list too long" errors with large data
TIMELINES_FILE="$METRICS_PATH/timelines-combined.json"
for timeline_file in "$METRICS_PATH/timelines"/*.json; do
    if [ -f "$timeline_file" ]; then
        # Extract build ID from filename (timeline_12345.json -> 12345)
        BUILD_ID=$(basename "$timeline_file" .json | sed 's/timeline_//')
        jq -n --arg id "$BUILD_ID" --slurpfile timeline "$timeline_file" '{($id): $timeline[0]}'
    fi
done | jq -s 'add // {}' > "$TIMELINES_FILE"

# Create intermediate JSON with builds and timelines
jq -n \
    --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --slurpfile builds "$BUILDS_FILE" \
    --slurpfile timelines "$TIMELINES_FILE" \
    '{
      generatedAt: $generatedAt,
      builds: $builds[0].value,
      timelines: $timelines[0]
    }' > "$RAW_FILE"

echo "Raw data size: $(du -h "$RAW_FILE" | cut -f1)"

# Process raw data into aggregated metrics using Node.js
echo "Processing raw data into aggregated metrics..."
node "$SCRIPT_DIR/process-data.cjs" "$RAW_FILE" "$OUTPUT_FILE" "$MODE"

# Clean up intermediate files
rm -f "$RAW_FILE" "$TIMELINES_FILE"

echo "Data JSON generated: $OUTPUT_FILE ($(du -h "$OUTPUT_FILE" | cut -f1))"
