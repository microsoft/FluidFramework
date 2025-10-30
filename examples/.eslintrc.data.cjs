/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// To facilitate reuse of configuration elements this module exports some
// pieces of configuration and composed configuration.

const importInternalModulesAllowed = [
	// Allow import of Fluid Framework external API exports.
	"@fluidframework/*/{beta,alpha,legacy}",
	"fluid-framework/{beta,alpha,legacy}",

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

const importInternalModulesAllowedForTest = importInternalModulesAllowed.concat([
	// TODO #26906: `test-utils` internal used in examples (test)
	// Should `test-utils` provide support through `/test-utils` instead of `/internal`?
	"@fluidframework/test-utils/internal",

	// Allow internal reaching within test directories.
	// (And also some external packages that aren't setup as modules.)
	"*/*.js",
]);

const lintConfig = {
	rules: {
		/**
		 * Allow Fluid Framework examples to import from unstable and legacy APIs.
		 * https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-internal-modules.md
		 */
		"import/no-internal-modules": [
			"error",
			{
				allow: importInternalModulesAllowed,
			},
		],
	},
	overrides: [
		{
			files: ["*.spec.ts", "src/test/**", "tests/**"],
			rules: {
				"import/no-internal-modules": [
					"error",
					{
						allow: importInternalModulesAllowedForTest,
					},
				],
			},
		},
	],
};

module.exports = {
	importInternalModulesAllowed: importInternalModulesAllowed,
	importInternalModulesAllowedForTest: importInternalModulesAllowedForTest,
	lintConfig: lintConfig,
};
