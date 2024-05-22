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
