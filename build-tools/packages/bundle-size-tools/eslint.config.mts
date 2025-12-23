/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import js from "@eslint/js";
import type { Linter } from "eslint";
import tseslint from "typescript-eslint";

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
		rules: {
			"@typescript-eslint/switch-exhaustiveness-check": "error",
			"@typescript-eslint/no-inferrable-types": "off",
			"@typescript-eslint/no-var-requires": "off",
		},
	},
];

export default config;
