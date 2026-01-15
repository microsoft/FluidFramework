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
			// AB#51780: temporarily disabled because of crashes in typescript-eslint on destructuring in promise chains.
			// See: channelCollection.ts:1070
			"@typescript-eslint/unbound-method": "off",
		},
	},
	// Rules only for test files
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			// TODO: remove these overrides and fix violations
			"@typescript-eslint/explicit-function-return-type": "off",
			"unicorn/consistent-function-scoping": "off",
			// Test files are run in node only so additional node libraries can be used.
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
