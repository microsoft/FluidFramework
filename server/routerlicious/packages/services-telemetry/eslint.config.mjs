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

		// TODO: remove these overrides and fix violations
		"@typescript-eslint/prefer-nullish-coalescing": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",

		// TODO: remove usages of deprecated APIs and remove this override
		"import-x/no-deprecated": "warn",
		},
	},
];
