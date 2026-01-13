/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { baseConfig } from "../../eslint.config.base.mts";

export default [
	...baseConfig,
	{
		rules: {
			// TODO: re-enable once eslint is v9+ and @typescript-eslint is upgraded accordingly
			"@typescript-eslint/no-unsafe-return": "off",
		},
	},
];
