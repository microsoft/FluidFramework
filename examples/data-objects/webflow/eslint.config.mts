/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { minimalDeprecated } from "../../../common/build/eslint-config-fluid/flat.mts";
import sharedConfig, {
	importInternalModulesAllowed,
	importInternalModulesAllowedForTest,
} from "../../eslint.config.data.mts";

const config: Linter.Config[] = [
	...minimalDeprecated,
	...sharedConfig,
	{
		rules: {
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/prefer-nullish-coalescing": "off", // requires strictNullChecks
			"@typescript-eslint/strict-boolean-expressions": "off",
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [...importInternalModulesAllowed, "*/*.js"],
				},
			],
			"max-len": "off",
			"no-bitwise": "off",
			"no-case-declarations": "off",
			// Disabled because the rule is crashing on this package - AB#51780
			"@typescript-eslint/unbound-method": "off",
		},
	},
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [...importInternalModulesAllowedForTest],
				},
			],
		},
	},
];

export default config;
