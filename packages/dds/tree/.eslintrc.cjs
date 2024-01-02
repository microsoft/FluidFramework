/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/minimal"), "prettier"],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		"@typescript-eslint/no-namespace": "off",
		"@typescript-eslint/no-empty-interface": "off",
		"@typescript-eslint/explicit-member-accessibility": "error",
		// This package is build with noUnusedLocals disabled for a specific use case (see note in tsconfig.json),
		// but should reject other cases using this rule:
		"@typescript-eslint/no-unused-vars": [
			"error",
			{
				argsIgnorePattern: "^",
				varsIgnorePattern: "^_",
				caughtErrorsIgnorePattern: "^_",
			},
		],
		"import/no-internal-modules": [
			"error",
			{
				// Allow imports from sibling and ancestral sibling directories,
				// but not from cousin directories. Parent is allowed but only
				// because there isn't a known way to deny it.
				allow: ["*/index.js"],
			},
		],
	},
	overrides: [
		{
			files: ["src/test/**/*"],
			rules: {
				"@typescript-eslint/no-unused-vars": ["off"],
			},
		},
	],
};
