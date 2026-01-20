/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { minimalDeprecated } from "@fluidframework/eslint-config-fluid/flat.mts";

export default [
	...minimalDeprecated,
	{
		rules: {
		"import/no-nodejs-modules": "off",

		// TODO: fix violations and remove these overrides
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",
		"@typescript-eslint/strict-boolean-expressions": "warn",
		},
	},
];
