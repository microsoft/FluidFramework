/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid")],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		"@typescript-eslint/strict-boolean-expressions": "off",
		// This package implements test utils to be run under Node.JS.
		"import/no-nodejs-modules": "off",
		"max-len": "off", // Many hits when moving away from eslint-config-prettier. Should be addressed at some point.

		// #region TODO: remove these once eslint-config-fluid has been updated to 5.8.0
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
	overrides: [
		{
			files: ["src/test/types/*"],
			rules: {
				"max-len": "off",
			},
		},
	],
};
