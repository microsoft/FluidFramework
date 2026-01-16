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
			"@typescript-eslint/strict-boolean-expressions": "off",
		},
	},
	// Rules only for test files
	{
		files: ["*.spec.ts", "src/test/**/*.ts"],
		rules: {
			// Test files are run in node only so additional node libraries can be used.
			"import-x/no-nodejs-modules": [
				"error",
				{
					allow: ["node:assert", "node:crypto", "node:fs", "node:path"],
				},
			],
		},
	},
];

export default config;
