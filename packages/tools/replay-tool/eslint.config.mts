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
			"@typescript-eslint/prefer-nullish-coalescing": "off", // requires strictNullChecks
			"@typescript-eslint/strict-boolean-expressions": "off",
			// This package often uses deprecated APIs because it's used to replay ops from older versions of the runtime
			"import-x/no-deprecated": "off",
			"import-x/no-nodejs-modules": "off",
			"no-case-declarations": "off",

			// #region TODO: remove these once this config has been updated to use our "recommended" base instead of our deprecated minimal one.
			"@typescript-eslint/consistent-type-imports": [
				"error",
				{
					fixStyle: "inline-type-imports",
				},
			],
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-import-type-side-effects": "error",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			// #endregion
			"unicorn/catch-error-name": "off",
			"unicorn/explicit-length-check": "off",
			"unicorn/no-array-for-each": "off",
			"unicorn/no-console-spaces": "off",
			"unicorn/no-negated-condition": "off",
			"unicorn/no-process-exit": "off",
			"unicorn/prefer-logical-operator-over-ternary": "off",
			"unicorn/prefer-module": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/prefer-number-properties": "off",
			"unicorn/prefer-optional-catch-binding": "off",
			"unicorn/prefer-top-level-await": "off",
			"unicorn/switch-case-braces": "off",
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
];

export default config;
