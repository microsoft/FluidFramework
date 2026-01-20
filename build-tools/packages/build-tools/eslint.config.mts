/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { baseConfig } from "../../eslint.config.base.mts";

export default [
	...baseConfig,
	// Ignore test data files
	{
		ignores: ["src/test/data/**"],
	},
	{
		rules: {
			// TODO: Enable these ASAP
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",

			"@typescript-eslint/no-non-null-assertion": "error",

			// Allow empty object types for extending interfaces
			"@typescript-eslint/no-empty-object-type": "off",

			// Allow require imports for dynamic loading
			"@typescript-eslint/no-require-imports": "off",

			// Rules that require code changes - disable for now
			"@typescript-eslint/class-literal-property-style": "off",
			"@typescript-eslint/return-await": "off",
			"@typescript-eslint/dot-notation": "off",
			"@typescript-eslint/no-restricted-imports": "off",
			"@typescript-eslint/no-misused-promises": "off",
			"@typescript-eslint/await-thenable": "off",
			"@typescript-eslint/prefer-string-starts-ends-with": "off",
			"@typescript-eslint/prefer-includes": "off",
			"@typescript-eslint/no-dynamic-delete": "off",
			"@typescript-eslint/prefer-for-of": "off",
			"@typescript-eslint/only-throw-error": "off",
			"@typescript-eslint/restrict-plus-operands": "off",
			"@typescript-eslint/no-extraneous-class": "off",
			"unicorn/prefer-ternary": "off",
			"unicorn/better-regex": "off",
			"jsdoc/check-indentation": "off",
			"@eslint-community/eslint-comments/no-unused-disable": "off",
			"@eslint-community/eslint-comments/no-unlimited-disable": "off",

			// Base ESLint rules that require code changes
			"guard-for-in": "off",
			"no-restricted-syntax": "off",
			"eqeqeq": "off",
			"no-param-reassign": "off",
			"no-undef-init": "off",
			"default-case": "off",
			"radix": "off",
		},
	},
	// Enable switch-exhaustiveness-check only for TS files (not .d.ts which lack type info)
	{
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		ignores: ["**/*.d.ts"],
		rules: {
			"@typescript-eslint/switch-exhaustiveness-check": "error",
		},
	},
];
