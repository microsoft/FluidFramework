/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/minimal-deprecated")],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		"@typescript-eslint/prefer-nullish-coalescing": "off", // requires strictNullChecks
		"@typescript-eslint/strict-boolean-expressions": "off",
		"import/no-nodejs-modules": "off",
	},
	overrides: [
		{
			files: ["src/test/types/*"],
			rules: {
				"max-len": "off",
			},
		},
	],
};
