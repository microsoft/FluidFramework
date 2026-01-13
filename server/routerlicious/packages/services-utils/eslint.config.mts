/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { baseConfig } from "../../eslint.config.base.mts";

export default [
	...baseConfig,
	{
		rules: {
			// TODO: fix violations and remove this override
			"@typescript-eslint/strict-boolean-expressions": "warn",
		},
	},
];
