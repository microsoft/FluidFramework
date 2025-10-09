/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid/minimal-deprecated"),
		"prettier",
	],
	rules: {
		"import/no-nodejs-modules": "off",
		"promise/catch-or-return": ["error", { allowFinally: true }],

		// TODO: remove this override and fix violations
		"@typescript-eslint/strict-boolean-expressions": "warn",

		// TODO: remove usages of deprecated APIs and remove this override
		"import/no-deprecated": "warn",
	},
};
