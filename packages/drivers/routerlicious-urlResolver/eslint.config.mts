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
			"@typescript-eslint/strict-boolean-expressions": "off",
			"unicorn/filename-case": [
				"error",
				{
					"cases": {
						"camelCase": true,
						"pascalCase": true,
					},
					"ignore": [{}],
				},
			],
			// This library is used in the browser, so we don't want dependencies on most node libraries.
			"import-x/no-nodejs-modules": ["error"],
		},
	},
	// Rules only for test files
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			// Test files are run in node only so additional node libraries can be used.
			"import-x/no-nodejs-modules": [
				"error",
				{
					"allow": ["assert"],
				},
			],
		},
	},
];

export default config;
