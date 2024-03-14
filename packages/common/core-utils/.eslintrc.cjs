/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/strict"), "prettier"],

	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		// This has been disabled in the next eslint-config-fluid.
		// Once the dependency here has been updated, this override can be removed.
		"unicorn/numeric-separators-style": "off",
	},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "*.test.ts", "src/test/**"],
			rules: {
				// Test files are run in node only so additional node libraries can be used.
				"import/no-nodejs-modules": ["error", { allow: ["node:assert", "node:process"] }],

				// TODO: This rule is disabled in version 5.2+ of the eslint config, so can be removed when we update to 5.2+.
				"import/order": "off",

				// Does not work well with describe/it block scoping
				"unicorn/consistent-function-scoping": "off",
			},
		},
	],
};
