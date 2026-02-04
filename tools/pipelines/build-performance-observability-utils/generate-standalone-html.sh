#!/bin/bash

# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# Generate a standalone HTML dashboard with inlined data
# This creates a single HTML file that can be viewed offline
# The generated file only contains data for the specified mode (no tabs)
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

# Use node to do the HTML transformation, reading files directly
node << NODESCRIPT
const fs = require('fs');

const templatePath = '${UTILS_DIR}/dashboard-template.html';
const outputPath = '${STANDALONE_FILE}';
const dataFile = '${DATA_FILE}';
const mode = '${MODE}';
const modeLabel = '${MODE_LABEL}';

let html = fs.readFileSync(templatePath, 'utf8');

// Read data file if it exists
let modeData = 'null';
if (fs.existsSync(dataFile)) {
    const content = fs.readFileSync(dataFile, 'utf8');
    modeData = content.trim();
}

// Create the inlined data script block (only for current mode)
const inlineDataScript = \`
        // Inlined data for standalone mode
        const STANDALONE_MODE = '\${mode}';
        const INLINED_DATA = \${modeData};
\`;

// Create replacement loadData function that uses inlined data (single mode only)
const newLoadData = \`
        async function loadData() {
            // Use inlined data instead of fetching (single mode standalone)
            const mode = STANDALONE_MODE;
            if (INLINED_DATA) {
                dashboardData[mode] = INLINED_DATA;
                document.getElementById(mode + '-loading').style.display = 'none';
                document.getElementById(mode + '-dashboard').style.display = 'block';
                renderDashboard(mode, dashboardData[mode]);
            } else {
                document.getElementById(mode + '-loading').style.display = 'none';
                document.getElementById(mode + '-no-data').style.display = 'block';
            }
        }
\`;

// Find and replace the loadData function
const loadDataRegex = /async function loadData\(\)\s*\{[\s\S]*?^\s{8}\}/m;
html = html.replace(loadDataRegex, newLoadData.trim());

// Insert the inlined data right after "const itemsPerPage = 5;"
html = html.replace(
    'const itemsPerPage = 5;',
    'const itemsPerPage = 5;\\n' + inlineDataScript
);

// Update the title to indicate which mode
html = html.replace('<title>FF Build Dashboard</title>', '<title>FF Build Dashboard - ' + modeLabel + '</title>');

// Remove the tabs UI (keep only header with title)
html = html.replace(
    /<div class="header-row">[\s\S]*?<\/div>\s*<\/div>/m,
    '<div class="header-row"><h1>Fluid Framework Build Performance Dashboard - ' + modeLabel + '</h1></div>'
);

// Remove the other mode's tab content entirely
const otherMode = mode === 'public' ? 'internal' : 'public';
const otherTabRegex = new RegExp('<div id="' + otherMode + '-content"[^>]*>[\\s\\S]*?<\\/div>\\s*(?=<\\/div>\\s*<script>)', 'm');
html = html.replace(otherTabRegex, '');

// Make current mode's tab content always active and visible
html = html.replace('id="' + mode + '-content" class="tab-content active"', 'id="' + mode + '-content" class="tab-content active" style="display: block;"');
html = html.replace('id="' + mode + '-content" class="tab-content"', 'id="' + mode + '-content" class="tab-content active" style="display: block;"');

fs.writeFileSync(outputPath, html, 'utf8');
console.log('Standalone HTML generated successfully for ' + modeLabel);
NODESCRIPT

echo "Generated standalone dashboard: $STANDALONE_FILE"
echo "File size: $(wc -c < "$STANDALONE_FILE") bytes"
