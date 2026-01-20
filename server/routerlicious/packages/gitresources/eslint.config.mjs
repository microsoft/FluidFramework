/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { minimalDeprecated } from "@fluidframework/eslint-config-fluid/flat.mts";

export default [
	...minimalDeprecated,
	{
		rules: {
		"promise/catch-or-return": ["error", { allowFinally: true }],

		// TODO: enable strict null checks in tsconfig and remove this override
		"@typescript-eslint/prefer-nullish-coalescing": "off",
		},
	},
];
