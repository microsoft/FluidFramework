/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "@fluidframework/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		// Include script files in typed linting via an explicit tsconfig list.
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: ["./tsconfig.json", "./tsconfig.scripts.json", "./src/test/tsconfig.json"],
			},
		},
	},
	{
		files: ["scripts/**/*.ts"],
		rules: {
			"import-x/no-nodejs-modules": "off",
			"unicorn/filename-case": "off",
			"@typescript-eslint/prefer-nullish-coalescing": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-return": "off",
		},
	},
	{
		rules: {
			"@typescript-eslint/consistent-type-imports": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"unicorn/text-encoding-identifier-case": "off",
		},
	},
];

export default config;
