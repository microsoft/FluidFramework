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
		// Useful for developer accessibility
		"unicorn/prevent-abbreviations": [
			"error",
			{
				allowList: {
					// Industry-standard index variable name.
					i: true,

					// Existing export - renaming would be a breaking change.
					// Leaving this alone for now, but this can be reconsidered in the future.
					AzureClientProps: true,
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
