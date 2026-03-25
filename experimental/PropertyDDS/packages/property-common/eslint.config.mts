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
			"@rushstack/no-new-null": "off",
			"@typescript-eslint/explicit-function-return-type": "warn",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"depend/ban-dependencies": [
				"error",
				{
					"allowed": ["lodash"],
				},
			],
			"jsdoc/require-description": "off",
			"prefer-arrow-callback": "off",
			"tsdoc/syntax": "off",
			"unicorn/catch-error-name": "off",
			"unicorn/error-message": "off",
			"unicorn/new-for-builtins": "off",
			"unicorn/no-array-for-each": "off",
			"unicorn/no-console-spaces": "off",
			"unicorn/no-instanceof-array": "off",
			"unicorn/no-negated-condition": "off",
			"unicorn/no-new-array": "off",
			"unicorn/no-null": "off",
			"unicorn/no-static-only-class": "off",
			"unicorn/no-thenable": "off",
			"unicorn/no-typeof-undefined": "off",
			"unicorn/no-zero-fractions": "off",
			"unicorn/prefer-number-properties": "off",
			"unicorn/prefer-spread": "off",
			"unicorn/prefer-string-slice": "off",
			"unicorn/throw-new-error": "off",
		},
	},
];

export default config;
