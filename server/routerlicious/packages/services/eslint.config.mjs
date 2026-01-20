/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { minimalDeprecated } from "@fluidframework/eslint-config-fluid/flat.mts";

export default [
	...minimalDeprecated,
	{
		rules: {
			"import-x/no-nodejs-modules": "off",
			"promise/catch-or-return": ["error", { allowFinally: true }],

			// TODO: remove this override and fix violations
			"@typescript-eslint/strict-boolean-expressions": "warn",

			// TODO: remove usages of deprecated APIs and remove this override
			"import-x/no-deprecated": "warn",
		},
	},
];
