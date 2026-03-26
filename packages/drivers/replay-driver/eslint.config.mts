/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			"@rushstack/no-new-null": "off",
			"@typescript-eslint/consistent-type-exports": "off",
			"@typescript-eslint/consistent-type-imports": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"unicorn/no-null": "off",
			"unicorn/prefer-date-now": "off",
		},
	},
];

export default config;
