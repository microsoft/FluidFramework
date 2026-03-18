/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "../../../common/build/eslint-config-fluid/flat.mts";
import sharedConfig from "../../eslint.config.data.mts";

const config: Linter.Config[] = [
	...recommended,
	...sharedConfig,
	{
		rules: {
			"@typescript-eslint/consistent-type-exports": "off",
			"@typescript-eslint/consistent-type-imports": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/prefer-nullish-coalescing": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"import-x/no-deprecated": "off",
			"unicorn/no-new-array": "off",
			"unicorn/prefer-code-point": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/prefer-number-properties": "off",
			"unicorn/prefer-string-slice": "off",
		},
	},
];

export default config;
