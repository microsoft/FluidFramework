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

		// TODO: remove usages of deprecated APIs and remove these overrides
		"import/no-deprecated": "warn",

		// TODO: fix violations and remove these overrides
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",
		"@typescript-eslint/strict-boolean-expressions": "warn",
	},
};
