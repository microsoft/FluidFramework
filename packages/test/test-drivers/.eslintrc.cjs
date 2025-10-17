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
		"import/no-nodejs-modules": "off",

		// FIXME: This rule is crashing on this package - disable until fixed
		"@typescript-eslint/unbound-method": "off",
	},
};
