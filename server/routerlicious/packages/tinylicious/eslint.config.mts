/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { minimalDeprecated } from "../../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...minimalDeprecated,
	{
		rules: {
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/promise-function-async": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"import-x/no-internal-modules": "off",
			"import-x/no-nodejs-modules": "off",
			"@typescript-eslint/prefer-nullish-coalescing": "off",
			"import-x/no-deprecated": "warn",
		},
	},
];

export default config;
