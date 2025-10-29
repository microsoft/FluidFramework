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
		// Disabled because the rule is crashing on this package - AB#51780
		"@typescript-eslint/unbound-method": "off",
	},
};
