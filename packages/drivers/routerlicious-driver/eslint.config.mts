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
			"@rushstack/no-new-null": "off",
			"@typescript-eslint/consistent-type-exports": "off",
			"@typescript-eslint/consistent-type-imports": "off",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"@typescript-eslint/unbound-method": "off",
			"no-case-declarations": "off",
			"require-atomic-updates": "off",
			"unicorn/catch-error-name": "off",
			"unicorn/explicit-length-check": "off",
			"unicorn/new-for-builtins": "off",
			"unicorn/no-array-for-each": "off",
			"unicorn/no-array-method-this-argument": "off",
			"unicorn/no-await-expression-member": "off",
			"unicorn/no-negated-condition": "off",
			"unicorn/no-null": "off",
			"unicorn/no-this-assignment": "off",
			"unicorn/no-useless-promise-resolve-reject": "off",
			"unicorn/prefer-date-now": "off",
			"unicorn/prefer-export-from": "off",
			"unicorn/prefer-logical-operator-over-ternary": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/prefer-spread": "off",
			"unicorn/prefer-string-slice": "off",
			"unicorn/switch-case-braces": "off",
			"unicorn/throw-new-error": "off",
			"unicorn/text-encoding-identifier-case": "off",
		},
	},
];

export default config;
