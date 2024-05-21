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
				// Exact variable name checks.
				// See: https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prevent-abbreviations.md#allowlist
				allowList: {
					// Industry-standard index variable name.
					i: true,
				},

				// RegEx-based exclusions
				// See: https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prevent-abbreviations.md#ignore
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
