/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "@fluidframework/eslint-config-fluid/flat.mts";

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
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-import-type-side-effects": "error",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"import-x/no-nodejs-modules": [
				"error",
				{
					"allow": ["child_process", "fs", "util"],
				},
			],
			"unicorn/catch-error-name": "off",
			"unicorn/explicit-length-check": "off",
			"unicorn/no-negated-condition": "off",
			"unicorn/no-new-array": "off",
			"unicorn/no-process-exit": "off",
			"unicorn/no-useless-promise-resolve-reject": "off",
			"unicorn/no-useless-switch-case": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/prefer-number-properties": "off",
			"unicorn/prefer-optional-catch-binding": "off",
			"unicorn/prefer-spread": "off",
			"unicorn/prefer-string-slice": "off",
			"unicorn/prefer-top-level-await": "off",
			"unicorn/switch-case-braces": "off",
			"unicorn/text-encoding-identifier-case": "off",
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
];

export default config;
