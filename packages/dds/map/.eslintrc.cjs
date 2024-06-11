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
		"@typescript-eslint/no-use-before-define": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",

		// TODO: consider re-enabling once we have addressed how this rule conflicts with our error codes.
		"unicorn/numeric-separators-style": "off",
	},
	overrides: [
		{
			files: ["src/test/**"],
			rules: {
				// Allow tests (which only run in Node.js) use `__dirname`
				"unicorn/prefer-module": "off",
			},
		},
	],
};
