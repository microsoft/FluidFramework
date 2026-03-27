/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Generates HTML dashboard files for build performance observability.
 * Uses EJS templating to generate the final HTML from separate CSS, JS, and template files.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ejs from "ejs";

import type { BuildPerfMode } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Directory containing the template source files (dashboard.ejs, dashboard.css, dashboard.ts).
 * At runtime the compiled dashboard.js is read from this directory.
 */
export const TEMPLATES_DIR = path.resolve(__dirname, "templates");

/**
 * Generate a standalone HTML dashboard by rendering the EJS template
 * with CSS, JS, and data inlined.
 *
 * @param templatePath - Path to the dashboard.ejs file.
 * @param dataJson - Stringified JSON data to inject.
 * @param mode - The build perf mode ("public" or "internal").
 * @returns The generated HTML string with all assets inlined.
 */
export function generateStandaloneHtml(
	templatePath: string,
	dataJson: string,
	mode: BuildPerfMode,
): string {
	// Validate JSON before inlining
	JSON.parse(dataJson);

	// Sanitize for safe embedding in <script> tag: escape </script> sequences
	const sanitizedDataJson = dataJson.replace(/<\//g, "<\\/");

	return renderTemplate(templatePath, {
		standalone: true,
		mode,
		sanitizedDataJson,
	});
}

/**
 * Generate a multi-mode HTML dashboard for Azure Static Web Apps deployment.
 * The generated HTML fetches data from `data/*.json` at runtime instead of
 * inlining it, and shows tabs for both public and internal modes.
 *
 * @param templatePath - Path to the dashboard.ejs file.
 * @returns The generated HTML string (no data inlined).
 */
export function generateAswaHtml(templatePath: string): string {
	return renderTemplate(templatePath, {
		standalone: false,
	});
}

/**
 * Render the EJS dashboard template with the given variables.
 */
function renderTemplate(templatePath: string, vars: Record<string, unknown>): string {
	const templateDir = path.dirname(templatePath);
	const cssContent = readFileSync(path.join(templateDir, "dashboard.css"), "utf8");
	// Read the tsc-compiled JS and strip module artifacts — this is inlined
	// in a <script> tag, not loaded as an ES module.
	const jsContent = readFileSync(path.join(templateDir, "dashboard.js"), "utf8")
		.split("\n")
		.filter(
			(line) =>
				line.trim() !== '"use strict";' &&
				line.trim() !== "export {};" &&
				!line.startsWith("//# sourceMappingURL="),
		)
		.join("\n")
		.trimEnd();
	const ejsTemplate = readFileSync(templatePath, "utf8");

	return ejs.render(ejsTemplate, {
		...vars,
		cssContent,
		jsContent,
	});
}
