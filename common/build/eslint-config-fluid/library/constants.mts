/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";

/**
 * Shared list of permitted imports for configuring the `import-x/no-internal-modules` rule.
 */
export const permittedImports = [
	// Within Fluid Framework allow import of '/internal' from other FF packages.
	"@fluid-example/*/internal",
	"@fluid-experimental/*/internal",
	"@fluid-internal/*/internal",
	"@fluid-private/*/internal",
	"@fluid-tools/*/internal",
	"@fluidframework/*/internal",

	// Allow /legacy imports for backwards compatibility during API transition
	"@fluid-example/*/legacy",
	"@fluid-experimental/*/legacy",
	"@fluid-internal/*/legacy",
	"@fluid-private/*/legacy",
	"@fluid-tools/*/legacy",
	"@fluidframework/*/legacy",

	// Experimental package APIs and exports are unknown, so allow any imports from them.
	"@fluid-experimental/**",

	// Allow imports from sibling and ancestral sibling directories,
	// but not from cousin directories. Parent is allowed but only
	// because there isn't a known way to deny it.
	"*/index.js",
];

/**
 * Restricted import paths for all code.
 */
export const restrictedImportPaths = [
	// Prefer strict assertions
	// See: <https://nodejs.org/api/assert.html#strict-assertion-mode>
	{
		name: "assert",
		importNames: ["default"],
		message: 'Use `strict` instead. E.g. `import { strict as assert } from "node:assert";`',
	},
	{
		name: "node:assert",
		importNames: ["default"],
		message: 'Use `strict` instead. E.g. `import { strict as assert } from "node:assert";`',
	},
];

/**
 * Restricted import patterns for production code.
 * Not applied to test code.
 */
export const restrictedImportPatternsForProductionCode = [
	// Don't import from the parent index file.
	{
		group: ["./index.js", "**/../index.js"],
		message:
			"Importing from a parent index file tends to cause cyclic dependencies. Import from a more specific sibling file instead.",
	},
];

/**
 * Test file patterns for identifying test files.
 */
export const testFilePatterns = ["*.spec.ts", "*.test.ts", "**/test/**", "**/tests/**"];

/**
 * Global ignore patterns for ESLint.
 */
export const globalIgnores: Linter.Config = {
	ignores: [
		// Build output directories
		"**/dist/**",
		"**/lib/**",
		"**/build/**",

		// Dependencies
		"**/node_modules/**",

		// Generated files
		"**/packageVersion.ts",
		"**/layerGenerationState.ts",
		"**/*.generated.ts",
		"**/*.generated.js",

		// Common non-source directories
		"**/coverage/**",
		"**/.nyc_output/**",
	],
};
