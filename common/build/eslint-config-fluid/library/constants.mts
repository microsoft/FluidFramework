/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Shared constants for ESLint configuration.
 *
 * This module contains reusable constant values used across multiple config files:
 * - permittedImports: Allowed import patterns for the import-x/no-internal-modules rule
 * - restrictedImportPaths: Import paths that should be restricted
 * - restrictedImportPatternsForProductionCode: Import patterns restricted in production code
 * - restrictedSyntax: Selectors for the no-restricted-syntax rule
 * - testFilePatterns: Glob patterns for identifying test files
 * - globalIgnores: Global ignore patterns for ESLint
 */

import type { Linter } from "eslint";

/**
 * Shared list of permitted imports for configuring the `import-x/no-internal-modules` rule.
 *
 * @remarks
 * All `@fluid-` scopes could probably allow `/**` as entrypoint structuring rules do
 * NOT apply. Currently only known uses of structured imports are from -internal scope;
 * so, no broad allowances are stated.
 */
export const permittedImports = [
	// Within Fluid Framework allow import of '/internal' from other FF packages.
	// Note that `/internal/test**` is still restricted (disallowed) but uses
	// customCondition of "allow-ff-test-exports" for enforcement.
	"@fluidframework/*/internal{,/**}",

	// Experimental package APIs and exports are unknown, so allow any imports from them.
	"@fluid-experimental/**",

	// Internal packages may structure their exports arbitrarily, so allow any imports from them.
	"@fluid-internal/**",

	// Allow imports from sibling and ancestral sibling directories,
	// but not from cousin directories. Parent is allowed but only
	// because there isn't a known way to deny it.
	"*/index.js",
] as const;

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
] as const;

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
] as const;

/**
 * Restricted syntax selectors for the `no-restricted-syntax` rule.
 *
 * @remarks
 * ESLint does not merge multiple `no-restricted-syntax` configurations: when more than one
 * config in the resolved chain sets the rule, only the last one wins (its options array replaces
 * earlier ones rather than concatenating). Packages that need to add their own selectors must
 * therefore re-include these base selectors alongside their additions. Exporting them here lets
 * downstream configs spread them in (`[...restrictedSyntax, myExtraSelector]`) instead of
 * hand-copying.
 */
export const restrictedSyntax = [
	{
		selector: "ExportAllDeclaration",
		message:
			"Exporting * is not permitted. You should export only named items you intend to export.",
	},
	"ForInStatement",
] as const;

/**
 * Test file patterns for identifying test files.
 */
export const testFilePatterns = ["*.spec.ts", "*.test.ts", "**/test/**", "**/tests/**"] as const;

/**
 * Global ignore patterns for ESLint.
 */
export const globalIgnores = {
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

		// Mocha config files (must be CommonJS, not compatible with TS-focused linting)
		"**/.mocharc*.cjs",
	],
} as const satisfies Linter.Config;
