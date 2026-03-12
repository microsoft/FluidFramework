/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: AB#59243 Replace this standalone config with @fluidframework/eslint-config-fluid once a
// version is published that supports ESLint 9 flat config.

import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import rushstackPlugin from "@rushstack/eslint-plugin";
import unicornPlugin from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: ["dist/**", "lib/**", "node_modules/**", "**/*.d.ts"],
	},
	eslint.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	...tseslint.configs.stylisticTypeChecked,
	eslintConfigPrettier,
	{
		plugins: {
			"@rushstack": rushstackPlugin,
			"unicorn": unicornPlugin,
		},
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"@rushstack/no-new-null": "error",
			"unicorn/text-encoding-identifier-case": "error",
		},
	},
	{
		files: ["src/test/**"],
		rules: {
			// Generated type validation files use many unused variables by design.
			"@typescript-eslint/no-unused-vars": "off",
		},
	},
);
