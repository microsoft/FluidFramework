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
		// Disabled because they disagrees with React common patterns / best practices.
		"@typescript-eslint/unbound-method": "off",
		"unicorn/consistent-function-scoping": "off",

		// Disabled because it conflicts with Prettier.
		"unicorn/no-nested-ternary": "off",

		// Prevent imports from undeclared dependencies / dev dependencies, but allow imports from
		// dev dependencies in test code.
		// TODO: Remove this override once the base config is more flexible around where test code
		// lives in a package.
		"import/no-extraneous-dependencies": [
			"error",
			{
				devDependencies: ["src/**/test/**"],
			},
		],
	},
	overrides: [
		{
			// Overrides for test files
			files: ["*.spec.ts", "*.test.ts", "src/test/**"],
			plugins: ["jest"],
			extends: ["plugin:jest/recommended"],
			rules: {
				"import/no-nodejs-modules": "off",
				"unicorn/prefer-module": "off",
			},
		},
	],
};
