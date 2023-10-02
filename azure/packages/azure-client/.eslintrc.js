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
				},
				ignore: [
					// "props" has become something of an industry standard abbreviation for "properties".
					// Allow names to include "props" / "Props".
					"[pP]rops",
				],
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
