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
			"@typescript-eslint/consistent-type-imports": [
				"error",
				{
					"fixStyle": "inline-type-imports",
				},
			],
			"@typescript-eslint/no-import-type-side-effects": "error",
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
		},
	},
	{
		files: ["*.spec.ts", "*.test.ts", "**/test/**"],
		rules: {
			// Some deprecated APIs are permissible in tests; use `warn` to keep them visible
			"import-x/no-deprecated": "warn",
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [
						"@fluidframework/*/{beta,alpha,legacy}",
						"fluid-framework/{beta,alpha,legacy}",
						"@fluidframework/*/test-utils",
						"*/index.js",
						"@fluidframework/telemetry-utils/internal",
						"@fluidframework/test-utils/internal",
						"@fluidframework/test-runtime-utils/internal",
					],
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
];

export default config;
