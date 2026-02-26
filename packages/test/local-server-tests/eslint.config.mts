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
			"@typescript-eslint/strict-boolean-expressions": "off", // requires strictNullChecks=true in tsconfig
			"import-x/no-nodejs-modules": "off",
			"import-x/no-extraneous-dependencies": [
				"error",
				{
					// This package is only used to run its tests. It's ok for the src/utils.ts to import from devDependencies, in
					// addition to the test files
					devDependencies: ["src/utils.ts", "src/test/**"],
				},
			],
		},
	},
	{
		// Override @typescript-eslint/parser to use explicit project list instead of projectService.
		// This is a test-only package without a root tsconfig.json, so typescript-eslint's
		// projectService can't auto-discover the project configuration.
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: ["./src/test/tsconfig.json"],
			},
		},
	},
];

export default config;
