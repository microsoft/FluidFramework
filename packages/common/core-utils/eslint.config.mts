/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "@fluidframework/eslint-config-fluid/flat.mts";
import type { Linter } from "eslint";

const config: Linter.Config[] = [
	...strict,
	{
		rules: {
			"unicorn/numeric-separators-style": "off",
		},
	},
	{
		files: ["*.spec.ts", "*.test.ts", "src/test/**"],
		rules: {
			"import-x/no-nodejs-modules": [
				"error",
				{
					"allow": ["node:assert", "node:process"],
				},
			],
			"unicorn/consistent-function-scoping": "off",
		},
	},
];

export default config;
