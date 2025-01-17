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
		// Too many false positives with array access
		"@fluid-internal/fluid/no-unchecked-record-access": "off",

		// Rule is reported in a lot of places where it would be invalid to follow the suggested pattern
		"@typescript-eslint/class-literal-property-style": "off",

		// Comparing general input strings against system-known values (via enums) is used commonly to support
		// extensibility.
		"@typescript-eslint/no-unsafe-enum-comparison": "off",

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

		"unicorn/prefer-module": "off",
		"unicorn/prefer-negative-index": "off",

		// TODO: remove this override once this rule has been disabled in the root config.
		"unicorn/no-array-push-push": "off",

		// This package is exclusively used in a Node.js context
		"import/no-nodejs-modules": "off",
	},
	overrides: [
		{
			// Overrides for test files
			files: ["src/**/test/**"],
			plugins: ["chai-expect", "chai-friendly"],
			extends: ["plugin:chai-expect/recommended", "plugin:chai-friendly/recommended"],
			rules: {
				"import/no-extraneous-dependencies": [
					"error",
					{
						devDependencies: true,
					},
				],

				// Handled by chai-friendly instead.
				"@typescript-eslint/no-unused-expressions": "off",
			},
		},
	],
};
