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
			"import-x/no-nodejs-modules": ["error"],
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",

			// Disabled because the rule is crashing on this package - AB#51780
			"@typescript-eslint/unbound-method": "off",
		},
	},

	// Rules only for test files
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			// Node libraries are OK for test files.
			"import-x/no-nodejs-modules": "off",
		},
	},
];

export default config;
