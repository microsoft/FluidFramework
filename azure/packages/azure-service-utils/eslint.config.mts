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
			"import-x/no-unassigned-import": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			// Useful for developer accessibility
			"unicorn/prevent-abbreviations": [
				"error",
				{
					"allowList": {
						// Industry-standard index variable name.
						"i": true,
					},
				},
			],
		},
	},
	// Overrides for type-tests
	{
		files: ["src/test/types/*"],
		rules: {
			"unicorn/prevent-abbreviations": "off",
		},
	},
];

export default config;
