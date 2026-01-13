/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { baseConfig } from "../../eslint.config.base.mts";

export default [
	...baseConfig,
	{
		rules: {
			"@typescript-eslint/restrict-template-expressions": "off",
		},
	},
];
