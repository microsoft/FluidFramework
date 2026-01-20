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

			// TODO: remove usages of deprecated APIs and remove these overrides
			"import-x/no-deprecated": "warn",

			// TODO: fix violations and remove these overrides
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			"@typescript-eslint/strict-boolean-expressions": "warn",
		},
	},
	{
		files: ["**/*.spec.ts"],
		rules: {
			"@typescript-eslint/no-misused-promises": "off",
			"@typescript-eslint/no-floating-promises": "off",
			"@typescript-eslint/no-shadow": "off",
			"@typescript-eslint/no-unused-expressions": "off",
			"@typescript-eslint/consistent-type-assertions": "off",
			"prefer-arrow-callback": "off",
			"prefer-const": "off",
			"no-sequences": "off",
		},
	},
];
