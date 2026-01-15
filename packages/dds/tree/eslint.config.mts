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
			"@typescript-eslint/no-namespace": "off",
			// This library leverages empty, derived interface definitions to capture concepts
			// in a nicely reusable way.
			"@typescript-eslint/no-empty-interface": "off",
			"@typescript-eslint/no-empty-object-type": "off",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			// This package is build with noUnusedLocals disabled for a specific use case (see note in tsconfig.json),
			// but should reject other cases using this rule:
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					"argsIgnorePattern": "^",
					"varsIgnorePattern": "^_",
					"caughtErrorsIgnorePattern": "^_",
				},
			],
			// TODO: Remove this override once this config has been updated to extend the "strict" base config.
			"@typescript-eslint/explicit-member-accessibility": "error",
			// #region TODO:AB#6983: Remove these overrides and fix violations
			"@typescript-eslint/explicit-module-boundary-types": "off",
			// Causes eslint to stack-overflow in this package. Will need investigation.
			"@typescript-eslint/no-unsafe-argument": "off",
			// Causes eslint to stack-overflow in this package. Will need investigation.
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"import-x/order": "off",
			// Set to a warning to encourage adding docs :)
			"jsdoc/require-description": "warn",
			"unicorn/consistent-function-scoping": "off",
			"unicorn/no-await-expression-member": "off",
			"unicorn/no-null": "off",
			"unicorn/prefer-export-from": "off",
			"unicorn/text-encoding-identifier-case": "off",

			// #endregion
		},
	},
	{
		files: ["src/test/**/*"],
		rules: {
			"@typescript-eslint/no-unused-vars": ["off"],
			"@typescript-eslint/explicit-function-return-type": "off",
		},
	},
];

export default config;
