/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid/recommended"),
		"prettier",
		"../../.eslintrc.cjs",
	],
	parserOptions: {
		project: ["./tsconfig.json"],
	},
	rules: {
		// TODO: AB#18875 - Re-enable react/no-deprecated once we replace uses of the deprecated ReactDOM.render()
		// with the new React 18 createRoot().
		"react/no-deprecated": "off",
	},
};
