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
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [
						"@fluidframework/*/alpha",
						"@fluidframework/*/beta",
						"@fluidframework/*/legacy",
						"@fluidframework/*/internal",
					],
				},
			],
		},
	},
	{
		files: ["src/test/**/*"],
		rules: {
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [
						"*/index.js",
						"@fluidframework/*/alpha",
						"@fluidframework/*/beta",
						"@fluidframework/*/legacy",
						"@fluidframework/*/internal",
					],
				},
			],
		},
	},
];

export default config;
