/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { strict } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strict,
	{
		rules: {
			"@typescript-eslint/consistent-indexed-object-style": "off",
		},
	},
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": ["@fluidframework/*/internal{,/**}"],
				},
			],
		},
	},
	{
		// Override @typescript-eslint/parser to use explicit project list instead of projectService.
		// This package has a special tsconfig (tsconfig.no-exactOptionalPropertyTypes.json) for
		// testing exactOptionalPropertyTypes=false. That file is excluded from the main test
		// tsconfig, so typescript-eslint's projectService can't discover it automatically.
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: [
					"./tsconfig.json",
					"./src/test/tsconfig.json",
					"./src/test/tsconfig.no-exactOptionalPropertyTypes.json",
				],
			},
		},
	},
];

export default config;
