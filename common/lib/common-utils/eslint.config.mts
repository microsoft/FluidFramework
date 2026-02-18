/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: AB#59243 Replace this standalone config with @fluidframework/eslint-config-fluid once a
// version is published that supports ESLint 9 flat config.

import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import rushstackPlugin from "@rushstack/eslint-plugin";
import importPlugin from "eslint-plugin-import";
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
			"import": importPlugin,
			"unicorn": unicornPlugin,
		},
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// Rules from the shared config that are referenced by inline eslint-disable comments.
			"@rushstack/no-new-null": "error",
			"@typescript-eslint/no-non-null-assertion": "error",
			"default-case": "error",
			"import/no-internal-modules": "error",
			"no-bitwise": "error",
			"no-new-func": "error",
			"no-restricted-syntax": [
				"error",
				{
					selector: "ExportAllDeclaration",
					message:
						"Exporting * is not permitted. You should export only named items you intend to export.",
				},
			],
			"unicorn/error-message": "error",
			"unicorn/no-thenable": "error",

			// This package is being deprecated, so it's okay to use deprecated APIs.
			"@typescript-eslint/no-deprecated": "off",
			"import/no-deprecated": "off",

			// This package uses node's events APIs.
			// This should probably be reconsidered, but until then we will leave an exception for it here.
			"import/no-nodejs-modules": ["error", { allow: ["events"] }],

			// This package has been deprecated. The following rules have a significant number of
			// violations that will not be fixed here.
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-unused-vars": "off",
			"@typescript-eslint/require-await": "off",
			"@typescript-eslint/no-inferrable-types": "off",
			"@typescript-eslint/no-empty-function": "off",
			"@typescript-eslint/prefer-promise-reject-errors": "off",
			"@typescript-eslint/no-duplicate-type-constituents": "off",
			"@typescript-eslint/no-misused-promises": "off",
			"@typescript-eslint/no-redundant-type-constituents": "off",
			"@typescript-eslint/prefer-nullish-coalescing": "off",
			"unicorn/text-encoding-identifier-case": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/prefer-code-point": "off",
		},
	},
	{
		files: ["src/test/**"],
		rules: {
			// It's fine for tests to use node.js modules.
			"import/no-nodejs-modules": "off",
		},
	},
);
