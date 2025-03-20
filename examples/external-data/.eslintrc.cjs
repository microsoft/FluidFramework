/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { importInternalModulesAllowedForTest } = require("../.eslintrc.data.cjs");

module.exports = {
	plugins: ["react", "react-hooks"],
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid"),
		"plugin:react/recommended",
		"plugin:react-hooks/recommended",
		"prettier",
		"../.eslintrc.cjs",
	],
	rules: {
		"import/no-nodejs-modules": ["error", { allow: ["node:http"] }],
		// TODO: AB#18875 - Re-enable react/no-deprecated once we replace uses of the deprecated ReactDOM.render()
		// with the new React 18 createRoot().
		"react/no-deprecated": "off",
	},
	overrides: [
		{
			files: ["tests/**"],
			rules: {
				// Fine for tests to import from dev dependencies
				"import/no-extraneous-dependencies": ["error", { devDependencies: true }],

				// Since the "tests" directory is adjacent to "src", and this package (intentionally) does not expose
				// a single exports roll-up, reaching into "src" is required.
				"import/no-internal-modules": [
					"error",
					{ allow: importInternalModulesAllowedForTest.concat(["*/src/*/*.js"]) },
				],

				// Fine for tests to use node.js modules.
				// Tests will ensure our webpack configuration is correctly set up to support any that we use.
				"import/no-nodejs-modules": "off",
			},
		},
	],
	settings: {
		react: {
			version: "detect",
		},
	},
};
