/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	plugins: ["react", "react-hooks"],
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid/strict"),
		"plugin:react/recommended",
		"plugin:react-hooks/recommended",
		"prettier",
	],
	parserOptions: {
		project: ["./tsconfig.esm.json", "./src/test/tsconfig.esm.json"],
	},
	rules: {
		// Disabled because they disagrees with React common patterns / best practices.
		"@typescript-eslint/unbound-method": "off",
		"unicorn/consistent-function-scoping": "off",
		"@fluid-internal/fluid/no-unchecked-record-access": "error",

		// Disabled because they conflict with Prettier.
		"unicorn/no-nested-ternary": "off",

		/**
		 * TODO: remove this override once dependency on base config has been updated
		 * (newer versions will have this rule disabled).
		 */
		"unicorn/no-useless-undefined": "off",

		// Forbid new imports from legacy FluentUI react package.
		// We have a couple of components that still use it, but new usages should not be added without due consideration.
		"no-restricted-imports": ["error", "@fluentui/react"],

		// Allow unassigned imports for testing-library/jest-dom
		"import/no-unassigned-import": [
			"error",
			{
				allow: ["@testing-library/jest-dom"],
			},
		],
	},
	overrides: [
		{
			// Overrides for jest test files
			files: ["src/test/**"],
			plugins: ["jest"],
			extends: ["plugin:jest/recommended"],
			rules: {
				"import/no-nodejs-modules": "off",
				"unicorn/prefer-module": "off",
				"import/no-internal-modules": "off",
			},
		},
		{
			// Overrides for screenshot tests
			files: ["src/test/screenshot/**"],
			rules: {
				// Default exports are used by "Storybook" modules to describe test scenarios
				"import/no-default-export": "off",

				// Fine for tests
				"import/no-nodejs-modules": "off",
				"import/no-extraneous-dependencies": "off",
			},
		},
	],
	settings: {
		react: {
			version: "detect",
		},
	},
};
