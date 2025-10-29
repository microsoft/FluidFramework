/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid/minimal-deprecated"),
		"prettier",
	],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		"@typescript-eslint/no-non-null-assertion": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",
		"no-case-declarations": "off",
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",

		// Disabled because the rule is crashing on this package - AB#51780
		"@typescript-eslint/unbound-method": "off",
	},
};
