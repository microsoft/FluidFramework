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
		project: ["./tsconfig.json"],
	},
	rules: {
		"import-x/no-nodejs-modules": "off",

		// Disabled because the rule is crashing on this package - AB#51780
		"@typescript-eslint/unbound-method": "off",
	},
};
