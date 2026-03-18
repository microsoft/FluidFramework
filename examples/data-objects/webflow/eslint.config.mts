/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "../../../common/build/eslint-config-fluid/flat.mts";
import sharedConfig, {
	importInternalModulesAllowed,
	importInternalModulesAllowedForTest,
} from "../../eslint.config.data.mts";

const config: Linter.Config[] = [
	...recommended,
	...sharedConfig,
	{
		rules: {
			"@rushstack/no-new-null": "off",
			"@typescript-eslint/consistent-type-exports": "off",
			"@typescript-eslint/consistent-type-imports": "off",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/prefer-nullish-coalescing": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"@typescript-eslint/unbound-method": "off",
			"import-x/no-internal-modules": [
				"error",
				{
					allow: [...importInternalModulesAllowed, "*/*.js"],
				},
			],
			"max-len": "off",
			"no-bitwise": "off",
			"no-case-declarations": "off",
			"unicorn/catch-error-name": "off",
			"unicorn/error-message": "off",
			"unicorn/no-array-for-each": "off",
			"unicorn/no-array-reduce": "off",
			"unicorn/no-negated-condition": "off",
			"unicorn/no-null": "off",
			"unicorn/no-useless-fallback-in-spread": "off",
			"unicorn/prefer-code-point": "off",
			"unicorn/prefer-dom-node-append": "off",
			"unicorn/prefer-dom-node-remove": "off",
			"unicorn/prefer-math-trunc": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/prefer-number-properties": "off",
			"unicorn/prefer-query-selector": "off",
			"unicorn/prefer-set-has": "off",
			"unicorn/prefer-spread": "off",
			"unicorn/prefer-string-slice": "off",
			"unicorn/switch-case-braces": "off",
		},
	},
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			"import-x/no-internal-modules": [
				"error",
				{
					allow: [...importInternalModulesAllowedForTest],
				},
			],
		},
	},
];

export default config;
