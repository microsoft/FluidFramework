/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid"), "prettier"],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		"@typescript-eslint/strict-boolean-expressions": "off",

		// This library is used in the browser, so we don't want dependencies on most node libraries.
		"import/no-nodejs-modules": ["error", { allow: ["events"] }],
	},
	overrides: [
		{
			files: ["src/test/**"],
			rules: {
				// It's fine for tests to use Node.js modules
				"import/no-nodejs-modules": "off",
			},
		},
	],
};
