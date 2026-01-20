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
			"import-x/no-nodejs-modules": "off",
			"promise/catch-or-return": ["error", {
				"allowFinally": true,
			}],
			"@typescript-eslint/prefer-nullish-coalescing": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"import-x/no-deprecated": "warn",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
		},
	},
	{
		ignores: ["*.spec.ts"],
	},
];

export default config;
