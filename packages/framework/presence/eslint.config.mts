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
			"@typescript-eslint/consistent-indexed-object-style": "off",
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [
						"@fluidframework/*/internal{,/**}",
						"*/index.js",
						"@fluidframework/presence/alpha",
						"@fluidframework/presence/beta",
					],
				},
			],
		},
	},
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			"import-x/no-nodejs-modules": [
				"error",
				{
					"allow": ["node:assert"],
				},
			],
		},
	},
];

export default config;
