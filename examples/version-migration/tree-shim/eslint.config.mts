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
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			"@typescript-eslint/consistent-type-exports": "off",
			"@typescript-eslint/consistent-type-imports": "off",
			"unicorn/no-negated-condition": "off",
			"unicorn/prefer-number-properties": "off",
			"unicorn/prefer-query-selector": "off",
			"unicorn/prefer-set-has": "off",
			"unicorn/prefer-string-slice": "off",
			"unicorn/prefer-top-level-await": "off",
		},
	},
];

export default config;
