/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This script is used to read the previousVersions data from versions.json
 * Note that the results are formatted and printed with console.log() so that the 
 * output can be piped and consumed using a Bash Task in build-docs.yml
 */

const fs = require('fs');

// Read the JSON file content
const jsonData = fs.readFileSync('docs/data/versions.json', 'utf8');

// Parse the JSON data
const parsedData = JSON.parse(jsonData);

// Extract values from "previousVersions" and output for Bash processing
return(console.log(parsedData.params.previousVersions.join('\n')));  
