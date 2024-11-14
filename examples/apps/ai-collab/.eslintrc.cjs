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

					// NextJS requires reaching to its internal modules
					"next/**",

					// Path aliases
					"@/actions/**",
					"@/types/**",
					"@/components/**",

					// Experimental package APIs and exports are unknown, so allow any imports from them.
					"@fluidframework/ai-collab/alpha",
				],
			},
		],
		// This is an example/test app; all its dependencies are dev dependencies so as not to pollute the lockfile
		// with prod dependencies that aren't actually shipped. So don't complain when importing from dev dependencies.
		"import/no-extraneous-dependencies": ["error", { devDependencies: true }],
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
