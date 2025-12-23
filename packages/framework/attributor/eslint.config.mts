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
			"@typescript-eslint/consistent-type-imports": ["error", {
				"fixStyle": "inline-type-imports",
			}],
			"@typescript-eslint/no-import-type-side-effects": "error",
		},
	},
	{
		files: ["**/*.{ts,tsx}"],
		ignores: ["**/src/test/**", "**/tests/**", "**/*.spec.ts", "**/*.test.ts"],
		rules: {
			"@typescript-eslint/consistent-type-exports": [
				"error",
				{
				"fixMixedExportsWithInlineTypeSpecifier": true,
			},
			],
		},
	},
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			"import-x/no-nodejs-modules": [
				"error",
				{
				"allow": ["node:assert", "node:fs", "node:path"],
			},
			],
			"unicorn/prefer-module": "off",
		},
	},
];

export default config;
