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
		// Disabled because they conflict with Prettier.
		"unicorn/no-nested-ternary": "off",

		// Disabled because it is incompatible with API-Extractor.
		"@typescript-eslint/no-namespace": "off",
	},
	overrides: [
		{
			// Overrides for test files
			files: ["src/test/**"],
			plugins: ["chai-expect"],
			extends: ["plugin:chai-expect/recommended"],
			rules: {
				"import/no-nodejs-modules": "off",
				"unicorn/prefer-module": "off",

				// Superceded by chai-expect rule
				"@typescript-eslint/no-unused-expressions": "off",
			},
		},
	],
};
