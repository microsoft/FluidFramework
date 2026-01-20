/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { minimalDeprecated } from "../../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...minimalDeprecated,
	{
		rules: {
			"@typescript-eslint/strict-boolean-expressions": "off",
			"import-x/no-nodejs-modules": "off",
			"promise/catch-or-return": [
				"error",
				{
					allowFinally: true,
				},
			],
			"@typescript-eslint/prefer-nullish-coalescing": "off",
		},
	},
	{
		ignores: ["*.spec.ts"],
	},
];

export default config;
