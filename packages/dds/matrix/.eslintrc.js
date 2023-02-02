/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/minimal"), "prettier"],

	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		"@typescript-eslint/no-shadow": "off",
		"space-before-function-paren": "off", // Off because it conflicts with typescript-formatter

		// This library is used in the browser, so we don't want dependencies on most node libraries.
		"import/no-nodejs-modules": ["error", { allow: ["events"] }],
	},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				// Test files are run in node only so additional node libraries can be used.
				"import/no-nodejs-modules": ["error", { allow: ["assert", "events"] }],
			},
		},
	],
};
