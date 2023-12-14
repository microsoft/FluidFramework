/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/minimal"), "prettier"],
	rules: {
		"@typescript-eslint/consistent-type-assertions": "off",
		"@typescript-eslint/no-unsafe-return": "off",
		"@typescript-eslint/no-use-before-define": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",
		"import/no-nodejs-modules": "off",
		"no-case-declarations": "off",
		"promise/catch-or-return": ["error", { allowFinally: true }],
	},
};
