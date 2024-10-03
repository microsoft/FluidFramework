/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/recommended"), "prettier"],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
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
					// "*/index.js",
				],
			},
		],
	},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				// Test files are run in node only so additional node libraries can be used.
				"import/no-nodejs-modules": ["error", { allow: ["node:assert"] }],
			},
		},
		{
			// Rules only for test files
			files: ["actions/task.ts"],
			rules: {
				// This file runs on server side
				"import/no-nodejs-modules": ["error", { allow: ["node:fs", "node:path"] }],
			},
		},
	],
};
