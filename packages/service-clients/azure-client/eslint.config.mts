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
			// Useful for developer accessibility
			"unicorn/prevent-abbreviations": [
				"error",
				{
					"allowList": {
						"i": true,
					},
					"ignore": ["[pP]rops"],
				},
			],
		},
	},
	{
		files: ["src/test/types/*"],
		rules: {
			"unicorn/prevent-abbreviations": "off",
		},
	},
	{
		files: ["src/test/*.spec.ts"],
		rules: {
			// Mocha tests should prefer regular functions, see https://mochajs.org/#arrow-functions
			"prefer-arrow-callback": "off",
		},
	},
];

export default config;
