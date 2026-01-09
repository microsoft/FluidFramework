/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { minimalDeprecated } from "@fluidframework/eslint-config-fluid/flat.mts";

export default [
	...minimalDeprecated,
	{
		rules: {
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/promise-function-async": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"import-x/no-internal-modules": "off",
			"import-x/no-nodejs-modules": "off",

			// TODO: enable strict null checks in tsconfig and remove this override
			"@typescript-eslint/prefer-nullish-coalescing": "off",

			// TODO: remove usages of deprecated APIs and remove this override
			"import-x/no-deprecated": "warn",
		},
	},
];
