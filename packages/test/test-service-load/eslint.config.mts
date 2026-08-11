/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "@fluidframework/eslint-config-fluid/flat.mts";

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
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"import-x/no-nodejs-modules": "off",
			"unicorn/catch-error-name": "off",
			"unicorn/new-for-builtins": "off",
			"unicorn/no-array-for-each": "off",
			"unicorn/no-array-reduce": "off",
			"unicorn/no-await-expression-member": "off",
			"unicorn/no-console-spaces": "off",
			"unicorn/no-lonely-if": "off",
			"unicorn/no-negated-condition": "off",
			"unicorn/no-new-array": "off",
			"unicorn/no-process-exit": "off",
			"unicorn/no-typeof-undefined": "off",
			"unicorn/no-useless-switch-case": "off",
			"unicorn/prefer-module": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/prefer-number-properties": "off",
			"unicorn/prefer-spread": "off",
			"unicorn/prefer-string-slice": "off",
			"unicorn/prefer-top-level-await": "off",
			"unicorn/switch-case-braces": "off",
			"unicorn/text-encoding-identifier-case": "off",
		},
	},
];

export default config;
