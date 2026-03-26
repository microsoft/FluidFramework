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
			"@typescript-eslint/unbound-method": "off",
		},
	},
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			"@typescript-eslint/explicit-function-return-type": "off",
			"unicorn/consistent-function-scoping": "off",
			"import-x/no-nodejs-modules": [
				"error",
				{
					"allow": ["node:assert", "node:crypto"],
				},
			],
		},
	},
];

export default config;
