/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { strict } from "../../../common/build/eslint-config-fluid/flat.mts";

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
