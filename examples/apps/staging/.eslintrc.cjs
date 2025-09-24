/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid"),
		"prettier",
		"../../.eslintrc.cjs",
	],
	rules: {
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",
		"@typescript-eslint/explicit-function-return-type": "off",
		"@typescript-eslint/explicit-module-boundary-types": "off",
	},
};
