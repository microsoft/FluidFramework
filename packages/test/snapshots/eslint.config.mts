/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { minimalDeprecated } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...minimalDeprecated,
	{
		rules: {
			"@typescript-eslint/prefer-nullish-coalescing": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"import-x/no-nodejs-modules": "off",
		},
	},
];

export default config;
