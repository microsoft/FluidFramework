/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Shared ESLint configuration for examples.
 * Extend this in child package eslint.config.mts files to avoid duplicating common rules.
 * Named exports (e.g., importInternalModulesAllowed) can be imported and extended by consumers.
 */

import type { Linter } from "eslint";

/**
 * Patterns allowed for internal module imports in examples.
 */
export const importInternalModulesAllowed: string[] = [
	// Allow import of Fluid Framework external API exports.
	"@fluidframework/*/{beta,alpha,legacy,legacy/alpha}",
	"fluid-framework/{beta,alpha,legacy,legacy/alpha}",

	// Experimental package APIs and exports are unknown, so allow any imports from them.
	"@fluid-experimental/**",

	// Within examples allow import of Fluid Framework non-production test-utils APIs.
	"@fluidframework/*/test-utils",

	// Within examples assume and allow a progressive API pattern (no legacy).
	"@fluid-example/*/{beta,alpha}",

	// Allow imports from sibling and ancestral sibling directories,
	// but not from cousin directories. Parent is allowed but only
	// because there isn't a known way to deny it.
	"*/index.js",
];

/**
 * Extended patterns for test files, including additional internal imports.
 */
export const importInternalModulesAllowedForTest: string[] = [
	...importInternalModulesAllowed,

	// TODO #26906: `test-utils` internal used in examples (test)
	// Should `test-utils` provide support through `/test-utils` instead of `/internal`?
	"@fluidframework/test-utils/internal",

	// Allow internal reaching within test directories.
	// (And also some external packages that aren't setup as modules.)
	"*/*.js",
];

const config: Linter.Config[] = [
	{
		rules: {
			/**
			 * Allow Fluid Framework examples to import from unstable and legacy APIs.
			 * @see https://github.com/import-js/eslint-plugin-import-x/blob/main/docs/rules/no-internal-modules.md
			 */
			"import-x/no-internal-modules": [
				"error",
				{
					allow: importInternalModulesAllowed,
				},
			],
		},
	},
	{
		files: ["*.spec.ts", "src/test/**", "tests/**"],
		rules: {
			"import-x/no-internal-modules": [
				"error",
				{
					allow: importInternalModulesAllowedForTest,
				},
			],
		},
	},
];

export default config;
