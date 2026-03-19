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
			"@typescript-eslint/consistent-type-exports": "off",
			"@typescript-eslint/consistent-type-imports": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			// This library is used in the browser, so we don't want dependencies on most node libraries.
			"import-x/no-nodejs-modules": ["error"],
			"unicorn/filename-case": [
				"error",
				{
					ignore: [".*routerlicious-urlResolver\\.spec\\.ts"],
					cases: {
						camelCase: true,
						pascalCase: true,
					},
				},
			],
			"unicorn/no-useless-promise-resolve-reject": "off",
			"unicorn/prefer-export-from": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/prefer-set-has": "off",
			"unicorn/prefer-string-slice": "off",
		},
	},

	// Rules only for test files
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			// Test files are run in node only so additional node libraries can be used.
			"import-x/no-nodejs-modules": [
				"error",
				{
					allow: ["assert"],
				},
			],
		},
	},
];

export default config;
