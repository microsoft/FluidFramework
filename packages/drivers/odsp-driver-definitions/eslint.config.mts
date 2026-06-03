/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { recommended } from "@fluidframework/eslint-config-fluid/flat.mts";
import type { Linter } from "eslint";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
			"@rushstack/no-new-null": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"unicorn/no-null": "off",
		},
	},
];

export default config;
