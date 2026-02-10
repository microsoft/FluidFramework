#!/bin/bash

# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# Fetch timeline data for builds from Azure DevOps REST API
# Retrieves detailed timeline data for each build in parallel
#
# Required environment variables:
#   ADO_API_TOKEN  - Azure DevOps API token for authentication
#   ORG            - Azure DevOps organization name
#   PROJECT        - Azure DevOps project name
#   MODE           - "public" or "internal" (for logging)
#   PARALLEL_JOBS  - Number of concurrent API requests
#   OUTPUT_DIR     - Directory containing builds-raw.json and for timeline output

set -eu -o pipefail

# Validate required environment variables
: "${ADO_API_TOKEN:?ADO_API_TOKEN environment variable is required}"
: "${ORG:?ORG environment variable is required}"
: "${PROJECT:?PROJECT environment variable is required}"
: "${MODE:?MODE environment variable is required}"
: "${PARALLEL_JOBS:?PARALLEL_JOBS environment variable is required}"
: "${OUTPUT_DIR:?OUTPUT_DIR environment variable is required}"

echo "=========================================="
echo "Fetching timeline data for builds ($MODE mode)"
echo "=========================================="

BUILDS_FILE="$OUTPUT_DIR/metrics/builds-raw.json"

# Extract build IDs from builds
BUILD_IDS=$(jq -r '.value[] | .id' "$BUILDS_FILE")

# Count builds correctly (wc -l returns 1 for empty string due to trailing newline)
if [ -z "$BUILD_IDS" ]; then
    TOTAL_COUNT=0
else
    TOTAL_COUNT=$(echo "$BUILD_IDS" | wc -l | tr -d ' ')
fi

echo "Found $TOTAL_COUNT builds to fetch timeline data for"

# Exit early if no builds to process
if [ "$TOTAL_COUNT" -eq 0 ]; then
    echo "Warning: No builds found to process. Skipping timeline fetch."
    mkdir -p "$OUTPUT_DIR/metrics/timelines"
    exit 0
fi

echo ""

mkdir -p "$OUTPUT_DIR/metrics/timelines"
ERRORS_FILE="$OUTPUT_DIR/metrics/timeline_errors.log"
touch "$ERRORS_FILE"

# Fetch in parallel using background jobs
echo "Using $PARALLEL_JOBS parallel jobs for timeline fetching"
count=0

fetch_timeline() {
    local build_id=$1
    local output_file=$2
    local errors_file=$3
    local http_code

    http_code=$(curl -sL --max-time 60 -w "%{http_code}" -u ":$ADO_API_TOKEN" \
        "https://dev.azure.com/$ORG/$PROJECT/_apis/build/builds/$build_id/timeline?api-version=7.1" \
        -o "$output_file")

    if [ "$http_code" != "200" ]; then
        echo "Build $build_id: HTTP $http_code" >> "$errors_file"
        rm -f "$output_file"
    elif ! jq empty "$output_file" 2>/dev/null; then
        echo "Build $build_id: Invalid JSON response" >> "$errors_file"
        rm -f "$output_file"
    fi
}

# Export function and variables for use in subshells
export -f fetch_timeline
export ADO_API_TOKEN ORG PROJECT

for BUILD_ID in $BUILD_IDS; do
    count=$((count + 1))

    # Start background job (each job writes errors to its own file to avoid concurrent writes)
    fetch_timeline "$BUILD_ID" "$OUTPUT_DIR/metrics/timelines/timeline_${BUILD_ID}.json" "$ERRORS_FILE.${BUILD_ID}" &

    # Limit concurrent jobs
    if (( count % PARALLEL_JOBS == 0 )); then
        wait  # Wait for current batch to complete
        echo "[$count/$TOTAL_COUNT] Fetched timeline data..."
    fi
done

wait  # Wait for remaining jobs

# Merge individual error files into one
cat "$ERRORS_FILE".* 2>/dev/null > "$ERRORS_FILE" || true
rm -f "$ERRORS_FILE".*

# Report any errors
SUCCESS_COUNT=$(find "$OUTPUT_DIR/metrics/timelines" -name "*.json" | wc -l | tr -d ' ')
ERROR_COUNT=$(wc -l < "$ERRORS_FILE" | tr -d ' ')

echo "Timeline data fetched: $SUCCESS_COUNT successful, $ERROR_COUNT failed"

if [ "$ERROR_COUNT" -gt 0 ]; then
    echo "Warning: Some timeline fetches failed:"
    cat "$ERRORS_FILE"
fi

if [ "$SUCCESS_COUNT" -eq 0 ] && [ "$TOTAL_COUNT" -gt 0 ]; then
    echo "Error: All timeline fetches failed"
    exit 1
fi
