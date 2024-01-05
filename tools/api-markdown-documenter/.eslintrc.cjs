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
		// Rule is reported in a lot of places where it would be invalid to follow the suggested pattern
		"@typescript-eslint/class-literal-property-style": "off",

		// Comparing general input strings against system-known values (via enums) is used commonly to support
		// extensibility.
		"@typescript-eslint/no-unsafe-enum-comparison": "off",

		/**
		 * This package utilizes internals of api-documenter that are not exported by the package root.
		 *
		 * TODO: remove once we have completely migrated off of this library.
		 */
		"import/no-internal-modules": [
			"error",
			{
				allow: ["@microsoft/api-documenter/**"],
			},
		],

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
