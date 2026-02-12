/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BuildPerfMode } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Directory containing the bundled template files (dashboard-template.html, staticwebapp config).
 */
export const TEMPLATES_DIR = path.resolve(__dirname, "templates");

/**
 * Generate a standalone HTML dashboard by injecting data into the template.
 *
 * @param templatePath - Path to the dashboard-template.html file.
 * @param dataJson - Stringified JSON data to inject.
 * @param mode - The build perf mode ("public" or "internal").
 * @returns The generated HTML string with data inlined.
 */
export function generateStandaloneHtml(
	templatePath: string,
	dataJson: string,
	mode: BuildPerfMode,
): string {
	let html = readFileSync(templatePath, "utf8");

	// Validate JSON before inlining
	JSON.parse(dataJson);

	// Sanitize for safe embedding in <script> tag: escape </script> sequences
	const sanitizedData = dataJson.replace(/<\//g, "<\\/");

	// Replace the placeholder comments with actual variables
	html = html.replace(
		"        // const STANDALONE_MODE = 'public'; // or 'internal'\n        // const INLINED_DATA = {...};",
		`        const STANDALONE_MODE = '${mode}';\n        const INLINED_DATA = ${sanitizedData};`,
	);

	return html;
}
