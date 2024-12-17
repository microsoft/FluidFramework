/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// NOTE: this file isn't recognized by eslint automatically in this location.
// Packages that want to leverage it should extend from it in their local
// `.eslintrc.cjs` and normally after other configurations; so that these
// rules get priority.

module.exports = {
	rules: {
		/**
		 * Allow Fluid Framework examples to import from unstable and legacy APIs.
		 * https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-internal-modules.md
		 */
		"import/no-internal-modules": [
			"error",
			{
				allow: [
					// Allow import of Fluid Framework external API exports.
					"@fluidframework/*/{beta,alpha,legacy}",

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
				],
			},
		],
	},
};
