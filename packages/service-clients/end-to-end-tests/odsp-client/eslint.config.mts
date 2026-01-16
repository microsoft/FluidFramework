/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "../../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
			"prefer-arrow-callback": "off",
			"@typescript-eslint/strict-boolean-expressions": "off", // requires strictNullChecks=true in tsconfig
			"import-x/namespace": "off",

			// #region TODO: remove these once this config has been updated to use our "recommended" base instead of our deprecated minimal one.
			"@typescript-eslint/consistent-type-imports": [
				"error",
				{
					fixStyle: "inline-type-imports",
				},
			],
			"@typescript-eslint/no-import-type-side-effects": "error",
			// #endregion
		},
	},
	{
		files: ["**/*.{ts,tsx}"],
		ignores: ["**/src/test/**", "**/tests/**", "**/*.spec.ts", "**/*.test.ts"],
		rules: {
			"@typescript-eslint/consistent-type-exports": [
				"error",
				{
					fixMixedExportsWithInlineTypeSpecifier: true,
				},
			],
		},
	},
	{
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: ["./src/test/tsconfig.json"],
			},
		},
	},
	{
		rules: {
			"prefer-arrow-callback": "off",
			"@typescript-eslint/strict-boolean-expressions": "off", // requires strictNullChecks=true in tsconfig
			"import-x/namespace": "off",
			"@typescript-eslint/consistent-type-imports": [
				"error",
				{
					"fixStyle": "inline-type-imports",
				},
			],
			"@typescript-eslint/no-import-type-side-effects": "error",

			// #endregion
		},
	},
	{
		files: ["**/*.{ts,tsx}"],
		ignores: ["**/src/test/**", "**/tests/**", "**/*.spec.ts", "**/*.test.ts"],
		rules: {
			// #region TODO: remove these once this config has been updated to use our "recommended" base instead of our deprecated minimal one.
			"@typescript-eslint/consistent-type-exports": [
				"error",
				{
					"fixMixedExportsWithInlineTypeSpecifier": true,
				},
			],

			// #endregion
		},
	},
];

export default config;
