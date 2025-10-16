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
		// FIXME: This rule is crashing on this package - disable until fixed
		"@typescript-eslint/unbound-method": "off",
	},
};
