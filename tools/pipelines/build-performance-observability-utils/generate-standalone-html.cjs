/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Generates a standalone HTML dashboard by injecting data into the template.
 * Used by generate-html-artifact.sh.
 *
 * Required environment variables:
 *   UTILS_DIR       - Directory containing dashboard-template.html
 *   STANDALONE_FILE - Output path for the standalone HTML file
 *   DATA_FILE       - Path to the JSON data file
 *   MODE            - "public" or "internal"
 */

const fs = require("fs");

const templatePath = process.env.UTILS_DIR + "/dashboard-template.html";
const outputPath = process.env.STANDALONE_FILE;
const dataFile = process.env.DATA_FILE;
const mode = process.env.MODE;

let html = fs.readFileSync(templatePath, "utf8");

// Read and validate data file content
let data = "null";
if (fs.existsSync(dataFile)) {
	const raw = fs.readFileSync(dataFile, "utf8").trim();
	// Validate it's valid JSON before inlining
	try {
		JSON.parse(raw);
	} catch (e) {
		console.error("Error: Data file is not valid JSON:", e.message);
		process.exit(1);
	}
	// Sanitize for safe embedding in <script> tag: escape </script> sequences
	data = raw.replace(/<\//g, "<\\/");
}

// Replace the placeholder comments with actual variables
// Mode is validated by the calling script to be "public" or "internal"
html = html.replace(
	"        // const STANDALONE_MODE = 'public'; // or 'internal'\n        // const INLINED_DATA = {...};",
	`        const STANDALONE_MODE = '${mode}';\n        const INLINED_DATA = ${data};`,
);

fs.writeFileSync(outputPath, html, "utf8");
console.log("Standalone HTML generated successfully");
