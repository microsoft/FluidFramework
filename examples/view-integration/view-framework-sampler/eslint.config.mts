/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "@fluidframework/eslint-config-fluid/flat.mts";
import sharedConfig from "../../eslint.config.data.mts";

const config: Linter.Config[] = [
	...recommended,
	...sharedConfig,
	{
		rules: {
			"@typescript-eslint/consistent-type-imports": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"require-atomic-updates": "off",
			"unicorn/prefer-query-selector": "off",
			"unicorn/prefer-string-slice": "off",
			"unicorn/prefer-top-level-await": "off",
		},
	},
	{
		files: ["**/*.jsx", "**/*.tsx"],
		rules: {
			"react/no-deprecated": "off",
		},
	},
];

export default config;
