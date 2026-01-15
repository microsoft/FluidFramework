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
			"import-x/no-nodejs-modules": "off",
			// Disabled because the rule is crashing on this package - AB#51780
			"@typescript-eslint/unbound-method": "off",
		},
	},
];

export default config;
