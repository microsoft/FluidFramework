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
			"import-x/no-deprecated": "warn",
		},
	},
	{
		files: ["**/*.{ts,tsx}"],
		ignores: ["**/src/test/**", "**/tests/**", "**/*.spec.ts", "**/*.test.ts"],
		rules: {
			"@typescript-eslint/strict-boolean-expressions": "warn",
		},
	},
	{
		ignores: ["*.spec.ts"],
	},
];

export default config;
