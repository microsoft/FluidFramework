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
		project: ["./tsconfig.json"],
	},
	rules: {
		// Disabled because they disagrees with React common patterns / best practices.
		"@typescript-eslint/unbound-method": "off",
		"unicorn/consistent-function-scoping": "off",

		// Disabled because they conflict with Prettier.
		"unicorn/no-nested-ternary": "off",

		/**
		 * TODO: remove this override once dependency on base config has been updated
		 * (newer versions will have this rule disabled).
		 */
		"unicorn/no-useless-undefined": "off",

		"import/no-internal-modules": [
			"error",
			{
				allow: [
					// Allow use of unstable API
					"@fluentui/react-components/unstable",
				],
			},
		],
	},
	overrides: [
		{
			// Overrides for test files
			files: ["src/**/*.spec.ts", "src/**/*.test.ts", "src/**/test/**"],
			plugins: ["jest"],
			extends: ["plugin:jest/recommended"],
			rules: {
				"import/no-nodejs-modules": "off",
				"unicorn/prefer-module": "off",
			},

			// Overrides for screenshot tests
			files: ["src/**/test/screenshot-tests/**"],
			rules: {
				// Default exports are used by "Storybook" modules to describe test scenarios
				"import/no-default-export": "off",

				// previewjs doesn't handle imports from roll-up modules well.
				// Screenshot tests import components directly from their source module.
				"import/no-internal-modules": "off",
			},
		},
	],
	settings: {
		react: {
			version: "detect",
		},
	},
};
