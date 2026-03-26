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
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/promise-function-async": "off",
			"import-x/no-internal-modules": "off",
		},
	},
];

export default config;
