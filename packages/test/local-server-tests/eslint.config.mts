/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { minimalDeprecated } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...minimalDeprecated,
	{
		rules: {
			"@typescript-eslint/strict-boolean-expressions": "off", // requires strictNullChecks=true in tsconfig
			"import-x/no-nodejs-modules": "off",
			"import-x/no-extraneous-dependencies": [
				"error",
				{
					"devDependencies": ["src/utils.ts", "src/test/**"],
				},
			],

			// This package is only used to run its tests. It's ok for the src/utils.ts to import from devDependencies, in
			// addition to the test files
		},
	},
];

export default config;
