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
			"@rushstack/no-new-null": "off",
			"@typescript-eslint/consistent-type-imports": "off",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"require-atomic-updates": "off",
			"unicorn/no-array-for-each": "off",
			"unicorn/no-array-method-this-argument": "off",
			"unicorn/no-negated-condition": "off",
			"unicorn/no-null": "off",
			"unicorn/no-unreadable-array-destructuring": "off",
			"unicorn/prefer-date-now": "off",
			"unicorn/prefer-logical-operator-over-ternary": "off",
			"unicorn/prefer-native-coercion-functions": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/prefer-string-slice": "off",
			"unicorn/text-encoding-identifier-case": "off",
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
