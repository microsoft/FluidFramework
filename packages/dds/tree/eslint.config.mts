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
			"@typescript-eslint/no-empty-interface": "off",
			"@typescript-eslint/no-empty-object-type": "off",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					"argsIgnorePattern": "^",
					"varsIgnorePattern": "^_",
					"caughtErrorsIgnorePattern": "^_",
				},
			],
			"@typescript-eslint/explicit-member-accessibility": "error",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"import-x/order": "off",
			"jsdoc/require-description": "warn",
			"unicorn/no-await-expression-member": "off",
			"unicorn/no-null": "off",
			"unicorn/prefer-export-from": "off",
			"unicorn/text-encoding-identifier-case": "off",
		},
	},
	{
		files: ["src/test/**/*"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: ["./src/test/tsconfig.json"],
			},
		},
		rules: {
			"@typescript-eslint/no-unused-vars": ["off"],
			"@typescript-eslint/explicit-function-return-type": "off",
			// Test files commonly define helper functions inside describe blocks for better readability
			"unicorn/consistent-function-scoping": "off",
			// Test files frequently use `as any` casts to access internal/hidden properties for testing
			"@typescript-eslint/no-unsafe-member-access": "off",
		},
	},
];

export default config;
