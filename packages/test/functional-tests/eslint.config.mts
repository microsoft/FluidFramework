/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { minimalDeprecated } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...minimalDeprecated,
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			// Test files are run in node only so additional node libraries can be used.
			"import-x/no-nodejs-modules": [
				"error",
				{
					"allow": ["assert"],
				},
			],
		},
	},
];

export default config;
