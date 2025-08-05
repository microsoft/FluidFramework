/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid"), "prettier"],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		// TODO: remove these overrides and fix violations
		"@typescript-eslint/no-non-null-assertion": "off",
		"@typescript-eslint/no-use-before-define": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",

		// This library uses and serializes "utf-8".
		"unicorn/text-encoding-identifier-case": "off",
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",

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
			// Rules only for test files
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				// It's valuable for tests to validate handling of `null` values, regardless of our API policies.
				"unicorn/no-null": "off",

				// Fine for tests to use `__dirname`
				"unicorn/prefer-module": "off",
			},
		},
	],
};
