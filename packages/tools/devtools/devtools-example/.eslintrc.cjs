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
		"import/no-extraneous-dependencies": "off",

		// TODO: AB#18875 - Re-enable react/no-deprecated once we replace uses of the deprecated ReactDOM.render()
		// with the new React 18 createRoot().
		"react/no-deprecated": "off",
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",
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
		},
	],
	settings: {
		react: {
			version: "detect",
		},
	},
};
