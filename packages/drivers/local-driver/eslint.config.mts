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
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"require-atomic-updates": "off",
			"unicorn/no-array-method-this-argument": "off",
			"unicorn/no-null": "off",
			"unicorn/prefer-logical-operator-over-ternary": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/text-encoding-identifier-case": "off",
		},
	},
];

export default config;
