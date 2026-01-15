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

			// Exact variable name checks.
			// See: https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prevent-abbreviations.md#allowlist
			// Industry-standard index variable name.
			// RegEx-based exclusions
			// See: https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prevent-abbreviations.md#ignore
			// "props" has become something of an industry standard abbreviation for "properties".
			// Allow names to include "props" / "Props".
		},
	},
	// Overrides for type-tests
	{
		files: ["src/test/types/*"],
		rules: {
			"unicorn/prevent-abbreviations": "off",
		},
	},
	// Overrides for tests
	{
		files: ["src/test/*.spec.ts"],
		rules: {
			// Mocha tests should prefer regular functions, see https://mochajs.org/#arrow-functions
			"prefer-arrow-callback": "off",
		},
	},
];

export default config;
