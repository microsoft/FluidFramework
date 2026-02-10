#!/bin/bash

# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# Fetch build data from Azure DevOps REST API
# Retrieves build information for either PR builds (public) or internal builds
#
# Required environment variables:
#   ADO_API_TOKEN       - Azure DevOps API token for authentication
#   ORG                 - Azure DevOps organization name
#   PROJECT             - Azure DevOps project name
#   MODE                - "public" or "internal"
#   BUILD_COUNT         - Number of builds to fetch
#   PR_BUILD_DEF_ID     - Build definition ID for PR builds (required if MODE=public)
#   INTERNAL_BUILD_DEF_ID - Build definition ID for internal builds (required if MODE=internal)
#   OUTPUT_DIR          - Directory to write output files

set -eu -o pipefail

# Validate required environment variables
: "${ADO_API_TOKEN:?ADO_API_TOKEN environment variable is required}"
: "${ORG:?ORG environment variable is required}"
: "${PROJECT:?PROJECT environment variable is required}"
: "${MODE:?MODE environment variable is required}"
: "${BUILD_COUNT:?BUILD_COUNT environment variable is required}"
: "${OUTPUT_DIR:?OUTPUT_DIR environment variable is required}"

# Set build definition ID based on mode
if [ "$MODE" = "public" ]; then
    : "${PR_BUILD_DEF_ID:?PR_BUILD_DEF_ID is required for public mode}"
    BUILD_DEF_ID="$PR_BUILD_DEF_ID"
else
    : "${INTERNAL_BUILD_DEF_ID:?INTERNAL_BUILD_DEF_ID is required for internal mode}"
    BUILD_DEF_ID="$INTERNAL_BUILD_DEF_ID"
fi

echo "=========================================="
echo "Fetching build data"
echo "=========================================="
echo "Mode: $MODE"
echo "Organization: $ORG"
echo "Project: $PROJECT"
echo "Build Definition: $BUILD_DEF_ID"
echo "Build Count: $BUILD_COUNT"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR/metrics"

OUTPUT_FILE="$OUTPUT_DIR/metrics/builds-raw.json"

if [ "$MODE" = "public" ]; then
    # Fetch PR builds with reasonFilter and statusFilter
    echo "Fetching last $BUILD_COUNT PR builds (reason=pullRequest, succeeded/partiallySucceeded, completed)..."
    URL="https://dev.azure.com/$ORG/$PROJECT/_apis/build/builds?definitions=$BUILD_DEF_ID&reasonFilter=pullRequest&resultFilter=succeeded,partiallySucceeded&statusFilter=completed&\$top=$BUILD_COUNT&api-version=7.1"
else
    # Fetch internal builds from main branch
    echo "Fetching last $BUILD_COUNT internal builds (branch=main, succeeded/partiallySucceeded, completed)..."
    URL="https://dev.azure.com/$ORG/$PROJECT/_apis/build/builds?definitions=$BUILD_DEF_ID&branchName=refs/heads/main&resultFilter=succeeded,partiallySucceeded&statusFilter=completed&\$top=$BUILD_COUNT&api-version=7.1"
fi

HTTP_CODE=$(curl -sL --max-time 60 -w "%{http_code}" -u ":$ADO_API_TOKEN" \
    "$URL" -o "$OUTPUT_FILE")

if [ "$HTTP_CODE" != "200" ]; then
    echo "Error: API returned HTTP $HTTP_CODE"
    exit 1
fi

# Validate JSON response
if ! jq empty "$OUTPUT_FILE" 2>/dev/null; then
    echo "Error: Response is not valid JSON. Response saved to '$OUTPUT_FILE'."
    exit 1
fi

if ! jq -e '.value' "$OUTPUT_FILE" >/dev/null 2>&1; then
    echo "Error: Response does not contain expected '.value' array. Possible auth failure or wrong project."
    exit 1
fi

echo "Build data fetched successfully"
