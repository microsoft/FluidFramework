/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { minimalDeprecated } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...minimalDeprecated,
	{
		rules: {
			// This library is used in the browser, so we don't want dependencies on most node libraries.
			"import-x/no-nodejs-modules": [
				"error",
				{
				"allow": ["child_process", "fs", "util"],
			},
			],
			"@typescript-eslint/consistent-type-imports": ["error", {
				"fixStyle": "inline-type-imports",
			}],
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
