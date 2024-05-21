/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/strict"), "prettier"],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	overrides: [
		{
			// Overrides for tests
			files: ["src/test/*.spec.ts"],
			rules: {
				// Mocha tests should prefer regular functions, see https://mochajs.org/#arrow-functions
				"prefer-arrow-callback": "off",
			},
		},
	],
};
