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
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			"import-x/no-nodejs-modules": "off", // Node libraries are OK for test files.
		},
	},
];

export default config;
