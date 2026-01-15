/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	// Rules only for test files
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			"import-x/no-nodejs-modules": [
				"error",
				{
					"allow": ["node:assert", "node:fs", "node:path"],
				},
			],
			"unicorn/prefer-module": "off",
		},
	},
];

export default config;
