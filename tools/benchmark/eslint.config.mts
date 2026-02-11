/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: Replace this local config with the shared @fluidframework/eslint-config-fluid
// flat config once v9 is released. Example:
//   import { recommended } from "@fluidframework/eslint-config-fluid/flat.mts";
//   ...recommended,

import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import-x";
import unicorn from "eslint-plugin-unicorn";
import type { Linter } from "eslint";
import tseslint from "typescript-eslint";

const config: Linter.Config[] = [
	// Base ESLint recommended rules
	eslint.configs.recommended,

	// TypeScript ESLint recommended rules (type-checked)
	...tseslint.configs.recommendedTypeChecked,

	// import-x plugin for import rules
	importPlugin.flatConfigs.recommended as Linter.Config,
	importPlugin.flatConfigs.typescript as Linter.Config,

	// Unicorn plugin - register plugin so eslint-disable comments for unicorn rules are valid.
	// Only specific rules are enabled; the full recommended preset is not used due to a
	// compatibility issue between eslint-plugin-unicorn@54 and eslint@9.39 (expiring-todo-comments).
	{
		plugins: {
			unicorn,
		},
		rules: {
			"unicorn/prefer-module": "error",
			"unicorn/prefer-native-coercion-functions": "error",
			"unicorn/prefer-ternary": "error",
			"unicorn/no-negated-condition": "error",
		},
	},

	// Prettier config - disables rules that conflict with prettier (must be last in extends)
	eslintConfigPrettier,

	// TypeScript parser and project configuration
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		settings: {
			"import-x/resolver": {
				typescript: true,
				node: true,
			},
		},
	},

	// Project-specific rule overrides
	{
		rules: {
			"@typescript-eslint/no-shadow": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/require-await": "off",
			"@typescript-eslint/restrict-template-expressions": "off",
			"import-x/no-nodejs-modules": [
				"error",
				{ allow: ["node:v8", "perf_hooks", "node:child_process"] },
			],
		},
	},

	// Test file overrides
	{
		files: ["src/test/**"],
		rules: {
			"import-x/no-nodejs-modules": "off",
		},
	},
];

export default config;
