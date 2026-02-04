#!/bin/bash

# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# Generate a standalone HTML dashboard with inlined data
# This creates a single HTML file that can be viewed offline
#
# Required environment variables:
#   OUTPUT_DIR     - Directory containing the deploy folder with data files
#   SOURCE_DIR     - Directory containing source template files

set -eu -o pipefail

# Validate required environment variables
: "${OUTPUT_DIR:?OUTPUT_DIR environment variable is required}"
: "${SOURCE_DIR:?SOURCE_DIR environment variable is required}"

DEPLOY_DIR="$OUTPUT_DIR/deploy"
UTILS_DIR="$SOURCE_DIR/tools/pipelines/build-performance-observability-utils"
STANDALONE_FILE="$OUTPUT_DIR/dashboard-standalone.html"

echo "=========================================="
echo "Generating standalone HTML dashboard"
echo "=========================================="

# Check which data files exist
HAS_PUBLIC="false"
HAS_INTERNAL="false"

if [ -f "$DEPLOY_DIR/data/public-data.json" ]; then
    HAS_PUBLIC="true"
    echo "Found public-data.json ($(wc -c < "$DEPLOY_DIR/data/public-data.json") bytes)"
fi

if [ -f "$DEPLOY_DIR/data/internal-data.json" ]; then
    HAS_INTERNAL="true"
    echo "Found internal-data.json ($(wc -c < "$DEPLOY_DIR/data/internal-data.json") bytes)"
fi

# Use node to do the HTML transformation, reading files directly
node << NODESCRIPT
const fs = require('fs');

const templatePath = '${UTILS_DIR}/dashboard-template.html';
const outputPath = '${STANDALONE_FILE}';
const deployDir = '${DEPLOY_DIR}';
const hasPublic = ${HAS_PUBLIC};
const hasInternal = ${HAS_INTERNAL};

let html = fs.readFileSync(templatePath, 'utf8');

// Read data files if they exist
let publicData = 'null';
let internalData = 'null';

if (hasPublic) {
    const content = fs.readFileSync(deployDir + '/data/public-data.json', 'utf8');
    publicData = content.trim();
}

if (hasInternal) {
    const content = fs.readFileSync(deployDir + '/data/internal-data.json', 'utf8');
    internalData = content.trim();
}

// Create the inlined data script block
const inlineDataScript = \`
        // Inlined data for standalone mode
        const INLINED_PUBLIC_DATA = \${publicData};
        const INLINED_INTERNAL_DATA = \${internalData};
\`;

// Create replacement loadData function that uses inlined data
const newLoadData = \`
        async function loadData() {
            // Use inlined data instead of fetching
            if (INLINED_PUBLIC_DATA) {
                dashboardData.public = INLINED_PUBLIC_DATA;
                document.getElementById('public-loading').style.display = 'none';
                document.getElementById('public-dashboard').style.display = 'block';
                renderDashboard('public', dashboardData.public);
            } else {
                document.getElementById('public-loading').style.display = 'none';
                document.getElementById('public-no-data').style.display = 'block';
            }
            if (INLINED_INTERNAL_DATA) {
                dashboardData.internal = INLINED_INTERNAL_DATA;
                document.getElementById('internal-loading').style.display = 'none';
                document.getElementById('internal-dashboard').style.display = 'block';
                renderDashboard('internal', dashboardData.internal);
            } else {
                document.getElementById('internal-loading').style.display = 'none';
                document.getElementById('internal-no-data').style.display = 'block';
            }
        }
\`;

// Find and replace the loadData function
// Match from "async function loadData()" to its closing brace at the right indentation
const loadDataRegex = /async function loadData\(\)\s*\{[\s\S]*?^\s{8}\}/m;
html = html.replace(loadDataRegex, newLoadData.trim());

// Insert the inlined data right after "const itemsPerPage = 5;"
html = html.replace(
    'const itemsPerPage = 5;',
    'const itemsPerPage = 5;\\n' + inlineDataScript
);

// Update the title to indicate standalone version
html = html.replace('<title>FF Build Dashboard</title>', '<title>FF Build Dashboard (Standalone)</title>');

fs.writeFileSync(outputPath, html, 'utf8');
console.log('Standalone HTML generated successfully');
NODESCRIPT

echo "Generated standalone dashboard: $STANDALONE_FILE"
echo "File size: $(wc -c < "$STANDALONE_FILE") bytes"
