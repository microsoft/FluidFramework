/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/minimal"), "prettier"],
	rules: {
		"@typescript-eslint/prefer-nullish-coalescing": "off", // requires strictNullChecks
		"@typescript-eslint/strict-boolean-expressions": "off",
		"import/no-deprecated": "off", // This package often uses deprecated APIs because it's used to replay ops from older versions of the runtime
		"import/no-nodejs-modules": "off",
		"no-case-declarations": "off",
	},
};
