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
			"@typescript-eslint/strict-boolean-expressions": "off",
			"import-x/no-nodejs-modules": "off",
			"depend/ban-dependencies": [
				"error",
				{
					"allowed": ["execa"],
				},
			],
		},
	},
];

export default config;
