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
		// This library is used in the browser, so we don't want dependencies on most node libraries.
		"import/no-nodejs-modules": ["error", { allow: ["child_process", "fs", "util"] }],

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
