/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { baseConfig } from "../../eslint.config.base.mts";

export default [
	...baseConfig,
	{
		rules: {
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/promise-function-async": "off",
			"import-x/no-internal-modules": "off",
		},
	},
];
