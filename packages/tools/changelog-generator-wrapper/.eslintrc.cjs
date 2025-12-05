/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	plugins: ["@typescript-eslint"],
	extends: [
		// eslint-disable-next-line node/no-extraneous-require
		require.resolve("@fluidframework/eslint-config-fluid"),
		"prettier",
	],
	parserOptions: {
		project: "./tsconfig.lint.json",
	},
	rules: {
		// TODO: this package should really extend some base JS config, and not pull in TS-specific rules.
		// For now, TS rules are disabled below.
		"@typescript-eslint/no-require-imports": "off",
		"@typescript-eslint/no-var-requires": "off",
		"@typescript-eslint/explicit-function-return-type": "off",
		"unicorn/prefer-module": "off",

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
};
