/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "../../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			"@typescript-eslint/consistent-type-imports": "off",
			"@typescript-eslint/explicit-function-return-type": "warn",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-dynamic-delete": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-extraneous-class": "off",
			"@typescript-eslint/no-require-imports": "off",
			"@typescript-eslint/no-shadow": "off",
			"@typescript-eslint/no-this-alias": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unused-expressions": "off",
			"@typescript-eslint/prefer-for-of": "off",
			"@typescript-eslint/prefer-nullish-coalescing": "off",
			"@typescript-eslint/prefer-optional-chain": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"depend/ban-dependencies": [
				"error",
				{
					"allowed": ["lodash", "underscore"],
				},
			],
			"guard-for-in": "off",
			"import-x/no-internal-modules": "off",
			"jsdoc/require-description": "off",
			"no-bitwise": "off",
			"no-new-func": "off",
			"no-param-reassign": "off",
			"no-prototype-builtins": "off",
			"no-undef": "off",
			"no-undef-init": "off",
			"no-var": "off",
			"object-shorthand": "off",
			"one-var": "off",
			"prefer-arrow-callback": "off",
			"prefer-const": "off",
			"prefer-object-spread": "off",
			"prefer-template": "off",
			"tsdoc/syntax": "off",
			"unicorn/better-regex": "off",
			"unicorn/catch-error-name": "off",
			"unicorn/explicit-length-check": "off",
			"unicorn/new-for-builtins": "off",
			"unicorn/no-array-for-each": "off",
			"unicorn/no-console-spaces": "off",
			"unicorn/no-lonely-if": "off",
			"unicorn/no-negated-condition": "off",
			"unicorn/no-new-array": "off",
			"unicorn/no-null": "off",
			"unicorn/no-static-only-class": "off",
			"unicorn/no-this-assignment": "off",
			"unicorn/no-useless-promise-resolve-reject": "off",
			"unicorn/no-zero-fractions": "off",
			"unicorn/prefer-default-parameters": "off",
			"unicorn/prefer-export-from": "off",
			"unicorn/prefer-includes": "off",
			"unicorn/prefer-module": "off",
			"unicorn/prefer-native-coercion-functions": "off",
			"unicorn/prefer-number-properties": "off",
			"unicorn/prefer-optional-catch-binding": "off",
			"unicorn/prefer-reflect-apply": "off",
			"unicorn/prefer-spread": "off",
			"unicorn/prefer-string-slice": "off",
			"unicorn/switch-case-braces": "off",
			"unicorn/throw-new-error": "off",
		},
	},
	// Migrated from .eslintignore
	{
		ignores: ["src/index.d.ts"],
	},
];

export default config;
