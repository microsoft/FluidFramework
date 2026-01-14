/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { strict } from "../../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strict,
	{
		rules: {
			// Disabled because they disagrees with React common patterns / best practices.
			"@typescript-eslint/unbound-method": "off",
			"unicorn/consistent-function-scoping": "off",
			// Disabled because it conflicts with Prettier.
			"unicorn/no-nested-ternary": "off",
			// Prevent imports from undeclared dependencies / dev dependencies, but allow imports from
			// dev dependencies in test code.
			// TODO: Remove this override once the base config is more flexible around where test code
			// lives in a package.
			"import-x/no-extraneous-dependencies": [
				"error",
				{
					"devDependencies": ["src/**/test/**"],
				},
			],
		},
	},
	{
		files: ["*.test.ts", "src/test/**"],
		rules: {
			"import-x/no-nodejs-modules": "off",
			// "unicorn/prefer-module": "off",
			// Superceded by chai-expect rule
			"@typescript-eslint/no-unused-expressions": "off",
		},
	},
	{
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: ["./tsconfig.json"],
			},
		},
	},
];

export default config;
