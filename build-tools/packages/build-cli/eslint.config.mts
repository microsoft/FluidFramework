/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { baseConfig } from "../../eslint.config.base.mts";

export default [
	...baseConfig,
	// Ignore test data files and test fixtures that aren't in tsconfig
	{
		ignores: ["src/test/data/**", "src/test/**/fixtures/**"],
	},
	{
		rules: {
			// This rule is often triggered when using custom Flags, so disabling.
			"object-shorthand": "off",

			// The default for this rule is 4, but 5 is better.
			// TODO: Consider lowering this limit and simplifying build-tools code accordingly.
			"max-params": ["warn", 5],
		},
	},
];
