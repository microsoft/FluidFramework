/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { baseConfig } from "../../eslint.config.base.mts";

const config: Linter.Config[] = [
	...baseConfig,
	{
		rules: {
			// Package-specific rules
			"@typescript-eslint/no-floating-promises": "off",
			"@typescript-eslint/no-use-before-define": "off",
			"no-case-declarations": "off",
		},
	},
	{
		ignores: ["*.spec.ts", "*.generated.ts"],
	},
];

export default config;
