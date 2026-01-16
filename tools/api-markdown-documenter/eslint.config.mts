/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";

import chaiExpect from "eslint-plugin-chai-expect";
import chaiFriendly from "eslint-plugin-chai-friendly";

import { strict } from "../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strict,
	{
		rules: {
			// Too many false positives with array access
			"@fluid-internal/fluid/no-unchecked-record-access": "off",

			// Rule is reported in a lot of places where it would be invalid to follow the suggested pattern
			"@typescript-eslint/class-literal-property-style": "off",

			// Comparing general input strings against system-known values (via enums) is used commonly to support
			// extensibility.
			"@typescript-eslint/no-unsafe-enum-comparison": "off",

			// Useful for developer accessibility
			"unicorn/prevent-abbreviations": [
				"error",
				{
					allowList: {
						// Industry-standard index variable name.
						i: true,
					},
				},
			],

			"unicorn/prefer-module": "off",
			"unicorn/prefer-negative-index": "off",

			// This package is exclusively used in a Node.js context
			"import/no-nodejs-modules": "off",
		},
	},

	// Overrides for test files
	{
		files: ["src/**/test/**"],
		plugins: {
			"chai-expect": chaiExpect,
			"chai-friendly": chaiFriendly,
		},
		rules: {
			...chaiExpect.configs.recommended.rules,
			...chaiFriendly.configs.recommended.rules,
			"import/no-extraneous-dependencies": [
				"error",
				{
					devDependencies: true,
				},
			],

			// Handled by chai-friendly instead.
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
