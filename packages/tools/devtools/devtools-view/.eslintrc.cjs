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

					// Allow use of internal API
					"@fluid-experimental/devtools-core/internal",
					"*/index.js",
				],
			},
		],

		// Forbid new imports from legacy FluentUI react package.
		// We have a couple of components that still use it, but new usages should not be added without due consideration.
		"no-restricted-imports": ["error", "@fluentui/react"],
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
			files: ["src/screenshot-tests/**"],
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
		"react": {
			version: "detect",
		},
		"import/extensions": [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
		"import/parsers": {
			"@typescript-eslint/parser": [".ts", ".tsx", ".d.ts"],
		},
		"import/resolver": {
			node: {
				extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
			},
			typescript: {
				alwaysTryTypes: true, // always try to resolve types under `<root>@types` directory even it doesn't contain any source code, like `@types/unist`

				// Choose from one of the "project" configs below or omit to use <root>/tsconfig.json by default

				// use <root>/path/to/folder/tsconfig.json
				// "project": "path/to/folder",

				// Multiple tsconfigs (Useful for monorepos)

				// use a glob pattern
				// "project": "packages/*/tsconfig.json",

				// use an array
				// "project": [
				//   "packages/module-a/tsconfig.json",
				//   "packages/module-b/tsconfig.json"
				// ],

				// use an array of glob patterns
				// "project": [
				//   "packages/*/tsconfig.json",
				//   "other-packages/*/tsconfig.json"
				// ]
			},
		},
	},
};
