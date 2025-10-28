/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/recommended"), "prettier"],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				// TODO: remove these overrides and fix violations
				"@typescript-eslint/explicit-function-return-type": "off",
				"unicorn/consistent-function-scoping": "off",

				// Test files are run in node only so additional node libraries can be used.
				"import/no-nodejs-modules": ["error", { allow: ["node:assert", "node:crypto"] }],
			},
		},
	],
};
