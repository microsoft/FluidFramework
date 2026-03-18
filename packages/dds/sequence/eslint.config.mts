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
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			"@typescript-eslint/consistent-type-exports": "off",
			"@typescript-eslint/consistent-type-imports": "off",
			"@typescript-eslint/explicit-function-return-type": "warn",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"no-void": "off",
			"unicorn/escape-case": "off",
			"unicorn/no-array-for-each": "off",
			"unicorn/no-array-reduce": "off",
			"unicorn/no-await-expression-member": "off",
			"unicorn/no-lonely-if": "off",
			"unicorn/no-negated-condition": "off",
			"unicorn/no-null": "off",
			"unicorn/no-object-as-default-parameter": "off",
			"unicorn/no-useless-fallback-in-spread": "off",
			"unicorn/no-zero-fractions": "off",
			"unicorn/prefer-code-point": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/prefer-number-properties": "off",
			"unicorn/prefer-spread": "off",
			"unicorn/prefer-string-slice": "off",
			"unicorn/switch-case-braces": "off",
		},
	},
];

export default config;
