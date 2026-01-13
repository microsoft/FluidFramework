/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { baseConfig } from "../../eslint.config.base.mts";

export default [
	...baseConfig,
	{
		rules: {
			"@typescript-eslint/no-floating-promises": "off",
			"@typescript-eslint/no-use-before-define": "off",
			"no-case-declarations": "off",
		},
	},
];
