#!/bin/bash

# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# Generate combined data JSON from builds and timeline data
# Combines raw build data with timeline data into a single JSON file
#
# Required environment variables:
#   MODE       - "public" or "internal" (determines output filename)
#   OUTPUT_DIR - Directory containing metrics/ subdirectory and for final output

set -eu -o pipefail

# Validate required environment variables
: "${MODE:?MODE environment variable is required}"
: "${OUTPUT_DIR:?OUTPUT_DIR environment variable is required}"

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

# Create output JSON with raw builds and timelines
jq -n \
    --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --slurpfile builds "$BUILDS_FILE" \
    --slurpfile timelines "$TIMELINES_FILE" \
    '{
      generatedAt: $generatedAt,
      builds: $builds[0].value,
      timelines: $timelines[0]
    }' > "$OUTPUT_FILE"

echo "Data JSON generated: $OUTPUT_FILE"
echo "Data size: $(wc -c < "$OUTPUT_FILE") bytes"
