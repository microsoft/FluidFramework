/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { strictBiome } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strictBiome,
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
