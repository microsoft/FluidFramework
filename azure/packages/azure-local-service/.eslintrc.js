/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/strict"), "prettier"],
	parserOptions: {
		project: ["./tsconfig.json"],
	},
	rules: {
		// Useful for developer accessibility
		"unicorn/prevent-abbreviations": [
			"error",
			{
				allowList: {
					// Industry-standard index variable name.
					i: true,
				},
			},
		],
	},
	overrides: [
		{
			// Overrides for type-tests
			files: ["src/test/types/*"],
			rules: {
				"unicorn/prevent-abbreviations": "off",
			},
		},
	],
};
