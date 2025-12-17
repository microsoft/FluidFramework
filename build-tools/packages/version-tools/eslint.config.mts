/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import type { Linter } from "eslint";

const config: Linter.Config[] = [
	{
		ignores: ["**/dist/**", "**/lib/**", "**/node_modules/**"],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		linterOptions: {
			// Don't report unused disable directives for rules we no longer have
			reportUnusedDisableDirectives: "off",
		},
	},
	{
		files: ["**/*.ts"],
		languageOptions: {
			parserOptions: {
				projectService: true,
			},
		},
		rules: {
			// We use semver classes a lot in this package, and they stringify without issue but this rule is still triggered,
			// so disabling.
			"@typescript-eslint/no-base-to-string": "off",

			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",

			// Allow unused variables with underscore prefix
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					"argsIgnorePattern": "^_",
					"varsIgnorePattern": "^_",
				},
			],
		},
	},
];

export default config;
