/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
			"@typescript-eslint/consistent-type-imports": [
				"error",
				{
					"fixStyle": "inline-type-imports",
				},
			],
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-import-type-side-effects": "error",
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"import-x/no-nodejs-modules": "off",
			"unicorn/filename-case": [
				"error",
				{
					cases: {
						camelCase: true,
						pascalCase: true,
					},
					ignore: ["fluid-runner", "sample-executable"],
				},
			],
			"unicorn/no-array-for-each": "off",
			"unicorn/no-negated-condition": "off",
			"unicorn/no-process-exit": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/prefer-number-properties": "off",
			"unicorn/prefer-spread": "off",
			"unicorn/prefer-top-level-await": "off",
			"unicorn/text-encoding-identifier-case": "off",
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
					fixMixedExportsWithInlineTypeSpecifier: true,
				},
			],

			// #endregion
		},
	},
	{
		// Override @typescript-eslint/parser to use explicit project list instead of projectService.
		// This package has special .cjs.ts test files excluded from the main test tsconfig that
		// require a separate tsconfig.cjs.lint.json for linting. typescript-eslint's projectService
		// can't auto-discover this non-standard configuration.
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: [
					"./tsconfig.json",
					"./tsconfig.bin.lint.json",
					"./src/test/tsconfig.json",
					"./src/test/tsconfig.cjs.lint.json",
				],
			},
		},
	},
];

export default config;
