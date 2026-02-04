#!/bin/bash

# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# Check build performance thresholds and determine if alerts should be sent
#
# Required environment variables:
#   MODE                      - "public" or "internal" (determines input filename and which threshold to check)
#   INPUT_DIR                 - Directory containing the data JSON files
#   AVG_DURATION_THRESHOLD    - Maximum acceptable average build duration in minutes
#   CHANGE_PERIOD_THRESHOLD   - Maximum acceptable percentage change over the relevant period
#                               (3 days for public, 7 days for internal)
#
# Outputs (set as pipeline variables):
#   shouldAlert               - "true" if any threshold is exceeded
#   alertMessage              - Formatted message describing the threshold violations

set -eu -o pipefail

# Validate required environment variables
: "${MODE:?MODE environment variable is required}"
: "${INPUT_DIR:?INPUT_DIR environment variable is required}"
: "${AVG_DURATION_THRESHOLD:?AVG_DURATION_THRESHOLD environment variable is required}"
: "${CHANGE_PERIOD_THRESHOLD:?CHANGE_PERIOD_THRESHOLD environment variable is required}"

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
echo "  ${CHANGE_PERIOD_DAYS}-day change: ${CHANGE_PERIOD_THRESHOLD}%"

# Extract pre-computed metrics from the data file
AVG_DURATION=$(jq '.summary.avgDuration' "$DATA_FILE")
CHANGE_PERIOD=$(jq ".$CHANGE_FIELD" "$DATA_FILE")

echo ""
echo "Current metrics:"
echo "  Average duration: ${AVG_DURATION} minutes"
echo "  ${CHANGE_PERIOD_DAYS}-day change: ${CHANGE_PERIOD}%"

# Check thresholds
SHOULD_ALERT="false"
ALERT_REASONS=()

# Check average duration threshold
if (( $(echo "$AVG_DURATION > $AVG_DURATION_THRESHOLD" | bc -l) )); then
    SHOULD_ALERT="true"
    ALERT_REASONS+=("Average build duration (${AVG_DURATION} min) exceeds threshold (${AVG_DURATION_THRESHOLD} min)")
fi

# Check period change threshold (absolute value comparison)
CHANGE_PERIOD_ABS=$(echo "$CHANGE_PERIOD" | tr -d '-')
if (( $(echo "$CHANGE_PERIOD_ABS > $CHANGE_PERIOD_THRESHOLD" | bc -l) )); then
    SHOULD_ALERT="true"
    ALERT_REASONS+=("${CHANGE_PERIOD_DAYS}-day build duration change (${CHANGE_PERIOD}%) exceeds threshold (±${CHANGE_PERIOD_THRESHOLD}%)")
fi

echo ""
echo "=========================================="
if [ "$SHOULD_ALERT" = "true" ]; then
    echo "ALERT: Thresholds exceeded!"
    ALERT_MESSAGE="Build Performance Alert ($MODE builds):\n\n"
    for reason in "${ALERT_REASONS[@]}"; do
        echo "  - $reason"
        ALERT_MESSAGE+="• $reason\n"
    done
    ALERT_MESSAGE+="\nCurrent Metrics:\n"
    ALERT_MESSAGE+="• Average Duration: ${AVG_DURATION} minutes\n"
    ALERT_MESSAGE+="• ${CHANGE_PERIOD_DAYS}-day Change: ${CHANGE_PERIOD}%\n"
else
    echo "All thresholds within acceptable limits"
    ALERT_MESSAGE=""
fi
echo "=========================================="

# Set output variables for Azure DevOps
echo "##vso[task.setvariable variable=shouldAlert;isOutput=true]$SHOULD_ALERT"
echo "##vso[task.setvariable variable=alertMessage;isOutput=true]$ALERT_MESSAGE"
echo "##vso[task.setvariable variable=avgDuration;isOutput=true]$AVG_DURATION"
echo "##vso[task.setvariable variable=changePeriod;isOutput=true]$CHANGE_PERIOD"
echo "##vso[task.setvariable variable=changePeriodDays;isOutput=true]$CHANGE_PERIOD_DAYS"
