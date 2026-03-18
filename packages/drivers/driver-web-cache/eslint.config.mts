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
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-misused-promises": "off",
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/promise-function-async": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"@typescript-eslint/unbound-method": "off",
			"unicorn/no-array-for-each": "off",
			"unicorn/no-null": "off",
			"unicorn/prefer-date-now": "off",
			"unicorn/prefer-number-properties": "off",
		},
	},
];

export default config;
