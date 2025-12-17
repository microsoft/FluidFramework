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
			// Catch unused variables at lint time instead of compile time
			"@typescript-eslint/no-unused-vars": "error",
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
		// Rules for CommonJS config files
		files: ["**/*.cjs"],
		languageOptions: {
			globals: {
				module: "readonly",
				require: "readonly",
				__dirname: "readonly",
			},
		},
	},
];

export default config;
