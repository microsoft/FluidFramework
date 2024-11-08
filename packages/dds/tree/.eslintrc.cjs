/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid"),
		"prettier",
	],
	parserOptions: {
		project: ["./tsconfig.json"],
	},
	rules: {
		"@typescript-eslint/no-namespace": "off",
		"@typescript-eslint/no-empty-interface": "off",

		// This package is build with noUnusedLocals disabled for a specific use case (see note in tsconfig.json),
		// but should reject other cases using this rule:
		"@typescript-eslint/no-unused-vars": [
			"error",
			{
				argsIgnorePattern: "^",
				varsIgnorePattern: "^_",
				caughtErrorsIgnorePattern: "^_",
			},
		],

		// TODO: Remove this override once dependency on eslint-config-fluid has been updated to 5.2.0+
		"import/order": "off",

		// #region TODO: Remove these overrides once this config has been updated to extend the "strict" base config.

		"@typescript-eslint/explicit-member-accessibility": "error",
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

		// #region TODO:AB#6983: Remove these overrides and fix violations

		"@typescript-eslint/explicit-module-boundary-types": "off",

		// Causes eslint to stack-overflow in this package. Will need investigation.
		"@typescript-eslint/no-unsafe-argument": "off",

		// Causes eslint to stack-overflow in this package. Will need investigation.
		"@typescript-eslint/no-unsafe-assignment": "off",

		"@typescript-eslint/no-unsafe-call": "off",
		"@typescript-eslint/no-unsafe-member-access": "off",

		"jsdoc/require-description": "warn",

		"unicorn/explicit-length-check": "off",
		"unicorn/no-array-callback-reference": "off",
		"unicorn/no-array-for-each": "off",
		"unicorn/no-array-reduce": "off",
		"unicorn/no-lonely-if": "off",
		"unicorn/no-negated-condition": "off",
		"unicorn/no-null": "off",
		"unicorn/prefer-default-parameters": "off",
		"unicorn/prefer-export-from": "off",
		"unicorn/prefer-set-has": "off",
		"unicorn/text-encoding-identifier-case": "off",

		// #endregion
	},
	overrides: [
		{
			files: ["src/test/**/*"],
			parserOptions: {
				project: ["./src/test/tsconfig.json"],
			},
			rules: {
				"@typescript-eslint/no-unused-vars": ["off"],
				"@typescript-eslint/explicit-function-return-type": "off",
			},
		},
		// TODO: Remove this override once this config has been updated to extend at least the "recommended" base config.
		{
			files: ["src/test/**/*.generated.ts*"],
			rules: {
				"@typescript-eslint/no-explicit-any": ["off"],
			},
		},
	],
	settings: {
		"import/extensions": [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
		"import/parsers": {
			"@typescript-eslint/parser": [".ts", ".tsx", ".d.ts"],
		},
		"import/resolver": {
			typescript: {
				extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
				conditionNames: [
					"allow-ff-test-exports",

					// Default condition names below, see https://www.npmjs.com/package/eslint-import-resolver-typescript#conditionnames
					"types",
					"import",

					// APF: https://angular.io/guide/angular-package-format
					"esm2020",
					"es2020",
					"es2015",

					"require",
					"node",
					"node-addons",
					"browser",
					"default",
				],
			},
		},
	},
};
