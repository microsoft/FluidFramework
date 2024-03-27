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
		project: [
			"./tsconfig.esm.json",
			"./src/test/jest/tsconfig.esm.json",
			"./src/test/screenshot/tsconfig.json",
			"./src/test/utils/tsconfig.esm.json",
		],
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
					// - Copied allowances from @fluidframework/eslint-config-fluid/strict -
					// Within Fluid Framework allow import of '/internal' from other FF packages.
					"@fluidframework/*/internal",
					// Allow imports from sibling and ancestral sibling directories,
					// but not from cousin directories. Parent is allowed but only
					// because there isn't a known way to deny it.
					"*/index.js",

					// Allow use of unstable API
					"@fluentui/react-components/unstable",
				],
			},
		],

		// Forbid new imports from legacy FluentUI react package.
		// We have a couple of components that still use it, but new usages should not be added without due consideration.
		"no-restricted-imports": ["error", "@fluentui/react"],
	},
	overrides: [
		{
			// Overrides for jest test files
			files: ["src/test/jest/**"],
			plugins: ["jest"],
			extends: ["plugin:jest/recommended"],
			rules: {
				"import/no-nodejs-modules": "off",
				"unicorn/prefer-module": "off",
			},

			// Overrides for screenshot tests
			files: ["src/test/screenshot/**"],
			rules: {
				// Default exports are used by "Storybook" modules to describe test scenarios
				"import/no-default-export": "off",

				// previewjs doesn't handle imports from roll-up modules well.
				// Screenshot tests import components directly from their source module.
				"import/no-internal-modules": "off",

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
