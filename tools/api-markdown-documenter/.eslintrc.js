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
