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
		},
	},
	{
		files: ["*.spec.ts", "src/test/**/*.ts"],
		rules: {
			"import-x/no-nodejs-modules": [
				"error",
				{
					"allow": ["node:assert", "node:crypto", "node:fs", "node:path"],
				},
			],
		},
	},
];

export default config;
