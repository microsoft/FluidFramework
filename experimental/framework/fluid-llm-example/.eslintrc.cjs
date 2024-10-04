/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/recommended"), "prettier"],
	parserOptions: {
		project: ["./tsconfig.json"],
	},
	rules: {
		"import/no-internal-modules": [
			"error",
			{
				allow: [
					"@fluidframework/odsp-client/beta",
					"@fluidframework/tree/alpha",

					// NextJS shenanigans
					"@/actions/**",
					"@/types/**",
					"@/components/**",

					// Experimental package APIs and exports are unknown, so allow any imports from them.
					"@fluid-experimental/**",
				],
			},
		],
	},
	overrides: [
		{
			// Rules only for test files
			files: ["src/actions/task.ts"],
			rules: {
				// This file runs on server side
				"import/no-nodejs-modules": ["error", { allow: ["node:fs", "node:path", "node:url"] }],
			},
		},
	],
};
