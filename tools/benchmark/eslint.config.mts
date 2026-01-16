/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
			"@typescript-eslint/no-shadow": "off",
			"space-before-function-paren": "off", // Off because it conflicts with typescript-formatter
			"import/no-nodejs-modules": [
				"error",
				{
				allow: ["node:v8", "perf_hooks", "node:child_process"],
			},
			],
		},
	},
	{
		files: ["src/test/**"],
		rules: {
			"import/no-nodejs-modules": "off",
		},
	},
];

export default config;
