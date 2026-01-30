#!/bin/bash

# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# Prepare deployment package for Azure Static Web App
# Copies generated data and static files, fetches existing data from live site
#
# Required environment variables:
#   MODE           - "public" or "internal"
#   ASWA_HOSTNAME  - Hostname of the Azure Static Web App
#   OUTPUT_DIR     - Directory containing generated data files
#   SOURCE_DIR     - Directory containing source template files
#   DEPLOY_DIR     - Directory to create deployment package in

set -eu -o pipefail

# Validate required environment variables
: "${MODE:?MODE environment variable is required}"
: "${ASWA_HOSTNAME:?ASWA_HOSTNAME environment variable is required}"
: "${OUTPUT_DIR:?OUTPUT_DIR environment variable is required}"
: "${SOURCE_DIR:?SOURCE_DIR environment variable is required}"
: "${DEPLOY_DIR:?DEPLOY_DIR environment variable is required}"

echo "=========================================="
echo "Preparing deployment package ($MODE mode)"
echo "=========================================="

# Validate ASWA_HOSTNAME is set (non-empty after variable expansion)
if [ -z "${ASWA_HOSTNAME:-}" ]; then
    echo "Error: ASWA_HOSTNAME variable is not set"
    exit 1
fi

mkdir -p "$DEPLOY_DIR/data"

# Copy our generated data file
if [ "$MODE" = "public" ]; then
    cp "$OUTPUT_DIR/public-data.json" "$DEPLOY_DIR/data/public-data.json"
    OTHER_FILE="internal-data.json"
else
    cp "$OUTPUT_DIR/internal-data.json" "$DEPLOY_DIR/data/internal-data.json"
    OTHER_FILE="public-data.json"
fi

# Try to fetch the other mode's data from the live site (may not exist yet)
echo "Fetching existing $OTHER_FILE from dashboard..."
FETCH_URL="https://${ASWA_HOSTNAME}/data/$OTHER_FILE"
FETCH_OUTPUT="$DEPLOY_DIR/data/$OTHER_FILE"

echo "Fetching from: $FETCH_URL"
HTTP_CODE=$(curl -sL --max-time 30 -w "%{http_code}" -o "$FETCH_OUTPUT" "$FETCH_URL") || HTTP_CODE="000"
if [ "$HTTP_CODE" = "000" ]; then
    echo "Error: curl failed (network or connectivity issue)"
    rm -f "$FETCH_OUTPUT"
elif [ "$HTTP_CODE" = "200" ] && [ -s "$FETCH_OUTPUT" ]; then
    echo "Successfully fetched $OTHER_FILE (HTTP $HTTP_CODE, $(wc -c < "$FETCH_OUTPUT") bytes)"
else
    echo "HTTP $HTTP_CODE - fetch failed or empty response"
    rm -f "$FETCH_OUTPUT"
    echo "Note: Could not fetch $OTHER_FILE (first deployment or other mode hasn't run yet)"
    echo "      The dashboard will show 'No data available' for that tab until the other pipeline runs."
fi

# Copy static web app files from the repo (templates -> deployed names)
UTILS_DIR="$SOURCE_DIR/tools/pipelines/build-performance-observability-utils"
cp "$UTILS_DIR/staticwebapp-template.config.json" "$DEPLOY_DIR/staticwebapp.config.json"
cp "$UTILS_DIR/dashboard-template.html" "$DEPLOY_DIR/index.html"

echo "Deployment package contents:"
find "$DEPLOY_DIR" -type f
