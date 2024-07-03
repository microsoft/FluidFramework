/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/recommended"), "prettier"],
	rules: {
		/**
		 * Allow Fluid Framework examples to import from unstable APIs.
		 * https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-internal-modules.md
		 */
		"import/no-internal-modules": [
			"error",
			{
				allow: [
					// Within Fluid Framework allow import of '/beta' from other FF packages.
					"@fluidframework/*/beta",

					// Experimental package APIs and exports are unknown, so allow any imports from them.
					"@fluid-experimental/**",

					// Allow imports from sibling and ancestral sibling directories,
					// but not from cousin directories. Parent is allowed but only
					// because there isn't a known way to deny it.
					"*/index.js",
				],
			},
		],
	},
};
