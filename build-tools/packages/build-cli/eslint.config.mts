/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import js from "@eslint/js";
import type { Linter } from "eslint";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

const config: Linter.Config[] = [
	{
		ignores: [
			"**/dist/**",
			"**/lib/**",
			"**/node_modules/**",
			// Test data files that are not part of the tsconfig
			"**/test/data/**/*.d.ts",
			"**/src/test/data/**/*.d.ts",
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	prettier,
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
			// Catch unused variables at lint time instead of compile time
			// Allow unused variables with underscore prefix
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					"argsIgnorePattern": "^_",
					"varsIgnorePattern": "^_",
				},
			],

			// This rule is often triggered when using custom Flags, so disabling.
			"object-shorthand": "off",

			// The default for this rule is 4, but 5 is better
			"max-params": ["warn", 5],
		},
	},
	{
		// Rules only for test files
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			// Superseded by chai-friendly/no-unused-expressions
			"no-unused-expressions": "off",
			"@typescript-eslint/no-unused-expressions": "off",
		},
	},
	{
		// Rules for CommonJS config/test files
		files: ["**/*.cjs", "**/*.cts"],
		languageOptions: {
			globals: {
				module: "readonly",
				require: "readonly",
				__dirname: "readonly",
				exports: "readonly",
			},
		},
	},
];

export default config;
