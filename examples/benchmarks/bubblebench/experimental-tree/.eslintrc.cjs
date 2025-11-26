/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid"),
		"prettier",
		"../../../.eslintrc.cjs",
	],
	rules: {
		// TODO: AB#18875 - Re-enable react/no-deprecated once we replace uses of the deprecated ReactDOM.render()
		// with the new React 18 createRoot().
		"react/no-deprecated": "off",

		// Causes eslint to stack-overflow. Given that this is testing a DDS we are no longer actively developing,
		// we can probably just ignore this until this package is eventually removed.
		"@typescript-eslint/no-unsafe-argument": "off",

		// TODO: fix violations and remove this override
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",
	},
};
