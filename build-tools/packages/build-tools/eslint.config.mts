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
		files: ["**/*.ts"],
		languageOptions: {
			parserOptions: {
				projectService: true,
			},
		},
	},
	{
		// Disable type-aware parsing for .d.ts files
		files: ["**/*.d.ts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: null,
			},
		},
	},
	{
		rules: {
			// TODO: Enable these ASAP
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",

			// Allow require() imports - this package is CommonJS
			"@typescript-eslint/no-require-imports": "off",

			// Allow empty interfaces for now
			"@typescript-eslint/no-empty-object-type": "off",

			"@typescript-eslint/no-non-null-assertion": "error",

			// Catch unused variables at lint time instead of compile time
			// But allow unused catch variables named with underscore
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					"caughtErrors": "none",
				},
			],
		},
	},
	{
		// Apply type-aware rule only to non-.d.ts files
		files: ["**/*.ts"],
		ignores: ["**/*.d.ts"],
		rules: {
			"@typescript-eslint/switch-exhaustiveness-check": "error",
		},
	},
];

export default config;
