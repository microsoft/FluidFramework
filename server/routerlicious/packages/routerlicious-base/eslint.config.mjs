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

			// TODO: fix violations and remove these overrides
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			"@typescript-eslint/explicit-function-return-type": "off",
			"@typescript-eslint/no-shadow": "off",
			"no-bitwise": "off",
			"@typescript-eslint/no-non-null-assertion": "off",
			"unicorn/prefer-ternary": "off",
			"eqeqeq": ["error", "always", { null: "ignore" }],
			"import-x/no-internal-modules": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/consistent-type-assertions": "off",
			"@typescript-eslint/no-misused-promises": "off",
			"@typescript-eslint/no-base-to-string": "off",
		},
	},
];
