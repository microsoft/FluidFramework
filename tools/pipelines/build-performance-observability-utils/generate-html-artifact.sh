#!/bin/bash

# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# Generates a standalone HTML dashboard artifact
# The generated file only contains data for the specified mode (public or internal)
#
# Required environment variables:
#   MODE           - "public" or "internal" (determines which data to include)
#   OUTPUT_DIR     - Directory containing the deploy folder with data files
#   SOURCE_DIR     - Directory containing source template files

set -eu -o pipefail

# Validate required environment variables
: "${MODE:?MODE environment variable is required}"
: "${OUTPUT_DIR:?OUTPUT_DIR environment variable is required}"
: "${SOURCE_DIR:?SOURCE_DIR environment variable is required}"

DEPLOY_DIR="$OUTPUT_DIR/deploy"
UTILS_DIR="$SOURCE_DIR/tools/pipelines/build-performance-observability-utils"
STANDALONE_FILE="$OUTPUT_DIR/dashboard.html"

echo "=========================================="
echo "Generating standalone HTML dashboard ($MODE mode)"
echo "=========================================="

# Determine the data file for this mode
if [ "$MODE" = "public" ]; then
    DATA_FILE="$DEPLOY_DIR/data/public-data.json"
    MODE_LABEL="PR Builds"
else
    DATA_FILE="$DEPLOY_DIR/data/internal-data.json"
    MODE_LABEL="Internal Builds"
fi

if [ -f "$DATA_FILE" ]; then
    echo "Found data file: $DATA_FILE ($(wc -c < "$DATA_FILE") bytes)"
else
    echo "Warning: Data file not found: $DATA_FILE"
fi

# Inject standalone mode variables into the template to only display the relevant view
export UTILS_DIR STANDALONE_FILE DATA_FILE MODE
node << 'NODESCRIPT'
const fs = require('fs');

const templatePath = process.env.UTILS_DIR + '/dashboard-template.html';
const outputPath = process.env.STANDALONE_FILE;
const dataFile = process.env.DATA_FILE;
const mode = process.env.MODE;

let html = fs.readFileSync(templatePath, 'utf8');

// Read data file content
const data = fs.existsSync(dataFile) ? fs.readFileSync(dataFile, 'utf8').trim() : 'null';

// Replace the placeholder comments with actual variables
html = html.replace(
    "        // const STANDALONE_MODE = 'public'; // or 'internal'\n        // const INLINED_DATA = {...};",
    `        const STANDALONE_MODE = '${mode}';\n        const INLINED_DATA = ${data};`
);

fs.writeFileSync(outputPath, html, 'utf8');
console.log('Standalone HTML generated successfully');
NODESCRIPT

echo "Generated standalone dashboard: $STANDALONE_FILE"
echo "File size: $(wc -c < "$STANDALONE_FILE") bytes"
