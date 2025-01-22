/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid/minimal-deprecated"),
		"prettier",
		"../../.eslintrc.cjs",
	],
	rules: {
		"@typescript-eslint/no-use-before-define": "off",
		"@typescript-eslint/restrict-plus-operands": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",
		"no-case-declarations": "off",
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",
	},
};
