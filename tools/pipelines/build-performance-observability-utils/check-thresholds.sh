#!/bin/bash

# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# Check build performance thresholds and fail the pipeline if exceeded
#
# Required environment variables:
#   MODE                      - "public" or "internal" (determines input filename and which threshold to check)
#   INPUT_DIR                 - Directory containing the data JSON files
#   AVG_DURATION_THRESHOLD    - Maximum acceptable average build duration in minutes
#   CHANGE_PERIOD_THRESHOLD   - Maximum acceptable percentage change over the relevant period
#                               (3 days for public, 7 days for internal)
#
# Optional environment variables:
#   FORCE_FAILURE             - Set to "true" to force a failure (for testing notifications)

set -eu -o pipefail

# Validate required environment variables
: "${MODE:?MODE environment variable is required}"
: "${INPUT_DIR:?INPUT_DIR environment variable is required}"
: "${AVG_DURATION_THRESHOLD:?AVG_DURATION_THRESHOLD environment variable is required}"
: "${CHANGE_PERIOD_THRESHOLD:?CHANGE_PERIOD_THRESHOLD environment variable is required}"

# Optional: force failure for testing
FORCE_FAILURE="${FORCE_FAILURE:-false}"

echo "=========================================="
echo "Checking build performance thresholds ($MODE mode)"
echo "=========================================="

# Set input filename and change period based on mode
if [ "$MODE" = "public" ]; then
    DATA_FILE="$INPUT_DIR/public-data.json"
    CHANGE_PERIOD_DAYS=3
    CHANGE_FIELD="change3Day"
else
    DATA_FILE="$INPUT_DIR/internal-data.json"
    CHANGE_PERIOD_DAYS=7
    CHANGE_FIELD="change7Day"
fi

echo "Data file: $DATA_FILE"
echo "Thresholds:"
echo "  Average duration: ${AVG_DURATION_THRESHOLD} minutes"
echo "  ${CHANGE_PERIOD_DAYS}-day change: ±${CHANGE_PERIOD_THRESHOLD}%"

if [ "$FORCE_FAILURE" = "true" ]; then
    echo ""
    echo "** FORCE_FAILURE is enabled - will fail regardless of thresholds **"
fi

# Extract pre-computed metrics from the data file
AVG_DURATION=$(jq '.summary.avgDuration' "$DATA_FILE")
CHANGE_PERIOD=$(jq ".$CHANGE_FIELD" "$DATA_FILE")

if [ "$AVG_DURATION" = "null" ] || [ -z "$AVG_DURATION" ]; then
    echo "Warning: Could not extract avgDuration from data file"
    exit 0
fi
if [ "$CHANGE_PERIOD" = "null" ] || [ -z "$CHANGE_PERIOD" ]; then
    echo "Warning: Could not extract $CHANGE_FIELD from data file"
    exit 0
fi

echo ""
echo "Key metrics:"
echo "  Average duration: ${AVG_DURATION} minutes"
echo "  ${CHANGE_PERIOD_DAYS}-day change: ${CHANGE_PERIOD}%"

# Check thresholds
SHOULD_FAIL="false"
ALERT_REASONS=()

# Check average duration threshold
if (( $(echo "$AVG_DURATION > $AVG_DURATION_THRESHOLD" | bc -l) )); then
    SHOULD_FAIL="true"
    ALERT_REASONS+=("Average build duration (${AVG_DURATION} min) exceeds threshold (${AVG_DURATION_THRESHOLD} min)")
fi

# Check period change threshold (absolute value comparison)
CHANGE_PERIOD_ABS=$(echo "$CHANGE_PERIOD" | tr -d '-')
if (( $(echo "$CHANGE_PERIOD_ABS > $CHANGE_PERIOD_THRESHOLD" | bc -l) )); then
    SHOULD_FAIL="true"
    ALERT_REASONS+=("${CHANGE_PERIOD_DAYS}-day build duration change (${CHANGE_PERIOD}%) exceeds threshold (±${CHANGE_PERIOD_THRESHOLD}%)")
fi

# Force failure if requested (for testing)
if [ "$FORCE_FAILURE" = "true" ]; then
    SHOULD_FAIL="true"
    ALERT_REASONS+=("Forced failure for testing notifications")
fi

echo ""
echo "=========================================="
if [ "$SHOULD_FAIL" = "true" ]; then
    echo "ALERT: Thresholds exceeded:"
    for reason in "${ALERT_REASONS[@]}"; do
        echo "  - $reason"
    done
    echo ""
    echo "Key metrics:"
    echo "  - Average Duration: ${AVG_DURATION} minutes"
    echo "  - ${CHANGE_PERIOD_DAYS}-day Change: ${CHANGE_PERIOD}%"
    echo "=========================================="
    echo ""
    echo "Failing pipeline to trigger notifications..."
    exit 1
else
    echo "All thresholds within acceptable limits"
    echo "=========================================="
    exit 0
fi
