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

		// TODO: enable strict null checks in tsconfig and remove these overrides
		"@typescript-eslint/prefer-nullish-coalescing": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",

		// TODO: remove usages of deprecated APIs and remove this override
		"import-x/no-deprecated": "warn",

		// TODO: fix violations and remove this override
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",
		},
	},
	{
		files: ["**/*.spec.ts"],
		rules: {
			"@typescript-eslint/consistent-type-assertions": "off",
			"@typescript-eslint/no-unsafe-return": "off",
		},
	},
];
