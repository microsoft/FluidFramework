/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { strictBiome } from "../../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strictBiome,
	{
		rules: {
			"@typescript-eslint/unbound-method": "off",
			"unicorn/consistent-function-scoping": "off",
			"unicorn/no-nested-ternary": "off",
			"import-x/no-extraneous-dependencies": [
				"error",
				{
					"devDependencies": ["src/**/test/**"],
				},
			],
		},
	},
	{
		files: ["*.test.ts", "src/test/**"],
		rules: {
			"import-x/no-nodejs-modules": "off",
			"@typescript-eslint/no-unused-expressions": "off",
		},
	},
];

export default config;
