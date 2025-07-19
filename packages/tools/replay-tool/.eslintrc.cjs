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
		"@typescript-eslint/prefer-nullish-coalescing": "off", // requires strictNullChecks
		"@typescript-eslint/strict-boolean-expressions": "off",
		"import/no-deprecated": "off", // This package often uses deprecated APIs because it's used to replay ops from older versions of the runtime
		"import/no-nodejs-modules": "off",
		"no-case-declarations": "off",

		// #region TODO: remove these once this config has been updated to use our "recommended" base instead of our deprecated minimal one.
		"@typescript-eslint/consistent-type-exports": [
			"error",
			{ fixMixedExportsWithInlineTypeSpecifier: true },
		],
		"@typescript-eslint/consistent-type-imports": [
			"error",
			{ fixStyle: "inline-type-imports" },
		],
		"@typescript-eslint/no-import-type-side-effects": "error",
		// #endregion
	},
};
