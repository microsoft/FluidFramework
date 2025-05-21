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
		"@typescript-eslint/no-floating-promises": "off",
		"@typescript-eslint/no-use-before-define": "off",
		"no-case-declarations": "off",
		"promise/catch-or-return": ["error", { allowFinally: true }],

		// TODO: enable strict null checks in tsconfig and remove these overrides
		"@typescript-eslint/prefer-nullish-coalescing": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",

		// TODO: remove usages of deprecated APIs and remove this override
		"import/no-deprecated": "warn",

		// TODO: fix violations and remove this override
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",
	},
};
